# Vocalyze AI — Research & Technical Reasoning

> *Why* each key decision was made — theory, tradeoffs, and evidence.
> For *what* the system looks like, see [`Architecture.md`](Architecture.md).
> For *current task status*, see [`decision.md`](decision.md).

_Last updated: August 2026_

---

## 1. Why Post-Recording Analysis (Not Live)

The original architecture ran MediaPipe during recording inside a `requestAnimationFrame` loop.

**Problems with live analysis:**
- MediaPipe WASM competes with `MediaRecorder` for the CPU during the exact moment recording quality matters most → dropped frames, audio glitches
- `rAF` timing is tied to screen refresh rate (60fps) → unpredictable, inconsistent timestamps
- Live badges mid-answer ("Reading Script?") break the "calm practice mirror" UX goal
- MediaPipe had to finish loading *before* recording could start → 2–4 second spinner

**Post-recording advantages:**
- Recording starts immediately — no waiting for WASM
- No real-time constraint — analysis takes as long as it needs
- Adaptive, device-speed-aware sampling rate
- Cleaner separation: record → review → analyze → submit

---

## 2. Why Seek-Based Sampling Failed

The first post-recording approach sought to each sample point:
```typescript
video.currentTime = t / 1000;
await waitForSeekedEvent();
faceLandmarker.detectForVideo(video, t);
```

**Root cause of failure:** `MediaRecorder` writes a streaming WebM container with no Matroska seek index. Without a seek index:
- `video.duration` returns `Infinity`
- `onseeked` **never fires** → `await` hangs forever at 0%
- Even when it does work, each seek forces a keyframe re-decode (~300ms overhead × 84 seeks for a 7s video = ~25 seconds)

**Fix:** Play the video through once at 8× speed and sample frames as they arrive (sequential decode — one pass, no re-decoding).

**WebM duration workaround for the progress bar:**
```typescript
// blob size ÷ ~25 KB/s (≈200 kbps) gives a rough second estimate
durationMs = Math.max((videoBlob.size / 25_000) * 1000, 1000);
```
Used only for the loading bar percentage, not for sampling logic.

---

## 3. Why CPU-First (Skip GPU Attempt)

MediaPipe supports `GPU` (WebGL) and `CPU` (WASM) delegates.

**Why GPU seems better but isn't:**
- Budget laptops, Chromebooks, and most phones expose a WebGL context but not real compute-capable GPU
- The GPU delegate silently fails and falls back to CPU anyway — after wasting **200–600ms** on a failed init
- The original code tried GPU first, then CPU on failure → doubled init time on most real-world devices

**Why CPU is fine:**
- MediaPipe's WASM runtime uses SIMD instructions
- For `face_landmarker` (float16): 80–400ms per frame → fast enough for 4–8fps target
- No extra init cost, no failed attempt roundtrip

---

## 4. Why PoseLandmarker Was Dropped

PoseLandmarker (33 body joints) computed posture score, spine angle, and arms-crossed detection.

**Why it was removed:**
1. It is a second full neural network on top of FaceLandmarker → nearly doubles CPU inference time per frame (~150ms + ~150ms = ~300ms total)
2. Webcam recordings are framed chest-up — hips are almost never visible, making spine angle and arms-crossed detection unreliable
3. Head pitch/roll from FaceLandmarker already captures the key posture signals (slouching, leaning)

Can be re-enabled as an opt-in on confirmed GPU devices in future.

---

## 5. FPS — What It Is and Why 4–8fps Is the Right Range

**FPS here = how many frames per second of recording MediaPipe analyzes** (not camera FPS).

**Why not analyze all 24 camera fps?**
```
24 frames/sec × 200ms per inference (CPU) = 4,800ms per second of video
A 7-second video takes 33 seconds to analyze — unacceptable
```

**Scientific lower bound — Nyquist–Shannon Theorem:**
> To capture a signal changing at frequency F Hz, sample at ≥ 2F Hz.

Human gaze and facial expressions change at most **1–2 times per second** during speech:
```
Signal frequency ≈ 2 Hz → minimum sample rate = 4 fps
```
Above **8fps** there is no new behavioral information — just wasted CPU.

**Practical range: 4–8fps** regardless of device speed.

---

## 6. Adaptive FPS — Why Benchmark at Runtime

Different devices run MediaPipe at very different speeds. A fixed rate is either too slow (wastes time on fast devices) or too fast (misses the budget on slow ones).

**Algorithm:**
```typescript
// 1. Measure one inference
const benchStart = performance.now();
faceLandmarker.detectForVideo(video, 0);
const msPerFrame = performance.now() - benchStart;

// 2. Compute affordable FPS within 12s budget
const affordableFps = (12_000 / msPerFrame) / videoDurationSec;

// 3. Clamp to useful range
const finalFps = Math.min(8, Math.max(4, affordableFps));
```

| Device | ms/frame | Affordable FPS | Final FPS |
|---|---|---|---|
| Slow laptop | 400ms | 4.3 | **4fps** (min clamp) |
| Average laptop | 150ms | 11.4 | **8fps** (max clamp) |
| Fast desktop | 60ms | 28.6 | **8fps** (max clamp) |

DevTools log on every run:
```
[analyzeVideo] benchmark: 142ms/frame → affordable=11.9fps → using=8.0fps (interval=125ms)
```

---

## 7. Why CDN-Hosted Models Are Acceptable

MediaPipe downloads ~7.6 MB on first analysis click:
- WASM runtime: ~2.5 MB (from `jsdelivr`)
- `face_landmarker.task` (float16): ~5.1 MB (from Google CDN)

**After first load** the browser caches both files → zero download on repeat visits.

**Self-hosting was considered but removed from scope:** The backend (Whisper API, Groq/Llama-3, Supabase) also requires internet. Offline use is not achievable regardless of whether model files are self-hosted. Both the CDN and backend fail together. Solution: do one warm-up run on demo WiFi before presenting.

---

## 8. Scoring Algorithms

### Eye Contact (0–1)
```
iris offset = |iris center x − eye socket center x| / eye width
score = 1 − average(left, right) / 0.6
```
Score → 1 when pupils are centered. Uses iris landmarks 468–475.

### Head Pose / Yaw (0–1)
```
score = 1 − |noseTip.x − cheekMidpoint.x| / 0.12
```
Landmarks: nose tip (1), left cheek (234), right cheek (454).

### Gaze Zone Classification
Applies head-yaw compensation to separate eye movement from head rotation:
```typescript
compensatedOffsetX = rawIrisOffsetX − (headYaw × 0.55)

avgOffsetY > 0.45           → "down"
compensatedOffsetX < −0.35  → "left"
compensatedOffsetX > 0.35   → "right"
else                        → "center"
```

### Blendshape Emotion Signals (O(1) lookup)
Built as a `Map<string, number>` once per frame instead of 9× `Array.find()`:

| Signal | Blendshape(s) |
|---|---|
| Mouth open | `jawOpen` |
| Smile | `mouthSmileLeft + mouthSmileRight` |
| Blink | `(eyeBlinkLeft + eyeBlinkRight) / 2` |
| Anxiety | `browInnerUp` |
| Confusion | `(browDownLeft + browDownRight) / 2` |
| Stress | `(mouthPressLeft + mouthPressRight) / 2` |
| Frown | `(mouthFrownLeft + mouthFrownRight) / 2` |
| Squint | `(eyeSquintLeft + eyeSquintRight) / 2` |

### Script-Reading Detection
```
isReadingScript = true  if:
  last 40 sampled frames have ≥4 left↔right gaze switches
  AND headPoseScore > 0.8
```
Teleprompter/notes reading causes rapid horizontal gaze shifts while the head stays still.

---

## 9. Dual Recorder — Why Two Streams

Whisper doesn't need video. Sending a full video file for transcription:
- Wastes bandwidth (~2 MB vs ~73 KB for a 7s clip)
- Slows the Whisper API call

Recording audio-only in parallel at record time is simpler and more reliable than post-hoc audio extraction from a WebM blob.

---

## 10. State Machine — Why Not Boolean Flags

Multiple booleans (`isRecording`, `isLoading`, `hasError`) allow impossible states — e.g., `isRecording = true` AND `hasError = true` simultaneously, which has no valid UI.

A TypeScript discriminated union (`"requesting" | "recording" | "stopping" | "error_permission" | "error_support"`) makes each state mutually exclusive at compile time.
