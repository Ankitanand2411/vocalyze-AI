"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RecordingResult } from "@/app/page";
import { analyzeVideo, type FrameAnalysisEntry } from "@/lib/videoAnalysis";
import { postAnalyze, type AnalysisResponse } from "@/lib/api";

if (typeof window !== "undefined") {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Created TensorFlow Lite XNNPACK delegate for CPU")
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

interface ReviewScreenProps {
  result: RecordingResult;
  onRetry: () => void;
  onBack: () => void;
}

type AnalysisStatus = "idle" | "running" | "done" | "error";

function formatDuration(ms: number): string {
  if (!isFinite(ms) || isNaN(ms) || ms < 0) return "--:--";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWordCounts(words: string[] | undefined): string {
  if (!words || words.length === 0) return "0 words";
  const counts: Record<string, number> = {};
  for (const w of words) {
    const lw = w.toLowerCase().trim();
    counts[lw] = (counts[lw] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "0 words";
  return entries.map(([word, count]) => `${word}(${count})`).join(", ");
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <span className="text-xs font-bold text-slate-900 font-mono">
        {value}
      </span>
    </div>
  );
}

function SpeechCompositionDiagram({
  acoustic_stats,
  linguistic_stats,
  insights,
}: {
  acoustic_stats: any;
  linguistic_stats: any;
  insights: any;
}) {
  const silencePct = Math.min(
    100,
    Math.max(5, Math.round(insights?.silence_ratio_pct ?? 24)),
  );
  const activePct = 100 - silencePct;

  const c = 439.8; // 2 * PI * 70
  const activeDash = (activePct / 100) * c;
  const silenceDash = (silencePct / 100) * c;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col lg:flex-row items-center gap-8">
        {/* LEFT: Donut Chart with Callout Pointers */}
        <div className="relative w-64 h-64 shrink-0 flex items-center justify-center">
          <svg
            className="w-full h-full transform -rotate-90"
            viewBox="0 0 200 200"
          >
            {/* Donut Track */}
            <circle
              cx="100"
              cy="100"
              r="70"
              stroke="#f1f5f9"
              strokeWidth="18"
              fill="none"
            />

            {/* Active Speech Slice (Teal) */}
            <circle
              cx="100"
              cy="100"
              r="70"
              stroke="#0d9488"
              strokeWidth="18"
              fill="none"
              strokeDasharray={`${activeDash} ${c}`}
              strokeDashoffset="0"
              strokeLinecap="round"
            />

            {/* Silence / Pauses Slice (Blue) */}
            <circle
              cx="100"
              cy="100"
              r="70"
              stroke="#3b82f6"
              strokeWidth="18"
              fill="none"
              strokeDasharray={`${silenceDash} ${c}`}
              strokeDashoffset={`-${activeDash}`}
              strokeLinecap="round"
            />

            {/* Expressive Cadence Slice (Purple) */}
            <circle
              cx="100"
              cy="100"
              r="70"
              stroke="#8b5cf6"
              strokeWidth="18"
              fill="none"
              strokeDasharray={`40 ${c}`}
              strokeDashoffset={`-${activeDash + silenceDash - 40}`}
              strokeLinecap="round"
            />
          </svg>

          {/* Donut Center Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-black text-slate-900 leading-none">
              {activePct}%
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
              Active Speech
            </span>
          </div>
        </div>

        {/* RIGHT: Metric Callout Items */}
        <div className="flex-1 w-full divide-y divide-slate-100">
          {/* Vocal Variety */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Vocal Variety
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {(acoustic_stats?.pitch_variation ?? 0).toFixed(1)}Hz dev
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-600">
              {insights?.vocal_variety || "Dynamic"}
            </span>
          </div>

          {/* Pauses & Silence */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Pauses & Silence
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {acoustic_stats?.pause_count || 0} pauses ({silencePct}%
                  silence)
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600">
              {(acoustic_stats?.pause_count || 0) > 10 ? "High" : "Good"}
            </span>
          </div>

          {/* Movement (Fidgeting) */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Movement (Fidgeting)
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {insights?.fidget_index || "Low"}
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600">
              {insights?.fidget_index === "High" ? "Needs Work" : "Good"}
            </span>
          </div>

          {/* Warmth & Tone */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-pink-600 shrink-0">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Warmth & Tone
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {insights?.warmth_index || "Neutral"}
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-pink-50 text-pink-600">
              Analyzed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HighlightedTranscript({
  text,
  fillerWords,
}: {
  text: string;
  fillerWords?: string[];
}) {
  const [copied, setCopied] = useState(false);

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build target set of filler words dynamically from backend report
  const targetWords = new Set<string>();
  if (fillerWords && fillerWords.length > 0) {
    for (const w of fillerWords) {
      if (w.trim()) targetWords.add(w.toLowerCase().trim());
    }
  }
  // Always include unambiguous core fillers
  targetWords.add("uh");
  targetWords.add("um");
  targetWords.add("er");
  targetWords.add("ah");

  const sortedWords = Array.from(targetWords).sort(
    (a, b) => b.length - a.length,
  );
  const regexPattern =
    sortedWords.length > 0
      ? new RegExp(
          `\\b(${sortedWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
          "gi",
        )
      : null;

  const renderTextWithHighlights = (str: string) => {
    if (!regexPattern) return str;
    const parts = str.split(regexPattern);
    return parts.map((part, idx) => {
      if (targetWords.has(part.toLowerCase().trim())) {
        return (
          <mark
            key={idx}
            className="bg-amber-100/90 text-amber-900 font-bold px-1.5 py-0.5 rounded-md border border-amber-200/60 inline-block my-0.5 mx-0.5"
            title="Filler Word"
          >
            {part}
          </mark>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // Group sentences into natural flowing paragraphs so short intros like "Hi." stay together
  const rawSentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
  const paragraphs: string[] = [];
  let currentPara = "";

  for (const sentence of rawSentences) {
    if ((currentPara + " " + sentence).length > 220 && currentPara.length > 0) {
      paragraphs.push(currentPara.trim());
      currentPara = sentence;
    } else {
      currentPara = currentPara ? `${currentPara} ${sentence}` : sentence;
    }
  }
  if (currentPara.trim()) {
    paragraphs.push(currentPara.trim());
  }

  const displayParagraphs = paragraphs.length > 0 ? paragraphs : [text];

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80">
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-4 mb-3.5 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider">
              Video Transcript
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">
              Filler words highlighted in amber
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Word Count Badge */}
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
            {wordCount} words
          </span>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-colors"
          >
            {copied ? (
              <>
                <svg
                  className="w-3.5 h-3.5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Transcript Text Container */}
      <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl p-4 max-h-72 overflow-y-auto space-y-3">
        {displayParagraphs.map((para, idx) => (
          <p
            key={idx}
            className="text-sm text-slate-800 leading-relaxed font-medium"
          >
            {renderTextWithHighlights(para)}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type BackendStatus = "idle" | "sending" | "done" | "error";

export default function ReviewScreen({
  result,
  onRetry,
  onBack,
}: ReviewScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");

  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [frameAnalysis, setFrameAnalysis] = useState<FrameAnalysisEntry[]>([]);
  const [mediapipeReady, setMediapipeReady] = useState(false);

  const [backendStatus, setBackendStatus] = useState<BackendStatus>("idle");
  const [backendReport, setBackendReport] = useState<AnalysisResponse | null>(
    null,
  );
  const [backendError, setBackendError] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(result.videoBlob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result.videoBlob]);

  const handleAnalyze = useCallback(async () => {
    setAnalysisStatus("running");
    setAnalysisProgress(0);
    setAnalysisError("");
    setBackendStatus("idle");
    setBackendReport(null);
    setBackendError("");
    setFrameAnalysis([]); // Clear old telemetry data

    let fa: FrameAnalysisEntry[] = [];
    let ready = false;

    try {
      const result_ = await analyzeVideo(result.videoBlob, setAnalysisProgress);
      fa = result_.frameAnalysis;
      ready = result_.mediapipeReady;
      setFrameAnalysis(fa);
      setMediapipeReady(ready);
      setAnalysisStatus(ready ? "done" : "error");
      if (!ready) {
        setAnalysisError("MediaPipe failed to initialize.");
        return;
      }
    } catch (err) {
      console.error("[ReviewScreen] MediaPipe analysis failed:", err);
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed.");
      setAnalysisStatus("error");
      return;
    }

    setBackendStatus("sending");
    try {
      const report = await postAnalyze({
        audioBlob: result.audioBlob,
        frameData: { mediapipeReady: ready, frameAnalysis: fa },
      });
      setBackendReport(report);
      setBackendStatus("done");
    } catch (err) {
      console.error("[ReviewScreen] backend call failed:", err);
      setBackendError(
        err instanceof Error
          ? err.message
          : "Could not connect to FastAPI server.",
      );
      setBackendStatus("error");
    }
  }, [result.videoBlob, result.audioBlob]);

  return (
    <div className="min-h-screen animate-fade-in bg-[#f8fafc] bg-grid-pattern text-[#0f172a] px-4 sm:px-8 py-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* Navigation header */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-bold hover:text-slate-900 transition-colors bg-white hover:bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl cursor-pointer"
              aria-label="Back to modules"
            >
              <svg
                className="w-3.5 h-3.5 text-slate-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
              <span>Back to Modules</span>
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                Vocalyze AI Diagnostic Console
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Session telemetry and AI coaching breakdown
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-300 font-mono">
            Session Review
          </span>
        </div>

        {/* Main 2-Column Split Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Video + Telemetry, lg:col-span-5) */}
          <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-6">
            {/* Video Player Container */}
            <div className="rounded-2xl overflow-hidden bg-slate-900 aspect-video shadow-md relative group">
              {videoUrl && (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                  aria-label="Recorded session playback"
                />
              )}
            </div>

            {/* Info Tiles */}
            <div className="grid grid-cols-3 gap-3">
              <InfoTile
                label="Duration"
                value={formatDuration(result.durationMs)}
              />
              <InfoTile
                label="Video File"
                value={formatFileSize(result.videoBlob.size)}
              />
              <InfoTile
                label="Audio Stream"
                value={formatFileSize(result.audioBlob.size)}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                id="analyze-btn"
                onClick={handleAnalyze}
                disabled={analysisStatus === "running"}
                className={`flex-1 py-3 px-6 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 ${
                  analysisStatus === "running"
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-sm cursor-pointer"
                }`}
              >
                <span>
                  {analysisStatus === "running"
                    ? `Analyzing Telemetry… ${analysisProgress}%`
                    : analysisStatus === "done"
                      ? "Re-Analyze Telemetry"
                      : "Analyze Recording"}
                </span>
              </button>
              <button
                id="retry-btn"
                onClick={onRetry}
                className="py-3 px-6 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
              >
                Try Again
              </button>
            </div>

            {analysisStatus === "running" && (
              <div className="mt-4">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all duration-200 linear"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
              </div>
            )}

            {analysisStatus === "error" && (
              <p className="mt-4 text-xs text-rose-600 text-center font-bold">
                {analysisError}
              </p>
            )}

            {/* MediaPipe On-Device Telemetry Panel (Moved to Left Column) */}
            {mediapipeReady && frameAnalysis.length > 0 && (
              <ScoredTelemetryPanel frameAnalysis={frameAnalysis} />
            )}
          </div>

          {/* Right Column (Diagnostic Report & Telemetry, lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Transcript (Moved to Right Column, top) */}
            {backendReport?.transcript && (
              <HighlightedTranscript
                text={backendReport.transcript}
                fillerWords={backendReport.linguistic_stats?.filler_words_found}
              />
            )}

            <BackendReport
              status={backendStatus}
              report={backendReport}
              error={backendError}
              onSeek={(timeMs) => {
                if (videoRef.current) {
                  videoRef.current.currentTime = timeMs / 1000;
                  videoRef.current
                    .play()
                    .catch((e) => console.error("Play failed:", e));
                  videoRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-3.5 text-center border border-slate-200 shadow-sm">
      <p className="text-[10px] font-mono text-slate-500 font-bold uppercase mb-1">
        {label}
      </p>
      <p className="text-xs font-extrabold font-mono text-slate-900">{value}</p>
    </div>
  );
}

// ─── Score Circle ─────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 75
      ? "text-emerald-700 border-emerald-500 bg-emerald-50"
      : score >= 50
        ? "text-amber-700 border-amber-500 bg-amber-50"
        : "text-rose-700 border-rose-500 bg-rose-50";
  return (
    <div
      className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${color} shadow-sm`}
    >
      <span className="text-xl font-black font-mono">{Math.round(score)}</span>
    </div>
  );
}

// ─── Metric Card Helper ──────────────────────────────────────────────────────

function MetricCard({
  icon,
  color,
  title,
  value,
  status,
  progress,
  layout = "horizontal",
  isGrouped = false,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  value: string | number;
  status: string;
  progress?: number;
  layout?: "horizontal" | "vertical";
  isGrouped?: boolean;
}) {
  const colorMap = {
    teal: { bg: "bg-teal-50", text: "text-teal-600", bar: "bg-teal-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", bar: "bg-amber-500" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", bar: "bg-rose-500" },
    purple: {
      bg: "bg-purple-50",
      text: "text-purple-600",
      bar: "bg-purple-500",
    },
    blue: { bg: "bg-blue-50", text: "text-blue-600", bar: "bg-blue-500" },
    orange: {
      bg: "bg-orange-50",
      text: "text-orange-600",
      bar: "bg-orange-500",
    },
    pink: { bg: "bg-pink-50", text: "text-pink-600", bar: "bg-pink-500" },
  } as Record<string, { bg: string; text: string; bar: string }>;

  const c = colorMap[color] || colorMap.teal;

  if (layout === "vertical") {
    return (
      <div className="flex flex-col gap-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow h-full">
        <div className="flex items-start justify-between">
          <div
            className={`w-10 h-10 rounded-full ${c.bg} flex items-center justify-center shrink-0`}
          >
            <svg
              className={`w-5 h-5 ${c.text}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {icon}
            </svg>
          </div>
          <span
            className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}
          >
            {status}
          </span>
        </div>
        <div className="mt-1">
          <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {title}
          </h4>
          <div className="text-2xl font-black text-slate-900 leading-none">
            {value}
          </div>
        </div>
        {progress !== undefined && (
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full ${c.bar} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  const containerClasses = isGrouped
    ? "flex items-center gap-4 p-4 hover:bg-slate-50/60 transition-colors"
    : "flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow";

  return (
    <div className={containerClasses}>
      <div
        className={`w-12 h-12 rounded-full ${c.bg} flex items-center justify-center shrink-0`}
      >
        <svg
          className={`w-6 h-6 ${c.text}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          {icon}
        </svg>
      </div>
      <div className="flex-1">
        <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">{title}</h4>
        <div
          className={`flex items-center gap-2.5 text-sm ${progress !== undefined ? "mb-2" : ""}`}
        >
          <span className="text-slate-700 font-bold">{value}</span>
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}
          >
            {status}
          </span>
        </div>
        {progress !== undefined && (
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${c.bar} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Backend Coaching Report ──────────────────────────────────────────────────

function BackendReport({
  status,
  report,
  error,
  frameAnalysis,
  onSeek,
}: {
  status: BackendStatus;
  report: AnalysisResponse | null;
  error: string;
  frameAnalysis?: FrameAnalysisEntry[];
  onSeek?: (timeMs: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"deterministic" | "coaching">(
    "deterministic",
  );
  const [llmReport, setLlmReport] = useState<any | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState("");
  const [showRawRanges, setShowRawRanges] = useState(false);

  // Poll for background LLM report if session_id is available
  useEffect(() => {
    if (!report?.calibration_session_id) return;

    // If backend already included coaching_report
    if (report.coaching_report) {
      setLlmReport(report.coaching_report);
      return;
    }

    let isSubscribed = true;
    let pollTimer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      setLlmLoading(true);
      try {
        const { fetchCoachingReport } = await import("@/lib/api");
        const res = await fetchCoachingReport(report.calibration_session_id!);
        if (!isSubscribed) return;
        if (res) {
          setLlmReport(res);
          setLlmLoading(false);
        } else {
          pollTimer = setTimeout(poll, 3000);
        }
      } catch (err) {
        if (!isSubscribed) return;
        console.error("LLM Poll Error:", err);
        setLlmError(
          err instanceof Error ? err.message : "Failed to load LLM feedback",
        );
        setLlmLoading(false);
      }
    };

    poll();

    return () => {
      isSubscribed = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [report]);

  if (status === "idle") return null;

  if (status === "sending") {
    return (
      <div className="mt-6 bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="w-4 h-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-700 font-medium">
          Generating AI diagnostic report…
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-6 bg-white rounded-xl border border-rose-300 p-5 shadow-sm">
        <p className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">
          Backend Connection Error
        </p>
        <p className="text-xs text-slate-600">{error}</p>
      </div>
    );
  }

  if (!report) return null;

  const { overall_score, acoustic_stats, linguistic_stats, insights } = report;

  let eyePct = insights?.audience_connection_pct ?? 0;
  if (frameAnalysis && frameAnalysis.length > 0) {
    const detected = frameAnalysis.filter((f) => f.faceDetected);
    if (detected.length > 0) {
      eyePct =
        (detected.reduce(
          (s, f) => s + ((f.eyeContactScore as number) ?? 0),
          0,
        ) /
          detected.length) *
        100;
    }
  }

  const eyeLabel = getEyeContactLabel(eyePct);
  const eyeColor = getStatusColor(eyeLabel);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
      <div className="text-center pb-2 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-900 mb-6">
          Rehearsal Insights
        </h2>

        {/* Overall Score Circle */}
        <div className="relative w-32 h-32 mx-auto mb-3">
          <svg
            className="w-full h-full transform -rotate-90"
            viewBox="0 0 100 100"
          >
            {/* Background track */}
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="#ccfbf1"
              strokeWidth="8"
              fill="none"
            />
            {/* Progress track */}
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="#14b8a6"
              strokeWidth="8"
              fill="none"
              strokeDasharray="251.2"
              strokeDashoffset={251.2 - 251.2 * (overall_score / 100)}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-white bg-teal-500 rounded-full w-24 h-24 flex items-center justify-center">
              {Math.round(overall_score)}
            </span>
          </div>
        </div>
        <h3 className="text-lg font-bold text-slate-800">Overall Score</h3>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center border-b border-slate-200">
        <button
          onClick={() => setActiveTab("deterministic")}
          className={`px-4 py-3 text-sm font-bold transition-colors border-b-2 flex-1 text-center ${
            activeTab === "deterministic"
              ? "border-teal-500 text-teal-700 bg-teal-50/50"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          Acoustic & Deterministic Feedback
        </button>
        <button
          onClick={() => setActiveTab("coaching")}
          className={`px-4 py-3 text-sm font-bold transition-colors border-b-2 flex-1 text-center flex items-center justify-center gap-2 ${
            activeTab === "coaching"
              ? "border-amber-500 text-amber-700 bg-amber-50/50"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <span>AI Coaching Feedback</span>
          <span className="text-xs">💡</span>
        </button>
      </div>

      <div className="pt-2">
        {/* Left Column: Bento Metric Cards */}
        {activeTab === "deterministic" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
                Acoustic & Linguistic Metrics
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* TOP ROW: Most Important (3 columns) */}
                <div className="md:col-span-1">
                  <MetricCard
                    icon={
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    }
                    color="teal"
                    title="Pacing"
                    value={`${acoustic_stats?.wpm.toFixed(0) || 0} WPM`}
                    status={insights?.pacing_status || "Optimal"}
                    layout="vertical"
                  />
                </div>

                <div className="md:col-span-1">
                  <MetricCard
                    icon={
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      />
                    }
                    color="teal"
                    title="Filler Words"
                    value={formatWordCounts(
                      linguistic_stats?.filler_words_found,
                    )}
                    status={insights?.filler_severity || "Good"}
                    layout="vertical"
                  />
                </div>

                <div className="md:col-span-1">
                  <MetricCard
                    icon={
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    }
                    color="rose"
                    title="Weak Words"
                    value={formatWordCounts(linguistic_stats?.weak_words_found)}
                    status={
                      (linguistic_stats?.weak_words_count || 0) > 5
                        ? "Needs Work"
                        : "Good"
                    }
                    layout="vertical"
                  />
                </div>

                {/* BOTTOM SINGLE BOX: Donut Chart Diagram + Callout Metrics */}
                <div className="md:col-span-3 mt-1">
                  <SpeechCompositionDiagram
                    acoustic_stats={acoustic_stats}
                    linguistic_stats={linguistic_stats}
                    insights={insights}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Column: AI Coaching Insights */}
        {activeTab === "coaching" && (
          <div className="mt-4">
            {/* 1. Loading State */}
            {(llmLoading || !llmReport) && !llmError && (
              <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-center">
                <div className="relative w-16 h-16 mb-6">
                  <div className="absolute inset-0 rounded-full border-[3px] border-slate-100"></div>
                  <div className="absolute inset-0 rounded-full border-[3px] border-amber-400 border-t-transparent animate-spin"></div>
                </div>
                <h4 className="text-[17px] font-bold text-slate-900 mb-2">
                  Generating your AI Coaching Report...
                </h4>
                <p className="text-[14px] text-slate-500 font-medium max-w-sm">
                  Analyzing your delivery, phrasing structure, tone, and
                  grammar...
                </p>
              </div>
            )}

            {/* 2. Error State */}
            {llmError && (
              <div className="bg-rose-50 rounded-2xl p-10 border border-rose-200/80 shadow-sm flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 mb-4 shadow-sm border border-rose-200/60">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h4 className="text-[16px] font-bold text-slate-900 mb-2">
                  Failed to generate coaching insights
                </h4>
                <p className="text-sm text-slate-600 font-medium mb-6 max-w-sm mx-auto">
                  {llmError}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-bold rounded-xl shadow-sm transition-all"
                >
                  Retry Analysis
                </button>
              </div>
            )}

            {/* 3. Success State (Loaded) */}
            {!llmLoading && llmReport && !llmError && (
              <div className="bg-[#fef3c7] rounded-2xl p-5 border border-amber-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-[#fde68a] flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-xl">💡</span>
                  </div>
                  <div>
                    <h4 className="text-[17px] font-bold text-slate-900">
                      AI Coaching Insights
                    </h4>
                  </div>
                </div>

                <div className="space-y-6 text-[15px] text-slate-800 font-medium leading-relaxed">
                  {llmReport.coach_final_note && (
                    <div className="bg-white/90 rounded-xl p-5 border border-amber-300 shadow-sm">
                      <h5 className="text-[11px] font-bold text-teal-600 uppercase tracking-wider mb-2">
                        Coach&apos;s Note
                      </h5>
                      <p className="text-[14px] text-slate-800 italic font-medium leading-relaxed">
                        {llmReport.coach_final_note}
                      </p>
                    </div>
                  )}

                  {llmReport.overall_assessment && (
                    <p className="text-slate-800">
                      {llmReport.overall_assessment}
                    </p>
                  )}

                  {/* SPACIOUS INSIGHTS LAYOUT */}
                  <div className="space-y-8">
                    {/* Row 1: Structure */}
                    {llmReport.structural_analysis && (
                      <div className="py-2">
                        <h5 className="text-sm font-extrabold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <span className="text-lg">🏗️</span> Structure
                        </h5>
                        <p className="text-[14.5px] text-slate-700 leading-relaxed font-medium">
                          {llmReport.structural_analysis}
                        </p>
                      </div>
                    )}

                    {/* Row 2: Body Language */}
                    {llmReport.body_language_analysis && (
                      <div className="py-2">
                        <h5 className="text-sm font-extrabold text-fuchsia-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <span className="text-lg">👀</span> Body Language
                        </h5>
                        <p className="text-[14.5px] text-slate-700 leading-relaxed font-medium">
                          {llmReport.body_language_analysis}
                        </p>
                      </div>
                    )}

                    {/* Row 3: Action Plan */}
                    {llmReport.improvement_plan?.length > 0 && (
                      <div className="py-2">
                        <h5 className="text-base font-extrabold text-amber-950 mb-4 flex items-center gap-2">
                          <span className="text-xl">🚀</span> Action Plan
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          {llmReport.improvement_plan.map(
                            (plan: string, i: number) => (
                              <div
                                key={i}
                                className="bg-white rounded-xl p-5 shadow-sm flex flex-col gap-3 transition-transform hover:-translate-y-1 border border-amber-100/50"
                              >
                                <span className="text-amber-700 font-extrabold shrink-0 bg-amber-50 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-inner">
                                  {i + 1}
                                </span>
                                <span className="text-[14px] text-slate-800 leading-relaxed font-medium whitespace-pre-line">
                                  {plan
                                    .replace(/(?:,\s*|\s+)(\d+\))/g, "\n$1")
                                    .trim()}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {/* Row 4: Strengths & Areas for Improvement */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-2">
                      {llmReport.strengths?.length > 0 && (
                        <div>
                          <h5 className="text-base font-extrabold text-emerald-950 mb-4 flex items-center gap-2">
                            <span className="text-xl">✅</span> Key Strengths
                          </h5>
                          <ul className="space-y-4 text-[14px] text-slate-700 font-medium">
                            {llmReport.strengths.map(
                              (str: string, i: number) => (
                                <li key={i} className="pl-6 relative">
                                  <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
                                  {str}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}

                      {llmReport.gap_analysis?.length > 0 && (
                        <div>
                          <h5 className="text-base font-extrabold text-rose-950 mb-4 flex items-center gap-2">
                            <span className="text-xl">🎯</span> Areas for
                            Improvement
                          </h5>
                          <ul className="space-y-4 text-[14px] text-slate-700 font-medium">
                            {llmReport.gap_analysis.map(
                              (gap: string, i: number) => (
                                <li key={i} className="pl-6 relative">
                                  <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-sm" />
                                  {gap}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CORRECTIONS SECTION (Side-by-Side BEFORE vs AFTER) */}
                  {(() => {
                    if (
                      !llmReport.corrections ||
                      llmReport.corrections.length === 0
                    )
                      return null;
                    const grouped = llmReport.corrections.reduce(
                      (acc: any, corr: any) => {
                        const cat = corr.category || "Phrasing & Grammar";
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(corr);
                        return acc;
                      },
                      {},
                    );

                    return (
                      <div className="pt-8 mt-4 border-t border-amber-200/60">
                        <h5 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-wider">
                          <span>📝</span> Sentence Corrections
                        </h5>
                        <div className="space-y-10">
                          {Object.entries(grouped).map(
                            (
                              [category, corrs]: [string, any],
                              groupIdx: number,
                            ) => (
                              <div key={groupIdx} className="space-y-6">
                                <div className="text-[12px] font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2">
                                  {category}
                                </div>
                                <div className="space-y-8">
                                  {corrs.map((corr: any, idx: number) => (
                                    <div key={idx} className="space-y-3">
                                      {/* Side-by-Side 2-Column Comparison */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Before */}
                                        <div className="border-l-2 border-rose-400 pl-4 py-1">
                                          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-1.5 block">
                                            Before
                                          </span>
                                          <p className="text-slate-600 italic text-[14px] leading-relaxed">
                                            &quot;{corr.before}&quot;
                                          </p>
                                        </div>

                                        {/* After */}
                                        <div className="border-l-2 border-emerald-400 pl-4 py-1">
                                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1.5 block">
                                            After
                                          </span>
                                          <p className="text-emerald-950 font-medium text-[14px] leading-relaxed">
                                            &quot;{corr.after}&quot;
                                          </p>
                                        </div>
                                      </div>

                                      {/* Why Explanation */}
                                      {corr.why && (
                                        <div className="border-l-2 border-indigo-400 pl-4 py-1 mt-3">
                                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1.5 block">
                                            Why
                                          </span>
                                          <div className="text-[14px] text-slate-700 leading-relaxed font-medium">
                                            {corr.why}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Score Panel (MediaPipe Telemetry & Emotion Signals) ──────────────────────

export type StatusLevel = "Excellent" | "Good" | "Needs Work";
export type StatusColor = "teal" | "amber" | "rose";

export function getStatusColor(status: StatusLevel): StatusColor {
  if (status === "Excellent") return "teal";
  if (status === "Good") return "amber";
  return "rose";
}

export function getEyeContactLabel(pct: number): StatusLevel {
  if (pct >= 70) return "Excellent";
  if (pct >= 45) return "Good";
  return "Needs Work";
}

export function getGazeZoneLabel(pct: number): StatusLevel {
  if (pct >= 60) return "Excellent";
  if (pct >= 40) return "Good";
  return "Needs Work";
}

export function getAnxietyLabel(pct: number): StatusLevel {
  if (pct < 15) return "Excellent";
  if (pct <= 40) return "Good";
  return "Needs Work";
}

export function getStressLabel(pct: number): StatusLevel {
  if (pct < 15) return "Excellent";
  if (pct <= 40) return "Good";
  return "Needs Work";
}

export function getHeadPoseLabel(yawDeg: number): StatusLevel {
  const absYaw = Math.abs(yawDeg);
  if (absYaw <= 10) return "Excellent";
  if (absYaw <= 20) return "Good";
  return "Needs Work";
}

export function getHeadPoseText(yawDeg: number): string {
  if (yawDeg > 10) return "Looking Left";
  if (yawDeg < -10) return "Looking Right";
  return "Centered";
}

function ScoreBar({
  label,
  value,
  unit = "%",
  invert = false,
}: {
  label: string;
  value: number;
  unit?: string;
  invert?: boolean;
}) {
  const pct =
    unit === "°"
      ? Math.min(100, (Math.abs(value) / 30) * 100)
      : Math.round(value * 100);
  const display = unit === "°" ? `${value.toFixed(1)}°` : `${pct}%`;
  const color = invert
    ? pct > 60
      ? "bg-rose-500"
      : pct > 30
        ? "bg-amber-500"
        : "bg-emerald-600"
    : pct > 65
      ? "bg-emerald-600"
      : pct > 35
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-600 font-medium">{label}</span>
        <span className="text-xs font-mono font-bold text-slate-900">
          {display}
        </span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Scored Telemetry Panel ──────────────────────────────────────────────────

function ScoredTelemetryPanel({
  frameAnalysis,
}: {
  frameAnalysis: FrameAnalysisEntry[];
}) {
  const detected = frameAnalysis.filter((f) => f.faceDetected);
  if (detected.length === 0) return null;
  const avg = (key: keyof FrameAnalysisEntry) =>
    detected.reduce((s, f) => s + ((f[key] as number) ?? 0), 0) /
    detected.length;

  const eyeContact = avg("eyeContactScore") * 100;
  const headPose = avg("headPoseScore");
  const anxiety = avg("anxietyScore") * 100;
  const stress = avg("stressScore") * 100;

  const total = detected.length;
  const gazeCenter = Math.round(
    (detected.filter((f) => f.gazeZone === "center").length / total) * 100,
  );

  const eyeLabel = getEyeContactLabel(eyeContact);
  const eyeColor = getStatusColor(eyeLabel);

  const gazeLabel = getGazeZoneLabel(gazeCenter);
  const gazeColor = getStatusColor(gazeLabel);

  const anxietyLabel = getAnxietyLabel(anxiety);
  const anxietyColor = getStatusColor(anxietyLabel);

  const stressLabel = getStressLabel(stress);
  const stressColor = getStatusColor(stressLabel);

  const headLabel = getHeadPoseLabel(headPose);
  const headColor = getStatusColor(headLabel);
  const headText = getHeadPoseText(headPose);

  // Directional dot mapping for yaw (-30 to +30 degrees)
  const dotX = Math.max(0, Math.min(100, 50 + (headPose / 30) * 50));

  return (
    <div className="mt-6 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider">
          SCORED TELEMETRY
        </span>
      </div>

      <div className="space-y-3">
        {/* Eye Contact */}
        <MetricCard
          icon={
            <>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </>
          }
          color={eyeColor}
          title="Eye Contact"
          value={`${Math.round(eyeContact)}%`}
          status={eyeLabel}
          progress={Math.round(eyeContact)}
        />

        {/* Gaze Center % */}
        <MetricCard
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
            />
          }
          color={gazeColor}
          title="Gaze Zone (Center)"
          value={`${gazeCenter}%`}
          status={gazeLabel}
          progress={gazeCenter}
        />

        {/* Anxiety */}
        <MetricCard
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          }
          color={anxietyColor}
          title="Anxiety Signal"
          value={`${Math.round(anxiety)}%`}
          status={anxietyLabel}
          progress={Math.round(anxiety)}
        />

        {/* Stress */}
        <MetricCard
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          }
          color={stressColor}
          title="Stress Signal"
          value={`${Math.round(stress)}%`}
          status={stressLabel}
          progress={Math.round(stress)}
        />

        {/* Head Pose Yaw */}
        <MetricCard
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          }
          color={headColor}
          title="Head Pose (Yaw)"
          value={`${headPose.toFixed(1)}°`}
          status={headText}
          progress={Math.min(100, (Math.abs(headPose) / 30) * 100)}
        />
      </div>
    </div>
  );
}
