"use client";

interface LandingScreenProps {
  onSelectImpromptu: () => void;
}

const modules = [
  {
    id: "impromptu",
    name: "Impromptu Speaker",
    description: "Respond to an unexpected prompt and refine your thinking under pressure.",
    icon: "💬",
    active: true,
  },
  {
    id: "qa",
    name: "Q&A Simulator",
    description: "Fielding rapid-fire questions from an AI interviewer with interruptions.",
    icon: "🎯",
    active: false,
  },
  {
    id: "presentation",
    name: "Presentation Engine",
    description: "Deliver a structured long-form talk and get slide-synced delivery feedback.",
    icon: "📊",
    active: false,
  },
  {
    id: "feynman",
    name: "Feynman Simulator",
    description: "Explain a complex topic to a curious beginner and gauge true understanding.",
    icon: "🔬",
    active: false,
  },
];

export default function LandingScreen({ onSelectImpromptu }: LandingScreenProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-8 pt-10 pb-2">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <span className="text-2xl">🎙</span>
          <span className="text-xl font-semibold text-[#1a1a2e] tracking-tight">
            Vocalyze <span className="text-[#6c8ebf]">AI</span>
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="px-8 pt-14 pb-10 animate-fade-in">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm font-medium text-[#6c8ebf] tracking-widest uppercase mb-3">
            Communication Diagnostics
          </p>
          <h1 className="text-4xl font-bold text-[#1a1a2e] leading-tight mb-4 max-w-xl">
            Your personal mirror <br />
            for speaking practice.
          </h1>
          <p className="text-base text-[#6b7280] max-w-lg leading-relaxed">
            Choose a module below to begin. Each session is recorded locally first — 
            review your take before anything is processed or shared.
          </p>
        </div>
      </section>

      {/* Module grid */}
      <section className="px-8 pb-16 flex-1">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-5">
          {modules.map((mod, i) => (
            <ModuleCard
              key={mod.id}
              mod={mod}
              delay={i * 80}
              onSelect={mod.active ? onSelectImpromptu : undefined}
            />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-[#e5e7eb]">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs text-[#9ca3af] text-center">
            All recordings stay on your device until you choose to analyze them.
          </p>
        </div>
      </footer>
    </div>
  );
}

interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  active: boolean;
}

function ModuleCard({
  mod,
  delay,
  onSelect,
}: {
  mod: Module;
  delay: number;
  onSelect?: () => void;
}) {
  const isActive = mod.active;

  return (
    <div
      className="animate-slide-up"
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <button
        onClick={onSelect}
        disabled={!isActive}
        aria-disabled={!isActive}
        className={[
          "w-full text-left rounded-2xl border p-6 transition-all duration-200 group relative",
          isActive
            ? "bg-white border-[#e5e7eb] hover:border-[#6c8ebf] hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            : "bg-white/60 border-[#e5e7eb] opacity-50 cursor-not-allowed",
        ].join(" ")}
      >
        {/* Coming soon badge */}
        {!isActive && (
          <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af] bg-[#f4f2ef] px-2 py-1 rounded-full border border-[#e5e7eb]">
            Coming soon
          </span>
        )}

        {/* Active indicator dot */}
        {isActive && (
          <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#6c8ebf]" />
        )}

        <span className="text-2xl mb-4 block">{mod.icon}</span>

        <h2 className="text-base font-semibold text-[#1a1a2e] mb-1.5 group-hover:text-[#6c8ebf] transition-colors">
          {mod.name}
        </h2>
        <p className="text-sm text-[#6b7280] leading-relaxed">{mod.description}</p>

        {isActive && (
          <div className="mt-5 flex items-center gap-1.5 text-xs font-medium text-[#6c8ebf]">
            <span>Start session</span>
            <svg
              className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </button>
    </div>
  );
}
