# 🎙 Vocalyze AI — Frontend

> A personal mirror for communication practice. Record yourself speaking, get AI-driven face analysis, and review your session before anything is sent to a backend.

---

## What It Does

- Shows a random speaking prompt (6 prompts, picked randomly)
- Gives 3 seconds prep time (10s in production)
- Records your response using the browser's `MediaRecorder` API (dual-stream: audio-only + video)
- After recording: runs **MediaPipe FaceLandmarker** on the video to analyze eye contact, gaze, and emotion signals
- Lets you review the full score panel and replay your recording locally

No data leaves the device until you hit **Analyze Recording** — and even then, only a small JSON + audio blob goes to the backend (not the video).

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.2.12 | React framework (App Router) |
| **React** | 19.2.4 | UI rendering |
| **TypeScript** | ^5 | Type safety |
| **Tailwind CSS** | ^4 | Utility-first styling |
| **@mediapipe/tasks-vision** | 1.0.1 | Face landmark detection (WASM, runs in browser) |
| **Inter** (Google Font) | — | Typography |

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome, Firefox, or Edge**.

> Safari has limited `MediaRecorder` support — use Chromium-based browsers for best results.

### Requirements

- Node.js 18+
- A browser supporting `MediaRecorder` + `getUserMedia`
- HTTPS or `localhost` (required for camera/mic access)
- Internet connection (MediaPipe model files + future backend both require it)

---

## App Flow

```
Landing → Topic (3s prep) → Recording → Review → [future: Backend analysis]
```

See [`Architecture.md`](Architecture.md) for the full screen-by-screen breakdown and data flow diagrams.

---

## Documentation

| File | Contents |
|---|---|
| [`Architecture.md`](Architecture.md) | System structure, component breakdown, data flow |
| [`research.md`](research.md) | Why each decision was made — theory + reasoning |
| [`decision.md`](decision.md) | Current status, open tasks, what's done |

---

## What's Next

The frontend is complete. Next step: build the backend `/analyze` endpoint.

**Backend payload (already wired up in `ReviewScreen.tsx`):**
```ts
POST /analyze  (multipart/form-data)
  audio          → audio.webm  (→ Whisper transcription)
  frame_analysis → JSON string (→ cross-referenced with transcript)
  duration_ms    → number
  topic          → string
```

See [`decision.md`](decision.md) for full remaining task list.
