import React, { useState, useCallback, useEffect } from "react";
import HardwareAPI from "./api/hardware";
import HomeScreen from "./screens/HomeScreen";
import TextureBookScreen from "./screens/TextureBookScreen";
import StressCheckScreen from "./screens/StressCheckScreen";
import BreatheScreen from "./screens/BreatheScreen";

/**
 * App — root component with stress-aware routing.
 *
 * Break handling:
 *   TextureBookScreen stays MOUNTED during breaks (hidden via CSS).
 *   When the break ends, the child returns to exactly where they were —
 *   same texture, same question, same progress.
 */
export default function App() {
  const [screen, setScreen] = useState("home");
  const [stressSignals, setStressSignals] = useState(0);
  const [stressReason, setStressReason] = useState(null);
  const [activityComplete, setActivityComplete] = useState(false);

  // Track whether texture book has been entered (so we keep it mounted)
  const [textureBookActive, setTextureBookActive] = useState(false);
  // Track where to return after break
  const [breakReturnTo, setBreakReturnTo] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const patientId = parseInt(params.get("patient"), 10) || 1;
    console.log(`[APP] Starting session for patient ${patientId}`);
    HardwareAPI.startSession(patientId);
    return () => { HardwareAPI.endSession(); };
  }, []);

  const navigate = useCallback((target) => {
    HardwareAPI.logEvent("navigate", { to: target });

    if (target === "texture-book") {
      setTextureBookActive(true);
    }

    // If navigating to break from texture book, remember to return there
    if (target === "stress-check" || target === "breathe") {
      setBreakReturnTo((prev) => prev || (screen === "texture-book" ? "texture-book" : null));
    }

    // If going home, fully close the texture book
    if (target === "home") {
      setTextureBookActive(false);
      setBreakReturnTo(null);
    }

    setScreen(target);
  }, [screen]);

  const logEvent = useCallback((type, data) => {
    console.log(`[APP] Event: ${type}`, data);
  }, []);

  const handleStressSignal = useCallback((isCorrect) => {
    if (!isCorrect) {
      setStressSignals((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          setStressReason("struggling");
          setBreakReturnTo("texture-book");
          setScreen("stress-check");
          return 0;
        }
        return next;
      });
    } else {
      setStressSignals(0);
    }
  }, []);

  const handleActivityComplete = useCallback(() => {
    setActivityComplete(true);
    setTextureBookActive(false);
    setStressReason("check-in");
    setScreen("stress-check");
  }, []);

  const handleBreakComplete = useCallback(() => {
    setStressSignals(0);
    setStressReason(null);
    const returnTo = breakReturnTo || "home";
    setBreakReturnTo(null);
    setScreen(returnTo);
  }, [breakReturnTo]);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {screen === "home" && (
        <HomeScreen onNavigate={navigate} activityComplete={activityComplete} />
      )}

      {/* TextureBookScreen stays mounted while active — hidden during breaks */}
      {textureBookActive && (
        <div style={{ display: screen === "texture-book" ? "block" : "none" }}>
          <TextureBookScreen
            onNavigate={navigate}
            onLogEvent={logEvent}
            onStressSignal={handleStressSignal}
            onActivityComplete={handleActivityComplete}
          />
        </div>
      )}

      {screen === "stress-check" && (
        <StressCheckScreen
          onNavigate={navigate}
          reason={stressReason}
          onBreakComplete={handleBreakComplete}
        />
      )}
      {screen === "breathe" && (
        <BreatheScreen
          onNavigate={navigate}
          onBreakComplete={handleBreakComplete}
        />
      )}
    </>
  );
}
