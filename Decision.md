# Vocalyze AI — Decisions & Task Tracker

> Current status of all decisions and open tasks.
> For *why* decisions were made, see [`research.md`](research.md).
> For *system structure*, see [`Architecture.md`](Architecture.md).

_Last updated: August 2026_

---

## Frontend — What's Done

| Area | Status | Notes |
|---|---|---|
| Dual recording (Module A audio, Module B video) | ✅ Done | — |
| Shared clock (t=0 sync) | ✅ Done | — |
| MediaPipe post-recording analysis | ✅ Done | CPU-only, playback-based |
| Seek-based → playback-based sampling | ✅ Done | Fixes WebM hang + speed |
| Adaptive FPS (benchmark at runtime) | ✅ Done | 4–8fps range |
| CPU-first (skip GPU attempt) | ✅ Done | Saves 200–600ms wasted init |
| PoseLandmarker removed | ✅ Done | Too expensive on CPU |
| Resolution 1280×720 → 640×360 | ✅ Done | PoseLandmarker no longer needs wide-angle |
| `getUserMedia` 3-tier fallback | ✅ Done | 640×360@24fps → 640×360 → bare video |
| Score panel + gaze zone display | ✅ Done | — |
| Emotion signals (blendshapes) | ✅ Done | 8 metrics |
| Progress bar during analysis | ✅ Done | — |
| Debug Inspector (8 sanity checks) | ✅ Done | Keep visible until presentation |
| End-to-end test | ✅ Done | 104 frames, 92.3% face detection |

---

## Frontend — Still Open

| # | Task | Priority | Notes |
|---|---|---|---|
| 1 | Hide "Body Posture" section in ReviewScreen | Low | Always shows "unavailable" — PoseLandmarker dropped |
| 2 | Strip Debug Inspector | Low | Keep for now; remove before final presentation |
| 3 | Bump `PREP_DURATION` 3s → 10s | Low | Currently 3s for testing; change before production |

---

## Backend — Not Started

| # | Task | Priority |
|---|---|---|
| 1 | Build `/analyze` endpoint (Whisper + Llama-3) | **High** |
| 2 | Define confidence-score formula | **High** (thesis contribution) |
| 3 | Supabase schema + session persistence | Medium |
| 4 | Supabase video storage (pre-signed URL) | Medium |

---

## Dropped (with reasons)

| Feature | Reason |
|---|---|
| **PoseLandmarker** | ~200ms extra per frame on CPU; webcam rarely shows hips |
| **GPU delegate** | Failed init on most devices wastes 200–600ms; CPU WASM is fast enough |
| **Seek-based sampling** | `onseeked` never fires on live-recorded WebM blobs (no seek index) |
| **Live analysis during recording** | Competes with MediaRecorder for CPU; broke recording quality |
| **ImageSegmenter / background blur** | Live-only cosmetic; not relevant post-recording |
| **Self-host MediaPipe models** | Backend also needs internet (Whisper, Groq, Supabase) — offline is not achievable regardless |

---

## Deferred to Backend Phase

- Whisper speech transcription
- Llama-3 AI feedback (via Groq)
- Confidence score formula
- Prosody / vocal-delivery analysis (pitch, volume, energy)
- Q&A Simulator — live AI interruption (TTS)
