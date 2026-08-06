"use client";

import { useState, useEffect } from "react";

interface TopicScreenProps {
  initialTopic?: string;
  onStartRecording: (topic: string) => void;
  onBack: () => void;
}

const PRESET_TOPICS = [
  "What is one opinion you hold strongly that most people around you disagree with?",
  "Describe a significant challenge you overcame and what it taught you about leadership.",
  "If you had unlimited resources, what global technical problem would you solve first?",
  "Explain why AI tools will augment rather than replace creative professionals.",
];

const PREP_DURATION = 15; // 15 seconds prep timer

export default function TopicScreen({ initialTopic, onStartRecording, onBack }: TopicScreenProps) {
  const [topic, setTopic] = useState(
    initialTopic || PRESET_TOPICS[0]
  );
  const [timeLeft, setTimeLeft] = useState(PREP_DURATION);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // Countdown timer
  useEffect(() => {
    if (!isTimerRunning) return;

    if (timeLeft <= 0) {
      onStartRecording(topic);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isTimerRunning, topic, onStartRecording]);

  const handleRandomize = () => {
    const remaining = PRESET_TOPICS.filter((t) => t !== topic);
    const next = remaining[Math.floor(Math.random() * remaining.length)];
    setTopic(next);
    setTimeLeft(PREP_DURATION);
  };

  const handleStartNow = () => {
    setIsTimerRunning(false);
    onStartRecording(topic);
  };

  const progressPct = ((PREP_DURATION - timeLeft) / PREP_DURATION) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 animate-fade-in bg-[#f8fafc] bg-grid-pattern text-[#0f172a]">
      <div className="w-full max-w-xl">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-mono text-slate-600 hover:text-slate-900 transition-colors bg-white border border-slate-200 px-3.5 py-2 rounded-lg mb-8 shadow-sm"
        >
          <span>←</span>
          <span>Back to Console</span>
        </button>

        {/* Bento Card Wrapper */}
        <div className="bento-card bg-white p-8 space-y-6 shadow-lg border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <span className="font-mono text-xs uppercase font-bold text-slate-600 tracking-wider">
              01 // IMPROMPTU PREPARATION
            </span>
            <span className="text-xs font-mono text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-300 font-bold">
              PREP MODE
            </span>
          </div>

          <div>
            <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2 font-bold">Speech Topic Prompt</h2>
            <p className="text-base sm:text-lg font-bold text-[#0f172a] leading-relaxed bg-[#f8fafc] p-5 rounded-lg border border-slate-200">
              "{topic}"
            </p>
          </div>

          {/* Randomize Button */}
          <div className="flex justify-end">
            <button
              onClick={handleRandomize}
              className="text-xs font-mono text-slate-700 hover:text-slate-900 bg-slate-100 border border-slate-300 px-3.5 py-1.5 rounded-lg transition-colors font-semibold"
            >
              Shuffle Topic ↺
            </button>
          </div>

          {/* Prep Countdown Section */}
          <div className="bg-[#f8fafc] p-6 rounded-xl border border-slate-200 text-center space-y-4">
            <div className="flex items-center justify-between font-mono text-xs text-slate-600 font-bold">
              <span>Auto-Start Countdown</span>
              <span className="text-emerald-700 font-bold text-sm">{timeLeft}s</span>
            </div>

            {/* Countdown Progress Bar */}
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            
            <p className="text-xs text-slate-500 font-medium">
              Review your thoughts before recording begins automatically.
            </p>
          </div>

          {/* Action Button */}
          <button
            onClick={handleStartNow}
            className="w-full btn-primary text-sm py-4 rounded-xl flex items-center justify-center gap-2 font-mono uppercase tracking-wide shadow-md"
          >
            <span>Start Recording Now</span>
            <span className="text-xs font-normal opacity-80">[ ↵ ]</span>
          </button>
        </div>
      </div>
    </div>
  );
}
