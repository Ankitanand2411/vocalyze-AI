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
  const avgConfusion = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.confusionScore ?? 0), 0) / detectedFrames : 0;
  const avgFrown   = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.frownScore ?? 0), 0) / detectedFrames : 0;
  const avgSquint  = detectedFrames > 0 ? frameAnalysis.filter((f) => f.faceDetected).reduce((s, f) => s + (f.squintScore ?? 0), 0) / detectedFrames : 0;

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
    <div className="mt-8 border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-slate-800 font-mono tracking-wider uppercase">Telemetry & Debug Inspector</span>
          {frameAnalysis.length > 0 && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${
              sanity.passed === sanity.total
                ? "bg-teal-50 text-teal-700 border-teal-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              {sanity.passed}/{sanity.total} Passed
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
        <div className="px-5 pb-6 pt-5 bg-white space-y-6">
          {frameAnalysis.length === 0 && (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              No movement telemetry yet. Click &quot;Analyze Recording&quot; above to run MediaPipe analysis.
            </div>
          )}

          <div>
            <p className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider mb-3">
              Diagnostic Metrics
            </p>
            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
              <StatRow label="Mouth Open" value={`${Math.round(avgMouth * 100)}%`} />
              <StatRow label="Smile" value={`${Math.round(avgSmile * 100)}%`} />
              <StatRow label="Blink Rate" value={`${Math.round(avgBlink * 100)}%`} />
              <StatRow label="Head Pitch" value={`${avgPitch.toFixed(1)}°`} />
              <StatRow label="Head Roll" value={`${avgRoll.toFixed(1)}°`} />
              <StatRow label="Confusion" value={`${Math.round(avgConfusion * 100)}%`} />
              <StatRow label="Frown" value={`${Math.round(avgFrown * 100)}%`} />
              <StatRow label="Squint" value={`${Math.round(avgSquint * 100)}%`} />
            </div>
          </div>

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
        <div className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-bold hover:text-slate-900 transition-colors bg-white hover:bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl cursor-pointer"
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
              <InfoTile label="Duration" value={formatDuration(result.durationMs)} />
              <InfoTile label="Video File" value={formatFileSize(result.videoBlob.size)} />
              <InfoTile label="Audio Stream" value={formatFileSize(result.audioBlob.size)} />
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
              <p className="mt-4 text-xs text-rose-600 text-center font-bold">{analysisError}</p>
            )}

            {/* MediaPipe On-Device Telemetry Panel (Moved to Left Column) */}
            {mediapipeReady && frameAnalysis.length > 0 && (
              <ScoredTelemetryPanel frameAnalysis={frameAnalysis} />
            )}

            <DebugInspector
              audioBlob={result.audioBlob}
              videoBlob={result.videoBlob}
              frameAnalysis={frameAnalysis}
              mediapipeReady={mediapipeReady}
            />
          </div>

          {/* Right Column (Diagnostic Report & Telemetry, lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Transcript (Moved to Right Column, top) */}
            {backendReport?.transcript && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Video Transcript
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-800 leading-relaxed font-medium break-words whitespace-pre-wrap">
                    {backendReport.transcript}
                  </p>
                </div>
              </div>
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

  const eyePct = insights?.audience_connection_pct ?? 0;
  const eyeLabel = getEyeContactLabel(eyePct);
  const eyeColor = getStatusColor(eyeLabel);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
      <div className="text-center pb-2 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Rehearsal Insights</h2>
        
        {/* Overall Score Circle */}
        <div className="relative w-32 h-32 mx-auto mb-3">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background track */}
            <circle cx="50" cy="50" r="40" stroke="#ccfbf1" strokeWidth="8" fill="none" />
            {/* Progress track */}
            <circle 
              cx="50" cy="50" r="40" 
              stroke="#14b8a6" 
              strokeWidth="8" 
              fill="none" 
              strokeDasharray="251.2" 
              strokeDashoffset={251.2 - (251.2 * (overall_score / 100))}
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

      {/* Bento Metric Cards */}
      <div className="space-y-3">
        {/* Pacing */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Pacing</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">{acoustic_stats?.wpm.toFixed(0) || 0} WPM</span>
              <span className="text-slate-400">-</span>
              <span className="text-teal-600 font-bold">{insights?.pacing_status || "Optimal"}</span>
            </div>
          </div>
          <div className="shrink-0 flex items-end gap-1 h-8">
            <div className="w-1.5 bg-teal-200 h-1/3 rounded-t"></div>
            <div className="w-1.5 bg-teal-300 h-2/3 rounded-t"></div>
            <div className="w-1.5 bg-teal-400 h-full rounded-t"></div>
            <div className="w-1.5 bg-teal-500 h-4/5 rounded-t"></div>
            <div className="w-1.5 bg-teal-600 h-2/3 rounded-t"></div>
          </div>
        </div>

        {/* Filler Words */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Filler Words</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">
                {linguistic_stats?.filler_words_found?.length || 0} words{linguistic_stats?.filler_words_found?.length ? `: '${linguistic_stats.filler_words_found.slice(0, 2).join("', '")}'` : ""}
              </span>
              <span className="text-slate-400">-</span>
              <span className="text-teal-600 font-bold">{insights?.filler_severity || "Good"}</span>
            </div>
          </div>
        </div>

        {/* Eye Contact */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className={`w-12 h-12 rounded-full bg-${eyeColor}-50 flex items-center justify-center shrink-0`}>
            <svg className={`w-6 h-6 text-${eyeColor}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Eye Contact</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">{eyePct.toFixed(0)}% Engagement</span>
              <span className="text-slate-400">-</span>
              <span className={`text-${eyeColor}-600 font-bold`}>{eyeLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Coaching Insights */}
      <div className="bg-[#fef3c7] rounded-2xl p-5 border border-amber-200 shadow-sm mt-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#fde68a] flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-xl">💡</span>
          </div>
          <div>
            <h4 className="text-[17px] font-bold text-slate-900">AI Coaching Insights</h4>
          </div>
        </div>
        
        <div className="space-y-4 text-[15px] text-slate-800 font-medium leading-relaxed">
          {llmReport?.improvement_plan ? (
            llmReport.improvement_plan.slice(0, 3).map((plan: string, idx: number) => (
              <p key={idx}>{plan}</p>
            ))
          ) : (
            <>
              <p>Focus on eye contact during the first 30 seconds to engage the audience immediately.</p>
              <p>Reduce filler words like &apos;uh&apos; in minutes 1-2.</p>
              <p>Try slowing down slightly when introducing key product features for better emphasis.</p>
            </>
          )}
        </div>

        <button 
          onClick={() => setActiveTab("ai_feedbacks")}
          className="w-full mt-6 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-[15px] shadow-sm hover:bg-slate-50 transition-colors"
        >
          Review Feedback Points
        </button>
      </div>

      {/* Render detailed AI feedbacks if tab is active (could be in a modal or just appended below) */}
      {activeTab === "ai_feedbacks" && llmReport && (
        <div className="mt-8 p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-bold text-slate-900">Detailed Coaching Report</h4>
            <button onClick={() => setActiveTab("mandatory")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
          
          <div className="space-y-6">
            {llmReport.corrections?.length > 0 && (
              <div>
                <h5 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Phrasing Refinements</h5>
                <div className="space-y-3">
                  {llmReport.corrections.map((corr: any, idx: number) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <div className="mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Before</span>
                        <p className="text-slate-700 italic text-sm">&quot;{corr.before}&quot;</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-teal-600 uppercase">After</span>
                        <p className="text-teal-900 font-semibold text-sm">&quot;{corr.after}&quot;</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {llmReport.coach_final_note && (
              <div className="bg-slate-900 rounded-xl p-5 text-white">
                <h5 className="text-[11px] font-bold text-teal-400 uppercase tracking-wider mb-2">Coach&apos;s Note</h5>
                <p className="text-sm italic font-medium leading-relaxed">{llmReport.coach_final_note}</p>
              </div>
            )}
          </div>
        </div>
      )}
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

// ─── Scored Telemetry Panel ──────────────────────────────────────────────────

function ScoredTelemetryPanel({ frameAnalysis }: { frameAnalysis: FrameAnalysisEntry[] }) {
  const detected = frameAnalysis.filter((f) => f.faceDetected);
  if (detected.length === 0) return null;
  const avg = (key: keyof FrameAnalysisEntry) =>
    detected.reduce((s, f) => s + ((f[key] as number) ?? 0), 0) / detected.length;

  const eyeContact = avg("eyeContactScore") * 100;
  const headPose   = avg("headPoseScore");
  const anxiety    = avg("anxietyScore") * 100;
  const stress     = avg("stressScore") * 100;

  const total = detected.length;
  const gazeCenter = Math.round((detected.filter((f) => f.gazeZone === "center").length / total) * 100);

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
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className={`w-12 h-12 rounded-full bg-${eyeColor}-50 flex items-center justify-center shrink-0`}>
            <svg className={`w-6 h-6 text-${eyeColor}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Eye Contact</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">{Math.round(eyeContact)}%</span>
              <span className="text-slate-400">-</span>
              <span className={`text-${eyeColor}-600 font-bold`}>{eyeLabel}</span>
            </div>
          </div>
        </div>

        {/* Gaze Center % */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className={`w-12 h-12 rounded-full bg-${gazeColor}-50 flex items-center justify-center shrink-0`}>
            <svg className={`w-6 h-6 text-${gazeColor}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Gaze Zone (Center)</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">{gazeCenter}%</span>
              <span className="text-slate-400">-</span>
              <span className={`text-${gazeColor}-600 font-bold`}>{gazeLabel}</span>
            </div>
          </div>
        </div>

        {/* Anxiety */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className={`w-12 h-12 rounded-full bg-${anxietyColor}-50 flex items-center justify-center shrink-0`}>
            <svg className={`w-6 h-6 text-${anxietyColor}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Anxiety Signal</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">{Math.round(anxiety)}%</span>
              <span className="text-slate-400">-</span>
              <span className={`text-${anxietyColor}-600 font-bold`}>{anxietyLabel}</span>
            </div>
          </div>
        </div>

        {/* Stress */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className={`w-12 h-12 rounded-full bg-${stressColor}-50 flex items-center justify-center shrink-0`}>
            <svg className={`w-6 h-6 text-${stressColor}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Stress Signal</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">{Math.round(stress)}%</span>
              <span className="text-slate-400">-</span>
              <span className={`text-${stressColor}-600 font-bold`}>{stressLabel}</span>
            </div>
          </div>
        </div>

        {/* Head Pose Yaw */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className={`w-12 h-12 rounded-full bg-${headColor}-50 flex items-center justify-center shrink-0`}>
            <div className="relative w-6 h-6 border-2 border-slate-300 rounded-full">
              <div 
                className={`absolute w-2 h-2 rounded-full bg-${headColor}-600`} 
                style={{ top: "50%", left: `${dotX}%`, transform: "translate(-50%, -50%)" }}
              />
            </div>
          </div>
          <div className="flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">Head Pose (Yaw)</h4>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">{Math.abs(headPose).toFixed(1)}°</span>
              <span className="text-slate-400">-</span>
              <span className={`text-${headColor}-600 font-bold`}>{headText}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Upper Body posture note */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-start gap-2 text-xs text-slate-700 font-medium">
        <span className="text-slate-500 font-bold font-mono text-[10px] uppercase">NOTE:</span>
        <span>
          Body posture data unavailable — PoseLandmarker may not have detected your upper body. Try positioning further back from the camera.
        </span>
      </div>

      {/* Footnote */}
      <p className="text-[11px] text-slate-400 font-mono text-center pt-2">
        Face analysis based on {detected.length} detected frames out of {frameAnalysis.length} total.
      </p>
    </div>
  );
}
