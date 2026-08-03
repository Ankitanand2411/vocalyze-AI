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

// MediaPipe FaceLandmarker returns landmarks as {x, y, z} objects.
type Landmark = { x: number; y: number; z: number };
type BlendshapeCategory = { categoryName: string; score: number };
type MPResult = {
  faceLandmarks?: Landmark[][];
  faceBlendshapes?: { categories: BlendshapeCategory[] }[];
};
type PoseResult = {
  poseLandmarks?: Landmark[][];
};
// 33 MediaPipe Pose landmark indices we care about
const POSE = {
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13,   rightElbow: 14,
  leftWrist: 15,   rightWrist: 16,
  leftHip: 23,     rightHip: 24,
  nose: 0,
} as const;

interface LiveScores {
  eyeContact: number;
  headPose: number;
  mouthOpen: number;
  smile: number;
  posture: number;
  gazeZone: string;
  faceWidth: number;
  isReadingScript: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ── Gaze zone classifier — with head-yaw compensation ────────────────────
//
// Problem with naive iris-offset approach:
//   When the head is slightly turned, the iris shifts in the eye socket
//   even when the person IS looking at the camera. This causes false
//   "left"/"right" readings.
//
// Fix: compute the head's yaw offset (how much the nose deviates from the
//   mid-cheek line) and subtract that from the raw iris offset.
//   Net result: the gaze is measured relative to where the HEAD is pointing,
//   not relative to the absolute frame centre. If the head is turned 5° left
//   and the iris is also shifted 5° left (still looking forward relative to
//   the head), we correctly classify it as "center".
//
function classifyGazeZone(
  pts: Landmark[]
): "center" | "left" | "right" | "down" | "away" {
  const leftIrisIdx  = [468, 469, 470, 471];
  const rightIrisIdx = [472, 473, 474, 475];
  if (pts.length <= 475) return "away";
  const ok = [...leftIrisIdx, ...rightIrisIdx, 33, 133, 263, 362, 1, 234, 454].every((i) => pts[i]);
  if (!ok) return "away";

  // ── Raw iris horizontal offset (normalised by eye width) ──────────────
  const leftIrisX    = leftIrisIdx.reduce((s, i) => s + pts[i].x, 0) / 4;
  const leftIrisY    = leftIrisIdx.reduce((s, i) => s + pts[i].y, 0) / 4;
  const leftEyeW     = Math.abs(pts[33].x - pts[133].x) || 0.01;
  const leftOffsetX  = (leftIrisX - (pts[33].x + pts[133].x) / 2) / leftEyeW;

  const rightIrisX   = rightIrisIdx.reduce((s, i) => s + pts[i].x, 0) / 4;
  const rightIrisY   = rightIrisIdx.reduce((s, i) => s + pts[i].y, 0) / 4;
  const rightEyeW    = Math.abs(pts[263].x - pts[362].x) || 0.01;
  const rightOffsetX = (rightIrisX - (pts[263].x + pts[362].x) / 2) / rightEyeW;

  const rawOffsetX = (leftOffsetX + rightOffsetX) / 2;

  // ── Head yaw compensation ─────────────────────────────────────────────
  // noseTip x relative to midpoint between cheeks → head turn signal.
  // When head turns right: nose moves right of cheek midpoint → positive yaw.
  // The iris follows the same direction. Scale factor ~0.6 found empirically.
  const noseTip     = pts[1];
  const leftCheek   = pts[234];
  const rightCheek  = pts[454];
  const cheekMidX   = (leftCheek.x + rightCheek.x) / 2;
  const cheekSpanX  = Math.abs(leftCheek.x - rightCheek.x) || 0.1;
  const headYaw     = (noseTip.x - cheekMidX) / cheekSpanX; // ~-0.5 to +0.5
  const yawCorrection = headYaw * 0.55; // empirical compensation factor

  const compensatedOffsetX = rawOffsetX - yawCorrection;

  // ── Vertical offset ───────────────────────────────────────────────────
  // Use upper-eyelid (159/386) vs lower-eyelid (145/374) midpoint.
  const leftEyeMidY  = ((pts[159]?.y ?? leftIrisY) + (pts[145]?.y ?? leftIrisY)) / 2;
  const rightEyeMidY = ((pts[386]?.y ?? rightIrisY) + (pts[374]?.y ?? rightIrisY)) / 2;
  const leftEyeH     = Math.abs((pts[159]?.y ?? 0) - (pts[145]?.y ?? 0)) || 0.01;
  const rightEyeH    = Math.abs((pts[386]?.y ?? 0) - (pts[374]?.y ?? 0)) || 0.01;
  const leftOffsetY  = (leftIrisY  - leftEyeMidY)  / leftEyeH;
  const rightOffsetY = (rightIrisY - rightEyeMidY) / rightEyeH;
  const avgOffsetY   = (leftOffsetY + rightOffsetY) / 2;

  // ── Classify ──────────────────────────────────────────────────────────
  // Thresholds are deliberately generous:
  //   ±0.35 horizontal (was ±0.25) — iris has to be noticeably off-centre
  //   0.45  vertical   (was 0.30)  — looking down has to be pronounced
  if (avgOffsetY   >  0.45) return "down";
  if (compensatedOffsetX < -0.35) return "left";
  if (compensatedOffsetX >  0.35) return "right";
  return "center";
}

// ── Body pose scorer (from PoseLandmarker 33 landmarks) ──────────────────
function scorePose(poseLandmarks: Landmark[]): {
  postureScore: number;
  shoulderLevelDiff: number;
  spineAngle: number;
  armsCrossed: boolean;
} {
  const zero = { postureScore: 0, shoulderLevelDiff: 0, spineAngle: 0, armsCrossed: false };
  if (!poseLandmarks || poseLandmarks.length < 25) return zero;
  const lSh = poseLandmarks[POSE.leftShoulder];
  const rSh = poseLandmarks[POSE.rightShoulder];
  const lHip = poseLandmarks[POSE.leftHip];
  const rHip = poseLandmarks[POSE.rightHip];
  const lWr = poseLandmarks[POSE.leftWrist];
  const rWr = poseLandmarks[POSE.rightWrist];
  if (!lSh || !rSh || !lHip || !rHip) return zero;

  // Shoulder level diff (0 = perfectly even)
  const shoulderLevelDiff = Math.abs(lSh.y - rSh.y);

  // Spine angle: angle between mid-shoulder and mid-hip from vertical
  const midShX = (lSh.x + rSh.x) / 2;
  const midShY = (lSh.y + rSh.y) / 2;
  const midHiX = (lHip.x + rHip.x) / 2;
  const midHiY = (lHip.y + rHip.y) / 2;
  const spineAngle = Math.abs(
    Math.atan2(midShX - midHiX, midHiY - midShY) * (180 / Math.PI)
  );

  // Arms crossed: both wrists are between the shoulders horizontally
  const shoulderMinX = Math.min(lSh.x, rSh.x);
  const shoulderMaxX = Math.max(lSh.x, rSh.x);
  const armsCrossed =
    !!lWr && !!rWr &&
    lWr.x > shoulderMinX && lWr.x < shoulderMaxX &&
    rWr.x > shoulderMinX && rWr.x < shoulderMaxX &&
    (lWr.y < lSh.y + 0.1) && (rWr.y < rSh.y + 0.1); // wrists near torso height

  // Posture score: penalise uneven shoulders and spine lean
  const shoulderPenalty = Math.min(1, shoulderLevelDiff / 0.06);
  const spinePenalty    = Math.min(1, spineAngle / 15);
  const crossedPenalty  = armsCrossed ? 0.3 : 0;
  const postureScore    = Math.max(0, 1 - shoulderPenalty * 0.4 - spinePenalty * 0.4 - crossedPenalty);

  return { postureScore, shoulderLevelDiff, spineAngle, armsCrossed };
}

function scoreFrame(
  landmarks: Landmark[],
  blendshapes?: BlendshapeCategory[]
): {
  eyeContactScore: number;
  headPoseScore: number;
  mouthOpenScore: number;
  smileScore: number;
  blinkScore: number;
  headPitch: number;
  headRoll: number;
  // extended blendshapes
  anxietyScore: number;
  confusionScore: number;
  stressScore: number;
  frownScore: number;
  squintScore: number;
  // gaze zone
  gazeZone: "center" | "left" | "right" | "down" | "away";
} {
  const zero = {
    eyeContactScore: 0, headPoseScore: 0, mouthOpenScore: 0, smileScore: 0,
    blinkScore: 0, headPitch: 0, headRoll: 0,
    anxietyScore: 0, confusionScore: 0, stressScore: 0, frownScore: 0, squintScore: 0,
    gazeZone: "away" as const,
  };
  if (!landmarks || landmarks.length === 0) return zero;
  const pts = landmarks;

  // ── Head pose yaw ────────────────────────────────────────────────────
  const noseTip    = pts[1];
  const leftCheek  = pts[234];
  const rightCheek = pts[454];
  let headPoseScore = 1;
  if (noseTip && leftCheek && rightCheek) {
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
    headPoseScore = Math.max(0, 1 - Math.abs(noseTip.x - faceCenterX) / 0.12);
  }

  // ── Eye contact (iris gaze offset) ──────────────────────────────────
  let eyeContactScore = 0.5;
  const leftIrisIdx  = [468, 469, 470, 471];
  const rightIrisIdx = [472, 473, 474, 475];
  const hasIris = pts.length > 475 && leftIrisIdx.every((i) => pts[i]) && rightIrisIdx.every((i) => pts[i]);
  if (hasIris) {
    const leftIrisX  = leftIrisIdx.reduce((s, i) => s + pts[i].x, 0) / 4;
    const leftEyeW   = Math.abs((pts[33]?.x ?? 1) - (pts[133]?.x ?? 0)) || 1;
    const leftGaze   = Math.abs(leftIrisX  - ((pts[33]?.x  ?? 0) + (pts[133]?.x ?? 1)) / 2) / leftEyeW;
    const rightIrisX = rightIrisIdx.reduce((s, i) => s + pts[i].x, 0) / 4;
    const rightEyeW  = Math.abs((pts[263]?.x ?? 1) - (pts[362]?.x ?? 0)) || 1;
    const rightGaze  = Math.abs(rightIrisX - ((pts[263]?.x ?? 0) + (pts[362]?.x ?? 1)) / 2) / rightEyeW;
    eyeContactScore  = Math.max(0, 1 - (leftGaze + rightGaze) / 2 / 0.6);
  }

  // ── Pitch ─────────────────────────────────────────────────────────────
  let headPitch = 0;
  const foreheadTop = pts[10];
  const chin        = pts[152];
  if (noseTip && foreheadTop && chin) {
    const faceH = chin.y - foreheadTop.y;
    if (faceH > 0) headPitch = ((noseTip.y - foreheadTop.y) / faceH - 0.45) * 60;
  }

  // ── Roll ──────────────────────────────────────────────────────────────
  let headRoll = 0;
  const lEyeInner = pts[133];
  const rEyeInner = pts[362];
  if (lEyeInner && rEyeInner)
    headRoll = Math.atan2(rEyeInner.y - lEyeInner.y, rEyeInner.x - lEyeInner.x) * (180 / Math.PI);

  // ── Blendshapes ────────────────────────────────────────────────────────
  let mouthOpenScore = 0, smileScore = 0, blinkScore = 0;
  let anxietyScore = 0, confusionScore = 0, stressScore = 0, frownScore = 0, squintScore = 0;
  if (blendshapes && blendshapes.length > 0) {
    const find = (name: string) => blendshapes.find((c) => c.categoryName === name)?.score ?? 0;
    // basics
    // NOTE: MediaPipe FaceLandmarker uses "jawOpen" not "mouthOpen" for mouth aperture.
    // We use jawOpen as primary, mouthOpen as fallback (older model versions).
    mouthOpenScore = find("jawOpen") || find("mouthOpen");
    smileScore     = Math.min(1, find("mouthSmileLeft") + find("mouthSmileRight"));
    blinkScore     = (find("eyeBlinkLeft") + find("eyeBlinkRight")) / 2;
    // extended emotion signals
    anxietyScore    = find("browInnerUp");
    confusionScore  = (find("browDownLeft") + find("browDownRight")) / 2;
    stressScore     = (find("mouthPressLeft") + find("mouthPressRight")) / 2;
    frownScore      = (find("mouthFrownLeft") + find("mouthFrownRight")) / 2;
    squintScore     = (find("eyeSquintLeft") + find("eyeSquintRight")) / 2;
  }

  // ── Gaze zone ─────────────────────────────────────────────────────────
  const gazeZone = classifyGazeZone(pts);

  // ── Face Width (Framing) ──────────────────────────────────────────────
  let faceWidth = 0;
  if (pts[234] && pts[454]) {
    // 234 is outer left cheek, 454 is outer right cheek in MediaPipe topology
    faceWidth = Math.abs(pts[454].x - pts[234].x);
  }

  return {
    eyeContactScore, headPoseScore, mouthOpenScore, smileScore, blinkScore,
    headPitch, headRoll,
    anxietyScore, confusionScore, stressScore, frownScore, squintScore,
    gazeZone, faceWidth,
  };
}

// ─── Canvas face-mesh drawing ─────────────────────────────────────────────────

const EYE_L  = [33, 160, 158, 133, 153, 144];
const EYE_R  = [263, 387, 385, 362, 380, 373];
const MOUTH  = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const IRIS_L = [468, 469, 470, 471];
const IRIS_R = [472, 473, 474, 475];

function drawPolyline(
  ctx: CanvasRenderingContext2D, pts: Landmark[], indices: number[],
  cw: number, ch: number, color: string, close = false
) {
  const points = indices.map((i) => pts[i]).filter(Boolean);
  if (points.length < 2) return;
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.moveTo(points[0].x * cw, points[0].y * ch);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * cw, points[i].y * ch);
  if (close) ctx.closePath();
  ctx.stroke();
}

function drawFaceMesh(canvas: HTMLCanvasElement, video: HTMLVideoElement, landmarks: Landmark[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = video.videoWidth || video.clientWidth;
  const h = video.videoHeight || video.clientHeight;
  if (canvas.width !== w)  canvas.width  = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (landmarks.length === 0) return;
  const cw = canvas.width, ch = canvas.height;
  // Mesh dots
  ctx.fillStyle = "rgba(108,142,191,0.25)";
  for (const pt of landmarks) {
    ctx.beginPath(); ctx.arc(pt.x * cw, pt.y * ch, 1, 0, Math.PI * 2); ctx.fill();
  }
  // Feature contours
  drawPolyline(ctx, landmarks, [...EYE_L, EYE_L[0]],   cw, ch, "rgba(108,180,255,0.7)", true);
  drawPolyline(ctx, landmarks, [...EYE_R, EYE_R[0]],   cw, ch, "rgba(108,180,255,0.7)", true);
  drawPolyline(ctx, landmarks, [...MOUTH, MOUTH[0]],   cw, ch, "rgba(220,150,150,0.6)", true);
  // Iris dots
  ctx.fillStyle = "rgba(100,210,255,0.9)";
  for (const idx of [...IRIS_L, ...IRIS_R]) {
    const pt = landmarks[idx];
    if (!pt) continue;
    ctx.beginPath(); ctx.arc(pt.x * cw, pt.y * ch, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecordingScreen({
  topic,
  onDone,
  onBack,
}: RecordingScreenProps) {
  const [state, setState] = useState<RecordingState>("requesting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveScores, setLiveScores] = useState<LiveScores | null>(null);
  const liveScoreTickRef = useRef(0);
  const gazeHistoryRef = useRef<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isBlurEnabled, setIsBlurEnabled] = useState(false);

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
    faceLandmarkerRef: useRef<unknown>(null),
    poseLandmarkerRef: useRef<unknown>(null), // PoseLandmarker — body pose
    segmenterRef: useRef<unknown>(null),      // ImageSegmenter — background blur
    animFrameRef: useRef<number>(0),
    frameDataRef: useRef<FrameAnalysisEntry[]>([]),
    mpReadyRef: useRef(false),
    poseReadyRef: useRef(false),
    segmenterReadyRef: useRef(false),
    maskBufferRef: useRef<ImageData | null>(null),
    offCanvasRef: useRef<HTMLCanvasElement | null>(null),
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
      const { FaceLandmarker, PoseLandmarker, ImageSegmenter, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      // ── FaceLandmarker (GPU → CPU fallback) ───────────────────────────────
      const createFace = async (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate,
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        });

      try {
        moduleB.faceLandmarkerRef.current = await createFace("GPU");
        console.log("[Module B] FaceLandmarker ready (GPU)");
      } catch {
        console.warn("[Module B] GPU delegate failed — retrying with CPU");
        moduleB.faceLandmarkerRef.current = await createFace("CPU");
        console.log("[Module B] FaceLandmarker ready (CPU fallback)");
      }
      moduleB.mpReadyRef.current = true;

      // ── PoseLandmarker (GPU → CPU fallback) — non-fatal if fails ─────────
      try {
        const createPose = async (delegate: "GPU" | "CPU") =>
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate,
            },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        try {
          moduleB.poseLandmarkerRef.current = await createPose("GPU");
          console.log("[Module B] PoseLandmarker ready (GPU)");
        } catch {
          moduleB.poseLandmarkerRef.current = await createPose("CPU");
          console.log("[Module B] PoseLandmarker ready (CPU fallback)");
        }
        moduleB.poseReadyRef.current = true;
      } catch (poseErr) {
        console.warn("[Module B] PoseLandmarker failed (non-fatal):", poseErr);
        moduleB.poseReadyRef.current = false;
      }

      // ── ImageSegmenter (CPU only for stability) ──────────────────────────
      try {
        moduleB.segmenterRef.current = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-assets/selfie_segmentation.tflite",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        moduleB.segmenterReadyRef.current = true;
        console.log("[Module B] ImageSegmenter ready");
      } catch (err) {
        console.warn("[Module B] ImageSegmenter init failed:", err);
      }
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
      const faceLandmarker = moduleB.faceLandmarkerRef.current as {
        detectForVideo: (v: HTMLVideoElement, t: number) => MPResult;
      } | null;
      const poseLandmarker = moduleB.poseLandmarkerRef.current as {
        detectForVideo: (v: HTMLVideoElement, t: number) => PoseResult;
      } | null;

      // ── Diagnostic: log state every ~1 second ──────────────────────────────
      if (rafCount % 60 === 0) {
        console.log("[MP Loop] state snapshot:", {
          rafCount,
          hasVideo: !!video,
          readyState: video?.readyState,
          hasFaceLandmarker: !!faceLandmarker,
          hasPoseLandmarker: !!poseLandmarker,
          mpReadyRef: moduleB.mpReadyRef.current,
          poseReadyRef: moduleB.poseReadyRef.current,
          timeSinceLastDetect: Math.round(now - lastDetectTime),
          framesCollected: moduleB.frameDataRef.current.length,
        });
      }

      if (
        video &&
        faceLandmarker &&
        moduleB.mpReadyRef.current &&
        video.readyState >= 2 &&
        now - lastDetectTime >= TARGET_INTERVAL_MS
      ) {
        lastDetectTime = now;
        try {
          // ── Face + blendshapes + gaze ───────────────────────────────────────
          const faceResult  = faceLandmarker.detectForVideo(video, now);
          const landmarks   = faceResult.faceLandmarks?.[0]  ?? [];
          const blendshapes = faceResult.faceBlendshapes?.[0]?.categories ?? [];

          if (!firstFrameLogged) {
            firstFrameLogged = true;
            console.log("[MP Loop] ✅ First frame detected:", {
              landmarkCount: landmarks.length,
              blendshapeCount: blendshapes.length,
              faceDetected: landmarks.length > 0,
            });
            // Log all blendshape names so we can verify the exact API names
            if (blendshapes.length > 0) {
              console.log("[MP Blendshapes] Available names:", blendshapes.map((b) => b.categoryName));
              console.log("[MP Blendshapes] jawOpen:", blendshapes.find((b) => b.categoryName === "jawOpen")?.score ?? "NOT FOUND");
              console.log("[MP Blendshapes] mouthOpen:", blendshapes.find((b) => b.categoryName === "mouthOpen")?.score ?? "NOT FOUND");
            }
          }

          const canvas = canvasRef.current;

          // ── Background Blur (ImageSegmenter) ─────────────────────────────
          if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (isBlurEnabled && segmenter && moduleB.segmenterReadyRef.current) {
              try {
                const segResult = segmenter.segmentForVideo(video, now);
                if (segResult.categoryMask) {
                  const mask = segResult.categoryMask.getAsUint8Array();
                  const w = segResult.categoryMask.width;
                  const h = segResult.categoryMask.height;
                  
                  // Initialize buffers if needed
                  if (!moduleB.maskBufferRef.current || moduleB.maskBufferRef.current.width !== w) {
                    moduleB.maskBufferRef.current = new ImageData(w, h);
                    moduleB.offCanvasRef.current = document.createElement("canvas");
                    moduleB.offCanvasRef.current.width = w;
                    moduleB.offCanvasRef.current.height = h;
                  }
                  
                  const imgData = moduleB.maskBufferRef.current;
                  const data = imgData.data;
                  // Fast iteration to set alpha channel based on segmentation mask
                  for (let i = 0; i < mask.length; i++) {
                    data[i * 4 + 3] = mask[i] > 0 ? 255 : 0; 
                  }
                  
                  const offCanvas = moduleB.offCanvasRef.current!;
                  const offCtx = offCanvas.getContext("2d")!;
                  offCtx.putImageData(imgData, 0, 0);
                  
                  // Draw scaled mask to main canvas
                  ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
                  // Composite video inside the mask (leaving the rest transparent)
                  ctx.globalCompositeOperation = "source-in";
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  // Reset for face mesh
                  ctx.globalCompositeOperation = "source-over";
                }
              } catch (segErr) {
                // Ignore segmenter errors
              }
            }
          }

          if (canvas) drawFaceMesh(canvas, video, landmarks);

          const scores = scoreFrame(landmarks, blendshapes);

          // ── Body pose (non-fatal) ───────────────────────────────────────────
          let poseScores = { postureScore: 0, shoulderLevelDiff: 0, spineAngle: 0, armsCrossed: false };
          let poseDetected = false;
          if (poseLandmarker && moduleB.poseReadyRef.current) {
            try {
              const poseResult    = poseLandmarker.detectForVideo(video, now);
              // BUG FIX: The MediaPipe PoseLandmarkerResult property is `.landmarks`, not `.poseLandmarks`
              // (Unlike FaceLandmarker which uses `.faceLandmarks`)
              const poseLandmarks = poseResult.landmarks?.[0] ?? [];
              poseDetected = poseLandmarks.length > 0;
              if (poseDetected) {
                poseScores = scorePose(poseLandmarks);
                // Log first successful pose detection
                if (moduleB.frameDataRef.current.filter((f) => f.poseDetected).length === 0) {
                  console.log("[MP Loop] 🧍 First pose detected — landmark count:", poseLandmarks.length);
                }
              } else if (rafCount % 120 === 0) {
                // Log every ~2s if pose isn't being detected — helps diagnose camera-distance issues
                console.warn("[MP Loop] 🧍 Pose not detected — is upper body visible in frame? poseLandmarks:", poseLandmarks.length);
              }
            } catch (poseErr) {
              if (moduleB.frameDataRef.current.length < 5) {
                console.error("[MP Loop] 🧍 Pose detectForVideo threw:", poseErr);
              }
            }
          }
          // ── Script Reading Detection ──────────────────────────────────
          gazeHistoryRef.current.push(scores.gazeZone);
          if (gazeHistoryRef.current.length > 40) gazeHistoryRef.current.shift();
          
          let isReadingScript = false;
          // Only check if we have enough history and the head is relatively still
          if (gazeHistoryRef.current.length === 40 && scores.headPoseScore > 0.8) {
             const hist = gazeHistoryRef.current;
             let switches = 0;
             for (let i = 1; i < hist.length; i++) {
                if (hist[i] !== hist[i-1] && (hist[i] === "left" || hist[i] === "right")) {
                   switches++;
                }
             }
             // If eyes darted side-to-side 4+ times in the last ~1.5 seconds
             isReadingScript = switches >= 4;
          }

          moduleB.frameDataRef.current.push({
            timestamp:          Date.now() - startTimeRef.current,
            // face
            eyeContactScore:    scores.eyeContactScore,
            headPoseScore:      scores.headPoseScore,
            faceDetected:       landmarks.length > 0,
            headPitch:          scores.headPitch,
            headRoll:           scores.headRoll,
            // blendshape basics
            mouthOpenScore:     scores.mouthOpenScore,
            smileScore:         scores.smileScore,
            blinkScore:         scores.blinkScore,
            // extended blendshapes
            anxietyScore:       scores.anxietyScore,
            confusionScore:     scores.confusionScore,
            stressScore:        scores.stressScore,
            frownScore:         scores.frownScore,
            squintScore:        scores.squintScore,
            // gaze zone
            gazeZone:           scores.gazeZone,
            // advanced
            faceWidth:          scores.faceWidth,
            isReadingScript,
            // body pose
            poseDetected,
            postureScore:       poseScores.postureScore,
            shoulderLevelDiff:  poseScores.shoulderLevelDiff,
            spineAngle:         poseScores.spineAngle,
            armsCrossed:        poseScores.armsCrossed,
          });

          // Update live UI scores every ~500 ms
          liveScoreTickRef.current++;
          if (liveScoreTickRef.current % 12 === 0) {
            setLiveScores({
              eyeContact: scores.eyeContactScore,
              headPose:   scores.headPoseScore,
              mouthOpen:  scores.mouthOpenScore,
              smile:      scores.smileScore,
              posture:    poseScores.postureScore,
              gazeZone:   scores.gazeZone,
              faceWidth:  scores.faceWidth,
              isReadingScript,
            });
          }
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

  // ── Boot: request media → attach preview → init MP → ATOMIC START ────────

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
        // We request 720p (1280x720) instead of 360p. 
        // Why? Requesting low resolutions often causes the browser to digitally 
        // crop the center of the webcam sensor. We need the full wide-angle view
        // so that the shoulders/torso are visible for PoseLandmarker.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, frameRate: 24 },
          audio: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;

        // The <video> element is now rendered unconditionally (see JSX below),
        // so it already exists here — attach immediately and let it start
        // buffering while MediaPipe's WASM/model loads in Step 2. This is
        // what makes readyState >= 2 by the time the shared clock starts,
        // instead of losing the first several seconds of frames.
        if (videoRef.current) videoRef.current.srcObject = stream;

        // ── Step 2: init Module B (MediaPipe WASM) ───────────────────────────
        //   Camera preview is already warming up in parallel with this load.
        setState("initializing_mp");
        await initModuleB_MP(); // always resolves; failure is non-fatal

        if (cancelled) return;

        // ── Step 3: wire up both recorders ───────────────────────────────────

        // Module A — audio only, high quality (128 kbps) for Whisper/Librosa
        moduleA.chunksRef.current = [];
        const audioStream = new MediaStream(stream.getAudioTracks());
        const recA = new MediaRecorder(audioStream, { audioBitsPerSecond: 128_000 });
        moduleA.recorderRef.current = recA;
        recA.ondataavailable = (e) => {
          if (e.data.size > 0) moduleA.chunksRef.current.push(e.data);
        };

        // Module B — full audio+video for playback + MediaPipe frame input
        moduleB.chunksRef.current = [];
        moduleB.frameDataRef.current = [];
        const recB = new MediaRecorder(stream, {
          videoBitsPerSecond: 800_000,
          audioBitsPerSecond: 128_000,
        });
        moduleB.recorderRef.current = recB;
        recB.ondataavailable = (e) => {
          if (e.data.size > 0) moduleB.chunksRef.current.push(e.data);
        };

        // ── Step 4: ATOMIC START — set shared clock, kick off both modules ───
        //   Both .start() calls are in the same synchronous block so t=0 is
        //   identical for Module A audio chunks and Module B frame timestamps.
        //   By this point the <video> has had the entire MP init duration to
        //   warm up, so the detection loop should hit readyState >= 2 almost
        //   immediately instead of after a multi-second delay.
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

  // NOTE: the old "attach stream to <video> once it mounts" effect has been
  // removed. The <video> element is now always in the DOM (see JSX below),
  // so Step 1 of boot() can attach the stream directly — no more waiting on
  // a state transition before the camera starts warming up.

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

  // ─── Requesting / Initializing / Recording / Stopping ────────────────────
  //
  //  The <video> element is now rendered in every one of these states so it
  //  can attach the stream and start buffering as early as possible — this
  //  is what fixes the multi-second gap at the start of frameAnalysis.
  //  Overlays (spinner / timer / finishing) are absolutely positioned on top.

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

        {/* Video preview — always mounted (requesting → initializing_mp → recording → stopping) */}
        <div className="relative rounded-2xl overflow-hidden bg-[#1a1a2e] aspect-video shadow-md mb-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            // Apply CSS blur to the raw video element if background blur is enabled
            style={{ filter: isBlurEnabled ? 'blur(12px)' : 'none', transition: 'filter 0.3s ease' }}
            className="w-full h-full object-cover"
            aria-label="Live camera preview"
          />

          {/* Requesting / preparing overlay */}
          {(state === "requesting" || state === "initializing_mp") && (
            <div className="absolute inset-0 bg-[#1a1a2e]/70 flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full border-2 border-[#6c8ebf] border-t-transparent animate-spin mx-auto mb-4" />
                <p className="text-sm text-white">
                  {state === "requesting" ? "Requesting camera access…" : "Preparing session…"}
                </p>
              </div>
            </div>
          )}

          {/* Recording timer + live scores */}
          {state === "recording" && (
            <>
              {/* Top Controls */}
              <div className="absolute top-4 left-4 flex items-center gap-3">
                <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#b45309] pulse-dot" aria-hidden="true" />
                  <span className="text-white text-xs font-medium tabular-nums">
                    {formatDuration(elapsedMs)}
                  </span>
                </div>
                
                {/* Blur Toggle */}
                {moduleB.segmenterReadyRef.current && (
                  <button
                    onClick={() => setIsBlurEnabled(!isBlurEnabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                      isBlurEnabled 
                        ? "bg-[#6c8ebf] text-white" 
                        : "bg-black/30 backdrop-blur-sm text-white/70 hover:bg-black/50"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Blur BG
                  </button>
                )}
              </div>
              
              {/* Warnings */}
              <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                {liveScores?.isReadingScript && (
                  <div className="bg-red-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
                    👀 Reading Script?
                  </div>
                )}
                {liveScores && liveScores.faceWidth > 0.6 && (
                  <div className="bg-amber-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                    ⚠️ Move Back
                  </div>
                )}
                {liveScores && liveScores.faceWidth < 0.15 && liveScores.faceWidth > 0 && (
                  <div className="bg-amber-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                    ⚠️ Move Closer
                  </div>
                )}
              </div>

              {liveScores && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-3 flex-wrap">
                  {[
                    { label: "👁 Eye",     val: liveScores.eyeContact, isNum: true },
                    { label: "🙂 Head",    val: liveScores.headPose,   isNum: true },
                    { label: "🧍 Posture", val: liveScores.posture,    isNum: true },
                    { label: "😄 Smile",   val: liveScores.mouthOpen,  isNum: true },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
                      <span className="text-[10px] text-white/70">{label}</span>
                      <span className="text-[10px] font-semibold text-white">{Math.round(val * 100)}%</span>
                    </div>
                  ))}
                  {/* Gaze zone badge — text not % */}
                  <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
                    <span className="text-[10px] text-white/70">👀 Gaze</span>
                    <span className={`text-[10px] font-semibold ${
                      liveScores.gazeZone === "center" ? "text-green-400" : "text-amber-400"
                    }`}>
                      {liveScores.gazeZone}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Stopping overlay */}
          {state === "stopping" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <p className="text-white text-sm">Finishing…</p>
            </div>
          )}
        </div>

        {/* Canvas face-mesh overlay — sits on top of video */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        />

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
