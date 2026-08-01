"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RecordingResult, FrameAnalysisEntry } from "@/app/page";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecordingScreenProps {
  topic: string;
  onDone: (result: RecordingResult) => void;
  onBack: () => void;
}

type RecordingState =
  | "requesting"
  | "initializing_mp"   // MediaPipe WASM loading
  | "recording"
  | "stopping"
  | "error_permission"
  | "error_support";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Derives a 0–1 eye-contact score from FaceLandmarker's iris landmarks.
 *
 * Iris landmarks (468-471 = left iris, 472-475 = right iris) tell us where
 * the pupil center is relative to the eye corners. When pupils are centered,
 * the user is looking at the camera (eye contact ≈ 1). When they drift left/
 * right the score drops toward 0.
 *
 * We also use the nose-tip (1) vs mid-forehead (10) relative position to
 * detect if the person has turned their head horizontally.
 */
function scoreFrame(landmarks: number[][]): {
  eyeContactScore: number;
  headPoseScore: number;
} {
  if (!landmarks || landmarks.length === 0) {
    return { eyeContactScore: 0, headPoseScore: 0 };
  }

  const pts = landmarks; // [x, y, z] per landmark index

  // ── Head pose (yaw): compare nose tip to mid-face ────────────────────────
  // Landmark 1 = nose tip, 10 = forehead center, 454 = right cheek, 234 = left cheek
  const noseTip = pts[1];
  const leftCheek = pts[234];
  const rightCheek = pts[454];

  let headPoseScore = 1;
  if (noseTip && leftCheek && rightCheek) {
    const faceCenterX = (leftCheek[0] + rightCheek[0]) / 2;
    const yawOffset = Math.abs(noseTip[0] - faceCenterX);
    // yawOffset near 0 → facing camera; near 0.15+ → turned away
    headPoseScore = Math.max(0, 1 - yawOffset / 0.12);
  }

  // ── Eye contact (gaze): iris position relative to eye width ──────────────
  // Left iris center: avg of landmarks 468–471
  // Left eye corners: 33 (inner), 133 (outer)
  // Right iris center: avg of landmarks 472–475
  // Right eye corners: 362 (inner), 263 (outer)
  let eyeContactScore = 0.5; // neutral default

  const leftIrisIndices = [468, 469, 470, 471];
  const rightIrisIndices = [472, 473, 474, 475];

  const hasIris =
    pts.length > 475 &&
    leftIrisIndices.every((i) => pts[i]) &&
    rightIrisIndices.every((i) => pts[i]);

  if (hasIris) {
    // Left iris center x
    const leftIrisX =
      leftIrisIndices.reduce((sum, i) => sum + pts[i][0], 0) /
      leftIrisIndices.length;
    const leftInner = pts[133]?.[0] ?? 0;
    const leftOuter = pts[33]?.[0] ?? 1;
    const leftEyeW = Math.abs(leftOuter - leftInner) || 1;
    const leftGaze = Math.abs(leftIrisX - (leftInner + leftOuter) / 2) / leftEyeW;

    // Right iris center x
    const rightIrisX =
      rightIrisIndices.reduce((sum, i) => sum + pts[i][0], 0) /
      rightIrisIndices.length;
    const rightInner = pts[362]?.[0] ?? 0;
    const rightOuter = pts[263]?.[0] ?? 1;
    const rightEyeW = Math.abs(rightOuter - rightInner) || 1;
    const rightGaze = Math.abs(rightIrisX - (rightInner + rightOuter) / 2) / rightEyeW;

    const avgGaze = (leftGaze + rightGaze) / 2;
    // avgGaze ≈ 0 → centered; ≈ 0.5 → extreme
    eyeContactScore = Math.max(0, 1 - avgGaze / 0.3);
  }

  return { eyeContactScore, headPoseScore };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecordingScreen({
  topic,
  onDone,
  onBack,
}: RecordingScreenProps) {
  const [state, setState] = useState<RecordingState>("requesting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // Refs — never cause re-renders
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // overlay for landmarks (optional)
  const streamRef = useRef<MediaStream | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceLandmarkerRef = useRef<any>(null); // typed as any to avoid importing heavy MP types at top-level
  const frameDataRef = useRef<FrameAnalysisEntry[]>([]);
  const mpReadyRef = useRef(false);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const cleanupAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ── MediaPipe initializer (dynamic import so WASM doesn't block SSR) ──────

  const initMediaPipe = useCallback(async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
      });

      mpReadyRef.current = true;
    } catch (err) {
      console.warn("[MediaPipe] Failed to initialize:", err);
      mpReadyRef.current = false;
    }
  }, []);

  // ── Detection loop (runs every animation frame while recording) ───────────

  const startDetectionLoop = useCallback(() => {
    let lastVideoTime = -1;

    function loop() {
      const video = videoRef.current;
      const landmarker = faceLandmarkerRef.current;

      if (video && landmarker && mpReadyRef.current && video.readyState >= 2) {
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          try {
            const result = landmarker.detectForVideo(video, performance.now());
            const landmarks = result.faceLandmarks?.[0] ?? [];
            const faceDetected = landmarks.length > 0;

            const { eyeContactScore, headPoseScore } = scoreFrame(landmarks);

            const entry: FrameAnalysisEntry = {
              timestamp: Date.now() - startTimeRef.current,
              eyeContactScore,
              headPoseScore,
              faceDetected,
            };

            frameDataRef.current.push(entry);

            // (data is accumulated silently; no UI updates needed here)
          } catch {
            // Silently skip frame on decode errors
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Main effect: request media → init MP → start recording ───────────────

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
        // 1. Request camera + mic
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360, frameRate: 24 },
          audio: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // 2. Init MediaPipe in parallel (non-blocking for the user)
        setState("initializing_mp");
        await initMediaPipe(); // resolves even on failure (sets mpStatus="failed")

        if (cancelled) return;

        // 3. Set up recorders
        audioChunksRef.current = [];
        videoChunksRef.current = [];
        frameDataRef.current = [];

        const audioStream = new MediaStream(stream.getAudioTracks());
        const audioRec = new MediaRecorder(audioStream);
        audioRecorderRef.current = audioRec;
        audioRec.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        const videoRec = new MediaRecorder(stream);
        videoRecorderRef.current = videoRec;
        videoRec.ondataavailable = (e) => {
          if (e.data.size > 0) videoChunksRef.current.push(e.data);
        };

        // 4. Start everything
        startTimeRef.current = Date.now();
        audioRec.start(250);
        videoRec.start(250);
        startDetectionLoop();

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

    boot();

    return () => {
      cancelled = true;
      cleanupAll();
    };
  }, [initMediaPipe, startDetectionLoop, cleanupAll]);

  // ── Stop handler ──────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (state !== "recording") return;
    setState("stopping");

    const duration = Date.now() - startTimeRef.current;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop detection loop
    cancelAnimationFrame(animFrameRef.current);

    const collectedFrames = [...frameDataRef.current];
    const mpWasReady = mpReadyRef.current;

    let audioSettled = false;
    let videoSettled = false;

    function tryFinish() {
      if (!audioSettled || !videoSettled) return;

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const videoBlob = new Blob(videoChunksRef.current, { type: "video/webm" });

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      onDone({
        audioBlob,
        videoBlob,
        durationMs: duration,
        topic,
        frameAnalysis: collectedFrames,
        mediapipeReady: mpWasReady,
      });
    }

    const audioRec = audioRecorderRef.current;
    const videoRec = videoRecorderRef.current;

    if (audioRec && audioRec.state !== "inactive") {
      audioRec.onstop = () => { audioSettled = true; tryFinish(); };
      audioRec.stop();
    } else {
      audioSettled = true;
    }

    if (videoRec && videoRec.state !== "inactive") {
      videoRec.onstop = () => { videoSettled = true; tryFinish(); };
      videoRec.stop();
    } else {
      videoSettled = true;
    }

    tryFinish();
  }, [state, topic, onDone]);

  // ─── Error states ─────────────────────────────────────────────────────────

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

  // ─── Requesting ───────────────────────────────────────────────────────────

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

  // ─── Initializing MediaPipe — show the same spinner as "requesting" ─────────

  if (state === "initializing_mp") {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-[#6c8ebf] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#6b7280]">Preparing session…</p>
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
        <div className="relative rounded-2xl overflow-hidden bg-[#1a1a2e] aspect-video shadow-md mb-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            aria-label="Live camera preview"
          />

          {/* Recording indicator */}
          {state === "recording" && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-[#b45309] pulse-dot" aria-hidden="true" />
              <span className="text-white text-xs font-medium tabular-nums">
                {formatDuration(elapsedMs)}
              </span>
            </div>
          )}

          {/* Stopping overlay */}
          {state === "stopping" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <p className="text-white text-sm">Finishing…</p>
            </div>
          )}
        </div>

        {/* Hidden canvas (available for future overlay rendering) */}
        <canvas ref={canvasRef} className="hidden" />

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
