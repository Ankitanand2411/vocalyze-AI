"use client";

import { useState } from "react";

interface LandingScreenProps {
  onSelectImpromptu: (topic?: string) => void;
}

const PRESET_PROMPTS = [
  { id: "onboarding", num: "01", label: "Leadership Pitch", text: "Deliver a 2-minute vision presentation for a new AI product line to executive leadership." },
  { id: "impromptu", num: "02", label: "Impromptu Prompt", text: "What is one opinion you hold strongly that most people around you disagree with?" },
  { id: "qa", num: "03", label: "Q&A Defense", text: "Explain why project timelines slipped without losing stakeholder confidence." },
  { id: "feynman", num: "04", label: "Feynman Technique", text: "Explain how neural networks work using simple real-world analogies." },
];

const MODULES = [
  {
    id: "impromptu",
    code: "MOD-01",
    name: "Impromptu Speaker",
    tagline: "Spontaneous Speaking",
    description: "Respond to unexpected prompts under pressure and measure vocal and facial confidence.",
    active: true,
    badge: "Active",
  },
  {
    id: "qa",
    code: "MOD-02",
    name: "Q&A Simulator",
    tagline: "Rapid-Fire Defense",
    description: "Field high-stakes questions from an interactive AI interviewer with sudden interruptions.",
    active: false,
    badge: "Coming Soon",
  },
  {
    id: "presentation",
    code: "MOD-03",
    name: "Presentation Engine",
    tagline: "Slide-Synced Delivery",
    description: "Deliver a structured long-form talk and receive slide-by-slide pacing and eye contact feedback.",
    active: false,
    badge: "Coming Soon",
  },
  {
    id: "feynman",
    code: "MOD-04",
    name: "Feynman Technique",
    tagline: "Concept Clarity",
    description: "Explain complex technical concepts to a non-technical audience and evaluate clarity.",
    active: false,
    badge: "Coming Soon",
  },
];

const TELEMETRY_FEATURES = [
  {
    code: "01",
    title: "Gaze Alignment",
    detail: "Sub-degree eye contact vectoring via MediaPipe FaceMesh",
    stat: "98.4%",
    unit: "accuracy",
  },
  {
    code: "02",
    title: "Whisper Audio Stream",
    detail: "Local WebM chunking at 128 kbps for backend transcription",
    stat: "142",
    unit: "WPM optimal",
  },
  {
    code: "03",
    title: "Emotion Telemetry",
    detail: "Real-time facial blendshape tension & posture signals",
    stat: "< 4ms",
    unit: "latency",
  },
];

export default function LandingScreen({ onSelectImpromptu }: LandingScreenProps) {
  const [customPrompt, setCustomPrompt] = useState<string>(
    "What is one thing you believe strongly that most people around you disagree with?"
  );

  const handleStartSession = () => {
    onSelectImpromptu(customPrompt);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090a0f] text-[#f3f4f6]">
      {/* Top Navbar */}
      <header className="border-b border-white/10 bg-[#090a0f] px-6 lg:px-12 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer" 
            onClick={() => onSelectImpromptu()}
          >
            <div className="w-7 h-7 rounded bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-xs font-mono">
              V
            </div>
            <span className="text-sm font-bold tracking-tight text-white font-mono">
              Vocalyze <span className="text-emerald-400 font-normal">AI</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-mono text-slate-400">
            <a href="#platform" className="hover:text-white transition-colors">01. Platform</a>
            <a href="#telemetry" className="hover:text-white transition-colors">02. Telemetry</a>
            <a href="#modules" className="hover:text-white transition-colors">03. Modules</a>
          </nav>

          {/* Right Action button */}
          <button 
            onClick={() => onSelectImpromptu()}
            className="btn-primary text-xs px-4 py-2 rounded font-mono"
          >
            Start Session
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-16 px-6 lg:px-12 animate-fade-in">
        <div className="max-w-3xl mx-auto text-center">
          {/* Monospaced Section Eyebrow */}
          <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500 mb-4">
            [ SYSTEM // VOCALYZE 1.0 ]
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Speech &amp; Delivery <span className="text-emerald-400 font-normal">Analysis Platform</span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed mb-10">
            Engineered for real-time MediaPipe gaze tracking, posture metrics, and Whisper acoustic analytics.
          </p>

          {/* High-Value Console Workspace */}
          <div className="bg-[#11131a] border border-white/10 rounded-xl text-left shadow-2xl corner-crosshair">
            {/* Top Workspace Header Bar */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 bg-[#0e1017] rounded-t-xl">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-slate-300">
                  SESSION_PROMPT.md
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  READY
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                MediaPipe 0.10.x
              </span>
            </div>

            <div className="p-6">
              {/* Preset Selector Tags */}
              <div className="font-mono text-[10px] uppercase text-slate-500 tracking-wider mb-2.5">
                Select Prompt Preset
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {PRESET_PROMPTS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setCustomPrompt(p.text)}
                    className={`px-3 py-1 rounded text-xs font-mono transition-colors border ${
                      customPrompt === p.text
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : "bg-[#161822] border-white/5 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-slate-500 mr-1.5">{p.num}</span>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Prompt Text Input */}
              <div className="relative mb-5">
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Enter prompt..."
                  rows={3}
                  className="w-full bg-[#090a0f] border border-white/10 rounded-lg p-3.5 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 transition-colors resize-none font-sans"
                />
                <button 
                  onClick={() => setCustomPrompt(PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)].text)}
                  className="absolute right-3 top-3 font-mono text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded border border-white/10"
                >
                  Randomize
                </button>
              </div>

              {/* Bottom Action Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="font-mono text-[11px] text-slate-500">
                  Privacy: Zero cloud storage before analysis
                </span>
                <button
                  onClick={handleStartSession}
                  id="generate-video-btn"
                  className="btn-primary text-xs font-semibold px-5 py-2.5 rounded flex items-center gap-2 font-mono"
                >
                  <span>Start Practice Session</span>
                  <span className="text-[10px] opacity-75 font-normal">[ ↵ ]</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Telemetry Matrix */}
      <section id="telemetry" className="py-12 px-6 lg:px-12 border-t border-white/5 bg-[#0d0e14]">
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            02 // PLATFORM TELEMETRY ARCHITECTURE
          </div>
          <h2 className="text-base font-bold text-white tracking-tight mb-8">
            Real-Time Diagnostic Metrics
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TELEMETRY_FEATURES.map((feat) => (
              <div key={feat.code} className="bg-[#12141c] border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between font-mono text-xs text-slate-500 mb-3">
                  <span>FEATURE_{feat.code}</span>
                  <span className="text-emerald-400">{feat.stat}</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{feat.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">{feat.detail}</p>
                <span className="font-mono text-[10px] text-slate-500 uppercase">{feat.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section id="modules" className="py-12 px-6 lg:px-12 border-t border-white/5 bg-[#090a0f]">
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            03 // DIAGNOSTIC FRAMEWORKS
          </div>
          <h2 className="text-base font-bold text-white tracking-tight mb-8">
            Practice Modules
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {MODULES.map((mod) => (
              <div
                key={mod.id}
                onClick={() => mod.active && onSelectImpromptu(customPrompt)}
                className={`rounded-xl border p-5 flex flex-col justify-between transition-colors ${
                  mod.active
                    ? "bg-[#12141c] border-white/10 hover:border-emerald-500/50 cursor-pointer"
                    : "bg-[#0c0d12] border-white/5 opacity-50 cursor-not-allowed"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] text-slate-500">{mod.code}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        mod.active
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-slate-800 text-slate-500 border-white/5"
                      }`}
                    >
                      {mod.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-white mb-1">{mod.name}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    {mod.description}
                  </p>
                </div>

                {mod.active ? (
                  <div className="text-xs font-mono font-medium text-emerald-400 flex items-center justify-between pt-3 border-t border-white/5">
                    <span>Launch</span>
                    <span>→</span>
                  </div>
                ) : (
                  <span className="font-mono text-[10px] text-slate-600 pt-3 border-t border-white/5 block">In Development</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 px-6 lg:px-12 mt-auto text-xs font-mono text-slate-500">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span>Vocalyze AI v1.0</span>
          <span>High-Precision Diagnostic Architecture</span>
        </div>
      </footer>
    </div>
  );
}
