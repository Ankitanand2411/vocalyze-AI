/**
 * api.ts — typed client for the Vocalyze AI Backend
 *
 * Mirrors the Pydantic response models in backend/models.py exactly.
 * All shapes must stay in sync with the backend's AnalysisResponse.
 */

// ── Response shape mirrors (keep in sync with backend/models.py) ─────────────

export interface GazeBreakdown {
  center_pct: number;
  left_pct: number;
  right_pct: number;
  down_pct: number;
  away_pct: number;
}

export interface EmotionSummary {
  avg_anxiety: number;
  avg_confusion: number;
  avg_stress: number;
  avg_frown: number;
  avg_squint: number;
  avg_smile: number;
  avg_blink_rate: number;
}

export interface HeadPoseSummary {
  avg_eye_contact: number;
  avg_head_pose: number;
  avg_head_pitch: number;
  avg_head_roll: number;
}

export interface AcousticStats {
  pitch_variation: number;
  avg_volume: number;
  pause_count: number;
  longest_pause_ms: number;
  total_pause_time_ms: number;
  avg_pause_ms: number;
  wpm: number;
  articulation_rate: number;
  filler_word_ratio: number;
}

export interface LinguisticStats {
  weak_words_count: number;
  weak_words_found: string[];
  run_on_sentences: number;
  top_repeated_words: string[];
  filler_words_found: string[];
}

export interface DerivedInsights {
  pacing_status: string;
  vocal_variety: string;
  silence_ratio_pct: number;
  audience_connection_pct: number;
  warmth_index: string;
  fidget_index: string;
  filler_severity: string;
}

export interface BeforeAfterCorrection {
  category: string;
  before: string;
  after: string;
  why: string;
}

export interface MomentAnnotation {
  event_type: string;
  start_ms: number;
  end_ms: number;
  spoken_text?: string;
  impact: string;
}

export interface CoachingReport {
  overall_assessment: string;
  corrections: BeforeAfterCorrection[];
  structural_analysis: string;
  body_language_analysis: string;
  framework_detected?: string;
  strengths: string[];
  gap_analysis: string[];
  improvement_plan: string[];
  moment_annotations?: MomentAnnotation[];
  coach_final_note: string;
}

export interface AnalysisResponse {
  audio_received_bytes: number;
  frame_count: number;
  face_detected_pct: number;
  gaze: GazeBreakdown;
  emotion: EmotionSummary;
  head_pose: HeadPoseSummary;
  acoustic_stats?: AcousticStats;
  linguistic_stats?: LinguisticStats;
  insights?: DerivedInsights;
  overall_score: number;
  feedback: string[];
  detected_events: DetectedEvent[];
  score_ranges: ScoreRanges;
  transcript: string;
  calibration_session_id?: string;
  coaching_report?: CoachingReport;
}

export interface DetectedEvent {
  type: string;          // e.g. "eye_contact_break", "gaze_away"
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  peak_value: number | null;
  spoken_text?: string;
}

export interface ScoreRanges {
  eye_contact_min: number;
  eye_contact_max: number;
  eye_contact_avg: number;
  anxiety_min: number;
  anxiety_max: number;
  anxiety_avg: number;
  stress_min: number;
  stress_max: number;
  stress_avg: number;
  smile_min: number;
  smile_max: number;
  smile_avg: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── Request ───────────────────────────────────────────────────────────────────

export interface AnalyzePayload {
  audioBlob: Blob;
  frameData: {
    mediapipeReady: boolean;
    frameAnalysis: object[];
  };
  mode?: string;
}

/**
 * POST /analyze
 *
 * Sends the audio WebM blob (Module A) and the MediaPipe frame-analysis JSON
 * to the FastAPI backend and returns the structured coaching report.
 */
export async function postAnalyze(payload: AnalyzePayload): Promise<AnalysisResponse> {
  const form = new FormData();
  form.append("audio", payload.audioBlob, "recording.webm");
  form.append("frame_data", JSON.stringify(payload.frameData));
  if (payload.mode) {
    form.append("mode", payload.mode);
  }

  const res = await fetch(`${BACKEND_URL}/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend /analyze returned ${res.status}: ${text}`);
  }

  return res.json() as Promise<AnalysisResponse>;
}

/**
 * GET /analyze/coach/{session_id}
 *
 * Polls for asynchronous LLM coaching report.
 */
export async function fetchCoachingReport(sessionId: string): Promise<CoachingReport | null> {
  const res = await fetch(`${BACKEND_URL}/analyze/coach/${sessionId}`);
  if (res.status === 202) {
    return null; // still processing
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend coach polling failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<CoachingReport>;
}
