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

  const handleModuleSelect = (customTopic?: string) => {
    if (customTopic && customTopic.trim()) {
      setCurrentTopic(customTopic);
      setScreen("recording");
    } else {
      setScreen("topic");
      setCurrentTopic("");
    }
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

  const handleUploadVideo = (file: File, topicName?: string) => {
    const videoEl = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;

    const proceedWithResult = (durationMs: number) => {
      URL.revokeObjectURL(objectUrl);
      const resultObj: RecordingResult = {
        videoBlob: file,
        audioBlob: file,
        durationMs,
        topic: topicName || `Uploaded Test Video (${file.name})`,
      };
      setResult(resultObj);
      setScreen("review");
    };

    videoEl.onloadedmetadata = () => {
      if (videoEl.duration === Infinity) {
        videoEl.currentTime = 1e101;
        videoEl.ontimeupdate = () => {
          videoEl.ontimeupdate = null;
          videoEl.currentTime = 0;
          proceedWithResult(Math.round(videoEl.duration * 1000) || 10000);
        };
      } else {
        proceedWithResult(Math.round(videoEl.duration * 1000) || 10000);
      }
    };
    videoEl.onerror = () => proceedWithResult(10000);
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
    <main className="min-h-screen bg-[#07090e] text-[#f8fafc] bg-grid-pattern relative selection:bg-indigo-500/30 selection:text-indigo-200">
      {screen === "landing" && (
        <LandingScreen 
          onSelectImpromptu={handleModuleSelect}
          onUploadVideo={handleUploadVideo} 
        />
      )}
      {screen === "topic" && (
        <TopicScreen onStart={handleTopicReady} onBack={handleBackToModules} />
      )}
      {screen === "recording" && (
        <RecordingScreen
          topic={currentTopic}
          onDone={handleRecordingDone}
          onBack={handleBackToModules}
          onUploadVideo={handleUploadVideo}
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
