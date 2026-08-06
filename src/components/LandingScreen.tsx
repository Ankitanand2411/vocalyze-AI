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
    description: "Respond to unexpected prompts under pressure and evaluate vocal confidence, pacing, and facial eye contact in real time.",
    active: true,
    badge: "Active Module",
    details: ["Real-time gaze tracking", "5 FPS sampling rate", "WPM speech pacing"],
  },
  {
    id: "qa",
    code: "MOD-02",
    name: "Q&A Simulator",
    tagline: "Rapid Interruption",
    description: "Field high-stakes questions from an interactive AI interviewer with sudden dynamic follow-ups and pressure tests.",
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
    <div className={`bg-[#090a0f] bg-grid-pattern text-[#f3f4f6] ${
      activeTab === "platform" ? "h-screen flex flex-col justify-between overflow-hidden" : "min-h-screen flex flex-col justify-between"
    }`}>
      {/* Persistent Widescreen Navbar */}
      <header className="border-b border-white/10 bg-[#090a0f]/90 backdrop-blur-sm px-6 lg:px-12 py-3.5 flex-shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          {/* Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer" 
            onClick={() => switchTab("platform")}
          >
            <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-xs font-mono">
              V
            </div>
            <span className="text-base font-black tracking-tight text-white font-mono uppercase">
              Vocalyze <span className="text-emerald-400 font-normal">AI</span>
            </span>
          </div>

          {/* Navigation Links with Active State */}
          <nav className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm font-mono font-semibold">
            <button
              onClick={() => switchTab("platform")}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === "platform"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              01. Platform
            </button>
            <button
              onClick={() => switchTab("telemetry")}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === "telemetry"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/40"
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
            className="btn-primary text-xs px-4 py-2 rounded font-mono font-bold tracking-wide hidden sm:inline-block uppercase"
          >
            Start Session
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col justify-center max-w-[1400px] w-full mx-auto px-6 lg:px-12 animate-fade-in ${
        activeTab === "platform" ? "py-2 overflow-hidden" : "py-12"
      }`}>
        {/* PAGE 1: PLATFORM (Tailored to fit 100% inside viewport frame with ZERO scrolling) */}
        {activeTab === "platform" && (
          <div className="w-full space-y-4 my-auto">
            {/* Bold Headline */}
            <div className="text-center max-w-4xl mx-auto space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold">
                [ SYSTEM // VOCALYZE 1.0 ]
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tight text-white leading-none">
                Speech &amp; Delivery <span className="text-emerald-400 font-normal">Analysis</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed font-medium">
                Engineered for real-time MediaPipe gaze tracking, posture metrics, and Whisper acoustic analytics.
              </p>
            </div>

            {/* Viewport-Fitted Bento Studio Console Workspace */}
            <div className="bento-card bg-[#11131a]/95 shadow-2xl border-white/10">
              <div className="bento-card-header px-6 py-3 flex items-center justify-between bg-[#0d0f17]">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                    WORKSPACE_CONSOLE // SESSION_01
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/30">
                    ONLINE
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-400 hidden sm:inline">
                  MediaPipe 0.10.x Engine
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
                {/* Left Pane (7 cols): Prompt Configuration */}
                <div className="lg:col-span-7 p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase font-bold text-slate-300 tracking-wider">
                      01 // PROMPT CONFIGURATION
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 font-medium">
                      Source: Custom Input
                    </span>
                  </div>

                  {/* Preset Chips */}
                  <div className="flex flex-wrap gap-2">
                    {PRESET_PROMPTS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setCustomPrompt(p.text)}
                        className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all border ${
                          customPrompt === p.text
                            ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm"
                            : "bg-[#161822] border-white/10 text-slate-300 hover:text-white hover:border-white/20"
                        }`}
                      >
                        <span className="text-slate-500 mr-1.5">{p.num}</span>
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span className="font-mono text-[11px] text-slate-400 font-bold uppercase tracking-wider">PROMPT_TEXT_INPUT</span>
                    <button 
                      onClick={() => setCustomPrompt(PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)].text)}
                      className="font-mono text-[11px] text-slate-300 hover:text-white bg-slate-800 px-3 py-1 rounded border border-white/10 hover:border-white/20 transition-colors font-medium"
                    >
                      Randomize Prompt
                    </button>
                  </div>

                  {/* Textarea compact fit */}
                  <div>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Enter speech prompt..."
                      rows={3}
                      className="w-full bg-[#090a0f] border border-white/15 rounded-lg p-3.5 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/70 transition-colors resize-none font-sans leading-relaxed shadow-inner"
                    />
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono text-[11px] text-slate-400 font-medium">
                      Zero cloud storage before analysis
                    </span>
                    <button
                      onClick={handleStartSession}
                      id="generate-video-btn"
                      className="btn-primary text-xs font-bold px-6 py-2.5 rounded-lg flex items-center gap-2.5 font-mono tracking-wide uppercase shadow-lg cursor-pointer"
                    >
                      <span>Start Practice Session</span>
                      <span className="text-[10px] opacity-80 font-normal">[ ↵ ]</span>
                    </button>
                  </div>
                </div>

                {/* Right Pane (5 cols): Pipeline Diagnostics */}
                <div className="lg:col-span-5 p-5 bg-[#0e1017]/70 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-xs uppercase font-bold text-slate-300 tracking-wider">
                        02 // PIPELINE DIAGNOSTICS
                      </span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    </div>

                    <div className="space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between items-center py-2 border-b border-white/10">
                        <span className="text-slate-400">MediaPipe Vision</span>
                        <span className="text-emerald-400 font-bold">INITIALIZED</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-white/10">
                        <span className="text-slate-400">Whisper Audio</span>
                        <span className="text-slate-200 font-medium">128 kbps WebM</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-white/10">
                        <span className="text-slate-400">Sampling Rate</span>
                        <span className="text-slate-200 font-medium">5 FPS / 200ms</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-white/10">
                        <span className="text-slate-400">Privacy Layer</span>
                        <span className="text-emerald-400 font-bold">ON-DEVICE</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#090a0f] p-3.5 rounded-lg border border-white/10 font-mono text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-300 font-semibold text-[11px]">
                      <span>System Readiness</span>
                      <span className="text-emerald-400 font-bold">100% READY</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 w-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 2: TELEMETRY (UNCHANGED) */}
        {activeTab === "telemetry" && (
          <div className="w-full space-y-10 my-auto">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400 font-bold mb-2">
                02 // PLATFORM TELEMETRY ARCHITECTURE
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
                Real-Time Diagnostic Metrics
              </h2>
              <p className="text-base text-slate-300 mt-2 max-w-2xl font-medium">
                High-frequency multi-modal sensors capturing facial landmarks, vocal acoustics, and postural telemetry simultaneously.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {TELEMETRY_FEATURES.map((feat) => (
                <div key={feat.code} className="bento-card bg-[#11131a]/95 p-8 flex flex-col justify-between min-h-[400px] border-white/10">
                  <div>
                    <div className="bento-card-header -mx-8 -mt-8 mb-6 px-8 py-5 flex items-center justify-between font-mono text-sm">
                      <span className="text-slate-400 font-bold">{feat.code}</span>
                      <span className="text-emerald-400 text-2xl font-black">{feat.stat}</span>
                    </div>
                    <h3 className="text-xl font-extrabold text-white mb-3">{feat.title}</h3>
                    <p className="text-sm text-slate-300 leading-relaxed mb-6 font-medium">{feat.detail}</p>
                  </div>

                  <div className="border-t border-white/10 pt-5">
                    <div className="font-mono text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">Technical Specifications</div>
                    <ul className="space-y-2 font-mono text-xs text-slate-200">
                      {feat.specs.map((spec, i) => (
                        <li key={i} className="flex items-center gap-2.5">
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

        {/* PAGE 3: MODULES (UNCHANGED) */}
        {activeTab === "modules" && (
          <div className="w-full space-y-10 my-auto">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400 font-bold mb-2">
                03 // DIAGNOSTIC FRAMEWORKS
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
                Practice Modules &amp; Simulators
              </h2>
              <p className="text-base text-slate-300 mt-2 max-w-2xl font-medium">
                Targeted communication environments designed to stress-test specific vocal and delivery parameters.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {MODULES.map((mod) => (
                <div
                  key={mod.id}
                  onClick={() => mod.active && onSelectImpromptu(customPrompt)}
                  className={`bento-card bg-[#11131a]/95 flex flex-col justify-between min-h-[420px] border-white/10 ${
                    mod.active ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="bento-card-header px-6 py-4 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-400">{mod.code}</span>
                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${
                        mod.active
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-slate-800 text-slate-400 border-white/5"
                      }`}
                    >
                      {mod.badge}
                    </span>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                    <div>
                      <span className="font-mono text-xs text-emerald-400 block mb-2 uppercase font-bold tracking-wider">
                        {mod.tagline}
                      </span>
                      <h3 className="text-base font-extrabold text-white mb-2">{mod.name}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        {mod.description}
                      </p>
                    </div>

                    <div className="border-t border-white/10 pt-4 space-y-1.5 font-mono text-xs text-slate-300">
                      {mod.details.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-slate-500">›</span>
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>

                    {mod.active ? (
                      <div className="text-xs font-mono font-bold text-emerald-400 flex items-center justify-between pt-4 border-t border-white/10 uppercase tracking-wide">
                        <span>Launch Module</span>
                        <span className="text-sm">→</span>
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-slate-500 pt-4 border-t border-white/10 block font-medium">In Development</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Persistent Widescreen Footer */}
      <footer className="border-t border-white/10 py-3.5 px-6 lg:px-12 bg-[#090a0f]/90 backdrop-blur-sm flex-shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between text-xs font-mono text-slate-400 font-medium">
          <span>Vocalyze AI v1.0</span>
          <span>High-Precision Diagnostic Architecture</span>
        </div>
      </footer>
    </div>
  );
}
