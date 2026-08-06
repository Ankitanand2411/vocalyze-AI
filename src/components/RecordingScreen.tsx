"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RecordingResult } from "@/app/page";

interface RecordingScreenProps {
  topic: string;
  onDone: (result: RecordingResult) => void;
  onBack: () => void;
}

type RecordingState = "requesting" | "recording" | "stopping" | "error_permission" | "error_unsupported";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export default function RecordingScreen({ topic, onDone, onBack }: RecordingScreenProps) {
  const [state, setState] = useState<RecordingState>("requesting");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up media stream
  const stopStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Timer helper
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 200);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Main recorder initialization
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState("error_unsupported");
      return;
    }

    let isMounted = true;

    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Play video failed:", e));
        }

        // Setup MediaRecorder
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        mediaRecorderRef.current = recorder;
        videoChunksRef.current = [];
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            videoChunksRef.current.push(e.data);
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.start(500); // chunk every 500ms
        startTimer();
        setState("recording");
      } catch (err: unknown) {
        if (!isMounted) return;
        console.error("Camera access error:", err);
        const message = err instanceof Error ? err.message : "Camera or Microphone permission denied.";
        setErrorMsg(message);
        setState("error_permission");
      }
    }

    initMedia();

    return () => {
      isMounted = false;
      stopTimer();
      stopStream();
    };
  }, [startTimer, stopTimer, stopStream]);

  // Handle Stop Recording
  const handleStop = useCallback(() => {
    if (state !== "recording" || !mediaRecorderRef.current) return;

    setState("stopping");
    stopTimer();

    const recorder = mediaRecorderRef.current;

    recorder.onstop = () => {
      const finalDuration = Date.now() - startTimeRef.current;
      const videoBlob = new Blob(videoChunksRef.current, { type: "video/webm" });
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

      stopStream();

      onDone({
        videoBlob,
        audioBlob,
        durationMs: finalDuration,
        topic,
      });
    };

    recorder.stop();
  }, [state, stopTimer, stopStream, onDone, topic]);

  if (state === "error_unsupported") {
    return (
      <ErrorCard
        title="Browser Unsupported"
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fade-in bg-[#f8fafc] bg-grid-pattern text-[#0f172a]">
      <div className="w-full max-w-2xl">
        {/* Top header navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-bold hover:text-slate-900 transition-colors bg-white border border-slate-300 px-3.5 py-1.5 rounded-lg shadow-sm cursor-pointer"
            aria-label="Cancel session"
          >
            <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Cancel</span>
          </button>

          <span className="text-xs font-mono font-bold text-rose-700 bg-rose-100 px-3 py-1 rounded border border-rose-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            <span>Recording Active</span>
          </span>
        </div>

        {/* Topic Banner */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 mb-4 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block mb-1">
            Topic Prompt
          </span>
          <p className="text-xs sm:text-sm text-slate-800 font-bold leading-relaxed">
            &quot;{topic}&quot;
          </p>
        </div>

        {/* Camera Viewport Container */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video border border-slate-300 mb-6 shadow-md">
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
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-md px-3 py-1 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-white font-bold">{formatDuration(elapsedMs)}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300 font-medium">MediaPipe Locked</span>
            </div>
          )}

          {state === "requesting" && (
            <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-xs font-bold text-slate-200">Initializing Webcam Feed…</p>
              </div>
            </div>
          )}

          {state === "stopping" && (
            <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-xs font-bold text-slate-200">Finalizing Recording…</p>
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
            className={`py-3.5 px-8 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-md ${
              state === "recording"
                ? "bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-white" />
            <span>Stop &amp; Analyze Recording</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ title, message, onBack }: { title: string; message: string; onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#f8fafc] bg-grid-pattern text-[#0f172a]">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-lg">
        <h2 className="text-base font-extrabold text-slate-900 mb-2">{title}</h2>
        <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">{message}</p>
        <button
          onClick={onBack}
          className="btn-primary w-full py-3 rounded-xl text-xs font-bold font-mono tracking-wide uppercase shadow-md cursor-pointer"
        >
          Return to Modules
        </button>
      </div>
    </div>
  );
}
