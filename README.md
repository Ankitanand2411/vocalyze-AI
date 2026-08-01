# 🎙 Vocalyze AI — Frontend

> **A personal mirror for communication practice.**  
> Record yourself speaking, get real-time face analysis via MediaPipe, and review your session before anything is sent anywhere.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [App Flow](#app-flow)
5. [Screen-by-Screen Breakdown](#screen-by-screen-breakdown)
   - [LandingScreen](#1-landingscreen)
   - [TopicScreen](#2-topicscreen)
   - [RecordingScreen](#3-recordingscreen)
   - [ReviewScreen](#4-reviewscreen)
6. [Core Data Types](#core-data-types)
7. [Recording Architecture (Dual-Module System)](#recording-architecture-dual-module-system)
   - [Module A — Audio](#module-a--audio-only)
   - [Module B — Video + MediaPipe](#module-b--video--mediapipe-face-analysis)
   - [Shared Clock](#shared-clock)
8. [MediaPipe Face Analysis](#mediapipe-face-analysis)
   - [Eye Contact Score](#eye-contact-score)
   - [Head Pose Score](#head-pose-score)
9. [State Machine](#state-machine)
10. [Styling System](#styling-system)
11. [Getting Started](#getting-started)
12. [What's Next (Backend Integration)](#whats-next-backend-integration)

---

## Overview

Vocalyze AI is a communication diagnostics platform. The frontend is a fully self-contained Next.js application that:

- Shows the user a random speaking prompt
- Gives them 10 seconds to prepare
- Records their response using the browser's `MediaRecorder` API
- Simultaneously runs **MediaPipe FaceLandmarker** in real-time to analyze eye contact and head pose on every video frame
- Lets the user review their recording locally before any data leaves the device

No data is sent to a backend yet — the full recording pipeline is local-first.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.2.12 | React framework (App Router) |
| **React** | 19.2.4 | UI rendering |
| **TypeScript** | ^5 | Type safety |
| **Tailwind CSS** | ^4 | Utility-first styling |
| **@mediapipe/tasks-vision** | ^1.0.1 | Real-time face landmark detection |
| **Inter** (Google Font) | — | Typography |

---

## Project Structure

```
Frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout — sets metadata, fonts, body bg
│   │   ├── page.tsx            # App entry — screen state machine + shared types
│   │   └── globals.css         # Design tokens, animations, font import
│   └── components/
│       ├── LandingScreen.tsx   # Module selection grid
│       ├── TopicScreen.tsx     # Topic reveal + 10s prep countdown
│       ├── RecordingScreen.tsx # Camera, dual recording, MediaPipe loop
│       └── ReviewScreen.tsx    # Local playback + session stats
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## App Flow

```
LandingScreen
     │
     │  user clicks "Impromptu Speaker"
     ▼
TopicScreen  ──── 10s countdown ────►  [Start Answering] button unlocks
     │
     │  user clicks "Start Answering"
     ▼
RecordingScreen
  ├── Step 1: getUserMedia (camera + mic)
  ├── Step 2: MediaPipe WASM loads in background
  ├── Step 3: Both MediaRecorders wired up
  ├── Step 4: ATOMIC START — shared clock set, recording begins
  │           └── rAF loop runs face detection on every frame
     │
     │  user clicks "Stop Recording"
     ▼
ReviewScreen
  ├── Local video playback (videoBlob → object URL)
  ├── Session stats (duration, file sizes)
  └── [Analyze Recording] → triggers backend call (coming soon)
       [Try Again] → back to TopicScreen
```

---

## Screen-by-Screen Breakdown

### 1. `LandingScreen`

**File:** `src/components/LandingScreen.tsx`

The entry point. Renders a 2×2 grid of module cards:

| Module | Status |
|---|---|
| 💬 Impromptu Speaker | ✅ Active |
| 🎯 Q&A Simulator | 🔒 Coming soon |
| 📊 Presentation Engine | 🔒 Coming soon |
| 🔬 Feynman Simulator | 🔒 Coming soon |

**Key details:**
- Only the **Impromptu Speaker** card is clickable; others are `disabled` with an `aria-disabled` attribute and a "Coming soon" badge.
- Cards animate in with staggered `slide-up` delays (80ms per card).
- Hover state lifts the card and highlights the border with the accent color.

---

### 2. `TopicScreen`

**File:** `src/components/TopicScreen.tsx`

Reveals the speaking prompt and gives the user time to think.

**Key details:**
- **Topic selection:** One of 6 hardcoded open-ended prompts is picked at random on mount using `useState(() => TOPICS[Math.floor(Math.random() * TOPICS.length)])`.
- **Countdown:** A 10-second prep timer runs via `setTimeout` (not `setInterval`) — each second schedules the next tick. This avoids drift.
- **Progress bar:** Fills left-to-right as time elapses. Uses a CSS `transition-all duration-1000 ease-linear` for smooth animation.
- **Start button:** Disabled until the countdown reaches 0. Changes from grey to blue when unlocked.

---

### 3. `RecordingScreen`

**File:** `src/components/RecordingScreen.tsx`

The most complex component. Manages camera access, dual recording, and the MediaPipe face analysis loop.

#### States

```
requesting → initializing_mp → recording → stopping
                                              ↓
                                     error_permission | error_support
```

#### Boot sequence (inside `useEffect`)

1. `navigator.mediaDevices.getUserMedia({ video: 640×360 @ 24fps, audio: true })`
2. MediaPipe WASM loads (`initModuleB_MP`) — camera preview is already live so the user doesn't wait in the dark
3. Both `MediaRecorder` instances are wired up (but not started yet)
4. **Atomic start:** `startTimeRef.current = Date.now()` is set, then `recA.start(250)`, `recB.start(250)`, and `startModuleB_Loop()` are all called in the same synchronous block

#### Stop sequence

1. User clicks "Stop Recording"
2. `cancelAnimationFrame` stops the MediaPipe loop
3. Both recorders call `.stop()` — their `onstop` callbacks fire after the final chunk is flushed
4. `tryFinish()` waits for both `onstop` events, then calls `onDone(RecordingResult)`

---

### 4. `ReviewScreen`

**File:** `src/components/ReviewScreen.tsx`

Local playback and session review before any backend submission.

**Key details:**
- `URL.createObjectURL(result.videoBlob)` creates a temporary browser-local URL for the `<video>` element. It is revoked on unmount to free memory.
- Shows 3 info tiles: **Duration**, **Video file size**, **Audio file size**.
- **"Analyze Recording"** button currently shows a toast: _"AI analysis coming soon ✦"_ — this is the hook point for the future backend call.
- **"Try Again"** navigates back to `TopicScreen` with a new random topic.

---

## Core Data Types

Defined in `src/app/page.tsx` and shared across components:

```ts
// One entry per video frame where a face was detected
interface FrameAnalysisEntry {
  timestamp: number;        // ms elapsed since recording started (shared clock)
  eyeContactScore: number;  // 0.0–1.0 (1 = looking directly at camera)
  headPoseScore: number;    // 0.0–1.0 (1 = facing straight forward)
  faceDetected: boolean;    // false if no face found in this frame
}

// The complete output produced when the user stops recording
interface RecordingResult {
  audioBlob: Blob;             // Audio-only WebM (for Whisper / backend)
  videoBlob: Blob;             // Full audio+video WebM (for local playback)
  durationMs: number;          // Total session length in milliseconds
  topic: string;               // The prompt the user responded to
  frameAnalysis: FrameAnalysisEntry[];  // ~24–60 entries per second
  mediapipeReady: boolean;     // false if MediaPipe failed to load (graceful fallback)
}
```

---

## Recording Architecture (Dual-Module System)

The recording is split into **two independent modules** that share a single clock:

### Module A — Audio Only

```
audioStream = new MediaStream(stream.getAudioTracks())
recA = new MediaRecorder(audioStream, { audioBitsPerSecond: 64_000 })
recA.start(250)  ← emits a chunk every 250ms
```

- Records **audio only** (no video payload) to keep the Whisper API upload small and fast.
- Chunks accumulate in `moduleA.chunksRef`.
- On stop: `new Blob(chunks, { type: "audio/webm" })` → `audioBlob`

### Module B — Video + MediaPipe Face Analysis

```
recB = new MediaRecorder(stream, {
  videoBitsPerSecond: 800_000,
  audioBitsPerSecond: 64_000,
})
recB.start(250)
```

- Records the **full stream** (video + audio) for local review.
- Simultaneously, a `requestAnimationFrame` loop runs `FaceLandmarker.detectForVideo()` on every new video frame and pushes a `FrameAnalysisEntry` to `moduleB.frameDataRef`.

### Shared Clock

```ts
startTimeRef.current = Date.now();   // ← t=0 set ONCE
recA.start(250);                     // Module A starts
recB.start(250);                     // Module B starts
startModuleB_Loop();                 // MediaPipe loop starts
```

Every `FrameAnalysisEntry.timestamp` is computed as:

```ts
timestamp = Date.now() - startTimeRef.current
```

This means the face analysis timestamps and the audio chunk offsets share the **same zero point**, so the backend can precisely correlate *which word was spoken* with *what the speaker's face was doing* at that exact moment.

---

## MediaPipe Face Analysis

Uses `@mediapipe/tasks-vision` FaceLandmarker with:
- **Model:** `face_landmarker.task` (float16, streamed from Google's CDN)
- **Running mode:** `VIDEO` (optimized for frame-by-frame streams)
- **Delegate:** `GPU` (falls back gracefully if unavailable)
- **Output:** 478 normalized `[x, y, z]` face landmarks per frame

The `scoreFrame(landmarks)` function in `RecordingScreen.tsx` converts raw landmarks into two human-readable scores:

### Eye Contact Score

Uses **iris landmark indices** (468–475):
- Computes the horizontal offset of each iris center relative to the eye corner midpoint
- Normalizes by eye width
- Score = `1 - average_drift / 0.3` (clamped to 0–1)
- Score → 1 when pupils are centered; drops as gaze shifts left or right

```
Left iris:  landmarks[468–471]
Right iris: landmarks[472–475]
Eye corners: landmarks[33, 133] (left), landmarks[263, 362] (right)
```

### Head Pose Score

Uses **nose tip and cheek landmarks**:
- Computes the horizontal offset of the nose tip from the midpoint of both cheeks
- Score = `1 - abs(noseTip.x - faceCenter.x) / 0.12` (clamped to 0–1)
- Score → 1 when face is straight; drops as the head turns left or right

```
Nose tip:    landmarks[1]
Left cheek:  landmarks[234]
Right cheek: landmarks[454]
```

---

## State Machine

`RecordingScreen` uses a discriminated union for state:

```
"requesting"       — waiting for getUserMedia permission
"initializing_mp"  — camera is live, MediaPipe WASM is loading
"recording"        — both recorders active, MediaPipe loop running
"stopping"         — recorders flushing final chunks
"error_permission" — user denied camera/mic access
"error_support"    — browser doesn't support MediaRecorder
```

Error states render a full-screen `<ErrorCard>` with a back button. Non-error states render the recording UI (or a spinner during initialization).

---

## Styling System

**File:** `src/app/globals.css`

Tailwind v4 is used for layout utilities. A custom CSS design token system sits on top:

```css
:root {
  --accent:          #6c8ebf;  /* Blue — primary CTA, active indicators */
  --accent-light:    #a8c4e2;  /* Lighter blue — hover states */
  --bg:              #f4f2ef;  /* Warm off-white — page background */
  --surface:         #ffffff;  /* Pure white — cards */
  --text-primary:    #1a1a2e;  /* Near-black — headings, body */
  --text-secondary:  #6b7280;  /* Mid-grey — subtext */
  --text-muted:      #9ca3af;  /* Light grey — labels, placeholders */
  --border:          #e5e7eb;  /* Soft grey — card borders */
  --recording-dot:   #b45309;  /* Amber — live recording indicator */
}
```

### Animations

| Class | Effect | Duration |
|---|---|---|
| `.animate-fade-in` | Fade + slide up 8px | 400ms ease-out |
| `.animate-slide-up` | Fade + slide up 16px | 500ms ease-out |
| `.pulse-dot` | Opacity pulse (1 → 0.3 → 1) | 2s infinite |
| `.delay-100/200/300/400` | Stagger animation start | 100–400ms |

**Font:** Inter (300, 400, 500, 600, 700) loaded from Google Fonts.

---

## Getting Started

```bash
# Install dependencies
npm install

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome, Firefox, or Edge** (Safari has limited MediaRecorder support).

> **Note:** Camera and microphone permissions are required. The app will show an error screen if denied.

### Requirements

- Node.js 18+
- A browser that supports `MediaRecorder` and `getUserMedia`
- HTTPS or `localhost` (required for camera access)

---

## What's Next (Backend Integration)

The `handleAnalyze` button in `ReviewScreen` is the integration point. When the backend is ready, the call will look like this:

```ts
const formData = new FormData();

// Binary blobs
formData.append("audio", result.audioBlob, "audio.webm");   // → Whisper transcription
formData.append("video", result.videoBlob, "video.webm");   // → optional storage

// JSON metadata (time-aligned with audio)
formData.append("frame_analysis", JSON.stringify(result.frameAnalysis));
formData.append("duration_ms",    String(result.durationMs));
formData.append("topic",          result.topic);

const response = await fetch("https://api.vocalyze.ai/analyze", {
  method: "POST",
  body: formData,
});
```

The backend can then:
1. Run **Whisper** on `audio.webm` to get word-level timestamps
2. Cross-reference the `frame_analysis` array to find the face score at each word's timestamp
3. Return a structured feedback report (filler words, eye contact by sentence, pace, etc.)
```
