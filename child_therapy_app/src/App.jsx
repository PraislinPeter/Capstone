import React, { useState, useCallback, useEffect, useRef } from "react";
import useCamera from "./hooks/useCamera";
import HardwareAPI from "./api/hardware";
import HomeScreen from "./screens/HomeScreen";
import TextureBookScreen from "./screens/TextureBookScreen";
import ScenariosScreen from "./screens/ScenariosScreen";
import StressCheckScreen from "./screens/StressCheckScreen";
import BreatheScreen from "./screens/BreatheScreen";

export default function App() {
  const { start, stop, captureFrame } = useCamera();
  const [screen, setScreen] = useState("home");
  const [sessionLog, setSessionLog] = useState([]);
  const [stressSignals, setStressSignals] = useState(0);
  const [stressReason, setStressReason] = useState(null);
  const [completedActivities, setCompletedActivities] = useState({
    textures: false,
    scenarios: false,
  });

  const prevScreen = useRef("home");
  const streamingIntervalRef = useRef(null);

  const startStreamingLoop = useCallback(() => {
    if (streamingIntervalRef.current) return;

    streamingIntervalRef.current = setInterval(() => {
      try {
        const frame = captureFrame();
        if (frame) {
          HardwareAPI.sendVideoFrame(frame);
        }
      } catch (err) {
        console.warn("Frame send failed:", err.message);
      }
    }, 200);
  }, [captureFrame]);

  const stopStreamingLoop = useCallback(() => {
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const patientId = parseInt(params.get("patient"), 10) || 1;

      console.log(`[APP] Starting session for patient ${patientId}`);

      try {
        if (!mounted) return;

        await HardwareAPI.startSession(patientId);
        await start();
        startStreamingLoop();
      } catch (err) {
        console.error("[APP] Failed to initialize session:", err);
      }
    };

    init();

    return () => {
      mounted = false;
      stopStreamingLoop();
      stop();
      HardwareAPI.endSession();
    };
  }, [start, stop, startStreamingLoop, stopStreamingLoop]);

  const navigate = useCallback(
    (target) => {
      prevScreen.current = screen;
      HardwareAPI.logEvent("navigate", { to: target });
      setScreen(target);
    },
    [screen]
  );

  const logEvent = useCallback((type, data) => {
    setSessionLog((prev) => [...prev, { type, ...data, time: Date.now() }]);
  }, []);

  const handleStressSignal = useCallback((isCorrect) => {
    if (!isCorrect) {
      setStressSignals((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          setStressReason("struggling");
          setScreen("stress-check");
          return 0;
        }
        return next;
      });
    } else {
      setStressSignals(0);
    }
  }, []);

  const handleActivityComplete = useCallback((activity) => {
    setCompletedActivities((prev) => ({ ...prev, [activity]: true }));
    setStressReason("check-in");
    setScreen("stress-check");
  }, []);

  const handleBreakComplete = useCallback(() => {
    setStressSignals(0);
    setStressReason(null);
    setScreen("home");
  }, []);

  const fontLink = (
    <link
      href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
      rel="stylesheet"
    />
  );

  return (
    <>
      {fontLink}

      {screen === "home" && (
        <HomeScreen
          onNavigate={navigate}
          completedActivities={completedActivities}
        />
      )}

      {screen === "texture-book" && (
        <TextureBookScreen
          onNavigate={navigate}
          onLogEvent={logEvent}
          onActivityComplete={() => handleActivityComplete("textures")}
        />
      )}

      {screen === "scenarios" && (
        <ScenariosScreen
          onNavigate={navigate}
          onLogEvent={logEvent}
          onStressSignal={handleStressSignal}
          onActivityComplete={() => handleActivityComplete("scenarios")}
        />
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