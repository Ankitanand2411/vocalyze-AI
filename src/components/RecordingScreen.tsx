"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RecordingResult } from "@/app/page";

interface RecordingScreenProps {
  topic: string;
  onDone: (result: RecordingResult) => void;
  onBack: () => void;
}

type RecordingState = "requesting" | "recording" | "stopping" | "error_permission" | "error_support";

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
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    // Check support first
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error_support");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setState("error_support");
      return;
    }

    let cancelled = false;

    async function requestMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360, frameRate: 24 },
          audio: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Audio-only recorder
        const audioStream = new MediaStream(stream.getAudioTracks());
        const audioRec = new MediaRecorder(audioStream);
        audioRecorderRef.current = audioRec;
        audioRec.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        // Full audio+video recorder
        const videoRec = new MediaRecorder(stream);
        videoRecorderRef.current = videoRec;
        videoRec.ondataavailable = (e) => {
          if (e.data.size > 0) videoChunksRef.current.push(e.data);
        };

        // Start both
        startTimeRef.current = Date.now();
        audioRec.start(250);
        videoRec.start(250);

        timerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - startTimeRef.current);
        }, 500);

        setState("recording");
      } catch (err: unknown) {
        if (cancelled) return;
        const error = err as Error;
        if (
          error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError"
        ) {
          setState("error_permission");
        } else {
          setErrorMsg(error.message || "Unknown error accessing camera.");
          setState("error_permission");
        }
      }
    }

    requestMedia();

    return () => {
      cancelled = true;
      cleanupStream();
    };
  }, [cleanupStream]);

  // The <video> element only exists in the DOM once state === "recording"
  // (see JSX below), so we can't attach the stream inside requestMedia() —
  // videoRef.current is still null at that point. Instead, attach it here,
  // which re-runs once the video element actually mounts.
  useEffect(() => {
    if (state === "recording" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [state]);

  const handleStop = useCallback(() => {
    if (state !== "recording") return;
    setState("stopping");

    const duration = Date.now() - startTimeRef.current;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    let audioSettled = false;
    let videoSettled = false;

    function tryFinish() {
      if (!audioSettled || !videoSettled) return;

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const videoBlob = new Blob(videoChunksRef.current, { type: "video/webm" });

      // Stop stream tracks
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      onDone({ audioBlob, videoBlob, durationMs: duration, topic });
    }

    const audioRec = audioRecorderRef.current;
    const videoRec = videoRecorderRef.current;

    if (audioRec && audioRec.state !== "inactive") {
      audioRec.onstop = () => {
        audioSettled = true;
        tryFinish();
      };
      audioRec.stop();
    } else {
      audioSettled = true;
    }

    if (videoRec && videoRec.state !== "inactive") {
      videoRec.onstop = () => {
        videoSettled = true;
        tryFinish();
      };
      videoRec.stop();
    } else {
      videoSettled = true;
    }

    tryFinish();
  }, [state, topic, onDone]);

  // ─── Error states ────────────────────────────────────────────────────────────

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
          "Vocalyze AI needs access to your camera and microphone to record your session. Please allow access in your browser and reload this page."
        }
        onBack={onBack}
      />
    );
  }

  // ─── Requesting / loading ─────────────────────────────────────────────────

  if (state === "requesting") {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-[#6c8ebf] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#6b7280]">Requesting camera access…</p>
        </div>
      </div>
    );
  }

  // ─── Recording / Stopping ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fade-in">
      <div className="w-full max-w-2xl">
        {/* Back */}
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

        {/* Topic reminder */}
        <div className="bg-white/70 rounded-xl border border-[#e5e7eb] px-5 py-3 mb-6">
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Topic</p>
          <p className="text-sm text-[#1a1a2e] leading-relaxed line-clamp-2">"{topic}"</p>
        </div>

        {/* Video preview */}
        <div className="relative rounded-2xl overflow-hidden bg-[#1a1a2e] aspect-video shadow-md mb-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            aria-label="Live camera preview"
          />

          {/* Recording indicator overlay */}
          {state === "recording" && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-[#b45309] pulse-dot" aria-hidden="true" />
              <span className="text-white text-xs font-medium tabular-nums">
                {formatDuration(elapsedMs)}
              </span>
            </div>
          )}

          {state === "stopping" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <p className="text-white text-sm">Finishing…</p>
            </div>
          )}
        </div>

        {/* Controls */}
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

          <p className="text-xs text-[#9ca3af]">
            Speak naturally — take your time.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Error card ───────────────────────────────────────────────────────────────

function ErrorCard({
  title,
  message,
  onBack,
}: {
  title: string;
  message: string;
  onBack: () => void;
}) {
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
