"use client";

import { useState } from "react";
import LandingScreen from "@/components/LandingScreen";
import TopicScreen from "@/components/TopicScreen";
import RecordingScreen from "@/components/RecordingScreen";
import ReviewScreen from "@/components/ReviewScreen";

export type AppScreen = "landing" | "topic" | "recording" | "review";

export interface RecordingResult {
  audioBlob: Blob;
  videoBlob: Blob;
  durationMs: number;
  topic: string;
}

export default function Home() {
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [currentTopic, setCurrentTopic] = useState<string>("");
  const [result, setResult] = useState<RecordingResult | null>(null);

  const handleModuleSelect = () => {
    setScreen("topic");
    setCurrentTopic("");
    setResult(null);
  };

  const handleTopicReady = (topic: string) => {
    setCurrentTopic(topic);
    setScreen("recording");
  };

  const handleRecordingDone = (r: RecordingResult) => {
    setResult(r);
    setScreen("review");
  };

  const handleRetry = () => {
    setResult(null);
    setScreen("topic");
  };

  const handleBackToModules = () => {
    setResult(null);
    setCurrentTopic("");
    setScreen("landing");
  };

  return (
    <main className="min-h-screen">
      {screen === "landing" && (
        <LandingScreen onSelectImpromptu={handleModuleSelect} />
      )}
      {screen === "topic" && (
        <TopicScreen onStart={handleTopicReady} onBack={handleBackToModules} />
      )}
      {screen === "recording" && (
        <RecordingScreen
          topic={currentTopic}
          onDone={handleRecordingDone}
          onBack={handleBackToModules}
        />
      )}
      {screen === "review" && result && (
        <ReviewScreen
          result={result}
          onRetry={handleRetry}
          onBack={handleBackToModules}
        />
      )}
    </main>
  );
}
