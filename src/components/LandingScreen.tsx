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
    tagline: "Spontaneous Delivery",
    description: "Respond to unexpected prompts under pressure and evaluate vocal and facial confidence.",
    active: true,
    badge: "Active",
  },
  {
    id: "qa",
    code: "MOD-02",
    name: "Q&A Simulator",
    tagline: "Rapid Interruption",
    description: "Field high-stakes questions from an AI interviewer with sudden dynamic follow-ups.",
    active: false,
    badge: "Coming Soon",
  },
  {
    id: "presentation",
    code: "MOD-03",
    name: "Presentation Engine",
    tagline: "Slide Pacing",
    description: "Deliver long-form presentations with slide-by-slide gaze distribution metrics.",
    active: false,
    badge: "Coming Soon",
  },
  {
    id: "feynman",
    code: "MOD-04",
    name: "Feynman Technique",
    tagline: "Concept Simplicity",
    description: "Explain complex technical architectures to a beginner audience and check clarity.",
    active: false,
    badge: "Coming Soon",
  },
];

const TELEMETRY_FEATURES = [
  {
    code: "FEAT_01",
    title: "Gaze Contact Vectoring",
    detail: "Real-time 3D facial landmark calculation via MediaPipe FaceMesh model.",
    stat: "98.4%",
    unit: "accuracy",
  },
  {
    code: "FEAT_02",
    title: "Whisper Audio Stream",
    detail: "Local WebM chunking at 128 kbps for downstream transcription and WPM pacing.",
    stat: "142",
    unit: "WPM target",
  },
  {
    code: "FEAT_03",
    title: "Emotion & Posture Matrix",
    detail: "Facial blendshape tension analysis combined with upper-body posture tracking.",
    stat: "< 4ms",
    unit: "inference",
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
    <div className="min-h-screen flex flex-col bg-[#090a0f] bg-grid-pattern text-[#f3f4f6]">
      {/* Top Navbar */}
      <header className="border-b border-white/10 bg-[#090a0f]/90 backdrop-blur-sm px-6 lg:px-12 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
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
          <nav className="hidden md:flex items-center gap-8 text-xs font-mono text-slate-400">
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
      <section className="pt-14 pb-16 px-6 lg:px-12 animate-fade-in">
        <div className="max-w-5xl mx-auto">
          {/* Title Area */}
          <div className="text-center max-w-3xl mx-auto mb-10">
            <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500 mb-3">
              [ SYSTEM // VOCALYZE 1.0 ]
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
              Speech &amp; Delivery <span className="text-emerald-400 font-normal">Analysis Platform</span>
            </h1>
            <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              Engineered for real-time MediaPipe gaze tracking, posture metrics, and Whisper acoustic analytics.
            </p>
          </div>

          {/* Bento Studio Console Workspace */}
          <div className="bento-card bg-[#11131a]/90">
            {/* Console Header Bar */}
            <div className="bento-card-header flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-slate-300">
                  WORKSPACE_CONSOLE // SESSION_01
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  ONLINE
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-500 hidden sm:inline">
                MediaPipe 0.10.x Engine
              </span>
            </div>

            {/* Console Split Body */}
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
              {/* Left Pane (7 columns): Prompt Configuration */}
              <div className="lg:col-span-7 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase text-slate-400 tracking-wider">
                    01 // PROMPT CONFIGURATION
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    Input Source: Custom
                  </span>
                </div>

                {/* Preset Pills */}
                <div className="flex flex-wrap gap-2">
                  {PRESET_PROMPTS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setCustomPrompt(p.text)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors border ${
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

                {/* Header bar above textarea with clean Randomize button */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span className="font-mono text-[10px] text-slate-500">PROMPT_TEXT_INPUT</span>
                  <button 
                    onClick={() => setCustomPrompt(PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)].text)}
                    className="font-mono text-[10px] text-slate-400 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded border border-white/10 hover:border-white/20 transition-colors"
                  >
                    Randomize Prompt
                  </button>
                </div>

                {/* Prompt Text Input */}
                <div>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter speech prompt..."
                    rows={3}
                    className="w-full bg-[#090a0f] border border-white/10 rounded-lg p-3.5 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 transition-colors resize-none font-sans leading-relaxed"
                  />
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-between pt-2">
                  <span className="font-mono text-[11px] text-slate-500">
                    On-device memory stream
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

              {/* Right Pane (5 columns): Stream Diagnostics */}
              <div className="lg:col-span-5 p-6 bg-[#0e1017]/60 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[10px] uppercase text-slate-400 tracking-wider">
                      02 // PIPELINE DIAGNOSTICS
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>

                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                      <span className="text-slate-400">MediaPipe Vision</span>
                      <span className="text-emerald-400">INITIALIZED</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                      <span className="text-slate-400">Whisper Audio</span>
                      <span className="text-slate-200">128 kbps WebM</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                      <span className="text-slate-400">Sampling Rate</span>
                      <span className="text-slate-200">5 FPS / 200ms</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                      <span className="text-slate-400">Privacy Layer</span>
                      <span className="text-emerald-400">ON-DEVICE</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#090a0f] p-3 rounded-lg border border-white/5 font-mono text-[11px]">
                  <div className="flex justify-between text-slate-400 mb-1.5">
                    <span>System Readiness</span>
                    <span className="text-emerald-400">100% READY</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Telemetry Matrix — Seamless Background Grid */}
      <section id="telemetry" className="py-12 px-6 lg:px-12 border-t border-white/10 bg-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            02 // PLATFORM TELEMETRY ARCHITECTURE
          </div>
          <h2 className="text-base font-bold text-white tracking-tight mb-6">
            Real-Time Diagnostic Metrics
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TELEMETRY_FEATURES.map((feat) => (
              <div key={feat.code} className="bento-card bg-[#11131a]/90">
                <div className="bento-card-header flex items-center justify-between font-mono text-xs">
                  <span className="text-slate-400">{feat.code}</span>
                  <span className="text-emerald-400 font-bold">{feat.stat}</span>
                </div>
                <div className="p-5">
                  <h3 className="text-xs font-bold text-white mb-1.5">{feat.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">{feat.detail}</p>
                  <span className="font-mono text-[10px] text-slate-500 uppercase">{feat.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Grid — Seamless Background Grid */}
      <section id="modules" className="py-12 px-6 lg:px-12 border-t border-white/10 bg-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            03 // DIAGNOSTIC FRAMEWORKS
          </div>
          <h2 className="text-base font-bold text-white tracking-tight mb-6">
            Practice Modules
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {MODULES.map((mod) => (
              <div
                key={mod.id}
                onClick={() => mod.active && onSelectImpromptu(customPrompt)}
                className={`bento-card bg-[#11131a]/90 flex flex-col justify-between ${
                  mod.active ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="bento-card-header flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-400">{mod.code}</span>
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
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 px-6 lg:px-12 mt-auto text-xs font-mono text-slate-500 bg-[#090a0f]/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span>Vocalyze AI v1.0</span>
          <span>High-Precision Diagnostic Architecture</span>
        </div>
      </footer>
    </div>
  );
}
