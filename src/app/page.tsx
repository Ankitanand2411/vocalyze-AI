"use client";

import { useState } from "react";
import LandingScreen from "@/components/LandingScreen";
import TopicScreen from "@/components/TopicScreen";
import RecordingScreen from "@/components/RecordingScreen";
import ReviewScreen from "@/components/ReviewScreen";

export type AppScreen = "landing" | "topic" | "recording" | "review";

export interface FrameAnalysisEntry {
  timestamp: number;       // ms since recording start

  // ── Face: gaze & pose ───────────────────────────────────────────────────
  eyeContactScore: number; // 0–1, higher = looking at camera
  headPoseScore: number;   // 0–1, higher = facing forward (yaw)
  faceDetected: boolean;
  headPitch: number;       // degrees, + = looking down
  headRoll: number;        // degrees, head tilt

  // ── Face: blendshape basics ─────────────────────────────────────────────
  mouthOpenScore: number;  // 0–1, speaking indicator
  smileScore: number;      // 0–1, smile intensity
  blinkScore: number;      // 0–1, both eyes closed = 1

  // ── Face: extended blendshape emotion signals ───────────────────────────
  anxietyScore: number;    // browInnerUp  — raised inner brows = stress/worry
  confusionScore: number;  // browDown avg — furrowed brows = confusion
  stressScore: number;     // mouthPress avg — lip compression = tension
  frownScore: number;      // mouthFrown avg — negative affect
  squintScore: number;     // eyeSquint avg — discomfort / focus strain

  // ── Gaze zone classification ─────────────────────────────────────────────
  gazeZone: "center" | "left" | "right" | "down" | "away"; // where eyes point

  // ── Body pose (PoseLandmarker) ───────────────────────────────────────────
  poseDetected: boolean;
  postureScore: number;       // 0–1, higher = upright & symmetric posture
  shoulderLevelDiff: number;  // |left_shoulder_y - right_shoulder_y|, 0 = even
  spineAngle: number;         // degrees lean from vertical (0 = upright)
  armsCrossed: boolean;       // rough detection from wrist vs torso positions
}

export interface RecordingResult {
  audioBlob: Blob;
  videoBlob: Blob;
  durationMs: number;
  topic: string;
  frameAnalysis: FrameAnalysisEntry[];
  mediapipeReady: boolean; // false if MediaPipe failed to init (graceful fallback)
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
