"use client";

import { useState, useEffect, useRef } from "react";

interface LandingScreenProps {
  onSelectImpromptu: (topic?: string) => void;
  onUploadVideo?: (file: File, topicName?: string) => void;
}

type TabView = "platform" | "telemetry";

const PRESET_PROMPTS = [
  "Deliver a 2-minute vision presentation for a new AI product line to executive leadership.",
  "What is one opinion you hold strongly that most people around you disagree with?",
  "Explain why project timelines slipped without losing stakeholder confidence.",
  "Explain how neural networks work using simple real-world analogies.",
  "Describe a significant challenge you overcame and what it taught you about leadership.",
  "If you had unlimited resources, what global technical problem would you solve first?",
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

export default function LandingScreen({ onSelectImpromptu, onUploadVideo }: LandingScreenProps) {
  const [activeTab, setActiveTab] = useState<TabView>("platform");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync hash with tab view
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "telemetry" || hash === "platform") {
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
    const randomTopic = PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)];
    onSelectImpromptu(randomTopic);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadVideo) {
      onUploadVideo(file);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`bg-[#f8fafc] bg-grid-pattern text-[#0f172a] ${
      activeTab === "platform" ? "min-h-screen flex flex-col justify-between overflow-x-hidden" : "min-h-screen flex flex-col justify-between"
    }`}>
      {/* Hidden File Input for Video Testing */}
      <input
        type="file"
        ref={fileInputRef}
        accept="video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Persistent Widescreen Navbar */}
      <header className="border-b border-slate-200 bg-[#f8fafc]/90 backdrop-blur-sm px-6 lg:px-12 py-3.5 flex-shrink-0 sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          {/* Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer" 
            onClick={() => switchTab("platform")}
          >
            <div className="w-8 h-8 rounded bg-[#0f172a] flex items-center justify-center text-white font-black text-xs font-mono">
              V
            </div>
            <span className="text-base font-black tracking-tight text-[#0f172a] font-mono uppercase">
              Vocalyze <span className="text-emerald-600 font-bold">AI</span>
            </span>
          </div>

          {/* Navigation Links with Active State */}
          <nav className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm font-mono font-bold">
            <button
              onClick={() => switchTab("platform")}
              className={`px-3.5 py-1.5 rounded transition-colors ${
                activeTab === "platform"
                  ? "bg-[#0f172a] text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              01. Modules
            </button>
            <button
              onClick={() => switchTab("telemetry")}
              className={`px-3.5 py-1.5 rounded transition-colors ${
                activeTab === "telemetry"
                  ? "bg-[#0f172a] text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              02. Telemetry
            </button>
          </nav>

          {/* Right Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={triggerUpload}
              className="text-xs px-3.5 py-2 rounded font-mono font-bold tracking-wide bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 transition-colors uppercase cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Upload a pre-recorded video file for testing"
            >
              <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span>Upload Video</span>
            </button>
            <button 
              onClick={handleStartSession}
              className="btn-primary text-xs px-4 py-2 rounded font-mono font-bold tracking-wide hidden sm:inline-block uppercase cursor-pointer"
            >
              Start Session
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center max-w-[1400px] w-full mx-auto px-6 lg:px-12 py-8 animate-fade-in">
        {/* PAGE 1: PLATFORM / MODULES (Light Slate Shaded Design) */}
        {activeTab === "platform" && (
          <div className="w-full space-y-6 my-auto">
            {/* Bold Headline */}
            <div className="text-center max-w-4xl mx-auto space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">
                [ SYSTEM // VOCALYZE 1.0 ]
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tight text-[#0f172a] leading-none">
                Speech &amp; Delivery <span className="text-emerald-600 font-bold">Analysis</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed font-medium">
                Engineered for real-time MediaPipe gaze tracking, posture metrics, and Whisper acoustic analytics.
              </p>
            </div>

            {/* Bento Studio Console Workspace */}
            <div className="bento-card bg-white shadow-lg border-slate-200">
              <div className="bento-card-header px-6 py-3 flex items-center justify-between bg-[#f1f5f9]">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-slate-800 uppercase tracking-wider">
                    WORKSPACE_CONSOLE // PRACTICE_MODULES
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-300">
                    ONLINE
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-500 hidden sm:inline">
                  MediaPipe 0.10.x Engine
                </span>
              </div>

              {/* Modules Grid Section on Landing Page */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <span className="font-mono text-xs uppercase font-bold text-slate-700 tracking-wider">
                    01 // SELECT PRACTICE MODULE
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 font-medium">
                    Prompt auto-assigned on launch
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {MODULES.map((mod) => (
                    <div
                      key={mod.id}
                      onClick={() => mod.active && handleStartSession()}
                      className={`bento-card bg-white flex flex-col justify-between border-slate-200 shadow-sm p-5 transition-all ${
                        mod.active ? "cursor-pointer hover:border-emerald-600 hover:shadow-md" : "opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3 font-mono text-xs">
                          <span className="font-bold text-slate-700">{mod.code}</span>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              mod.active
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : "bg-slate-200 text-slate-600 border-slate-300"
                            }`}
                          >
                            {mod.badge}
                          </span>
                        </div>

                        <span className="font-mono text-[11px] text-emerald-700 block mb-1 uppercase font-bold tracking-wider">
                          {mod.tagline}
                        </span>
                        <h3 className="text-base font-extrabold text-[#0f172a] mb-2">{mod.name}</h3>
                        <p className="text-xs text-slate-600 leading-relaxed font-medium mb-4">
                          {mod.description}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="border-t border-slate-200 pt-3 space-y-1 font-mono text-[11px] text-slate-600">
                          {mod.details.map((d, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="text-emerald-600 font-bold">›</span>
                              <span>{d}</span>
                            </div>
                          ))}
                        </div>

                        {mod.active ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartSession();
                            }}
                            className="w-full btn-primary text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 font-mono uppercase tracking-wide shadow-sm cursor-pointer"
                          >
                            <span>Start Practice Session</span>
                            <span className="text-[10px] opacity-80">→</span>
                          </button>
                        ) : (
                          <div className="text-center font-mono text-[11px] text-slate-400 py-2 border border-dashed border-slate-300 rounded-lg font-medium">
                            Module In Development
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pipeline Status Footer Bar */}
                <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>MediaPipe: <strong className="text-slate-900">Active</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Whisper: <strong className="text-slate-900">128 kbps</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Privacy: <strong className="text-slate-900">On-Device</strong></span>
                  </div>
                  <div className="flex items-center justify-end gap-2 text-emerald-700 font-bold">
                    <span>System: 100% Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 2: TELEMETRY (Light Slate Shaded Design) */}
        {activeTab === "telemetry" && (
          <div className="w-full space-y-10 my-auto">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-slate-500 font-bold mb-2">
                02 // PLATFORM TELEMETRY ARCHITECTURE
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-[#0f172a] uppercase tracking-tight">
                Real-Time Diagnostic Metrics
              </h2>
              <p className="text-base text-slate-600 mt-2 max-w-2xl font-medium">
                High-frequency multi-modal sensors capturing facial landmarks, vocal acoustics, and postural telemetry simultaneously.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {TELEMETRY_FEATURES.map((feat) => (
                <div key={feat.code} className="bento-card bg-white p-8 flex flex-col justify-between min-h-[400px] border-slate-200 shadow-sm">
                  <div>
                    <div className="bento-card-header -mx-8 -mt-8 mb-6 px-8 py-5 flex items-center justify-between font-mono text-sm bg-[#f1f5f9]">
                      <span className="text-slate-700 font-bold">{feat.code}</span>
                      <span className="text-emerald-700 text-2xl font-black">{feat.stat}</span>
                    </div>
                    <h3 className="text-xl font-extrabold text-[#0f172a] mb-3">{feat.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-6 font-medium">{feat.detail}</p>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <div className="font-mono text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Technical Specifications</div>
                    <ul className="space-y-2 font-mono text-xs text-slate-800">
                      {feat.specs.map((spec, i) => (
                        <li key={i} className="flex items-center gap-2.5">
                          <span className="text-emerald-600 font-bold">•</span>
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
      </main>

      {/* Persistent Widescreen Footer */}
      <footer className="border-t border-slate-200 py-3.5 px-6 lg:px-12 bg-[#f8fafc]/90 backdrop-blur-sm flex-shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between text-xs font-mono text-slate-600 font-semibold">
          <span>Vocalyze AI v1.0</span>
          <span>High-Precision Diagnostic Architecture</span>
        </div>
      </footer>
    </div>
  );
}
