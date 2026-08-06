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
   */
  const startTimeRef = useRef<number>(0);

  // Module A — audio only (→ Whisper, later on backend)
  const moduleA = {
    recorderRef: useRef<MediaRecorder | null>(null),
    chunksRef: useRef<Blob[]>([]),
  };

  // Module B — audio + video (→ local playback + MediaPipe analysis)
  const moduleB = {
    recorderRef: useRef<MediaRecorder | null>(null),
    chunksRef: useRef<Blob[]>([]),
  };

  const cleanupAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
  }, [state, topic, onDone]);

  if (state === "error_support") {
    return (
      <ErrorCard
        title="Browser Not Supported"
        message="Your browser doesn't support MediaRecorder. Please try Chrome, Firefox, or Edge."
        onBack={onBack}
      />
    );
  }

  if (state === "error_permission") {
    return (
      <ErrorCard
        title="Camera Access Needed"
        message={
          errorMsg ||
          "Vocalyze AI requires camera and microphone permissions for session analysis. Please allow access in browser bar."
        }
        onBack={onBack}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fade-in bg-[#090a0f] text-[#f3f4f6]">
      <div className="w-full max-w-2xl">
        {/* Top header navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-slate-900 border border-white/10 px-3 py-1.5 rounded-lg"
            aria-label="Cancel session"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Cancel</span>
          </button>

          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded border border-emerald-500/20">
            Recording Active
          </span>
        </div>

        {/* Topic Banner */}
        <div className="bg-[#12141c] rounded-xl p-4 border border-white/10 mb-4">
          <span className="text-[10px] text-slate-500 uppercase font-mono block mb-1">
            Topic Prompt
          </span>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            &quot;{topic}&quot;
          </p>
        </div>

        {/* Camera Viewport Container */}
        <div className="relative rounded-2xl overflow-hidden bg-[#12141c] aspect-video border border-white/10 mb-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
            aria-label="Live camera preview"
          />

          {/* Minimal Status pill */}
          {state === "recording" && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-[#090a0f]/90 border border-white/10 rounded-md px-3 py-1 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-white font-bold">{formatDuration(elapsedMs)}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">MediaPipe Locked</span>
            </div>
          )}

          {state === "requesting" && (
            <div className="absolute inset-0 bg-[#090a0f]/90 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-xs font-medium text-slate-300">Initializing Webcam Feed…</p>
              </div>
            </div>
          )}

          {state === "stopping" && (
            <div className="absolute inset-0 bg-[#090a0f]/90 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-xs font-medium text-slate-300">Finalizing Recording…</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action */}
        <div className="flex flex-col items-center gap-2">
          <button
            id="stop-recording-btn"
            onClick={handleStop}
            disabled={state !== "recording"}
            className={`py-3.5 px-8 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 ${
              state === "recording"
                ? "bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                : "bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-white" />
            <span>Stop & Analyze Recording</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ title, message, onBack }: { title: string; message: string; onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#090a0f] text-[#f3f4f6]">
      <div className="max-w-md w-full bg-[#12141c] rounded-2xl border border-white/10 p-6 text-center">
        <h2 className="text-base font-bold text-white mb-2">{title}</h2>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">{message}</p>
        <button
          onClick={onBack}
          className="btn-primary w-full py-2.5 rounded-lg text-xs font-semibold"
        >
          Return to Modules
        </button>
      </div>
    </div>
  );
}
