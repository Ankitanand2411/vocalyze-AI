// ─── Post-recording video analysis ─────────────────────────────────────────
//
//  Runs MediaPipe FaceLandmarker against an already-recorded video blob,
//  AFTER the user has finished recording and is reviewing it.
//
//  CPU-FIRST DESIGN: this app targets devices without a dedicated GPU.
//  Every choice below is tuned for single-threaded WASM execution:
//    - CPU delegate only — no GPU attempt (saves the failed-init roundtrip)
//    - FaceLandmarker only — PoseLandmarker dropped (2× the compute, rarely
//      visible in a typical webcam framing anyway)
//    - 5 samples/sec — enough for gaze/pose trends; every extra sample is
//      a full MediaPipe inference pass on the main thread
//    - 8× playback speed — halves wall-clock time vs. 4×
//    - Pinned WASM CDN URL — avoids a version-resolution request on every run
//    - O(1) blendshape lookup — build a Map once per frame instead of 9×
//      Array.find() linear scans
//
//  SAMPLING STRATEGY: play the video through (sped up) rather than seeking.
//  Seeking forces a re-decode from the nearest keyframe on every jump.
//  Playing through is sequential decode — one pass, much faster.
//
//  Timestamps use the video's own playback position (ms) so they align with
//  the audio blob's timeline (both share the same t=0 from RecordingScreen).

export type Landmark = { x: number; y: number; z: number };
type BlendshapeCategory = { categoryName: string; score: number };
type MPResult = {
  faceLandmarks?: Landmark[][];
  faceBlendshapes?: { categories: BlendshapeCategory[] }[];
};

export interface FrameAnalysisEntry {
  timestamp: number;       // ms from video start (aligns with audio timeline)

  // ── Face: gaze & pose ───────────────────────────────────────────────────
  eyeContactScore: number;
  headPoseScore: number;
  faceDetected: boolean;
  headPitch: number;
  headRoll: number;

  // ── Face: blendshape basics ─────────────────────────────────────────────
  mouthOpenScore: number;
  smileScore: number;
  blinkScore: number;

  // ── Face: extended blendshape emotion signals ───────────────────────────
  anxietyScore: number;
  confusionScore: number;
  stressScore: number;
  frownScore: number;
  squintScore: number;
  mockingScore: number;

  // ── Gaze zone classification ─────────────────────────────────────────────
  gazeZone: "center" | "left" | "right" | "down" | "up" | "away";

  // ── Advanced metrics ──────────────────────────────────────────────────────
  faceWidth: number;

  // ── Body pose — always zeroed (PoseLandmarker dropped for CPU perf) ──────
  poseDetected: false;
  postureScore: 0;
  shoulderLevelDiff: 0;
  spineAngle: 0;
  armsCrossed: false;
}

// ── Gaze zone classifier — with head-yaw compensation ────────────────────
function classifyGazeZone(pts: Landmark[]): "center" | "left" | "right" | "down" | "up" | "away" {
  const leftIrisIdx  = [468, 469, 470, 471];
  const rightIrisIdx = [472, 473, 474, 475];
  if (pts.length <= 475) return "away";
  const ok = [...leftIrisIdx, ...rightIrisIdx, 33, 133, 263, 362, 1, 234, 454].every((i) => pts[i]);
  if (!ok) return "away";

  const leftIrisX    = leftIrisIdx.reduce((s, i) => s + pts[i].x, 0) / 4;
  const leftIrisY    = leftIrisIdx.reduce((s, i) => s + pts[i].y, 0) / 4;
  const leftEyeW     = Math.abs(pts[33].x - pts[133].x) || 0.01;
  const leftOffsetX  = (leftIrisX - (pts[33].x + pts[133].x) / 2) / leftEyeW;

  const rightIrisX   = rightIrisIdx.reduce((s, i) => s + pts[i].x, 0) / 4;
  const rightIrisY   = rightIrisIdx.reduce((s, i) => s + pts[i].y, 0) / 4;
  const rightEyeW    = Math.abs(pts[263].x - pts[362].x) || 0.01;
  const rightOffsetX = (rightIrisX - (pts[263].x + pts[362].x) / 2) / rightEyeW;

  const rawOffsetX  = (leftOffsetX + rightOffsetX) / 2;

  const noseTip    = pts[1];
  const leftCheek  = pts[234];
  const rightCheek = pts[454];
  const cheekMidX  = (leftCheek.x + rightCheek.x) / 2;
  const cheekSpanX = Math.abs(leftCheek.x - rightCheek.x) || 0.1;
  const headYaw    = (noseTip.x - cheekMidX) / cheekSpanX;
  const compensatedOffsetX = rawOffsetX - headYaw * 0.55;

  const leftEyeMidY  = ((pts[159]?.y ?? leftIrisY) + (pts[145]?.y ?? leftIrisY)) / 2;
  const rightEyeMidY = ((pts[386]?.y ?? rightIrisY) + (pts[374]?.y ?? rightIrisY)) / 2;
  const leftEyeH     = Math.abs((pts[159]?.y ?? 0) - (pts[145]?.y ?? 0)) || 0.01;
  const rightEyeH    = Math.abs((pts[386]?.y ?? 0) - (pts[374]?.y ?? 0)) || 0.01;
  const leftOffsetY  = (leftIrisY  - leftEyeMidY)  / leftEyeH;
  const rightOffsetY = (rightIrisY - rightEyeMidY) / rightEyeH;
  const avgOffsetY   = (leftOffsetY + rightOffsetY) / 2;

  if (avgOffsetY        >  0.45) return "down";
  if (avgOffsetY        < -0.35) return "up";
  if (compensatedOffsetX < -0.35) return "left";
  if (compensatedOffsetX >  0.35) return "right";
  return "center";
}

// ── Per-frame face/gaze/emotion scorer ────────────────────────────────────
// blendshapes is a pre-built Map<name, score> — O(1) lookup vs. Array.find()
function scoreFrame(
  landmarks: Landmark[],
  blendshapeMap: Map<string, number>
) {
  const zero = {
    eyeContactScore: 0, headPoseScore: 0, mouthOpenScore: 0, smileScore: 0,
    blinkScore: 0, headPitch: 0, headRoll: 0,
    anxietyScore: 0, confusionScore: 0, stressScore: 0, frownScore: 0, squintScore: 0, mockingScore: 0,
    gazeZone: "away" as const,
    faceWidth: 0,
  };
  if (!landmarks || landmarks.length === 0) return zero;
  const pts = landmarks;

  // Head pose (yaw) — nose tip vs. cheek midpoint
  const noseTip    = pts[1];
  const leftCheek  = pts[234];
  const rightCheek = pts[454];
  let headPoseScore = 1;
  if (noseTip && leftCheek && rightCheek) {
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
    headPoseScore = Math.max(0, 1 - Math.abs(noseTip.x - faceCenterX) / 0.12);
  }

  // Eye contact — iris offset within eye socket
  let eyeContactScore = 0.5;
  if (pts.length > 475) {
    const lIx = (pts[468].x + pts[469].x + pts[470].x + pts[471].x) / 4;
    const rIx = (pts[472].x + pts[473].x + pts[474].x + pts[475].x) / 4;
    const lEyeW = Math.abs((pts[33]?.x ?? 1) - (pts[133]?.x ?? 0)) || 1;
    const rEyeW = Math.abs((pts[263]?.x ?? 1) - (pts[362]?.x ?? 0)) || 1;
    const lGaze = Math.abs(lIx - ((pts[33]?.x ?? 0) + (pts[133]?.x ?? 1)) / 2) / lEyeW;
    const rGaze = Math.abs(rIx - ((pts[263]?.x ?? 0) + (pts[362]?.x ?? 1)) / 2) / rEyeW;
    eyeContactScore = Math.max(0, 1 - (lGaze + rGaze) / 2 / 0.6);
  }

  // Head pitch — nose position along face height axis
  let headPitch = 0;
  const foreheadTop = pts[10];
  const chin        = pts[152];
  if (noseTip && foreheadTop && chin) {
    const faceH = chin.y - foreheadTop.y;
    if (faceH > 0) headPitch = ((noseTip.y - foreheadTop.y) / faceH - 0.45) * 60;
  }

  // Head roll — tilt of eye line
  let headRoll = 0;
  const lEyeInner = pts[133];
  const rEyeInner = pts[362];
  if (lEyeInner && rEyeInner)
    headRoll = Math.atan2(rEyeInner.y - lEyeInner.y, rEyeInner.x - lEyeInner.x) * (180 / Math.PI);

  // Blendshape scores — O(1) Map lookups
  const get = (name: string) => blendshapeMap.get(name) ?? 0;

  // Google Recommended Mouth Open (Speaking) calculation using inner lip landmarks
  const upperLip = pts[13];
  const lowerLip = pts[14];
  let mouthOpenScore = 0.0;
  if (upperLip && lowerLip) {
    const lipDistance = Math.abs(upperLip.y - lowerLip.y);
    // Y coordinates are normalized (0 to 1). A typical distance > 0.01 indicates speaking.
    mouthOpenScore = lipDistance > 0.01 ? 1.0 : 0.0;
  }
  const smileScore     = Math.min(1, get("mouthSmileLeft") + get("mouthSmileRight"));
  const blinkScore     = (get("eyeBlinkLeft") + get("eyeBlinkRight")) / 2;
  const anxietyScore   = get("browInnerUp");
  const confusionScore = (get("browDownLeft") + get("browDownRight")) / 2;
  const stressScore    = (get("mouthPressLeft") + get("mouthPressRight")) / 2;
  const frownScore     = (get("mouthFrownLeft") + get("mouthFrownRight")) / 2;
  const squintScore    = (get("eyeSquintLeft") + get("eyeSquintRight")) / 2;
  
  // Mocking/Unprofessional: Asymmetry (goofy faces, winking, smirks), Sneers (disgust), Pucker (kissy face)
  const asymmetryScore = Math.max(
    Math.abs(get("mouthSmileLeft") - get("mouthSmileRight")),
    Math.abs(get("mouthFrownLeft") - get("mouthFrownRight")),
    Math.abs(get("mouthStretchLeft") - get("mouthStretchRight")),
    Math.abs(get("mouthDimpleLeft") - get("mouthDimpleRight")),
    Math.abs(get("mouthLowerDownLeft") - get("mouthLowerDownRight")),
    Math.abs(get("eyeSquintLeft") - get("eyeSquintRight")),
    Math.abs(get("eyeBlinkLeft") - get("eyeBlinkRight"))
  );
  
  // Lip-to-Jaw Ratio (AU19 detection): Lips parted but jaw closed
  let tongueProtrusion = 0;
  if (pts[13] && pts[14] && pts[10] && pts[152]) {
    const lipGap = Math.abs(pts[13].y - pts[14].y);
    const faceHeight = Math.abs(pts[10].y - pts[152].y) || 1;
    const normalizedGap = lipGap / faceHeight;
    // If lips are parted > 2% of face height, but jaw is nearly shut
    if (normalizedGap > 0.02 && get("jawOpen") < 0.1) {
      tongueProtrusion = 1.0;
    }
  }

  const sneerScore = (get("noseSneerLeft") + get("noseSneerRight")) / 2;
  const puckerScore = get("mouthPucker");
  const mockingScore = Math.max(asymmetryScore, sneerScore, puckerScore, tongueProtrusion);

  const gazeZone = classifyGazeZone(pts);

  const faceWidth = (pts[234] && pts[454]) ? Math.abs(pts[454].x - pts[234].x) : 0;

  return {
    eyeContactScore, headPoseScore, mouthOpenScore, smileScore, blinkScore,
    headPitch, headRoll,
    anxietyScore, confusionScore, stressScore, frownScore, squintScore, mockingScore,
    gazeZone, faceWidth,
  };
}

export interface AnalyzeVideoResult {
  frameAnalysis: FrameAnalysisEntry[];
  mediapipeReady: boolean;
}

// ── CPU-tuned constants ────────────────────────────────────────────────────

// Pinned to match the installed package version — avoids a CDN version
// resolution request on every analysis run.
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

// 8× is the practical maximum most browsers honour before capping.
const PLAYBACK_RATE = 8;

// Sample rate bounds (fps) — derived from Nyquist:
//   gaze/emotion signals change at ~1-2Hz → need ≥4fps to capture them
//   above ~8fps there's no new behavioral information, just wasted CPU
const MIN_SAMPLE_FPS = 4;   // floor — never go slower than this
const MAX_SAMPLE_FPS = 8;   // ceiling — no useful signal above this
const ANALYSIS_BUDGET_MS = 12_000; // target: finish in ≤12 seconds of wall-clock time


/**
 * Analyze a recorded video blob AFTER the fact — call this from the Review
 * screen's "Analyze" action, not during recording.
 *
 * CPU-first: skips GPU delegate entirely, drops PoseLandmarker, and plays
 * the video through at 8× speed rather than seeking frame-by-frame.
 */
export async function analyzeVideo(
  videoBlob: Blob,
  onProgress?: (pct: number) => void
): Promise<AnalyzeVideoResult> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

  // ── Init MediaPipe — CPU delegate only ────────────────────────────────────
  // Skipping the GPU attempt entirely saves a failed-init roundtrip (~200-
  // 600 ms wasted on most laptops/phones that don't expose WebGL compute).
  let faceLandmarker: {
    detectForVideo: (v: HTMLVideoElement, t: number) => MPResult;
  } | null = null;

  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  } catch (err) {
    console.error("[analyzeVideo] MediaPipe init failed:", err);
    return { frameAnalysis: [], mediapipeReady: false };
  }

  // ── Load video off-screen for playback-based sampling ─────────────────────
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = "position:fixed;top:-9999px;width:1px;height:1px";
  video.src = URL.createObjectURL(videoBlob);
  document.body.appendChild(video);

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load recorded video for analysis"));
  });

  // Live-recorded WebM blobs often report duration=Infinity — MediaRecorder
  // doesn't write a Matroska duration header. We only need this for progress
  // reporting so fall back to a blob-size estimate (~25 KB/s at ~200 kbps).
  let durationMs = video.duration * 1000;
  if (!isFinite(durationMs) || durationMs <= 0) {
    durationMs = Math.max((videoBlob.size / 25_000) * 1000, 1000);
  }

  const frameAnalysis: FrameAnalysisEntry[] = [];
  const gazeHistory: string[] = [];

  // ── Adaptive sample rate — benchmark one frame, then compute ideal fps ────
  // Run a single warm-up inference to measure how fast MediaPipe runs on
  // this specific device, then derive the sample interval that keeps total
  // analysis time within ANALYSIS_BUDGET_MS, clamped to [MIN, MAX]_SAMPLE_FPS.
  let sampleIntervalMs = 1000 / 5; // safe default (5fps) if benchmark fails
  // MediaPipe requires strictly monotonically increasing timestamps.
  // Track the last timestamp sent so we never send the same value twice.
  let lastMpTimestamp = -1;
  try {
    // Use performance.now() for the benchmark — this is in the ms-since-page-load
    // domain, which is always > 0 and won't collide with video.currentTime values
    // (which start at 0). We'll switch to performance.now() for all subsequent
    // calls too, since that domain is guaranteed monotonically increasing.
    const benchTs = performance.now();
    const benchStart = benchTs;
    faceLandmarker!.detectForVideo(video, benchTs);
    lastMpTimestamp = benchTs;
    const msPerFrame = performance.now() - benchStart;

    const videoDurationSec = durationMs / 1000;
    const maxAffordableFrames = ANALYSIS_BUDGET_MS / msPerFrame;
    const affordableFps = maxAffordableFrames / videoDurationSec;
    const clampedFps = Math.min(MAX_SAMPLE_FPS, Math.max(MIN_SAMPLE_FPS, affordableFps));
    sampleIntervalMs = 1000 / clampedFps;

    console.log(
      `[analyzeVideo] benchmark: ${msPerFrame.toFixed(0)}ms/frame → ` +
      `affordable=${affordableFps.toFixed(1)}fps → ` +
      `using=${clampedFps.toFixed(1)}fps (interval=${sampleIntervalMs.toFixed(0)}ms)`
    );
  } catch {
    console.warn("[analyzeVideo] benchmark failed — using default 5fps");
  }

  try { video.playbackRate = PLAYBACK_RATE; } catch { /* browser cap — fine */ }


  // ── Playback loop ──────────────────────────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    let lastSampledMs = -Infinity;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };

    function tick() {
      if (settled) return;
      if (video.ended || video.paused) { finish(); return; }

      const tMs = video.currentTime * 1000;

      if (tMs - lastSampledMs >= sampleIntervalMs) {

        lastSampledMs = tMs;
        try {
          // Always use a strictly increasing timestamp for MediaPipe.
          // performance.now() is guaranteed monotonically increasing, unlike
          // video.currentTime which can repeat (e.g. stalls, first frame = 0).
          const mpTs = Math.max(performance.now(), lastMpTimestamp + 1);
          lastMpTimestamp = mpTs;
          const faceResult = faceLandmarker!.detectForVideo(video, mpTs);
          const landmarks   = faceResult.faceLandmarks?.[0] ?? [];

          // Build an O(1) blendshape lookup map once per sampled frame
          const blendshapeMap = new Map<string, number>(
            (faceResult.faceBlendshapes?.[0]?.categories ?? []).map(
              (c) => [c.categoryName, c.score]
            )
          );

          const scores = scoreFrame(landmarks, blendshapeMap);

          frameAnalysis.push({
            timestamp: tMs,
            eyeContactScore: scores.eyeContactScore,
            headPoseScore:   scores.headPoseScore,
            faceDetected:    landmarks.length > 0,
            headPitch:       scores.headPitch,
            headRoll:        scores.headRoll,
            mouthOpenScore:  scores.mouthOpenScore,
            smileScore:      scores.smileScore,
            blinkScore:      scores.blinkScore,
            anxietyScore:    scores.anxietyScore,
            confusionScore:  scores.confusionScore,
            stressScore:     scores.stressScore,
            frownScore:      scores.frownScore,
            squintScore:     scores.squintScore,
            mockingScore:    scores.mockingScore,
            gazeZone:        scores.gazeZone,
            faceWidth:       scores.faceWidth,
            // PoseLandmarker dropped — too expensive on CPU
            poseDetected:      false,
            postureScore:      0,
            shoulderLevelDiff: 0,
            spineAngle:        0,
            armsCrossed:       false,
          });
        } catch (err) {
          if (frameAnalysis.length === 0) {
            console.error("[analyzeVideo] detectForVideo threw:", err);
          }
        }

        onProgress?.(Math.min(99, Math.round((tMs / durationMs) * 100)));
      }

      requestAnimationFrame(tick);
    }

    video.onended = finish;
    video
      .play()
      .then(() => requestAnimationFrame(tick))
      .catch((err) =>
        reject(err instanceof Error ? err : new Error("Failed to play video for analysis"))
      );
  });

  document.body.removeChild(video);
  URL.revokeObjectURL(video.src);
  onProgress?.(100);

  return { frameAnalysis, mediapipeReady: true };
}
