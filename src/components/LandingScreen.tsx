"use client";

import { useState, useEffect } from "react";

interface LandingScreenProps {
  onSelectImpromptu: (topic?: string) => void;
}

type TabView = "platform" | "telemetry" | "modules";

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
    description: "Respond to unexpected prompts under pressure and evaluate vocal confidence, pacing, and facial eye contact.",
    active: true,
    badge: "Active Module",
    details: ["Real-time gaze tracking", "5 FPS sampling rate", "WPM speech pacing"],
  },
  {
    id: "qa",
    code: "MOD-02",
    name: "Q&A Simulator",
    tagline: "Rapid Interruption",
    description: "Field high-stakes questions from an AI interviewer with sudden dynamic follow-ups and pressure tests.",
    active: false,
    badge: "Coming Soon",
    details: ["Interruption detection", "Stress vocal analytics", "Defensiveness metrics"],
  },
  {
    id: "presentation",
    code: "MOD-03",
    name: "Presentation Engine",
    tagline: "Slide Pacing",
    description: "Deliver long-form presentations with slide-by-slide gaze distribution metrics and posture alignment.",
    active: false,
    badge: "Coming Soon",
    details: ["Slide sync telemetry", "Audience zone mapping", "Posture drift detection"],
  },
  {
    id: "feynman",
    code: "MOD-04",
    name: "Feynman Technique",
    tagline: "Concept Simplicity",
    description: "Explain complex technical architectures to a non-technical audience and analyze jargon density.",
    active: false,
    badge: "Coming Soon",
    details: ["Simplicity scoring", "Jargon density check", "Clarity benchmarks"],
  },
];

const TELEMETRY_FEATURES = [
  {
    code: "FEAT_01",
    title: "Gaze Contact Vectoring",
    detail: "Sub-degree eye contact vectoring computed locally via MediaPipe 468-point FaceMesh model in browser memory.",
    stat: "98.4%",
    unit: "Vector Accuracy",
    specs: ["Sub-degree angular tracking", "Zero cloud frame processing", "60 FPS rendering target"],
  },
  {
    code: "FEAT_02",
    title: "Whisper Audio Stream",
    detail: "Continuous WebM audio chunking at 128 kbps dispatched to FastAPI backend for transcription & WPM analysis.",
    stat: "142",
    unit: "WPM Optimal Target",
    specs: ["128 kbps audio stream", "Filler word detection", "Pitch variation modeling"],
  },
  {
    code: "FEAT_03",
    title: "Emotion & Posture Matrix",
    detail: "Facial blendshape tension analytics combined with upper-body posture alignment and blink rate telemetry.",
    stat: "< 4ms",
    unit: "Inference Latency",
    specs: ["5 FPS polling window", "Tension blendshape tracking", "Head pitch & roll degrees"],
  },
];

export default function LandingScreen({ onSelectImpromptu }: LandingScreenProps) {
  const [activeTab, setActiveTab] = useState<TabView>("platform");
  const [customPrompt, setCustomPrompt] = useState<string>(
    "What is one thing you believe strongly that most people around you disagree with?"
  );

  // Sync hash with tab view
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "telemetry" || hash === "modules" || hash === "platform") {
        setActiveTab(hash as TabView);
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const switchTab = (tab: TabView) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  const handleStartSession = () => {
    onSelectImpromptu(customPrompt);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#090a0f] bg-grid-pattern text-[#f3f4f6]">
      {/* Persistent Navbar */}
      <header className="border-b border-white/10 bg-[#090a0f]/90 backdrop-blur-sm px-6 lg:px-12 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer" 
            onClick={() => switchTab("platform")}
          >
            <div className="w-7 h-7 rounded bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-xs font-mono">
              V
            </div>
            <span className="text-sm font-bold tracking-tight text-white font-mono">
              Vocalyze <span className="text-emerald-400 font-normal">AI</span>
            </span>
          </div>

          {/* Navigation Links with Active State */}
          <nav className="flex items-center gap-2 sm:gap-6 text-xs font-mono">
            <button
              onClick={() => switchTab("platform")}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === "platform"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              01. Platform
            </button>
            <button
              onClick={() => switchTab("telemetry")}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === "telemetry"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              02. Telemetry
            </button>
            <button
              onClick={() => switchTab("modules")}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === "modules"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              03. Modules
            </button>
          </nav>

          {/* Right Action button */}
          <button 
            onClick={() => onSelectImpromptu(customPrompt)}
            className="btn-primary text-xs px-4 py-2 rounded font-mono hidden sm:inline-block"
          >
            Start Session
          </button>
        </div>
      </header>

      {/* Main Content Area — Distinct Standalone Pages */}
      <main className="flex-1 flex flex-col justify-center max-w-5xl w-full mx-auto px-6 lg:px-12 py-10 animate-fade-in">
        {/* PAGE 1: PLATFORM */}
        {activeTab === "platform" && (
          <div className="w-full space-y-10 my-auto">
            {/* Title Area */}
            <div className="text-center max-w-3xl mx-auto">
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
            <div className="bento-card bg-[#11131a]/95 shadow-2xl">
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

              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
                {/* Left Pane (7 cols) */}
                <div className="lg:col-span-7 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase text-slate-400 tracking-wider">
                      01 // PROMPT CONFIGURATION
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      Input Source: Custom
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PRESET_PROMPTS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setCustomPrompt(p.text)}
                        className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors border ${
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

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span className="font-mono text-[10px] text-slate-500">PROMPT_TEXT_INPUT</span>
                    <button 
                      onClick={() => setCustomPrompt(PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)].text)}
                      className="font-mono text-[10px] text-slate-400 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded border border-white/10 hover:border-white/20 transition-colors"
                    >
                      Randomize Prompt
                    </button>
                  </div>

                  <div>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Enter speech prompt..."
                      rows={3}
                      className="w-full bg-[#090a0f] border border-white/10 rounded-lg p-3.5 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 transition-colors resize-none font-sans leading-relaxed"
                    />
                  </div>

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

                {/* Right Pane (5 cols) */}
                <div className="lg:col-span-5 p-6 bg-[#0e1017]/60 flex flex-col justify-between space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-[10px] uppercase text-slate-400 tracking-wider">
                        02 // PIPELINE DIAGNOSTICS
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>

                    <div className="space-y-3 font-mono text-xs">
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

                  <div className="bg-[#090a0f] p-3.5 rounded-lg border border-white/5 font-mono text-[11px]">
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
        )}

        {/* PAGE 2: TELEMETRY */}
        {activeTab === "telemetry" && (
          <div className="w-full space-y-8 my-auto">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                02 // PLATFORM TELEMETRY ARCHITECTURE
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Real-Time Diagnostic Metrics
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                High-frequency multi-modal sensors capturing facial landmarks, vocal acoustics, and postural telemetry simultaneously.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TELEMETRY_FEATURES.map((feat) => (
                <div key={feat.code} className="bento-card bg-[#11131a]/95 p-6 flex flex-col justify-between min-h-[340px]">
                  <div>
                    <div className="bento-card-header -mx-6 -mt-6 mb-5 flex items-center justify-between font-mono text-xs">
                      <span className="text-slate-400">{feat.code}</span>
                      <span className="text-emerald-400 font-bold">{feat.stat}</span>
                    </div>
                    <h3 className="text-base font-bold text-white mb-2">{feat.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-6">{feat.detail}</p>
                  </div>

                  <div className="border-t border-white/5 pt-4">
                    <div className="font-mono text-[10px] text-slate-500 uppercase mb-2">Technical Specifications</div>
                    <ul className="space-y-1.5 font-mono text-[11px] text-slate-300">
                      {feat.specs.map((spec, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{spec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGE 3: MODULES */}
        {activeTab === "modules" && (
          <div className="w-full space-y-8 my-auto">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                03 // DIAGNOSTIC FRAMEWORKS
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Practice Modules &amp; Simulators
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Targeted communication environments designed to stress-test specific vocal and delivery parameters.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {MODULES.map((mod) => (
                <div
                  key={mod.id}
                  onClick={() => mod.active && onSelectImpromptu(customPrompt)}
                  className={`bento-card bg-[#11131a]/95 flex flex-col justify-between min-h-[340px] ${
                    mod.active ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
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

                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <span className="font-mono text-[10px] text-emerald-400 block mb-1 uppercase tracking-wide">
                        {mod.tagline}
                      </span>
                      <h3 className="text-sm font-bold text-white mb-2">{mod.name}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        {mod.description}
                      </p>
                    </div>

                    <div className="border-t border-white/5 pt-3 space-y-1 font-mono text-[10px] text-slate-400">
                      {mod.details.map((d, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-slate-600">›</span>
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>

                    {mod.active ? (
                      <div className="text-xs font-mono font-medium text-emerald-400 flex items-center justify-between pt-3 border-t border-white/5">
                        <span>Launch Module</span>
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
        )}
      </main>

      {/* Persistent Footer */}
      <footer className="border-t border-white/10 py-4 px-6 lg:px-12 bg-[#090a0f]/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs font-mono text-slate-500">
          <span>Vocalyze AI v1.0</span>
          <span>High-Precision Diagnostic Architecture</span>
        </div>
      </footer>
    </div>
  );
}
