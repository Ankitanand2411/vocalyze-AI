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
  | "initializing_mp"   // MediaPipe WASM loading (camera already on)
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
 * Iris landmarks 468–471 = left iris, 472–475 = right iris.
 * When pupils are centered relative to eye corners, the user is looking at the
 * camera (score → 1). When they drift left/right the score drops toward 0.
 * Head pose (yaw) is derived from nose-tip vs cheek midpoint offset.
 */
function scoreFrame(landmarks: number[][]): {
  eyeContactScore: number;
  headPoseScore: number;
} {
  if (!landmarks || landmarks.length === 0) {
    return { eyeContactScore: 0, headPoseScore: 0 };
  }

  const pts = landmarks;

  // ── Head pose (yaw) ───────────────────────────────────────────────────────
  const noseTip = pts[1];
  const leftCheek = pts[234];
  const rightCheek = pts[454];

  let headPoseScore = 1;
  if (noseTip && leftCheek && rightCheek) {
    const faceCenterX = (leftCheek[0] + rightCheek[0]) / 2;
    headPoseScore = Math.max(0, 1 - Math.abs(noseTip[0] - faceCenterX) / 0.12);
  }

  // ── Eye contact (gaze) ────────────────────────────────────────────────────
  let eyeContactScore = 0.5;

  const leftIrisIndices = [468, 469, 470, 471];
  const rightIrisIndices = [472, 473, 474, 475];

  const hasIris =
    pts.length > 475 &&
    leftIrisIndices.every((i) => pts[i]) &&
    rightIrisIndices.every((i) => pts[i]);

  if (hasIris) {
    const leftIrisX =
      leftIrisIndices.reduce((s, i) => s + pts[i][0], 0) / leftIrisIndices.length;
    const leftEyeW = Math.abs((pts[33]?.[0] ?? 1) - (pts[133]?.[0] ?? 0)) || 1;
    const leftGaze = Math.abs(leftIrisX - ((pts[33]?.[0] ?? 0) + (pts[133]?.[0] ?? 1)) / 2) / leftEyeW;

    const rightIrisX =
      rightIrisIndices.reduce((s, i) => s + pts[i][0], 0) / rightIrisIndices.length;
    const rightEyeW = Math.abs((pts[263]?.[0] ?? 1) - (pts[362]?.[0] ?? 0)) || 1;
    const rightGaze = Math.abs(rightIrisX - ((pts[263]?.[0] ?? 0) + (pts[362]?.[0] ?? 1)) / 2) / rightEyeW;

    eyeContactScore = Math.max(0, 1 - (leftGaze + rightGaze) / 2 / 0.3);
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

  // ── Shared infrastructure ─────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * SHARED CLOCK — set once to Date.now() just before both modules start.
   * Every timestamp in Module A and Module B is expressed as:
   *   offset_ms = Date.now() - startTimeRef.current
   * This makes audio-word timestamps and face-frame timestamps directly
   * comparable on the backend with zero drift.
   */
  const startTimeRef = useRef<number>(0);

  // ── MODULE A — Audio (→ Backend / Whisper) ────────────────────────────────
  //
  //  Captures a lean, audio-only stream so the Whisper API gets clean audio
  //  without video payload weight. Each chunk is time-indexed from t=0.
  //
  const moduleA = {
    recorderRef: useRef<MediaRecorder | null>(null),
    chunksRef: useRef<Blob[]>([]),
  };

  // ── MODULE B — Video + MediaPipe (Face Analysis) ──────────────────────────
  //
  //  Records full audio+video for local playback / storage.
  //  Simultaneously runs FaceLandmarker in a rAF loop; every detected frame
  //  is stamped with (Date.now() - startTimeRef.current) — same zero point
  //  as Module A, so backend can align Whisper word events with face poses.
  //
  const moduleB = {
    recorderRef: useRef<MediaRecorder | null>(null),
    chunksRef: useRef<Blob[]>([]),
    faceLandmarkerRef: useRef<unknown>(null), // typed as unknown; import is dynamic
    animFrameRef: useRef<number>(0),
    frameDataRef: useRef<FrameAnalysisEntry[]>([]),
    mpReadyRef: useRef(false),
  };

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const cleanupAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(moduleB.animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── MODULE B — MediaPipe initializer ─────────────────────────────────────

  const initModuleB_MP = useCallback(async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      // Try GPU first (faster), fall back to CPU (more compatible on Linux)
      const createLandmarker = async (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate,
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
        });

      try {
        moduleB.faceLandmarkerRef.current = await createLandmarker("GPU");
        console.log("[Module B] FaceLandmarker ready (GPU)");
      } catch {
        console.warn("[Module B] GPU delegate failed — retrying with CPU");
        moduleB.faceLandmarkerRef.current = await createLandmarker("CPU");
        console.log("[Module B] FaceLandmarker ready (CPU fallback)");
      }

      moduleB.mpReadyRef.current = true;
    } catch (err) {
      console.error("[Module B] MediaPipe init failed entirely:", err);
      moduleB.mpReadyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── MODULE B — Detection loop ─────────────────────────────────────────────
  //  Runs on every animation frame. Stamps each entry relative to startTimeRef
  //  so timestamps align with Module A's audio chunk offsets.

  const startModuleB_Loop = useCallback(() => {
    const TARGET_INTERVAL_MS = 1000 / 24;
    let lastDetectTime = -TARGET_INTERVAL_MS;
    let rafCount = 0;
    let firstFrameLogged = false;

    function loop() {
      rafCount++;
      const now = performance.now();
      const video = videoRef.current;
      const landmarker = moduleB.faceLandmarkerRef.current as {
        detectForVideo: (v: HTMLVideoElement, t: number) => {
          faceLandmarks?: number[][][];
        };
      } | null;

      // ── Diagnostic: log state every ~1 second ──────────────────────────────
      if (rafCount % 60 === 0) {
        console.log("[MP Loop] state snapshot:", {
          rafCount,
          hasVideo: !!video,
          readyState: video?.readyState,          // needs >= 2
          hasLandmarker: !!landmarker,
          mpReadyRef: moduleB.mpReadyRef.current, // needs true
          timeSinceLastDetect: Math.round(now - lastDetectTime),
          framesCollected: moduleB.frameDataRef.current.length,
        });
      }

      if (
        video &&
        landmarker &&
        moduleB.mpReadyRef.current &&
        video.readyState >= 2 &&
        now - lastDetectTime >= TARGET_INTERVAL_MS
      ) {
        lastDetectTime = now;
        try {
          const result = landmarker.detectForVideo(video, now);
          const landmarks = result.faceLandmarks?.[0] ?? [];

          if (!firstFrameLogged) {
            firstFrameLogged = true;
            console.log("[MP Loop] ✅ First frame detected:", {
              landmarkCount: landmarks.length,
              faceDetected: landmarks.length > 0,
              sampleLandmark: landmarks[0],
            });
          }

          const { eyeContactScore, headPoseScore } = scoreFrame(landmarks as number[][]);

          moduleB.frameDataRef.current.push({
            timestamp: Date.now() - startTimeRef.current,
            eyeContactScore,
            headPoseScore,
            faceDetected: landmarks.length > 0,
          });
        } catch (err) {
          if (moduleB.frameDataRef.current.length === 0) {
            console.error("[MP Loop] ❌ detectForVideo threw:", err);
          }
        }
      }

      moduleB.animFrameRef.current = requestAnimationFrame(loop);
    }

    console.log("[MP Loop] started");
    moduleB.animFrameRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Boot: request media → init MP → ATOMIC START ─────────────────────────

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error_support"); return;
    }
    if (typeof MediaRecorder === "undefined") {
      setState("error_support"); return;
    }

    let cancelled = false;

    async function boot() {
      try {
        // ── Step 1: request camera + mic ─────────────────────────────────────
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360, frameRate: 24 },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // ── Step 2: init Module B (MediaPipe WASM) ───────────────────────────
        //   Run while camera is warm so the user doesn't wait extra.
        setState("initializing_mp");
        await initModuleB_MP(); // always resolves; failure is non-fatal

        if (cancelled) return;

        // ── Step 3: wire up both recorders ───────────────────────────────────

        // Module A — audio only, lean bitrate (clean signal for Whisper)
        moduleA.chunksRef.current = [];
        const audioStream = new MediaStream(stream.getAudioTracks());
        const recA = new MediaRecorder(audioStream, { audioBitsPerSecond: 64_000 });
        moduleA.recorderRef.current = recA;
        recA.ondataavailable = (e) => {
          if (e.data.size > 0) moduleA.chunksRef.current.push(e.data);
        };

        // Module B — full audio+video for playback + MediaPipe frame input
        moduleB.chunksRef.current = [];
        moduleB.frameDataRef.current = [];
        const recB = new MediaRecorder(stream, {
          videoBitsPerSecond: 800_000,
          audioBitsPerSecond: 64_000,
        });
        moduleB.recorderRef.current = recB;
        recB.ondataavailable = (e) => {
          if (e.data.size > 0) moduleB.chunksRef.current.push(e.data);
        };

        // ── Step 4: ATOMIC START — set shared clock, kick off both modules ───
        //   Both .start() calls are in the same synchronous block so t=0 is
        //   identical for Module A audio chunks and Module B frame timestamps.
        startTimeRef.current = Date.now();   // ← SHARED CLOCK t=0
        recA.start(250);                      // Module A: audio chunk every 250 ms
        recB.start(250);                      // Module B: video chunk every 250 ms
        startModuleB_Loop();                  // Module B: face detection rAF loop

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

    return () => { cancelled = true; cleanupAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initModuleB_MP, startModuleB_Loop, cleanupAll]);

  // ── Attach stream to <video> once it mounts ───────────────────────────────
  //
  //  The <video> element only exists in the DOM when state is "recording" or
  //  "stopping". During "requesting" and "initializing_mp" the JSX renders a
  //  spinner instead, so videoRef.current is null when boot() first gets the
  //  stream. This effect fires after the <video> element mounts and wires up
  //  the live stream so the camera preview is visible.
  //
  useEffect(() => {
    if ((state === "recording" || state === "stopping") && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [state]);

  // ── Stop handler ──────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (state !== "recording") return;
    setState("stopping");

    const durationMs = Date.now() - startTimeRef.current;

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    // Stop Module B detection loop immediately
    cancelAnimationFrame(moduleB.animFrameRef.current);

    // Snapshot collected data before recorders flush final chunks
    const frameAnalysis = [...moduleB.frameDataRef.current];
    const mpWasReady = moduleB.mpReadyRef.current;

    // Wait for both recorders to flush their last chunk (onstop fires after flush)
    let aSettled = false;
    let bSettled = false;

    function tryFinish() {
      if (!aSettled || !bSettled) return;

      // Module A output → goes to Whisper / backend
      const audioBlob = new Blob(moduleA.chunksRef.current, { type: "audio/webm" });

      // Module B output → local playback + frame analysis
      const videoBlob = new Blob(moduleB.chunksRef.current, { type: "video/webm" });

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      onDone({
        audioBlob,       // Module A — send to backend (Whisper)
        videoBlob,       // Module B — local review / send to backend
        durationMs,
        topic,
        frameAnalysis,   // Module B — per-frame face data, timestamps from shared clock
        mediapipeReady: mpWasReady,
      });
    }

    const recA = moduleA.recorderRef.current;
    const recB = moduleB.recorderRef.current;

    if (recA && recA.state !== "inactive") {
      recA.onstop = () => { aSettled = true; tryFinish(); };
      recA.stop();
    } else { aSettled = true; }

    if (recB && recB.state !== "inactive") {
      recB.onstop = () => { bSettled = true; tryFinish(); };
      recB.stop();
    } else { bSettled = true; }

    tryFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ─── Requesting / Initializing MP ────────────────────────────────────────

  if (state === "requesting" || state === "initializing_mp") {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-[#6c8ebf] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#6b7280]">
            {state === "requesting" ? "Requesting camera access…" : "Preparing session…"}
          </p>
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

          {/* Recording timer badge */}
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

        {/* Hidden canvas — available for future landmark overlay rendering */}
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
