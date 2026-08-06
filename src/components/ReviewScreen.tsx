"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RecordingResult } from "@/app/page";
import { analyzeVideo, type FrameAnalysisEntry } from "@/lib/videoAnalysis";
import { postAnalyze, type AnalysisResponse } from "@/lib/api";

interface ReviewScreenProps {
  result: RecordingResult;
  onRetry: () => void;
  onBack: () => void;
}

type AnalysisStatus = "idle" | "running" | "done" | "error";

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
  videoBlob,
  frameAnalysis,
  mediapipeReady,
}: {
  audioBlob: Blob;
  videoBlob: Blob;
  frameAnalysis: FrameAnalysisEntry[];
  mediapipeReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [jsonTab] = useState<"summary" | "full">("summary");
  const [copied, setCopied] = useState(false);

  const [clockMs, setClockMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const dbgVideoRef = useRef<HTMLVideoElement>(null);
  const clockRafRef = useRef<number>(0);

  const tickClock = useCallback(() => {
    const v = dbgVideoRef.current;
    if (!v || v.paused || v.ended) return;
    setClockMs(Math.round(v.currentTime * 1000));
    clockRafRef.current = requestAnimationFrame(tickClock);
  }, []);

  const handleVideoPlay = useCallback(() => {
    setIsPlaying(true);
    clockRafRef.current = requestAnimationFrame(tickClock);
  }, [tickClock]);

  const handleVideoPause = useCallback(() => {
    setIsPlaying(false);
    cancelAnimationFrame(clockRafRef.current);
    const v = dbgVideoRef.current;
    if (v) setClockMs(Math.round(v.currentTime * 1000));
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    cancelAnimationFrame(clockRafRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const aUrl = URL.createObjectURL(audioBlob);
    const vUrl = URL.createObjectURL(videoBlob);
    setAudioUrl(aUrl);
    setVideoUrl(vUrl);
    return () => {
      URL.revokeObjectURL(aUrl);
      URL.revokeObjectURL(vUrl);
      cancelAnimationFrame(clockRafRef.current);
    };
  }, [open, audioBlob, videoBlob]);

  const totalFrames = frameAnalysis.length;
  const detectedFrames = frameAnalysis.filter((f) => f.faceDetected).length;
  const avgEye =
    detectedFrames > 0
      ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + f.eyeContactScore, 0) / detectedFrames
      : 0;
  const avgHead =
    detectedFrames > 0
      ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + f.headPoseScore, 0) / detectedFrames
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const downloadJson = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, filename);
  };

  const sanity = (() => {
    const checks: { label: string; pass: boolean; detail: string }[] = [];
    const fa = frameAnalysis;

    checks.push({
      label: "Frame count > 0",
      pass: fa.length > 0,
      detail: `${fa.length} frames collected`,
    });

    let tsMonotone = true;
    for (let i = 1; i < fa.length; i++) {
      if (fa[i].timestamp <= fa[i - 1].timestamp) { tsMonotone = false; break; }
    }
    checks.push({
      label: "Timestamps monotonically increasing",
      pass: tsMonotone,
      detail: tsMonotone ? "All timestamps strictly increase" : "Found non-increasing timestamp",
    });

    const avgInterval = fa.length > 1
      ? (fa[fa.length - 1].timestamp - fa[0].timestamp) / (fa.length - 1)
      : 0;
    const fpsOk = avgInterval > 100 && avgInterval < 600;
    checks.push({
      label: "Frame interval ~ 200 ms (5 fps sampling)",
      pass: fpsOk,
      detail: `Avg interval: ${avgInterval.toFixed(1)} ms (${avgInterval > 0 ? (1000 / avgInterval).toFixed(1) : "0"} fps)`,
    });

    const scoreKeys: (keyof FrameAnalysisEntry)[] = [
      "eyeContactScore", "headPoseScore", "mouthOpenScore",
      "smileScore", "blinkScore", "anxietyScore", "confusionScore",
      "stressScore", "frownScore", "squintScore",
    ];
    const outOfRange = fa.some((f) =>
      scoreKeys.some((k) => {
        const v = f[k] as number;
        return typeof v === "number" && (v < -0.01 || v > 1.01);
      })
    );
    checks.push({
      label: "All scores within [0, 1]",
      pass: !outOfRange,
      detail: outOfRange ? "Some scores fall outside valid range" : "All score values are valid",
    });

    const faceRate = fa.length > 0 ? detectedFrames / fa.length : 0;
    checks.push({
      label: "Face detected > 50% of frames",
      pass: faceRate > 0.5,
      detail: `${(faceRate * 100).toFixed(1)}% face detection rate`,
    });

    const validZones = new Set(["center", "left", "right", "down", "up", "away"]);
    const badZone = fa.some((f) => !validZones.has(f.gazeZone));
    checks.push({
      label: "gazeZone field always valid",
      pass: !badZone,
      detail: badZone ? "Some frames have invalid gazeZone value" : "All gazeZone values are valid enum members",
    });

    checks.push({
      label: "Video blob size > 5 KB",
      pass: videoBlob.size > 5120,
      detail: `Video: ${formatFileSize(videoBlob.size)}, Audio: ${formatFileSize(audioBlob.size)}`,
    });

    const durationCovered = fa.length > 0 ? fa[fa.length - 1].timestamp : 0;
    checks.push({
      label: "Frame data covers full duration",
      pass: durationCovered > 1000,
      detail: `Frame analysis spans ${(durationCovered / 1000).toFixed(2)} s`,
    });

    const passed = checks.filter((c) => c.pass).length;
    return { checks, passed, total: checks.length };
  })();

  const handleCopy = (data: object) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mt-8 border border-white/10 rounded-xl overflow-hidden bg-[#12141c]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-900/80 hover:bg-slate-900 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-white">Debug & Telemetry Inspector</span>
          {frameAnalysis.length > 0 && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              sanity.passed === sanity.total
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}>
              {sanity.passed}/{sanity.total} Checks Passed
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-6 pt-5 bg-[#090a0f] space-y-6 border-t border-white/5">
          {frameAnalysis.length === 0 && (
            <div className="text-xs text-slate-400 bg-[#12141c] rounded-lg px-4 py-3 border border-white/5">
              No movement telemetry yet. Click &quot;Analyze Recording&quot; above to run MediaPipe analysis.
            </div>
          )}

          <div>
            <p className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Data Verification
            </p>
            <div className="space-y-1.5 mb-4">
              {sanity.checks.map((c) => (
                <div key={c.label} className="flex items-start gap-2.5 bg-[#12141c] rounded-lg px-3 py-2 border border-white/5">
                  <span className={`mt-0.5 text-xs font-bold ${c.pass ? "text-emerald-400" : "text-rose-400"}`}>
                    {c.pass ? "✓" : "✗"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200">{c.label}</p>
                    <p className="text-[10px] text-slate-400">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadBlob(videoBlob, `vocalyze-video-${Date.now()}.webm`)}
                className="text-xs bg-emerald-500 text-slate-950 font-semibold px-3 py-1.5 rounded transition-colors"
              >
                Export Video (.webm)
              </button>
              <button
                onClick={() => downloadBlob(audioBlob, `vocalyze-audio-${Date.now()}.webm`)}
                className="text-xs bg-slate-800 text-white font-medium px-3 py-1.5 rounded border border-white/10"
              >
                Export Audio (.webm)
              </button>
              <button
                onClick={() => downloadJson(fullJson, `vocalyze-framedata-${Date.now()}.json`)}
                className="text-xs border border-white/10 bg-[#12141c] text-slate-300 px-3 py-1.5 rounded hover:text-white transition-colors"
              >
                Export Frame JSON
              </button>
              <button
                onClick={() => downloadJson(summaryJson, `vocalyze-summary-${Date.now()}.json`)}
                className="text-xs border border-white/10 bg-[#12141c] text-slate-300 px-3 py-1.5 rounded hover:text-white transition-colors"
              >
                Export Summary JSON
              </button>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Video Sync Preview
            </p>
            <div className="bg-[#12141c] rounded-xl p-3 border border-white/5">
              {videoUrl && (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3] max-h-[360px]">
                  <video
                    ref={dbgVideoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onEnded={handleVideoEnded}
                    onSeeked={() => {
                      const v = dbgVideoRef.current;
                      if (v) setClockMs(Math.round(v.currentTime * 1000));
                    }}
                  />

                  <div className="absolute top-3 left-3 bg-black/80 rounded px-2.5 py-1 pointer-events-none">
                    <span className="text-white text-[11px] font-mono">
                      {clockMs !== null ? `t = ${(clockMs / 1000).toFixed(3)} s` : "t = 0.000 s"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider mb-3">
              JSON Telemetry
            </p>
            <div className="relative">
              <button
                onClick={() => handleCopy(jsonTab === "summary" ? summaryJson : fullJson)}
                className="absolute top-3 right-3 z-10 text-[10px] text-slate-300 hover:text-white bg-slate-800 px-2 py-1 rounded border border-white/10"
              >
                {copied ? "Copied" : "Copy JSON"}
              </button>
              <pre className="bg-[#05060a] text-emerald-400 text-[11px] leading-relaxed rounded-xl p-4 overflow-auto max-h-64 font-mono border border-white/10">
                {JSON.stringify(jsonTab === "summary" ? summaryJson : fullJson, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type BackendStatus = "idle" | "sending" | "done" | "error";

export default function ReviewScreen({ result, onRetry, onBack }: ReviewScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");

  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [frameAnalysis, setFrameAnalysis] = useState<FrameAnalysisEntry[]>([]);
  const [mediapipeReady, setMediapipeReady] = useState(false);

  const [backendStatus, setBackendStatus] = useState<BackendStatus>("idle");
  const [backendReport, setBackendReport] = useState<AnalysisResponse | null>(null);
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
        err instanceof Error ? err.message : "Could not connect to FastAPI server."
      );
      setBackendStatus("error");
    }
  }, [result.videoBlob, result.audioBlob]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fade-in bg-[#f8fafc] bg-grid-pattern text-[#0f172a]">
      <div className="w-full max-w-3xl">
        {/* Navigation header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-slate-900 border border-white/10 px-3 py-1.5 rounded-lg"
            aria-label="Back to modules"
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span>Back to Modules</span>
          </button>
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded border border-emerald-500/20">
            Session Review
          </span>
        </div>

        {/* Video Player Container */}
        <div className="rounded-2xl overflow-hidden bg-[#12141c] aspect-video border border-white/10 mb-6">
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
        <div className="grid grid-cols-3 gap-3 mb-6">
          <InfoTile label="Duration" value={formatDuration(result.durationMs)} />
          <InfoTile label="Video File" value={formatFileSize(result.videoBlob.size)} />
          <InfoTile label="Audio Stream" value={formatFileSize(result.audioBlob.size)} />
        </div>

        {/* Topic Card */}
        <div className="bg-[#12141c] rounded-xl p-4 border border-white/10 mb-6">
          <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">
            Prompt
          </span>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">&quot;{result.topic}&quot;</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            id="analyze-btn"
            onClick={handleAnalyze}
            disabled={analysisStatus === "running"}
            className={`flex-1 py-3 px-6 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 ${
              analysisStatus === "running"
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
                : "btn-primary cursor-pointer"
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
            className="py-3 px-6 rounded-xl border border-white/10 bg-slate-900 text-slate-300 font-medium text-xs hover:text-white transition-colors"
          >
            Try Again
          </button>
        </div>

        {analysisStatus === "running" && (
          <div className="mt-4">
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-200 linear"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
          </div>
        )}

        {analysisStatus === "error" && (
          <p className="mt-4 text-xs text-rose-400 text-center">{analysisError}</p>
        )}

        {mediapipeReady && frameAnalysis.length > 0 && (
          <ScorePanel frameAnalysis={frameAnalysis} />
        )}

        <BackendReport
          status={backendStatus}
          report={backendReport}
          error={backendError}
          onSeek={(timeMs) => {
            if (videoRef.current) {
              videoRef.current.currentTime = timeMs / 1000;
              videoRef.current.play().catch(e => console.error("Play failed:", e));
              videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
        />

        <DebugInspector
          audioBlob={result.audioBlob}
          videoBlob={result.videoBlob}
          frameAnalysis={frameAnalysis}
          mediapipeReady={mediapipeReady}
        />
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#12141c] rounded-xl p-3.5 text-center border border-white/10">
      <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">{label}</p>
      <p className="text-xs font-bold font-mono text-white">{value}</p>
    </div>
  );
}

// ─── Backend Coaching Report ──────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 75 ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
    : score >= 50 ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
    : "text-rose-400 border-rose-500/40 bg-rose-500/10";
  return (
    <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${color}`}>
      <span className="text-xl font-bold font-mono">{Math.round(score)}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-mono text-slate-200">{value}</span>
    </div>
  );
}

function BackendReport({
  status,
  report,
  error,
  onSeek,
}: {
  status: BackendStatus;
  report: AnalysisResponse | null;
  error: string;
  onSeek?: (timeMs: number) => void;
}) {
  if (status === "idle") return null;

  if (status === "sending") {
    return (
      <div className="mt-6 bg-[#12141c] rounded-xl p-5 border border-white/10 flex items-center gap-3">
        <div className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-300">Generating AI diagnostic report…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-6 bg-[#12141c] rounded-xl border border-rose-500/30 p-5">
        <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">Backend Connection Error</p>
        <p className="text-xs text-slate-400">{error}</p>
      </div>
    );
  }

  if (!report) return null;

  const { overall_score, feedback, gaze, emotion, head_pose, acoustic_stats, audio_received_bytes, frame_count, face_detected_pct } = report;

  return (
    <div className="mt-6 bg-[#12141c] rounded-2xl p-6 border border-white/10 space-y-6">
      {/* Header + Score */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
            Diagnostic Coaching Report
          </span>
          <p className="text-xs text-slate-400">
            {frame_count} frames analyzed · {face_detected_pct.toFixed(0)}% face coverage · {(audio_received_bytes / 1024).toFixed(1)} KB audio
          </p>
        </div>
        <ScoreCircle score={overall_score} />
      </div>

      {/* Transcript */}
      {report.transcript && (
        <div>
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">
            Audio Transcript
          </p>
          <div className="bg-[#090a0f] rounded-xl p-3.5 border border-white/5">
            <p className="text-xs text-slate-300 leading-relaxed italic">
              &quot;{report.transcript}&quot;
            </p>
          </div>
        </div>
      )}

      {/* Coaching Tips */}
      <div>
        <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">
          Coaching Recommendations
        </p>
        <div className="space-y-1.5">
          {feedback.map((tip, i) => (
            <div key={i} className="text-xs text-slate-300 leading-relaxed bg-[#090a0f] rounded-lg px-3 py-2 border border-white/5 flex items-start gap-2">
              <span className="text-emerald-400 font-bold">•</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Gaze Breakdown */}
      <div>
        <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">
          Camera Gaze Distribution
        </p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {([
            { label: "Center", pct: gaze.center_pct, good: true },
            { label: "Left",   pct: gaze.left_pct,   good: false },
            { label: "Right",  pct: gaze.right_pct,  good: false },
            { label: "Down",   pct: gaze.down_pct,   good: false },
            { label: "Away",   pct: gaze.away_pct,   good: false },
          ] as const).map(({ label, pct, good }) => (
            <div key={label} className="bg-[#090a0f] rounded-lg p-2 border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase">{label}</p>
              <p className={`text-xs font-bold font-mono mt-0.5 ${
                good && pct > 50 ? "text-emerald-400"
                : !good && pct > 30 ? "text-amber-400"
                : "text-slate-300"
              }`}>
                {pct.toFixed(0)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics breakdown */}
      <div className={`grid grid-cols-1 ${acoustic_stats ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4`}>
        <div className="bg-[#090a0f] rounded-xl p-3.5 border border-white/5">
          <p className="text-[11px] font-mono text-slate-400 uppercase mb-2">Head &amp; Gaze</p>
          <StatRow label="Eye Contact"          value={`${(head_pose.avg_eye_contact * 100).toFixed(0)}%`} />
          <StatRow label="Head Pose (Yaw)"      value={`${(head_pose.avg_head_pose * 100).toFixed(0)}%`} />
          <StatRow label="Head Pitch"           value={`${head_pose.avg_head_pitch.toFixed(1)}°`} />
          <StatRow label="Head Roll"            value={`${head_pose.avg_head_roll.toFixed(1)}°`} />
        </div>
        <div className="bg-[#090a0f] rounded-xl p-3.5 border border-white/5">
          <p className="text-[11px] font-mono text-slate-400 uppercase mb-2">Emotion Signals</p>
          <StatRow label="Anxiety"   value={`${(emotion.avg_anxiety * 100).toFixed(0)}%`} />
          <StatRow label="Confusion" value={`${(emotion.avg_confusion * 100).toFixed(0)}%`} />
          <StatRow label="Stress"    value={`${(emotion.avg_stress * 100).toFixed(0)}%`} />
          <StatRow label="Smile"     value={`${(emotion.avg_smile * 100).toFixed(0)}%`} />
        </div>
        {acoustic_stats && (
          <div className="bg-[#090a0f] rounded-xl p-3.5 border border-white/5">
            <p className="text-[11px] font-mono text-slate-400 uppercase mb-2">Audio Telemetry</p>
            <StatRow label="Pacing (WPM)"       value={acoustic_stats.wpm?.toFixed(0) ?? "0"} />
            <StatRow label="Articulation"      value={`${acoustic_stats.articulation_rate?.toFixed(0) ?? "0"} wpm`} />
            <StatRow label="Filler Ratio"      value={`${((acoustic_stats.filler_word_ratio ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="Pitch Var"         value={acoustic_stats.pitch_variation.toFixed(2)} />
          </div>
        )}
      </div>

      {/* Timestamped Events */}
      <div>
        <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">
          Timestamped Events ({report.detected_events.length})
        </p>
        {report.detected_events.length === 0 ? (
          <p className="text-xs text-slate-500 bg-[#090a0f] rounded-lg p-3 border border-white/5">
            No notable events detected.
          </p>
        ) : (
          <div className="overflow-auto rounded-lg border border-white/5 bg-[#090a0f]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase font-mono text-[9px] border-b border-white/5">
                  <th className="px-3 py-2 text-left font-normal">Event Type</th>
                  <th className="px-3 py-2 text-right font-normal">Start</th>
                  <th className="px-3 py-2 text-right font-normal">End</th>
                  <th className="px-3 py-2 text-right font-normal">Duration</th>
                </tr>
              </thead>
              <tbody>
                {report.detected_events.map((ev, i) => (
                  <tr
                    key={i}
                    onClick={() => onSeek?.(ev.start_ms)}
                    className="border-t border-white/5 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-3 py-2 text-emerald-400 font-medium">
                      {ev.type.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{(ev.start_ms / 1000).toFixed(2)}s</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{(ev.end_ms / 1000).toFixed(2)}s</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">{ev.duration_ms.toFixed(0)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
    ? pct > 60 ? "bg-rose-500" : pct > 30 ? "bg-amber-400" : "bg-emerald-400"
    : pct > 65 ? "bg-emerald-400" : pct > 35 ? "bg-amber-400" : "bg-rose-500";

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-mono font-semibold text-white">{display}</span>
      </div>
      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
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

  const anxiety    = avg("anxietyScore");
  const confusion  = avg("confusionScore");
  const stress     = avg("stressScore");

  return (
    <div className="mt-6 bg-[#12141c] rounded-2xl p-6 border border-white/10 space-y-6">
      <div>
        <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-4">
          MediaPipe On-Device Telemetry
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ScoreBar label="Eye Contact"   value={eyeContact} />
          <ScoreBar label="Head Pose Alignment" value={headPose} />
          <ScoreBar label="Speaking Activity"   value={mouthOpen} />
          <ScoreBar label="Smile Expression"    value={smile} />
          <ScoreBar label="Blink Rate"           value={blink} invert />
          <ScoreBar label="Head Pitch"            value={pitch} unit="°" />
          <ScoreBar label="Head Roll"             value={roll}  unit="°" />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-4">
          Emotion Signals
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ScoreBar label="Anxiety Score"   value={anxiety}   invert />
          <ScoreBar label="Confusion Score" value={confusion} invert />
          <ScoreBar label="Stress Score"    value={stress}    invert />
        </div>
      </div>
    </div>
  );
}
