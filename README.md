# 🎙 Vocalyze AI — Frontend

> A personal mirror for communication practice. Record yourself speaking, get AI-driven face analysis, and review your session before anything is sent to a backend.

---

## What It Does

- Shows a random speaking prompt (6 prompts, picked randomly)
- Gives 3 seconds prep time (10s in production)
- Records your response using the browser's `MediaRecorder` API (dual-stream: audio-only + video)
- After recording: runs **MediaPipe FaceLandmarker** on the video to analyze eye contact, gaze, and emotion signals
- Sends the audio + frame analysis to the FastAPI backend and displays the returned coaching report
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
- Internet connection (MediaPipe model files + the backend both require it)
- The backend running locally at `http://localhost:8000` (see `Vocalyze AI Backend/README.md`) — or set `NEXT_PUBLIC_BACKEND_URL` to point elsewhere

---

## App Flow

```
Landing → Topic (3s prep) → Recording → Review → Analyze (MediaPipe + backend report)
```

See [`Architecture.md`](Architecture.md) for the full screen-by-screen breakdown and data flow diagrams.

---

## Documentation

| File | Contents |
|---|---|
| [`Architecture.md`](Architecture.md) | System structure, component breakdown, data flow |
| [`Research.md`](Research.md) | Why each decision was made — theory + reasoning |
| [`Decision.md`](Decision.md) | Current status, open tasks, what's done |

---

## What's Next

The frontend's capture, review, and MediaPipe analysis loop is complete and already wired to the backend. Next steps are backend-side: real Whisper transcription (via Groq, not OpenAI directly), stitching transcript timestamps against MediaPipe frame timestamps, and a Llama-3 reasoning pass over the combined summary — see `Vocalyze AI Backend`'s decisions for the current task list.

**Backend payload (implemented in `src/lib/api.ts` → `postAnalyze()`):**
```ts
POST /analyze  (multipart/form-data)
  audio      → recording.webm  (audio-only blob → Whisper, once wired up)
  frame_data → JSON string: { mediapipeReady: boolean, frameAnalysis: FrameAnalysisEntry[] }
```

Response shape mirrors `AnalysisResponse` from the backend's `models.py` — see `src/lib/api.ts` for the full TypeScript type.

See [`Decision.md`](Decision.md) for the full remaining task list.
