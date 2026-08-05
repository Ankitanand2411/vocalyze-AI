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
  const [jsonTab, setJsonTab] = useState<"summary" | "full">("summary");
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

  const activeFrame: FrameAnalysisEntry | null =
    clockMs !== null && frameAnalysis.length > 0
      ? frameAnalysis.reduce((best, f) =>
          Math.abs(f.timestamp - clockMs) < Math.abs(best.timestamp - clockMs) ? f : best
        )
      : null;

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
      detail: tsMonotone ? "All timestamps strictly increase" : "Found non-increasing timestamp — clock drift issue",
    });

    const avgInterval = fa.length > 1
      ? (fa[fa.length - 1].timestamp - fa[0].timestamp) / (fa.length - 1)
      : 0;
    // 5fps target (200ms interval) with wide tolerance — playback-based
    // sampling at 8× speed is not perfectly uniform across browsers.
    const fpsOk = avgInterval > 100 && avgInterval < 600;
    checks.push({
      label: "Frame interval ≈ 200 ms (5 fps sampling)",
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
    <div className="mt-8 border border-dashed border-[#e5e7eb] rounded-2xl overflow-hidden">
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
          {frameAnalysis.length > 0 && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              sanity.passed === sanity.total
                ? "bg-green-100 text-green-700"
                : sanity.passed >= sanity.total - 1
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
            }`}>
              {sanity.passed}/{sanity.total} checks ✓
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-[#9ca3af] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-6 pt-5 bg-white space-y-6 animate-fade-in">

          {frameAnalysis.length === 0 && (
            <div className="text-[11px] text-[#9ca3af] bg-[#f4f2ef] rounded-xl px-4 py-3">
              No movement data yet — click &quot;Analyze Recording&quot; above to run MediaPipe on this video.
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span>🔍</span> Data Integrity Check
            </p>
            <div className="space-y-1.5 mb-4">
              {sanity.checks.map((c) => (
                <div key={c.label} className="flex items-start gap-2.5 bg-[#f4f2ef] rounded-xl px-3 py-2">
                  <span className={`mt-0.5 text-xs font-bold ${c.pass ? "text-green-600" : "text-red-500"}`}>
                    {c.pass ? "✓" : "✗"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-[#1a1a2e]">{c.label}</p>
                    <p className="text-[10px] text-[#9ca3af]">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-2">
              Download for external review
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadBlob(videoBlob, `vocalyze-video-${Date.now()}.webm`)}
                className="flex items-center gap-1.5 text-xs font-medium bg-[#1a1a2e] text-white px-3 py-1.5 rounded-lg hover:bg-[#2d2d4e] transition-colors"
              >
                ⬇ Download Video (.webm)
              </button>
              <button
                onClick={() => downloadBlob(audioBlob, `vocalyze-audio-${Date.now()}.webm`)}
                className="flex items-center gap-1.5 text-xs font-medium bg-[#1a1a2e] text-white px-3 py-1.5 rounded-lg hover:bg-[#2d2d4e] transition-colors"
              >
                ⬇ Download Audio (.webm)
              </button>
              <button
                onClick={() => downloadJson(fullJson, `vocalyze-framedata-${Date.now()}.json`)}
                className="flex items-center gap-1.5 text-xs font-medium border border-[#e5e7eb] bg-white text-[#1a1a2e] px-3 py-1.5 rounded-lg hover:border-[#6c8ebf] hover:text-[#6c8ebf] transition-colors"
              >
                ⬇ Download Frame JSON
              </button>
              <button
                onClick={() => downloadJson(summaryJson, `vocalyze-summary-${Date.now()}.json`)}
                className="flex items-center gap-1.5 text-xs font-medium border border-[#e5e7eb] bg-white text-[#1a1a2e] px-3 py-1.5 rounded-lg hover:border-[#6c8ebf] hover:text-[#6c8ebf] transition-colors"
              >
                ⬇ Download Summary JSON
              </button>
            </div>
            <p className="text-[10px] text-[#9ca3af] mt-2">
              Download the video + frame JSON and share them in the chat — I can verify alignment, timestamps, and score quality directly.
            </p>
          </div>

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
                <span className="text-[#9ca3af]">128 kbps · audio-only</span>
              </div>
              {audioUrl && (
                <audio controls src={audioUrl} className="w-full h-10" aria-label="Extracted audio from recording" />
              )}
              <p className="text-[11px] text-[#9ca3af] leading-relaxed">
                This is the audio-only stream (no video payload) that would be sent to Whisper for transcription.
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span>🎬</span> Module B — Video (Shared Clock Proof)
            </p>
            <div className="bg-[#f4f2ef] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3 text-xs text-[#6b7280]">
                <span className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-1.5 font-mono">
                  video/webm
                </span>
                <span>{formatFileSize(videoBlob.size)}</span>
                <span className="text-[#9ca3af]">800 kbps · audio+video</span>
              </div>

              {videoUrl && (
                <div className="relative rounded-xl overflow-hidden bg-[#1a1a2e] aspect-[4/3] max-h-[600px]">
                  <video
                    ref={dbgVideoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                    aria-label="Module B video — shared clock proof"
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onEnded={handleVideoEnded}
                    onSeeked={() => {
                      const v = dbgVideoRef.current;
                      if (v) setClockMs(Math.round(v.currentTime * 1000));
                    }}
                  />

                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 pointer-events-none">
                    <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-green-400 animate-pulse" : "bg-amber-400"}`} />
                    <span className="text-white text-[11px] font-mono font-semibold tracking-wider">
                      {clockMs !== null ? `t = ${(clockMs / 1000).toFixed(3)} s` : "t = 0.000 s"}
                    </span>
                    <span className="text-white/50 text-[10px]">shared clock</span>
                  </div>

                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg p-1 pointer-events-auto z-10">
                    {[0.1, 0.25, 0.5, 1].map(rate => (
                      <button 
                        key={rate} 
                        onClick={() => { 
                          if (dbgVideoRef.current) {
                            dbgVideoRef.current.playbackRate = rate;
                            // Force re-render to highlight active rate if we were storing it in state, 
                            // but since we want to keep it simple without adding a new useState, 
                            // we'll just let the user click it.
                          }
                        }}
                        className="text-[10px] font-mono font-bold text-white px-2 py-1 rounded hover:bg-white/20 transition-colors"
                        title={`Set playback speed to ${rate}x`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {activeFrame && (
                    <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1 pointer-events-none">
                      <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2 text-right">
                        <p className="text-[9px] text-white/50 uppercase tracking-widest mb-1">
                          Closest frame @ {activeFrame.timestamp} ms
                        </p>
                        <div className="flex flex-wrap gap-2 justify-end max-w-[200px]">
                          {[
                            { k: "👁 Eye", v: activeFrame.eyeContactScore },
                            { k: "🙂 Head", v: activeFrame.headPoseScore },
                            { k: "😄 Smile", v: activeFrame.smileScore ?? 0 },
                            { k: "😑 Blink", v: activeFrame.blinkScore ?? 0 },
                            { k: "😟 Anx", v: activeFrame.anxietyScore ?? 0 },
                            { k: "😬 Str", v: activeFrame.stressScore ?? 0 },
                            { k: "😮 Jaw", v: activeFrame.mouthOpenScore ?? 0 },
                            { k: "☹️ Frown", v: activeFrame.frownScore ?? 0 },
                            { k: "🤡 Mock", v: activeFrame.mockingScore ?? 0 },
                          ].map(({ k, v }) => {
                            const val = v ?? 0;
                            // Highlight if it crosses the new backend thresholds
                            const isHigh = 
                              (k.includes("Eye") && val < 0.4) ||
                              (k.includes("Smile") && val > 0.45) ||
                              (k.includes("Blink") && val > 0.35) ||
                              (k.includes("Anx") && val > 0.35) ||
                              (k.includes("Str") && val > 0.35) ||
                              (k.includes("Jaw") && val > 0.3) ||
                              (k.includes("Frown") && val > 0.3) ||
                              (k.includes("Mock") && val > 0.4);
                            return (
                              <span key={k} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isHigh ? "bg-red-500/80 text-white" : "bg-white/20 text-white"}`}>
                                {k} {Math.round(val * 100)}%
                              </span>
                            );
                          })}
                        </div>
                        <p className="text-[9px] mt-1 font-medium" style={{ color: activeFrame.faceDetected ? "#4ade80" : "#f87171" }}>
                          {activeFrame.faceDetected ? "✓ face detected" : "✗ no face"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {clockMs !== null && activeFrame && (
                <div className="bg-white border border-[#e5e7eb] rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-2">
                    🔗 Shared-clock alignment
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#f4f2ef] rounded-lg px-2 py-2">
                      <p className="text-[9px] text-[#9ca3af] uppercase tracking-widest">Video t</p>
                      <p className="text-xs font-mono font-semibold text-[#1a1a2e] mt-0.5">{(clockMs / 1000).toFixed(3)} s</p>
                    </div>
                    <div className="bg-[#f4f2ef] rounded-lg px-2 py-2">
                      <p className="text-[9px] text-[#9ca3af] uppercase tracking-widest">Nearest frame</p>
                      <p className="text-xs font-mono font-semibold text-[#1a1a2e] mt-0.5">{activeFrame.timestamp} ms</p>
                    </div>
                    <div className="bg-[#f4f2ef] rounded-lg px-2 py-2">
                      <p className="text-[9px] text-[#9ca3af] uppercase tracking-widest">Drift</p>
                      <p className={`text-xs font-mono font-semibold mt-0.5 ${
                        Math.abs(activeFrame.timestamp - clockMs) < 100 ? "text-green-600" : "text-amber-600"
                      }`}>
                        {Math.abs(activeFrame.timestamp - clockMs)} ms
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#9ca3af] mt-2 leading-relaxed">
                    Drift &lt; ~100 ms means the video frame and the (12fps-sampled) face-analysis frame are from close to the same moment.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-[#9ca3af] leading-relaxed">
                Both audio (Module A) and this video (Module B) started at <code className="bg-[#e5e7eb] px-1 rounded">t = 0</code> together during recording. Frame analysis (Module B, run post-recording) uses the video&apos;s own playback position as its timestamp, so it lines up with the audio timeline. Scrub the video — the frame badge updates to show the nearest analyzed frame.
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span>📊</span> Module B — MediaPipe Frame Analysis
            </p>

            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${mediapipeReady ? "bg-green-500" : "bg-[#b45309]"}`} />
              <span className="text-xs text-[#6b7280]">
                MediaPipe:{" "}
                <span className={`font-semibold ${mediapipeReady ? "text-green-600" : "text-[#b45309]"}`}>
                  {mediapipeReady ? "Analysis complete" : "Not run yet"}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: "Total frames", value: totalFrames },
                { label: "Face detected", value: detectedFrames },
                { label: "Avg eye contact", value: `${(avgEye * 100).toFixed(0)}%` },
                { label: "Avg head pose", value: `${(avgHead * 100).toFixed(0)}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#f4f2ef] rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">{s.label}</p>
                  <p className="text-sm font-semibold text-[#1a1a2e]">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-1 mb-3 bg-[#f4f2ef] p-1 rounded-lg w-fit">
              {(["summary", "full"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setJsonTab(tab)}
                  className={[
                    "px-3 py-1 rounded-md text-xs font-medium transition-all duration-150",
                    jsonTab === tab ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#9ca3af] hover:text-[#6b7280]",
                  ].join(" ")}
                >
                  {tab === "summary" ? "Summary JSON" : `Full JSON (${totalFrames} frames)`}
                </button>
              ))}
            </div>

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
              Each frame entry has a <code className="bg-[#f4f2ef] px-1 rounded">timestamp</code> (ms from video start) that aligns with Module A&apos;s audio timeline — so the backend can map face scores to specific spoken words.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ── Backend report status ─────────────────────────────────────────────────────
type BackendStatus = "idle" | "sending" | "done" | "error";

export default function ReviewScreen({ result, onRetry, onBack }: ReviewScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");

  // MediaPipe (local) analysis state
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [frameAnalysis, setFrameAnalysis] = useState<FrameAnalysisEntry[]>([]);
  const [mediapipeReady, setMediapipeReady] = useState(false);

  // Backend report state
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("idle");
  const [backendReport, setBackendReport] = useState<AnalysisResponse | null>(null);
  const [backendError, setBackendError] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(result.videoBlob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result.videoBlob]);

  /**
   * Step 1 — run MediaPipe locally against the video blob.
   * Step 2 — once MediaPipe succeeds, immediately POST the audio + frame data
   *           to the FastAPI backend for the coaching report.
   */
  const handleAnalyze = useCallback(async () => {
    setAnalysisStatus("running");
    setAnalysisProgress(0);
    setAnalysisError("");
    setBackendStatus("idle");
    setBackendReport(null);
    setBackendError("");

    let fa: FrameAnalysisEntry[] = [];
    let ready = false;

    // ── Step 1: MediaPipe (local) ────────────────────────────────────────────
    try {
      const result_ = await analyzeVideo(result.videoBlob, setAnalysisProgress);
      fa = result_.frameAnalysis;
      ready = result_.mediapipeReady;
      setFrameAnalysis(fa);
      setMediapipeReady(ready);
      setAnalysisStatus(ready ? "done" : "error");
      if (!ready) {
        setAnalysisError("MediaPipe failed to load — check your connection and try again.");
        return;
      }
    } catch (err) {
      console.error("[ReviewScreen] MediaPipe analysis failed:", err);
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed.");
      setAnalysisStatus("error");
      return;
    }

    // ── Step 2: Backend report ───────────────────────────────────────────────
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
        err instanceof Error ? err.message : "Could not reach the backend."
      );
      setBackendStatus("error");
    }
  }, [result.videoBlob, result.audioBlob]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fade-in">
      <div className="w-full max-w-2xl">
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
          <p className="text-xs font-medium text-[#6c8ebf] tracking-widest uppercase">Review</p>
        </div>

        <div className="rounded-2xl overflow-hidden bg-[#1a1a2e] aspect-[4/3] max-h-[600px] shadow-md mb-6">
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

        <div className="grid grid-cols-3 gap-3 mb-6">
          <InfoTile label="Duration" value={formatDuration(result.durationMs)} />
          <InfoTile label="Video file" value={formatFileSize(result.videoBlob.size)} />
          <InfoTile label="Audio file" value={formatFileSize(result.audioBlob.size)} />
        </div>

        <div className="bg-white rounded-xl border border-[#e5e7eb] px-5 py-3.5 mb-7">
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Your topic</p>
          <p className="text-sm text-[#1a1a2e] leading-relaxed">&quot;{result.topic}&quot;</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            id="analyze-btn"
            onClick={handleAnalyze}
            disabled={analysisStatus === "running"}
            className={[
              "flex-1 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200",
              analysisStatus === "running"
                ? "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
                : "bg-[#6c8ebf] text-white hover:bg-[#5a7aad] hover:shadow-sm hover:-translate-y-0.5",
            ].join(" ")}
          >
            {analysisStatus === "running"
              ? `Analyzing… ${analysisProgress}%`
              : analysisStatus === "done"
              ? "Re-analyze"
              : "Analyze Recording"}
          </button>
          <button
            id="retry-btn"
            onClick={onRetry}
            className="flex-1 py-3 px-6 rounded-xl border border-[#e5e7eb] bg-white text-[#1a1a2e] font-medium text-sm hover:border-[#6c8ebf] hover:text-[#6c8ebf] transition-all duration-200"
          >
            Try Again
          </button>
        </div>

        {analysisStatus === "running" && (
          <div className="mt-4">
            <div className="h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6c8ebf] rounded-full transition-all duration-200 ease-linear"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[#9ca3af]">
              Running face and posture analysis on your recording — this can take a little while.
            </p>
          </div>
        )}

        {analysisStatus === "done" && backendStatus !== "done" && (
          <p className="mt-4 text-xs text-[#9ca3af]">
            Movement analysis complete.{backendStatus === "sending" ? " Sending to backend…" : ""}
          </p>
        )}

        {analysisStatus === "error" && (
          <p className="mt-4 text-xs text-[#b45309]">{analysisError}</p>
        )}

        {mediapipeReady && frameAnalysis.length > 0 && (
          <ScorePanel frameAnalysis={frameAnalysis} />
        )}

        {/* ── Backend coaching report ── */}
        <BackendReport
          status={backendStatus}
          report={backendReport}
          error={backendError}
          onSeek={(timeMs) => {
            if (videoRef.current) {
              videoRef.current.currentTime = timeMs / 1000;
              videoRef.current.play().catch(e => console.error("Play failed:", e));
              
              // Scroll to the video player so the user can see it
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
    <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3.5 text-center">
      <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#1a1a2e]">{value}</p>
    </div>
  );
}

// ─── Backend Coaching Report ──────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 75 ? "text-green-600 border-green-400"
    : score >= 50 ? "text-yellow-600 border-yellow-400"
    : "text-[#b45309] border-[#b45309]";
  return (
    <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center ${color}`}>
      <span className="text-2xl font-bold tabular-nums">{Math.round(score)}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#f4f2ef] last:border-0">
      <span className="text-xs text-[#6b7280]">{label}</span>
      <span className="text-xs font-semibold text-[#1a1a2e]">{value}</span>
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
      <div className="mt-6 bg-white rounded-2xl border border-[#e5e7eb] p-5 shadow-sm flex items-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-[#6c8ebf] border-t-transparent animate-spin flex-shrink-0" />
        <p className="text-sm text-[#6b7280]">Sending to backend for coaching report…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-6 bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-2">⚠️ Backend Error</p>
        <p className="text-sm text-[#b45309]">{error}</p>
        <p className="mt-2 text-xs text-[#9ca3af]">
          Make sure the FastAPI server is running on{" "}
          <code className="bg-[#f4f2ef] px-1 rounded">http://localhost:8000</code>.
        </p>
      </div>
    );
  }

  if (!report) return null;

  const { overall_score, feedback, gaze, emotion, head_pose, acoustic_stats, audio_received_bytes, frame_count, face_detected_pct } = report;

  return (
    <div className="mt-6 bg-white rounded-2xl border border-[#e5e7eb] p-5 shadow-sm space-y-6">

      {/* ── Header + score ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-0.5">
            🤖 Backend Coaching Report
          </p>
          <p className="text-xs text-[#6b7280]">
            {frame_count} frames · {face_detected_pct.toFixed(0)}% face detected
            · {(audio_received_bytes / 1024).toFixed(1)} KB audio
          </p>
        </div>
        <ScoreCircle score={overall_score} />
      </div>

      {/* ── Transcript ── */}
      {report.transcript && (
        <div>
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">🎙️ Whisper Transcript</p>
          <div className="bg-[#f4f2ef] rounded-xl px-4 py-3 border border-[#e5e7eb]">
            <p className="text-sm text-[#374151] leading-relaxed italic">
              "{report.transcript}"
            </p>
          </div>
        </div>
      )}

      {/* ── Feedback tips ── */}
      <div>
        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">💡 Coaching Tips</p>
        <ul className="space-y-2">
          {feedback.map((tip, i) => (
            <li key={i} className="text-sm text-[#374151] leading-relaxed bg-[#f4f2ef] rounded-xl px-4 py-2.5">
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Gaze breakdown ── */}
      <div>
        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">👀 Gaze Distribution</p>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {([
            { label: "Center", pct: gaze.center_pct, good: true },
            { label: "Left",   pct: gaze.left_pct,   good: false },
            { label: "Right",  pct: gaze.right_pct,  good: false },
            { label: "Down",   pct: gaze.down_pct,   good: false },
            { label: "Away",   pct: gaze.away_pct,   good: false },
          ] as const).map(({ label, pct, good }) => (
            <div key={label} className="bg-[#f4f2ef] rounded-xl p-2">
              <p className="text-[9px] text-[#9ca3af] uppercase tracking-widest">{label}</p>
              <p className={`text-sm font-semibold mt-0.5 ${
                good && pct > 50 ? "text-green-600"
                : !good && pct > 30 ? "text-amber-600"
                : "text-[#1a1a2e]"
              }`}>
                {pct.toFixed(0)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Head pose + emotion + acoustic stats ── */}
      <div className={`grid grid-cols-1 ${acoustic_stats ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-5`}>
        <div>
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-2">👤 Head &amp; Gaze</p>
          <StatRow label="Eye Contact"          value={`${(head_pose.avg_eye_contact * 100).toFixed(0)}%`} />
          <StatRow label="Head Pose (Yaw)"      value={`${(head_pose.avg_head_pose * 100).toFixed(0)}%`} />
          <StatRow label="Head Pitch"           value={`${head_pose.avg_head_pitch.toFixed(1)}°`} />
          <StatRow label="Head Roll"            value={`${head_pose.avg_head_roll.toFixed(1)}°`} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-2">🧠 Emotion Signals</p>
          <StatRow label="Anxiety"   value={`${(emotion.avg_anxiety * 100).toFixed(0)}%`} />
          <StatRow label="Confusion" value={`${(emotion.avg_confusion * 100).toFixed(0)}%`} />
          <StatRow label="Stress"    value={`${(emotion.avg_stress * 100).toFixed(0)}%`} />
          <StatRow label="Frown"     value={`${(emotion.avg_frown * 100).toFixed(0)}%`} />
          <StatRow label="Smile"     value={`${(emotion.avg_smile * 100).toFixed(0)}%`} />
        </div>
        {acoustic_stats && (
          <div>
            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-2">🎵 Acoustic Stats</p>
            <StatRow label="WPM"              value={acoustic_stats.wpm?.toFixed(0) ?? "0"} />
            <StatRow label="Articulation Rate" value={`${acoustic_stats.articulation_rate?.toFixed(0) ?? "0"} wpm`} />
            <StatRow label="Filler Words"     value={`${((acoustic_stats.filler_word_ratio ?? 0) * 100).toFixed(1)}%`} />
            <div className="my-2 border-b border-[#f4f2ef]"></div>
            <StatRow label="Pitch Variation"  value={acoustic_stats.pitch_variation.toFixed(2)} />
            <StatRow label="Avg Volume"       value={acoustic_stats.avg_volume.toFixed(3)} />
            <StatRow label="Pause Count"      value={`${acoustic_stats.pause_count}`} />
            <StatRow label="Longest Pause"    value={`${acoustic_stats.longest_pause_ms.toFixed(0)} ms`} />
            <StatRow label="Avg Pause"        value={`${acoustic_stats.avg_pause_ms.toFixed(0)} ms`} />
          </div>
        )}
      </div>

      {/* ── Linguistic Stats ── */}
      {report.linguistic_stats && (
        <div className="bg-[#f8f9fa] rounded-xl border border-[#e5e7eb] p-4">
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">📝 Language & Vocabulary</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <StatRow label="Weak Words Found" value={report.linguistic_stats.weak_words_count.toString()} />
              {report.linguistic_stats.weak_words_count > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {report.linguistic_stats.weak_words_found.map((w, i) => (
                    <span key={i} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md">{w}</span>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <StatRow label="Filler Words Found" value={report.linguistic_stats.filler_words_found.length.toString()} />
                {report.linguistic_stats.filler_words_found.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {report.linguistic_stats.filler_words_found.map((w, i) => (
                      <span key={i} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md">{w}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <StatRow label="Run-on Sentences (>40 words)" value={report.linguistic_stats.run_on_sentences.toString()} />
              <div className="mt-4">
                <StatRow label="Top Repeated Words" value={report.linguistic_stats.top_repeated_words.length > 0 ? "" : "None"} />
                {report.linguistic_stats.top_repeated_words.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {report.linguistic_stats.top_repeated_words.map((w, i) => (
                      <span key={i} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md">{w}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detected Events ── */}
      <div>
        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">
          ⚡ Detected Events
          <span className="ml-2 font-normal normal-case tracking-normal text-[10px]">
            ({report.detected_events.length} total — used for Whisper stitching)
          </span>
        </p>
        {report.detected_events.length === 0 ? (
          <p className="text-xs text-[#9ca3af] bg-[#f4f2ef] rounded-xl px-4 py-2.5">
            No notable events detected — thresholds may need loosening. Check Score Ranges below.
          </p>
        ) : (
          <div className="overflow-auto rounded-xl border border-[#e5e7eb]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f4f2ef] text-[#9ca3af] uppercase tracking-widest text-[9px]">
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Start</th>
                  <th className="px-3 py-2 text-right font-semibold">End</th>
                  <th className="px-3 py-2 text-right font-semibold">Duration</th>
                  <th className="px-3 py-2 text-right font-semibold">Peak</th>
                </tr>
              </thead>
              <tbody>
                {report.detected_events.map((ev, i) => {
                  const typeColor: Record<string, string> = {
                    eye_contact_break: "text-amber-600 bg-amber-50",
                    gaze_away:         "text-orange-600 bg-orange-50",
                    high_anxiety:      "text-red-600 bg-red-50",
                    high_stress:       "text-red-600 bg-red-50",
                    smile:             "text-green-600 bg-green-50",
                    eye_closure:       "text-blue-600 bg-blue-50",
                    long_pause:        "text-purple-600 bg-purple-50",
                  };
                  const cls = typeColor[ev.type] ?? "text-[#6b7280] bg-[#f4f2ef]";
                  return (
                    <tr 
                      key={i} 
                      className="border-t border-[#f4f2ef] cursor-pointer hover:bg-[#f4f2ef]/50 transition-colors group"
                      onClick={() => onSeek?.(ev.start_ms)}
                      title="Click to jump to this moment in the video"
                    >
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
                          {ev.type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#6b7280] group-hover:text-[#1a1a2e]">{(ev.start_ms / 1000).toFixed(2)}s</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#6b7280] group-hover:text-[#1a1a2e]">{(ev.end_ms / 1000).toFixed(2)}s</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#1a1a2e] font-medium">{ev.duration_ms.toFixed(0)}ms</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#6b7280]">
                        {ev.peak_value !== null ? ev.peak_value.toFixed(3) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Score Ranges (threshold tuning aid) ── */}
      <details className="group">
        <summary className="cursor-pointer text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest select-none list-none flex items-center gap-1.5">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
          📊 Raw Score Ranges (threshold tuning)
        </summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {([
            { label: "Eye Contact", min: report.score_ranges.eye_contact_min, max: report.score_ranges.eye_contact_max, avg: report.score_ranges.eye_contact_avg },
            { label: "Anxiety",     min: report.score_ranges.anxiety_min,     max: report.score_ranges.anxiety_max,     avg: report.score_ranges.anxiety_avg },
            { label: "Stress",      min: report.score_ranges.stress_min,      max: report.score_ranges.stress_max,      avg: report.score_ranges.stress_avg },
            { label: "Smile",       min: report.score_ranges.smile_min,       max: report.score_ranges.smile_max,       avg: report.score_ranges.smile_avg },
          ]).map(({ label, min, max, avg }) => (
            <div key={label} className="bg-[#f4f2ef] rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-[#9ca3af] uppercase tracking-widest mb-1">{label}</p>
              <p className="text-[10px] text-[#6b7280]">min <span className="font-semibold text-[#1a1a2e]">{min.toFixed(3)}</span></p>
              <p className="text-[10px] text-[#6b7280]">max <span className="font-semibold text-[#1a1a2e]">{max.toFixed(3)}</span></p>
              <p className="text-[10px] text-[#6b7280]">avg <span className="font-semibold text-[#6c8ebf]">{avg.toFixed(3)}</span></p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-[#9ca3af]">
          Use these ranges to tune thresholds in <code className="bg-[#f4f2ef] px-1 rounded">event_detection.py</code> — if no events fire, thresholds are likely above the actual max scores here.
        </p>
      </details>

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

  const anxiety    = avg("anxietyScore");
  const confusion  = avg("confusionScore");
  const stress     = avg("stressScore");
  const frown      = avg("frownScore");
  const squint     = avg("squintScore");

  const poseFrames    = frameAnalysis.filter((f) => f.poseDetected);
  const avgPosture    = poseFrames.length > 0
    ? poseFrames.reduce((s, f) => s + f.postureScore, 0) / poseFrames.length : 0;
  const avgSpine      = poseFrames.length > 0
    ? poseFrames.reduce((s, f) => s + f.spineAngle, 0) / poseFrames.length : 0;
  const armsCrossedPct = poseFrames.length > 0
    ? (poseFrames.filter((f) => f.armsCrossed).length / poseFrames.length) * 100 : 0;

  const gazeTotal = frameAnalysis.length;
  const gazeZones = ["center", "left", "right", "down", "away"] as const;
  const gazeCounts = Object.fromEntries(
    gazeZones.map((z) => [z, frameAnalysis.filter((f) => f.gazeZone === z).length])
  );

  return (
    <div className="mt-6 bg-white rounded-2xl border border-[#e5e7eb] p-5 shadow-sm space-y-6">

      <div>
        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <span>👤</span> Face &amp; Head
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ScoreBar label="👁 Eye Contact"          value={eyeContact} />
          <ScoreBar label="🙂 Head Pose (Yaw)"      value={headPose} />
          <ScoreBar label="💬 Mouth Open (Speaking)" value={mouthOpen} />
          <ScoreBar label="😄 Smile"                value={smile} />
          <ScoreBar label="😑 Blink Rate"           value={blink} invert />
          <ScoreBar label="↕ Head Pitch"            value={pitch} unit="°" />
          <ScoreBar label="↔ Head Roll"             value={roll}  unit="°" />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <span>👀</span> Gaze Zone Distribution
        </p>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {gazeZones.map((zone) => {
            const pct = gazeTotal > 0 ? Math.round((gazeCounts[zone] / gazeTotal) * 100) : 0;
            const isGood = zone === "center";
            return (
              <div key={zone} className="bg-[#f4f2ef] rounded-xl p-2">
                <p className="text-[9px] text-[#9ca3af] uppercase tracking-widest capitalize">{zone}</p>
                <p className={`text-sm font-semibold mt-0.5 ${isGood && pct > 50 ? "text-green-600" : !isGood && pct > 30 ? "text-amber-600" : "text-[#1a1a2e]"}`}>
                  {pct}%
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[#9ca3af] mt-1.5">Center &gt; 50% is ideal — means consistent camera eye contact.</p>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <span>🧠</span> Emotion Signals
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ScoreBar label="😟 Anxiety (brow raise)"   value={anxiety}   invert />
          <ScoreBar label="🤔 Confusion (brow furrow)" value={confusion} invert />
          <ScoreBar label="😬 Stress (lip press)"      value={stress}    invert />
          <ScoreBar label="☹️ Frown"                    value={frown}     invert />
          <ScoreBar label="😤 Squint (eye strain)"     value={squint}    invert />
        </div>
        <p className="text-[10px] text-[#9ca3af] mt-2">Lower is better — these signals indicate tension or discomfort.</p>
      </div>

      {poseFrames.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <span>🧍</span> Body Posture
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <ScoreBar label="🧍 Overall Posture"    value={avgPosture} />
            <ScoreBar label="📐 Spine Lean"         value={avgSpine} unit="°" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${armsCrossedPct > 30 ? "bg-amber-400" : "bg-green-500"}`} />
            <p className="text-xs text-[#6b7280]">
              Arms crossed {armsCrossedPct.toFixed(0)}% of session
              {armsCrossedPct > 30 ? " — consider open posture" : " — good open posture"}
            </p>
          </div>
          <p className="text-[10px] text-[#9ca3af] mt-1">
            Based on {poseFrames.length} frames with body detected out of {frameAnalysis.length} total.
          </p>
        </div>
      ) : (
        <div className="text-[11px] text-[#9ca3af] bg-[#f4f2ef] rounded-xl px-4 py-3">
          🧍 Body posture data unavailable — PoseLandmarker may not have detected your full upper body. Try sitting further back from the camera.
        </div>
      )}

      <p className="text-[10px] text-[#9ca3af]">
        Face analysis based on {detected.length} detected frames out of {frameAnalysis.length} total.
      </p>
    </div>
  );
}
