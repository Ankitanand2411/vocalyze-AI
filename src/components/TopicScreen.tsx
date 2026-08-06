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

const PREP_DURATION = 3; // seconds

interface TopicScreenProps {
  onStart: (topic: string) => void;
  onBack: () => void;
}

export default function TopicScreen({ onStart, onBack }: TopicScreenProps) {
  const [topicIndex, setTopicIndex] = useState(() => Math.floor(Math.random() * TOPICS.length));
  const [customTopic, setCustomTopic] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(PREP_DURATION);
  const [ready, setReady] = useState(false);

  const activeTopic = customTopic ?? TOPICS[topicIndex];

  useEffect(() => {
    if (timeLeft <= 0) {
      setReady(true);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft]);

  const handleStart = useCallback(() => {
    if (ready) onStart(activeTopic);
  }, [ready, activeTopic, onStart]);

  const handleRandomize = () => {
    const nextIdx = (topicIndex + 1) % TOPICS.length;
    setTopicIndex(nextIdx);
    setCustomTopic(null);
    setTimeLeft(PREP_DURATION);
    setReady(false);
  };

  const progressPct = ((PREP_DURATION - timeLeft) / PREP_DURATION) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 animate-fade-in bg-[#090a0f] bg-grid-pattern text-[#f3f4f6]">
      <div className="w-full max-w-lg">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-6"
          aria-label="Back to modules"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span>Back to Modules</span>
        </button>

        {/* Header Tag */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
            Impromptu Speaker
          </span>
          <span className="text-xs text-slate-500">Step 1 of 3</span>
        </div>

        {/* Main Topic Card */}
        <div className="bg-[#12141c] border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">
              Assigned Topic
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1 rounded border border-white/10 transition-colors"
              >
                {isEditing ? "Done" : "Edit"}
              </button>
              <button
                onClick={handleRandomize}
                className="text-xs text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1 rounded border border-white/10 transition-colors"
              >
                Swap
              </button>
            </div>
          </div>

          {isEditing ? (
            <textarea
              value={activeTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              rows={3}
              className="w-full bg-[#090a0f] border border-emerald-500/40 rounded-xl p-3 text-sm text-white focus:outline-none"
            />
          ) : (
            <p className="text-lg font-medium text-white leading-relaxed">
              &quot;{activeTopic}&quot;
            </p>
          )}
        </div>

        {/* Prep Timer Card */}
        <div className="bg-[#161922] border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="text-slate-400">
              {ready ? "Preparation complete" : "Gathering thoughts"}
            </span>
            <span className={`font-mono font-bold ${ready ? "text-emerald-400" : "text-slate-300"}`}>
              {ready ? "Ready" : `${timeLeft}s`}
            </span>
          </div>

          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={!ready}
          id="start-answering-btn"
          className={`w-full py-3.5 px-6 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 ${
            ready
              ? "btn-primary cursor-pointer"
              : "bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
          }`}
        >
          <span>{ready ? "Start Recording Session" : `Preparing in ${timeLeft}s…`}</span>
          {ready && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
