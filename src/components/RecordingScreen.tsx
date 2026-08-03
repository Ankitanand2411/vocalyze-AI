"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RecordingResult } from "@/app/page";

interface RecordingScreenProps {
  topic: string;
  onDone: (result: RecordingResult) => void;
  onBack: () => void;
}

type RecordingState =
  | "requesting"
  | "recording"
  | "stopping"
  | "error_permission"
  | "error_support";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecordingScreen({ topic, onDone, onBack }: RecordingScreenProps) {
  const [state, setState] = useState<RecordingState>("requesting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * SHARED CLOCK — set once to Date.now() just before both recorders start.
   * Post-recording MediaPipe analysis (see src/lib/videoAnalysis.ts) uses
   * the saved video's own playback position as its timestamp, which lines
   * up with this same t=0 since both blobs started recording together.
   */
  const startTimeRef = useRef<number>(0);

  // Module A — audio only (→ Whisper, later on the backend)
  const moduleA = {
    recorderRef: useRef<MediaRecorder | null>(null),
    chunksRef: useRef<Blob[]>([]),
  };

  // Module B — audio + video (→ local playback + post-recording MediaPipe analysis)
  const moduleB = {
    recorderRef: useRef<MediaRecorder | null>(null),
    chunksRef: useRef<Blob[]>([]),
  };

  const cleanupAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error_support");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setState("error_support");
      return;
    }

    let cancelled = false;

    async function boot() {
      try {
        // 640×360 is optimal for FaceLandmarker on CPU — smaller frames
        // mean faster MediaPipe inference per sample.
        // (PoseLandmarker was dropped, so the 1280×720 wide-angle view
        //  is no longer needed.)
        //
        // 3-tier fallback in case the webcam doesn't support the
        // preferred resolution:
        //   1. 640×360 @ 24fps  (ideal)
        //   2. 640×360          (no frameRate constraint)
        //   3. bare video:true  (whatever the browser can give us)
        const audioConstraints = {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        };

        let stream: MediaStream | null = null;
        const videoAttempts: MediaStreamConstraints[] = [
          { video: { width: 640, height: 360, frameRate: 24 }, audio: audioConstraints },
          { video: { width: 640, height: 360 },                audio: audioConstraints },
          { video: true,                                        audio: audioConstraints },
        ];
        let lastErr: unknown;
        for (const constraints of videoAttempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!stream) throw lastErr;
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // Module A — audio only
        moduleA.chunksRef.current = [];
        const audioStream = new MediaStream(stream.getAudioTracks());
        // 128 kbps — kept high for Whisper transcription quality
        const recA = new MediaRecorder(audioStream, { audioBitsPerSecond: 128_000 });
        moduleA.recorderRef.current = recA;
        recA.ondataavailable = (e) => {
          if (e.data.size > 0) moduleA.chunksRef.current.push(e.data);
        };

        // Module B — audio + video
        moduleB.chunksRef.current = [];
        const recB = new MediaRecorder(stream, {
          videoBitsPerSecond: 800_000,
          audioBitsPerSecond: 128_000,
        });
        moduleB.recorderRef.current = recB;
        recB.ondataavailable = (e) => {
          if (e.data.size > 0) moduleB.chunksRef.current.push(e.data);
        };

        // Atomic start — both recorders begin in the same synchronous block,
        // so t=0 is identical for both blobs' timelines.
        startTimeRef.current = Date.now();
        recA.start(250);
        recB.start(250);

        timerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - startTimeRef.current);
        }, 500);

        setState("recording");
      } catch (err: unknown) {
        if (cancelled) return;
        const error = err as Error;
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setState("error_permission");
        } else {
          setErrorMsg(error.message || "Unknown error accessing camera.");
          setState("error_permission");
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupAll]);

  const handleStop = useCallback(() => {
    if (state !== "recording") return;
    setState("stopping");

    const durationMs = Date.now() - startTimeRef.current;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    let aSettled = false;
    let bSettled = false;

    function tryFinish() {
      if (!aSettled || !bSettled) return;

      const audioBlob = new Blob(moduleA.chunksRef.current, { type: "audio/webm" });
      const videoBlob = new Blob(moduleB.chunksRef.current, { type: "video/webm" });

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      onDone({ audioBlob, videoBlob, durationMs, topic });
    }

    const recA = moduleA.recorderRef.current;
    const recB = moduleB.recorderRef.current;

    if (recA && recA.state !== "inactive") {
      recA.onstop = () => { aSettled = true; tryFinish(); };
      recA.stop();
    } else {
      aSettled = true;
    }

    if (recB && recB.state !== "inactive") {
      recB.onstop = () => { bSettled = true; tryFinish(); };
      recB.stop();
    } else {
      bSettled = true;
    }

    tryFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, topic, onDone]);

  if (state === "error_support") {
    return (
      <ErrorCard
        title="Browser not supported"
        message="Your browser doesn't support MediaRecorder. Please try Chrome, Firefox, or Edge."
        onBack={onBack}
      />
    );
  }

  if (state === "error_permission") {
    return (
      <ErrorCard
        title="Camera access needed"
        message={
          errorMsg ||
          "Vocalyze AI needs access to your camera and microphone. Please allow access and reload."
        }
        onBack={onBack}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fade-in">
      <div className="w-full max-w-2xl">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#9ca3af] hover:text-[#6b7280] transition-colors mb-8 group"
          aria-label="Back to modules"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to modules
        </button>

        <div className="bg-white/70 rounded-xl border border-[#e5e7eb] px-5 py-3 mb-6">
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Topic</p>
          <p className="text-sm text-[#1a1a2e] leading-relaxed line-clamp-2">&quot;{topic}&quot;</p>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-[#1a1a2e] aspect-video shadow-md mb-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            aria-label="Live camera preview"
          />

          {state === "requesting" && (
            <div className="absolute inset-0 bg-[#1a1a2e]/70 flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full border-2 border-[#6c8ebf] border-t-transparent animate-spin mx-auto mb-4" />
                <p className="text-sm text-white">Requesting camera access…</p>
              </div>
            </div>
          )}

          {state === "recording" && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-[#b45309] pulse-dot" aria-hidden="true" />
              <span className="text-white text-xs font-medium tabular-nums">{formatDuration(elapsedMs)}</span>
            </div>
          )}

          {state === "stopping" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <p className="text-white text-sm">Finishing…</p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            id="stop-recording-btn"
            onClick={handleStop}
            disabled={state !== "recording"}
            className={[
              "flex items-center gap-2.5 py-3 px-8 rounded-xl font-semibold text-sm transition-all duration-200",
              state === "recording"
                ? "bg-[#1a1a2e] text-white hover:bg-[#2d2d4e] shadow-sm hover:shadow-md"
                : "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed",
            ].join(" ")}
          >
            <span className="w-3 h-3 rounded-sm bg-current" aria-hidden="true" />
            Stop Recording
          </button>
          <p className="text-xs text-[#9ca3af]">Speak naturally — take your time.</p>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ title, message, onBack }: { title: string; message: string; onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 animate-fade-in">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#e5e7eb] p-8 text-center shadow-sm">
        <span className="text-4xl mb-4 block">🙅</span>
        <h2 className="text-lg font-semibold text-[#1a1a2e] mb-2">{title}</h2>
        <p className="text-sm text-[#6b7280] leading-relaxed mb-7">{message}</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl bg-[#6c8ebf] text-white text-sm font-medium hover:bg-[#5a7aad] transition-colors"
        >
          Back to modules
        </button>
      </div>
    </div>
  );
}
