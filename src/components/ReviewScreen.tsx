"use client";

import { useEffect, useRef, useState } from "react";
import type { RecordingResult, FrameAnalysisEntry } from "@/app/page";

interface ReviewScreenProps {
  result: RecordingResult;
  onRetry: () => void;
  onBack: () => void;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Debug Inspector ──────────────────────────────────────────────────────────

function DebugInspector({
  audioBlob,
  frameAnalysis,
  mediapipeReady,
}: {
  audioBlob: Blob;
  frameAnalysis: FrameAnalysisEntry[];
  mediapipeReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [jsonTab, setJsonTab] = useState<"summary" | "full">("summary");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [open, audioBlob]);

  // ── Summary stats derived from frameAnalysis ──────────────────────────────
  const totalFrames = frameAnalysis.length;
  const detectedFrames = frameAnalysis.filter((f) => f.faceDetected).length;
  const avgEye =
    detectedFrames > 0
      ? frameAnalysis
          .filter((f) => f.faceDetected)
          .reduce((s, f) => s + f.eyeContactScore, 0) / detectedFrames
      : 0;
  const avgHead =
    detectedFrames > 0
      ? frameAnalysis
          .filter((f) => f.faceDetected)
          .reduce((s, f) => s + f.headPoseScore, 0) / detectedFrames
      : 0;

  const avgMouth  = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.mouthOpenScore ?? 0), 0) / detectedFrames : 0;
  const avgSmile  = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.smileScore ?? 0), 0) / detectedFrames : 0;
  const avgBlink  = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.blinkScore ?? 0), 0) / detectedFrames : 0;
  const avgPitch  = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.headPitch ?? 0), 0) / detectedFrames : 0;
  const avgRoll   = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.headRoll ?? 0), 0) / detectedFrames : 0;

  const summaryJson = {
    mediapipeReady,
    totalFrames,
    detectedFrames,
    detectionRate: totalFrames > 0 ? `${((detectedFrames / totalFrames) * 100).toFixed(1)}%` : "N/A",
    averageEyeContactScore: parseFloat(avgEye.toFixed(3)),
    averageHeadPoseScore:   parseFloat(avgHead.toFixed(3)),
    averageMouthOpenScore:  parseFloat(avgMouth.toFixed(3)),
    averageSmileScore:      parseFloat(avgSmile.toFixed(3)),
    averageBlinkScore:      parseFloat(avgBlink.toFixed(3)),
    averageHeadPitchDeg:    parseFloat(avgPitch.toFixed(1)),
    averageHeadRollDeg:     parseFloat(avgRoll.toFixed(1)),
    durationCoveredMs: totalFrames > 0 ? frameAnalysis[totalFrames - 1].timestamp : 0,
    sampleFrames: frameAnalysis.slice(0, 5),
  };

  const fullJson = { mediapipeReady, frameAnalysis };

  const handleCopy = (data: object) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mt-8 border border-dashed border-[#e5e7eb] rounded-2xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-[#f4f2ef] hover:bg-[#ece9e5] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🛠</span>
          <span className="text-sm font-semibold text-[#1a1a2e]">Debug Inspector</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af] bg-[#e5e7eb] px-2 py-0.5 rounded-full">
            Temporary
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-[#9ca3af] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {open && (
        <div className="px-5 pb-6 pt-5 bg-white space-y-6 animate-fade-in">

          {/* ── Section 1: Extracted Audio ─────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span>🎵</span> Module A — Extracted Audio
            </p>
            <div className="bg-[#f4f2ef] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3 text-xs text-[#6b7280]">
                <span className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-1.5 font-mono">
                  audio/webm
                </span>
                <span>{formatFileSize(audioBlob.size)}</span>
                <span className="text-[#9ca3af]">64 kbps · audio-only</span>
              </div>
              {audioUrl && (
                <audio
                  controls
                  src={audioUrl}
                  className="w-full h-10"
                  aria-label="Extracted audio from recording"
                />
              )}
              <p className="text-[11px] text-[#9ca3af] leading-relaxed">
                This is the audio-only stream (no video payload) that would be sent to Whisper for transcription.
              </p>
            </div>
          </div>

          {/* ── Section 2: MediaPipe JSON ──────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span>📊</span> Module B — MediaPipe Frame Analysis
            </p>

            {/* Status row */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`w-2 h-2 rounded-full ${mediapipeReady ? "bg-green-500" : "bg-[#b45309]"}`}
              />
              <span className="text-xs text-[#6b7280]">
                MediaPipe:{" "}
                <span className={`font-semibold ${mediapipeReady ? "text-green-600" : "text-[#b45309]"}`}>
                  {mediapipeReady ? "Loaded successfully" : "Failed to load (scores will be 0)"}
                </span>
              </span>
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: "Total frames", value: totalFrames },
                { label: "Face detected", value: detectedFrames },
                { label: "Avg eye contact", value: `${(avgEye * 100).toFixed(0)}%` },
                { label: "Avg head pose", value: `${(avgHead * 100).toFixed(0)}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#f4f2ef] rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">
                    {s.label}
                  </p>
                  <p className="text-sm font-semibold text-[#1a1a2e]">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-3 bg-[#f4f2ef] p-1 rounded-lg w-fit">
              {(["summary", "full"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setJsonTab(tab)}
                  className={[
                    "px-3 py-1 rounded-md text-xs font-medium transition-all duration-150",
                    jsonTab === tab
                      ? "bg-white text-[#1a1a2e] shadow-sm"
                      : "text-[#9ca3af] hover:text-[#6b7280]",
                  ].join(" ")}
                >
                  {tab === "summary" ? "Summary JSON" : `Full JSON (${totalFrames} frames)`}
                </button>
              ))}
            </div>

            {/* JSON block */}
            <div className="relative">
              <button
                onClick={() => handleCopy(jsonTab === "summary" ? summaryJson : fullJson)}
                className="absolute top-3 right-3 z-10 text-[10px] font-semibold text-[#9ca3af] hover:text-[#6b7280] bg-[#1a1a2e]/80 px-2.5 py-1 rounded-md transition-colors"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
              <pre
                className="bg-[#1a1a2e] text-[#a8c4e2] text-[11px] leading-relaxed rounded-xl p-4 overflow-auto max-h-72 font-mono"
                aria-label="MediaPipe JSON output"
              >
                {JSON.stringify(jsonTab === "summary" ? summaryJson : fullJson, null, 2)}
              </pre>
            </div>

            <p className="mt-2 text-[11px] text-[#9ca3af] leading-relaxed">
              Each frame entry has a <code className="bg-[#f4f2ef] px-1 rounded">timestamp</code> (ms from recording start) that aligns with Module A&apos;s audio offsets — so the backend can map face scores to specific spoken words.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewScreen({ result, onRetry, onBack }: ReviewScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [toast, setToast] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(result.videoBlob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result.videoBlob]);

  const handleAnalyze = () => {
    setToast(true);
    setTimeout(() => setToast(false), 3000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a2e] text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-lg animate-fade-in">
          AI analysis coming soon ✦
        </div>
      )}

      <div className="w-full max-w-2xl">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[#9ca3af] hover:text-[#6b7280] transition-colors group"
            aria-label="Back to modules"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to modules
          </button>
          <p className="text-xs font-medium text-[#6c8ebf] tracking-widest uppercase">
            Review
          </p>
        </div>

        {/* Video playback */}
        <div className="rounded-2xl overflow-hidden bg-[#1a1a2e] aspect-video shadow-md mb-6">
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="w-full h-full object-cover"
              aria-label="Recorded session playback"
            />
          )}
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <InfoTile label="Duration" value={formatDuration(result.durationMs)} />
          <InfoTile
            label="Video file"
            value={formatFileSize(result.videoBlob.size)}
          />
          <InfoTile
            label="Audio file"
            value={formatFileSize(result.audioBlob.size)}
          />
        </div>

        {/* Topic */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-5 py-3.5 mb-7">
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">
            Your topic
          </p>
          <p className="text-sm text-[#1a1a2e] leading-relaxed">
            &quot;{result.topic}&quot;
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            id="analyze-btn"
            onClick={handleAnalyze}
            className="flex-1 py-3 px-6 rounded-xl bg-[#6c8ebf] text-white font-semibold text-sm hover:bg-[#5a7aad] transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5"
          >
            Analyze Recording
          </button>
          <button
            id="retry-btn"
            onClick={onRetry}
            className="flex-1 py-3 px-6 rounded-xl border border-[#e5e7eb] bg-white text-[#1a1a2e] font-medium text-sm hover:border-[#6c8ebf] hover:text-[#6c8ebf] transition-all duration-200"
          >
            Try Again
          </button>
        </div>

        {/* ── Session Score Panel ────────────────────────────────────────── */}
        {result.mediapipeReady && result.frameAnalysis.length > 0 && (
          <ScorePanel frameAnalysis={result.frameAnalysis} />
        )}

        {/* ── Temporary Debug Inspector ──────────────────────────────────── */}
        <DebugInspector
          audioBlob={result.audioBlob}
          frameAnalysis={result.frameAnalysis}
          mediapipeReady={result.mediapipeReady}
        />
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3.5 text-center">
      <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-[#1a1a2e]">{value}</p>
    </div>
  );
}

// ─── Score Panel ──────────────────────────────────────────────────────────────

function ScoreBar({ label, value, unit = "%", invert = false }: {
  label: string; value: number; unit?: string; invert?: boolean;
}) {
  const pct   = unit === "°" ? Math.min(100, Math.abs(value) / 30 * 100) : Math.round(value * 100);
  const display = unit === "°" ? `${value.toFixed(1)}°` : `${pct}%`;
  const color = invert
    ? pct > 60 ? "bg-[#b45309]" : pct > 30 ? "bg-yellow-400" : "bg-green-500"
    : pct > 65 ? "bg-green-500" : pct > 35 ? "bg-yellow-400" : "bg-[#b45309]";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-[#6b7280]">{label}</span>
        <span className="text-xs font-semibold text-[#1a1a2e]">{display}</span>
      </div>
      <div className="h-2 bg-[#f4f2ef] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function ScorePanel({ frameAnalysis }: { frameAnalysis: FrameAnalysisEntry[] }) {
  const detected = frameAnalysis.filter((f) => f.faceDetected);
  if (detected.length === 0) return null;
  const avg = (key: keyof FrameAnalysisEntry) =>
    detected.reduce((s, f) => s + ((f[key] as number) ?? 0), 0) / detected.length;

  const eyeContact = avg("eyeContactScore");
  const headPose   = avg("headPoseScore");
  const mouthOpen  = avg("mouthOpenScore");
  const smile      = avg("smileScore");
  const blink      = avg("blinkScore");
  const pitch      = avg("headPitch");
  const roll       = avg("headRoll");

  return (
    <div className="mt-6 bg-white rounded-2xl border border-[#e5e7eb] p-5 shadow-sm">
      <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-4 flex items-center gap-1.5">
        <span>📈</span> Session Analysis
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <ScoreBar label="👁 Eye Contact"   value={eyeContact} />
        <ScoreBar label="🙂 Head Pose (Yaw)" value={headPose} />
        <ScoreBar label="💬 Mouth Open (Speaking)" value={mouthOpen} />
        <ScoreBar label="😄 Smile"         value={smile} />
        <ScoreBar label="😑 Blink Rate"    value={blink} invert />
        <ScoreBar label="↕ Head Pitch"    value={pitch} unit="°" />
        <ScoreBar label="↔ Head Roll"     value={roll}  unit="°" />
      </div>
      <p className="mt-3 text-[10px] text-[#9ca3af]">
        Based on {detected.length} detected frames out of {frameAnalysis.length} total.
      </p>
    </div>
  );
}
