"use client";

import { useState, useEffect, useCallback } from "react";

const TOPICS = [
  "What is one thing you believe strongly that most people around you disagree with?",
  "Describe a moment when you had to make a decision with incomplete information. What did you do?",
  "If you could redesign one thing about how schools teach students, what would it be and why?",
  "Talk about a skill you've been meaning to develop for a long time but haven't started yet.",
  "What does 'success' mean to you right now, and has that definition changed in the last few years?",
  "Describe a place — real or imagined — where you feel completely at ease. What makes it that way?",
];

const PREP_DURATION = 5; // seconds

interface TopicScreenProps {
  onStart: (topic: string) => void;
  onBack: () => void;
}

export default function TopicScreen({ onStart, onBack }: TopicScreenProps) {
  const [topic] = useState(
    () => TOPICS[Math.floor(Math.random() * TOPICS.length)]
  );
  const [timeLeft, setTimeLeft] = useState(PREP_DURATION);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      setReady(true);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft]);

  const handleStart = useCallback(() => {
    if (ready) onStart(topic);
  }, [ready, topic, onStart]);

  const progressPct = ((PREP_DURATION - timeLeft) / PREP_DURATION) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 animate-fade-in">
      <div className="w-full max-w-lg">
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#9ca3af] hover:text-[#6b7280] transition-colors mb-10 group"
          aria-label="Back to modules"
        >
          <svg
            className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to modules
        </button>

        {/* Label */}
        <p className="text-xs font-medium text-[#6c8ebf] tracking-widest uppercase mb-5">
          Impromptu Speaker
        </p>

        {/* Topic card */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-8 shadow-sm mb-8">
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-4">
            Your topic
          </p>
          <p className="text-xl font-medium text-[#1a1a2e] leading-relaxed">
            "{topic}"
          </p>
        </div>

        {/* Prep timer */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm text-[#6b7280]">
              {ready ? "Prep time complete — you're ready." : "Gather your thoughts…"}
            </p>
            <span
              className={[
                "text-sm font-semibold tabular-nums transition-colors",
                ready ? "text-[#6c8ebf]" : "text-[#1a1a2e]",
              ].join(" ")}
            >
              {ready ? "✓" : `${timeLeft}s`}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6c8ebf] rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!ready}
          id="start-answering-btn"
          className={[
            "w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-200",
            ready
              ? "bg-[#6c8ebf] text-white hover:bg-[#5a7aad] shadow-sm hover:shadow-md hover:-translate-y-0.5"
              : "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed",
          ].join(" ")}
        >
          {ready ? "Start Answering" : `Starting in ${timeLeft}s…`}
        </button>

        <p className="mt-4 text-xs text-center text-[#9ca3af]">
          Your camera and microphone will be requested when you start.
        </p>
      </div>
    </div>
  );
}
