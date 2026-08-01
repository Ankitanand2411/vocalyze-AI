"use client";

import { useEffect, useRef, useState } from "react";
import type { RecordingResult } from "@/app/page";

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
            "{result.topic}"
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
