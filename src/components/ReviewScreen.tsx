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
  const dbgVideoRef = useRef<HTMLVideoElement>(null);
  const clockRafRef = useRef<number>(0);

  const tickClock = useCallback(() => {
    const v = dbgVideoRef.current;
    if (!v || v.paused || v.ended) return;
    setClockMs(Math.round(v.currentTime * 1000));
    clockRafRef.current = requestAnimationFrame(tickClock);
  }, []);

  const handleVideoPlay = useCallback(() => {
    clockRafRef.current = requestAnimationFrame(tickClock);
  }, [tickClock]);

  const handleVideoPause = useCallback(() => {
    cancelAnimationFrame(clockRafRef.current);
    const v = dbgVideoRef.current;
    if (v) setClockMs(Math.round(v.currentTime * 1000));
  }, []);

  const handleVideoEnded = useCallback(() => {
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
    <div className="mt-8 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-slate-800 font-mono">Debug &amp; Telemetry Inspector</span>
          {frameAnalysis.length > 0 && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
              sanity.passed === sanity.total
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : "bg-amber-100 text-amber-800 border-amber-300"
            }`}>
              {sanity.passed}/{sanity.total} Checks Passed
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-6 pt-5 bg-white space-y-6">
          {frameAnalysis.length === 0 && (
            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
              No movement telemetry yet. Click &quot;Analyze Recording&quot; above to run MediaPipe analysis.
            </div>
          )}

          <div>
            <p className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider mb-3">
              Data Verification
            </p>
            <div className="space-y-1.5 mb-4">
              {sanity.checks.map((c) => (
                <div key={c.label} className="flex items-start gap-2.5 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                  <span className={`mt-0.5 text-xs font-extrabold ${c.pass ? "text-emerald-600" : "text-rose-600"}`}>
                    {c.pass ? "✓" : "✗"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800">{c.label}</p>
                    <p className="text-[10px] text-slate-500 font-medium">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadBlob(videoBlob, `vocalyze-video-${Date.now()}.webm`)}
                className="text-xs bg-[#0f172a] text-white font-bold px-3 py-1.5 rounded transition-colors shadow-sm cursor-pointer"
              >
                Export Video (.webm)
              </button>
              <button
                onClick={() => downloadBlob(audioBlob, `vocalyze-audio-${Date.now()}.webm`)}
                className="text-xs bg-slate-100 text-slate-800 font-semibold px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-200 transition-colors"
              >
                Export Audio (.webm)
              </button>
              <button
                onClick={() => downloadJson(fullJson, `vocalyze-framedata-${Date.now()}.json`)}
                className="text-xs border border-slate-300 bg-white text-slate-700 font-semibold px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
              >
                Export Frame JSON
              </button>
              <button
                onClick={() => downloadJson(summaryJson, `vocalyze-summary-${Date.now()}.json`)}
                className="text-xs border border-slate-300 bg-white text-slate-700 font-semibold px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
              >
                Export Summary JSON
              </button>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider mb-3">
              Video Sync Preview
            </p>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              {videoUrl && (
                <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-[4/3] max-h-[360px]">
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

                  <div className="absolute top-3 left-3 bg-slate-950/80 rounded px-2.5 py-1 pointer-events-none">
                    <span className="text-white text-[11px] font-mono font-bold">
                      {clockMs !== null ? `t = ${(clockMs / 1000).toFixed(3)} s` : "t = 0.000 s"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider mb-3">
              JSON Telemetry
            </p>
            <div className="relative">
              <button
                onClick={() => handleCopy(jsonTab === "summary" ? summaryJson : fullJson)}
                className="absolute top-3 right-3 z-10 text-[10px] text-slate-800 font-bold hover:text-black bg-white px-2.5 py-1 rounded border border-slate-300 shadow-sm"
              >
                {copied ? "✓ Copied" : "Copy JSON"}
              </button>
              <pre className="bg-[#0f172a] text-emerald-300 text-[11px] leading-relaxed rounded-xl p-4 overflow-auto max-h-64 font-mono border border-slate-300">
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
    <div className="min-h-screen animate-fade-in bg-[#f8fafc] bg-grid-pattern text-[#0f172a] px-4 sm:px-8 py-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* Navigation header */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-bold hover:text-slate-900 transition-colors bg-slate-50 hover:bg-slate-100 border border-slate-300 px-3.5 py-2 rounded-xl shadow-sm cursor-pointer"
              aria-label="Back to modules"
            >
              <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              <span>Back to Modules</span>
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">Vocalyze AI Diagnostic Console</h1>
              <p className="text-[11px] text-slate-500 font-medium">Session telemetry and AI coaching breakdown</p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-300 font-mono">
            Session Review
          </span>
        </div>

        {/* Main 2-Column Split Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Video + Telemetry, Sticky on Desktop) */}
          <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-6">
            {/* Video Player Container */}
            <div className="rounded-2xl overflow-hidden bg-slate-900 aspect-video border border-slate-300 shadow-md relative group">
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
              <InfoTile label="Duration" value={formatDuration(result.durationMs)} />
              <InfoTile label="Video File" value={formatFileSize(result.videoBlob.size)} />
              <InfoTile label="Audio Stream" value={formatFileSize(result.audioBlob.size)} />
            </div>

            {/* Topic Card */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase block mb-1">
                Prompt
              </span>
              <p className="text-xs sm:text-sm text-slate-800 font-bold leading-relaxed">&quot;{result.topic}&quot;</p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                id="analyze-btn"
                onClick={handleAnalyze}
                disabled={analysisStatus === "running"}
                className={`flex-1 py-3.5 px-6 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 ${
                  analysisStatus === "running"
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                    : "btn-primary cursor-pointer shadow-md"
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
                className="py-3.5 px-6 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold text-xs hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
              >
                Try Again
              </button>
            </div>

            {analysisStatus === "running" && (
              <div className="mt-4">
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-200 linear"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
              </div>
            )}

            {analysisStatus === "error" && (
              <p className="mt-4 text-xs text-rose-600 text-center font-bold">{analysisError}</p>
            )}

            {/* MediaPipe On-Device Telemetry Panel */}
            {mediapipeReady && frameAnalysis.length > 0 && (
              <ScorePanel frameAnalysis={frameAnalysis} />
            )}
          </div>

          {/* Right Column (Full Diagnostic & AI Coaching Report) */}
          <div className="lg:col-span-7 space-y-6">
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
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-3.5 text-center border border-slate-200 shadow-sm">
      <p className="text-[10px] font-mono text-slate-500 font-bold uppercase mb-1">{label}</p>
      <p className="text-xs font-extrabold font-mono text-slate-900">{value}</p>
    </div>
  );
}

// ─── Score Circle ─────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 75 ? "text-emerald-700 border-emerald-500 bg-emerald-50"
    : score >= 50 ? "text-amber-700 border-amber-500 bg-amber-50"
    : "text-rose-700 border-rose-500 bg-rose-50";
  return (
    <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${color} shadow-sm`}>
      <span className="text-xl font-black font-mono">{Math.round(score)}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-200 last:border-0">
      <span className="text-xs text-slate-600 font-medium">{label}</span>
      <span className="text-xs font-mono font-bold text-slate-900">{value}</span>
    </div>
  );
}

// ─── Backend Coaching Report ──────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<"mandatory" | "ai_feedbacks">("mandatory");
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
        setLlmError(err instanceof Error ? err.message : "Failed to load LLM feedback");
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
        <p className="text-xs text-slate-700 font-medium">Generating AI diagnostic report…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-6 bg-white rounded-xl border border-rose-300 p-5 shadow-sm">
        <p className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">Backend Connection Error</p>
        <p className="text-xs text-slate-600">{error}</p>
      </div>
    );
  }

  if (!report) return null;

  const {
    overall_score,
    feedback,
    gaze,
    emotion,
    head_pose,
    acoustic_stats,
    linguistic_stats,
    insights,
    audio_received_bytes,
    frame_count,
    face_detected_pct,
    transcript,
    detected_events,
    score_ranges,
  } = report;

  return (
    <div className="mt-6 space-y-6">
      {/* Transcript Section */}
      {transcript && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🎙️</span>
            <span className="text-[11px] font-mono font-bold text-slate-600 uppercase tracking-wider">
              Whisper Transcript
            </span>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic font-medium break-words whitespace-pre-wrap">
              &quot;{transcript}&quot;
            </p>
          </div>
        </div>
      )}

      {/* Backend Coaching Report Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🤖</span>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                Backend Coaching Report
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {frame_count} frames · {face_detected_pct.toFixed(0)}% face detected · {(audio_received_bytes / 1024).toFixed(1)} KB audio
            </p>
          </div>
          <ScoreCircle score={overall_score} />
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 font-mono text-xs font-bold">
          <button
            onClick={() => setActiveTab("mandatory")}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === "mandatory"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            MANDATORY INSIGHTS
          </button>
          <button
            onClick={() => setActiveTab("ai_feedbacks")}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === "ai_feedbacks"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            AI FEEDBACKS
          </button>
        </div>

        {/* TAB 1: MANDATORY INSIGHTS */}
        {activeTab === "mandatory" && (
          <div className="space-y-6">
            {/* AI Coaching Analysis Summary */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">💡</span>
                <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider">
                  AI Coaching Analysis
                </span>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-black text-sm">
                    🤖
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      {llmReport ? "LLM Coaching Analysis Complete" : "Diagnostic Summary"}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Based on your visual, acoustic, and linguistic delivery metrics.
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-700 font-medium">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">📈</span>
                    <span>Solid foundation — composite score {overall_score.toFixed(1)}/100. Focus on areas below to level up.</span>
                  </div>
                  {acoustic_stats && (
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">📢</span>
                      <span>
                        Pace was {insights?.pacing_status.toLowerCase() || "measured"} ({acoustic_stats.wpm.toFixed(0)} wpm) — aim for 110–150 wpm for a conversational feel.
                      </span>
                    </div>
                  )}
                  {linguistic_stats && linguistic_stats.run_on_sentences > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">📝</span>
                      <span>{linguistic_stats.run_on_sentences} run-on sentence(s) detected (40+ words with no break) — try breaking long thoughts into shorter sentences.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Speaker Insights */}
            {insights && (
              <div className="bg-blue-50/50 rounded-xl border border-blue-200/60 p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📌</span>
                  <span className="text-[11px] font-mono font-bold text-blue-800 uppercase tracking-wider">
                    Speaker Insights
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InfoTile label="Pacing" value={insights.pacing_status} />
                  <InfoTile label="Vocal Variety" value={insights.vocal_variety} />
                  <InfoTile label="Audience Connection" value={`${insights.audience_connection_pct.toFixed(0)}%`} />
                  <InfoTile label="Warmth" value={insights.warmth_index} />
                  <InfoTile label="Presence" value={insights.fidget_index} />
                  <InfoTile label="Fillers" value={insights.filler_severity} />
                </div>
                <p className="text-[10px] text-blue-600/80 font-medium italic">
                  * Note: Your silence ratio was {insights.silence_ratio_pct}%.
                </p>
              </div>
            )}

            {/* Speaking Stats */}
            {acoustic_stats && (
              <div className="bg-blue-50/40 rounded-xl border border-blue-200/50 p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🎵</span>
                  <span className="text-[11px] font-mono font-bold text-blue-800 uppercase tracking-wider">
                    Speaking Stats
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3 border border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-600">Words Per Minute</span>
                    <span className="text-sm font-black font-mono text-slate-900">{acoustic_stats.wpm.toFixed(0)}</span>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-600">Filler Words</span>
                    <span className="text-sm font-black font-mono text-slate-900">{((acoustic_stats.filler_word_ratio || 0) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Language & Vocabulary */}
            {linguistic_stats && (
              <div className="bg-blue-50/40 rounded-xl border border-blue-200/50 p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📝</span>
                  <span className="text-[11px] font-mono font-bold text-blue-800 uppercase tracking-wider">
                    Language &amp; Vocabulary
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3 border border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-600">Weak Words Found</span>
                    <span className="text-sm font-black font-mono text-slate-900">{linguistic_stats.weak_words_count}</span>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-600">Run-on Sentences (&gt;40 words)</span>
                    <span className="text-sm font-black font-mono text-slate-900">{linguistic_stats.run_on_sentences}</span>
                  </div>
                </div>

                {/* Filler Words Chips */}
                {linguistic_stats.filler_words_found && linguistic_stats.filler_words_found.length > 0 && (
                  <div>
                    <span className="text-[11px] text-slate-600 font-bold block mb-2 font-mono uppercase">Filler Words Found</span>
                    <div className="flex flex-wrap gap-1.5">
                      {linguistic_stats.filler_words_found.map((w, i) => (
                        <span key={i} className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Repeated Words Chips */}
                {linguistic_stats.top_repeated_words && linguistic_stats.top_repeated_words.length > 0 && (
                  <div>
                    <span className="text-[11px] text-slate-600 font-bold block mb-2 font-mono uppercase">Top Repeated Words</span>
                    <div className="flex flex-wrap gap-1.5">
                      {linguistic_stats.top_repeated_words.map((w, i) => (
                        <span key={i} className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Detected Events */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                  ⚡ Detected Events ({detected_events.length} total — used for Whisper stitching)
                </span>
              </div>

              {detected_events.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  No notable events detected.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-600 bg-slate-50 uppercase font-mono text-[9px] border-b border-slate-200">
                        <th className="px-3 py-2.5 text-left font-bold">TYPE</th>
                        <th className="px-3 py-2.5 text-right font-bold">START</th>
                        <th className="px-3 py-2.5 text-right font-bold">END</th>
                        <th className="px-3 py-2.5 text-right font-bold">DURATION</th>
                        <th className="px-3 py-2.5 text-right font-bold">PEAK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detected_events.map((ev, i) => (
                        <tr
                          key={i}
                          onClick={() => onSeek?.(ev.start_ms)}
                          className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-3 py-2 text-slate-800 font-bold">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 border border-slate-300 text-slate-700 inline-block">
                              {ev.type.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600 font-semibold">{(ev.start_ms / 1000).toFixed(2)}s</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600 font-semibold">{(ev.end_ms / 1000).toFixed(2)}s</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-800 font-bold">{ev.duration_ms.toFixed(0)}ms</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500">{ev.peak_value ? ev.peak_value.toFixed(2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Threshold Tuning Collapsible */}
            {score_ranges && (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button
                  onClick={() => setShowRawRanges((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-mono font-bold text-slate-700"
                >
                  <span>📊 RAW SCORE RANGES (THRESHOLD TUNING)</span>
                  <span>{showRawRanges ? "▲" : "▼"}</span>
                </button>
                {showRawRanges && (
                  <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-bold">Eye Contact</span>
                      <span>min: {score_ranges.eye_contact_min.toFixed(2)}</span><br />
                      <span>max: {score_ranges.eye_contact_max.toFixed(2)}</span><br />
                      <span>avg: {score_ranges.eye_contact_avg.toFixed(2)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-bold">Anxiety</span>
                      <span>min: {score_ranges.anxiety_min.toFixed(2)}</span><br />
                      <span>max: {score_ranges.anxiety_max.toFixed(2)}</span><br />
                      <span>avg: {score_ranges.anxiety_avg.toFixed(2)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-bold">Stress</span>
                      <span>min: {score_ranges.stress_min.toFixed(2)}</span><br />
                      <span>max: {score_ranges.stress_max.toFixed(2)}</span><br />
                      <span>avg: {score_ranges.stress_avg.toFixed(2)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-bold">Smile</span>
                      <span>min: {score_ranges.smile_min.toFixed(2)}</span><br />
                      <span>max: {score_ranges.smile_max.toFixed(2)}</span><br />
                      <span>avg: {score_ranges.smile_avg.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AI FEEDBACKS (LLM Coaching Report) */}
        {activeTab === "ai_feedbacks" && (
          <div className="space-y-6">
            {llmLoading && (
              <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200 space-y-3">
                <div className="w-6 h-6 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin mx-auto" />
                <p className="text-xs font-mono font-bold text-slate-700 uppercase">
                  Generating Detailed AI Coaching Feedback via LLM...
                </p>
                <p className="text-xs text-slate-500 font-medium">
                  Analyzing sentence structure, vocabulary impact, and moment annotations.
                </p>
              </div>
            )}

            {llmError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-rose-700 font-mono">LLM Feedback Error</p>
                <p className="text-xs text-rose-600 mt-1">{llmError}</p>
              </div>
            )}

            {llmReport && (
              <div className="space-y-6">
                {/* 1. Coach's Assessment & Final Note (Top) */}
                <div className="space-y-4">
                  {llmReport.overall_assessment && (
                    <div className="bg-blue-50/60 rounded-xl border border-blue-200/60 p-5 space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">🤖</span>
                        <span className="text-[11px] font-mono font-bold text-blue-800 uppercase tracking-wider">
                          COACH'S ASSESSMENT
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed">
                        {llmReport.overall_assessment}
                      </p>
                    </div>
                  )}

                  {llmReport.coach_final_note && (
                    <div className="bg-emerald-50/60 rounded-xl p-5 border border-emerald-200/70 space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">💡</span>
                        <span className="text-[11px] font-mono font-bold text-emerald-800 uppercase tracking-wider">
                          COACH'S FINAL NOTE
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-emerald-950 italic font-semibold leading-relaxed">
                        &quot;{llmReport.coach_final_note}&quot;
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Structural & Body Language Analysis */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {llmReport.structural_analysis && (
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                      <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider block mb-2">
                        📐 Structural Analysis
                      </span>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">
                        {llmReport.structural_analysis}
                      </p>
                    </div>
                  )}
                  {llmReport.body_language_analysis && (
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                      <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider block mb-2">
                        👁️ Body Language Analysis
                      </span>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">
                        {llmReport.body_language_analysis}
                      </p>
                    </div>
                  )}
                </div>

                {/* 3. Strengths & Gaps & Improvement Plan */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {llmReport.strengths && (
                    <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-200/60">
                      <span className="text-[11px] font-mono font-bold text-emerald-800 uppercase block mb-2">
                        ✅ Key Strengths
                      </span>
                      <ul className="space-y-1.5 text-xs text-emerald-900 font-medium">
                        {llmReport.strengths.map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {llmReport.gap_analysis && (
                    <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200/60">
                      <span className="text-[11px] font-mono font-bold text-amber-800 uppercase block mb-2">
                        🔍 Growth Areas
                      </span>
                      <ul className="space-y-1.5 text-xs text-amber-900 font-medium">
                        {llmReport.gap_analysis.map((g: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-amber-600 font-bold">•</span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {llmReport.improvement_plan && (
                    <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-200/60">
                      <span className="text-[11px] font-mono font-bold text-blue-800 uppercase block mb-2">
                        🎯 Improvement Plan
                      </span>
                      <ul className="space-y-1.5 text-xs text-blue-900 font-medium">
                        {llmReport.improvement_plan.map((p: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-blue-600 font-bold">{i + 1}.</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* 4. Detailed Corrections (Before / After / Why) */}
                {llmReport.corrections && llmReport.corrections.length > 0 && (
                  <div className="bg-blue-50/40 rounded-xl border border-blue-200/50 p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">📝</span>
                      <span className="text-[11px] font-mono font-bold text-blue-800 uppercase tracking-wider">
                        CORRECTIONS & PHRASING REFINEMENTS
                      </span>
                    </div>

                    <div className="space-y-4">
                      {llmReport.corrections.map((corr: any, idx: number) => (
                        <div key={idx} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
                          <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider block">
                            {corr.category}
                          </span>

                          <div className="space-y-2 text-xs">
                            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                              <span className="text-[10px] font-mono font-bold text-rose-700 uppercase block mb-1">BEFORE</span>
                              <p className="text-rose-900 italic font-medium">&quot;{corr.before}&quot;</p>
                            </div>

                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase block mb-1">AFTER</span>
                              <p className="text-emerald-900 font-semibold">&quot;{corr.after}&quot;</p>
                            </div>

                            <div className="pt-1">
                              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block mb-0.5">WHY</span>
                              <p className="text-slate-700 font-medium">{corr.why}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!llmLoading && !llmReport && !llmError && (
              <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200">
                <p className="text-xs font-mono font-bold text-slate-600">
                  AI LLM Feedback will appear automatically once background analysis completes.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Score Panel (MediaPipe Telemetry & Emotion Signals) ──────────────────────

function ScoreBar({ label, value, unit = "%", invert = false }: {
  label: string; value: number; unit?: string; invert?: boolean;
}) {
  const pct   = unit === "°" ? Math.min(100, Math.abs(value) / 30 * 100) : Math.round(value * 100);
  const display = unit === "°" ? `${value.toFixed(1)}°` : `${pct}%`;
  const color = invert
    ? pct > 60 ? "bg-rose-500" : pct > 30 ? "bg-amber-500" : "bg-emerald-600"
    : pct > 65 ? "bg-emerald-600" : pct > 35 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-600 font-medium">{label}</span>
        <span className="text-xs font-mono font-bold text-slate-900">{display}</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
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
  const frown      = avg("frownScore");
  const squint     = avg("squintScore");

  // Gaze zones
  const total = detected.length;
  const centerPct = Math.round((detected.filter((f) => f.gazeZone === "center").length / total) * 100);
  const leftPct   = Math.round((detected.filter((f) => f.gazeZone === "left").length / total) * 100);
  const rightPct  = Math.round((detected.filter((f) => f.gazeZone === "right").length / total) * 100);
  const downPct   = Math.round((detected.filter((f) => f.gazeZone === "down").length / total) * 100);
  const awayPct   = Math.round((detected.filter((f) => f.gazeZone === "away").length / total) * 100);

  return (
    <div className="mt-6 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
      {/* Face & Head Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">👤</span>
          <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider">
            FACE &amp; HEAD
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ScoreBar label="Eye Contact"           value={eyeContact} />
          <ScoreBar label="Head Pose (Yaw)"       value={headPose} />
          <ScoreBar label="Mouth Open (Speaking)" value={mouthOpen} />
          <ScoreBar label="Smile"                 value={smile} />
          <ScoreBar label="Blink Rate"            value={blink} invert />
          <ScoreBar label="Head Pitch"            value={pitch} unit="°" />
          <ScoreBar label="Head Roll"             value={roll}  unit="°" />
        </div>
      </div>

      {/* Gaze Zone Distribution */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">👀</span>
          <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider">
            GAZE ZONE DISTRIBUTION
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <span className="text-[9px] text-emerald-800 font-bold uppercase block">CENTER</span>
            <span className="text-base font-black font-mono text-emerald-700">{centerPct}%</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[9px] text-slate-600 font-bold uppercase block">LEFT</span>
            <span className="text-base font-black font-mono text-slate-800">{leftPct}%</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[9px] text-slate-600 font-bold uppercase block">RIGHT</span>
            <span className="text-base font-black font-mono text-slate-800">{rightPct}%</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[9px] text-slate-600 font-bold uppercase block">DOWN</span>
            <span className="text-base font-black font-mono text-slate-800">{downPct}%</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[9px] text-slate-600 font-bold uppercase block">AWAY</span>
            <span className="text-base font-black font-mono text-slate-800">{awayPct}%</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 font-medium mt-2">
          Center &gt; 50% is ideal — means consistent camera eye contact.
        </p>
      </div>

      {/* Emotion Signals */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">💭</span>
          <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider">
            EMOTION SIGNALS
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ScoreBar label="Anxiety (brow raise)"    value={anxiety}   invert />
          <ScoreBar label="Confusion (brow furrow)" value={confusion} invert />
          <ScoreBar label="Stress (lip press)"      value={stress}    invert />
          <ScoreBar label="Frown"                   value={frown}     invert />
          <ScoreBar label="Squint (eye strain)"     value={squint}    invert />
        </div>
        <p className="text-[10px] text-slate-500 font-medium mt-3">
          Lower is better — these signals indicate tension or discomfort.
        </p>
      </div>

      {/* Upper Body posture note */}
      <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 flex items-start gap-2 text-xs text-amber-900 font-medium">
        <span className="text-amber-600 font-bold">🧍</span>
        <span>
          Body posture data unavailable — PoseLandmarker may not have detected your full upper body. Try sitting further back from the camera.
        </span>
      </div>

      {/* Footnote */}
      <p className="text-[11px] text-slate-400 font-mono text-center pt-2">
        Face analysis based on {detected.length} detected frames out of {frameAnalysis.length} total.
      </p>
    </div>
  );
}
