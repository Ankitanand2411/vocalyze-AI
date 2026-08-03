# Vocalyze AI — Architecture

> System structure, component breakdown, and data flow.
> For *why* decisions were made, see [`research.md`](research.md).
> For *current status and tasks*, see [`decision.md`](decision.md).

_Last updated: August 2026_

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────┐
│                      Browser (Client)                    │
│                                                          │
│  Next.js App ──► MediaRecorder (Module A: audio)         │
│                └─ MediaRecorder (Module B: video+audio)  │
│                                                          │
│  On "Analyze Recording":                                 │
│    videoBlob ──► MediaPipe FaceLandmarker (WASM/CPU)     │
│               └─► FrameAnalysis[] JSON                   │
└─────────────────────────────┬────────────────────────────┘
                              │ (future backend)
                              ▼
                 POST /analyze
                   audio.webm → Whisper
                   frameAnalysis JSON → Llama-3
```

---

## 2. File Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout — metadata, fonts, body bg
│   ├── page.tsx            # Screen state machine + shared types
│   └── globals.css         # CSS design tokens + animation classes
│
├── components/
│   ├── LandingScreen.tsx   # Module selection (2×2 grid)
│   ├── TopicScreen.tsx     # Random prompt + prep countdown
│   ├── RecordingScreen.tsx # Camera, dual recording
│   └── ReviewScreen.tsx    # Playback + analysis trigger + score panel
│
└── lib/
    └── videoAnalysis.ts    # All MediaPipe logic (post-recording only)
```

---

## 3. Screen State Machine

Managed in `page.tsx` via a `"landing" | "topic" | "recording" | "review"` discriminated union.

```
landing ──[select module]──► topic ──[countdown ends]──► recording
                                                              │
                                                        [stop recording]
                                                              │
                                                           review
                                                          /       \
                                                  [try again]   [back]
                                                      │              │
                                                    topic         landing
```

**Transitions:**

| Function                        | From → To          | Payload             |
| ------------------------------- | ------------------- | ------------------- |
| `handleModuleSelect()`        | landing → topic    | —                  |
| `handleTopicReady(topic)`     | topic → recording  | topic string        |
| `handleRecordingDone(result)` | recording → review | `RecordingResult` |
| `handleRetry()`               | review → topic     | —                  |
| `handleBackToModules()`       | any → landing      | —                  |

---

## 4. Component Breakdown

### `LandingScreen`

- 2×2 grid of module cards
- Only **Impromptu Speaker** is active; others are `aria-disabled` with "Coming soon" badge

### `TopicScreen`

- Picks 1 of 6 hardcoded prompts randomly on mount
- `PREP_DURATION = 3` seconds (currently for testing; increase to 10 before production)
- Uses recursive `setTimeout` (not `setInterval`) to avoid drift

### `RecordingScreen`

Internal state machine:

```
"requesting" → "recording" → "stopping" → [onDone()]
                                      → "error_permission"
                                      → "error_support"
```

Boot sequence:

1. `getUserMedia` — 3-tier fallback: `640×360@24fps` → `640×360` → `video:true`
2. Wire up Module A (audio-only) and Module B (video+audio)
3. **Atomic start:** `startTimeRef.current = Date.now()` then both `recA.start(250)` and `recB.start(250)` in the same synchronous tick

Key refs:

| Ref                                 | Purpose                             |
| ----------------------------------- | ----------------------------------- |
| `videoRef`                        | Live camera preview element         |
| `streamRef`                       | Raw`MediaStream`                  |
| `startTimeRef`                    | Shared clock`t=0`                 |
| `moduleA.recorderRef / chunksRef` | Audio-only recorder + chunk buffer  |
| `moduleB.recorderRef / chunksRef` | Full-stream recorder + chunk buffer |

### `ReviewScreen`

Internal state: `"idle" | "running" | "done" | "error"`

- Loads `videoBlob` via `URL.createObjectURL` for local playback
- "Analyze Recording" calls `analyzeVideo(videoBlob, onProgress)` from `lib/videoAnalysis.ts`
- Shows live progress bar during analysis
- Renders **ScorePanel** (face, gaze, emotion) and **DebugInspector** (8 sanity checks) after completion

---

## 5. Data Flow

### Recording → Review

```
RecordingScreen
   └── onDone(RecordingResult)
           │
        page.tsx (stores in useState)
           │
        ReviewScreen (result prop)
```

**`RecordingResult` type:**

```typescript
interface RecordingResult {
  audioBlob: Blob;     // audio/webm, audio-only (~64 kbps)
  videoBlob: Blob;     // video/webm, full stream (~800 kbps video + 64 kbps audio)
  durationMs: number;  // total session length in ms
  topic: string;       // the prompt the user responded to
}
```

### Analysis Pipeline

```
videoBlob
    │
analyzeVideo(videoBlob, onProgress)      [lib/videoAnalysis.ts]
    │
    ├── 1. Load FaceLandmarker (CPU, WASM from CDN)
    ├── 2. Create off-screen <video>, load blob
    ├── 3. Benchmark one inference → compute adaptive FPS (4–8fps)
    ├── 4. Play video at 8× speed
    ├── 5. requestAnimationFrame loop:
    │         every sampleIntervalMs → detectForVideo() → push FrameAnalysisEntry
    └── 6. video.onended → cleanup
    │
    ▼
{ frameAnalysis: FrameAnalysisEntry[], mediapipeReady: boolean }
```

### `FrameAnalysisEntry` shape

```typescript
interface FrameAnalysisEntry {
  timestamp: number;          // ms from video start

  // Face / gaze
  eyeContactScore: number;    // 0–1
  headPoseScore: number;      // 0–1 (yaw)
  faceDetected: boolean;
  headPitch: number;          // degrees
  headRoll: number;           // degrees

  // Blendshape basics
  mouthOpenScore: number;
  smileScore: number;
  blinkScore: number;

  // Emotion signals
  anxietyScore: number;
  confusionScore: number;
  stressScore: number;
  frownScore: number;
  squintScore: number;

  gazeZone: "center" | "left" | "right" | "down" | "away";
  faceWidth: number;
  isReadingScript: boolean;

  // Always 0 — PoseLandmarker dropped (CPU cost, see research.md §10)
  poseDetected: false;
  postureScore: 0;
  shoulderLevelDiff: 0;
  spineAngle: 0;
  armsCrossed: false;
}
```

---

## 6. Dual Recording (Module A / B)

```
getUserMedia (one stream)
        │
        ├── getAudioTracks() ──► Module A: MediaRecorder (audio/webm, 64 kbps)
        │                              └──► audioBlob → future Whisper call
        │
        └── full stream ──────► Module B: MediaRecorder (video/webm, 800+64 kbps)
                                       └──► videoBlob → local playback + MediaPipe input
```

**Shared clock:**

```typescript
startTimeRef.current = Date.now();  // t=0 set ONCE
recA.start(250);                    // same synchronous block
recB.start(250);                    // same synchronous block
```

Both blobs share the same `t=0`, so face analysis timestamps align with the audio/transcript timeline.

---

## 7. MediaPipe Configuration

| Setting        | Value                                        |
| -------------- | -------------------------------------------- |
| Model          | `face_landmarker.task` (float16, ~5.1 MB)  |
| WASM runtime   | `@mediapipe/tasks-vision@1.0.1` (~2.5 MB)  |
| Delegate       | `CPU` (GPU skipped — see research.md §9) |
| Running mode   | `VIDEO`                                    |
| Num faces      | `1`                                        |
| Blendshapes    | Enabled (52 coefficients)                    |
| Adaptive FPS   | 4–8fps benchmarked at runtime               |
| Playback speed | 8× during analysis                          |

Total CDN download on first use: **~7.6 MB** (cached by browser after first load).

---

## 8. Styling System

**File:** `src/app/globals.css`

```css
:root {
  --accent:          #6c8ebf;  /* primary CTA, active indicators */
  --accent-light:    #a8c4e2;  /* hover states */
  --bg:              #f4f2ef;  /* page background */
  --surface:         #ffffff;  /* cards */
  --text-primary:    #1a1a2e;
  --text-secondary:  #6b7280;
  --text-muted:      #9ca3af;
  --border:          #e5e7eb;
  --recording-dot:   #b45309;  /* amber pulse during recording */
}
```

Animations: `.animate-fade-in`, `.animate-slide-up`, `.pulse-dot`, `.delay-100/200/300/400`

Font: **Inter** (300–700) via Google Fonts.
