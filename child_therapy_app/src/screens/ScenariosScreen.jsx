import React, { useState, useMemo } from "react";
import palette from "../constants/palette";
import { getShuffledScenarios, STORY_INTRO } from "../constants/scenarios";
import HardwareAPI from "../api/hardware";
import BackButton from "../components/BackButton";
import ProgressDots from "../components/ProgressDots";
import SceneIllustration from "../components/SceneIllustration";
import CompanionBot from "../components/CompanionBot";

/**
 * ScenariosScreen — Phase 2: Peter & Maria emotion stories.
 *
 * Fixes in this version:
 *   - NO auto-advance timer. Child taps "I'm Ready!" to start answering.
 *   - Wrong answers: buttons DISABLE for 2s showing teaching prompt,
 *     then RESET for a fresh attempt. Each wrong tap = +1 attempt + stress signal.
 *   - 3 consecutive wrong answers across scenarios → auto-break (via App.jsx)
 *   - Scene-specific illustrations instead of generic face
 *   - Companion bot narrates story, celebrates, teaches
 */

const EMOTION_STYLES = {
  happy: { bg: "#FFD54F", bgLight: "#FFF8E1", border: "#FFC107", text: "#F57F17" },
  sad:   { bg: "#90CAF9", bgLight: "#E3F2FD", border: "#64B5F6", text: "#1565C0" },
  calm:  { bg: "#A5D6A7", bgLight: "#E8F5E9", border: "#81C784", text: "#2E7D32" },
};

export default function ScenariosScreen({ onNavigate, onLogEvent, onStressSignal, onActivityComplete }) {
  const scenarios = useMemo(() => getShuffledScenarios(), []);

  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  // Phases: "story" (reading narration) → "answering" (buttons active) → "wrong" (teaching, buttons disabled) → "correct" (praise, next button)
  const [phase, setPhase] = useState("story");
  const [selectedId, setSelectedId] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  // Bot state
  const [botMessage, setBotMessage] = useState("");
  const [botMood, setBotMood] = useState("neutral");

  const scenario = scenarios[scenarioIndex];

  // Child taps "I'm Ready" after reading the story
  const handleReady = () => {
    setPhase("answering");
    setBotMessage(scenario.question);
    setBotMood("thinking");
  };

  // Child taps an emotion button
  const handleSelect = (optionId) => {
    if (phase !== "answering") return; // ignore if buttons disabled

    const correct = optionId === scenario.expectedEmotion;
    setSelectedId(optionId);
    setAttempts((a) => a + 1);

    // Signal stress tracker in App.jsx — every wrong tap counts
    if (onStressSignal) onStressSignal(correct);

    if (correct) {
      // ✅ CORRECT
      setPhase("correct");
      setScore((s) => ({ correct: s.correct + 1, total: s.total + 1 }));

      const charName = scenario.character === "peter" ? "Peter" : "Maria";
      setBotMessage(`That's right! ${charName} feels ${scenario.expectedEmotion}! Great job! ✨`);
      setBotMood("celebrating");

      HardwareAPI.logGameEvent("scenario", {
        scenario_id: scenario.id,
        expected: scenario.expectedEmotion,
        selected: optionId,
        correct: true,
        attempts: attempts + 1,
      });

      if (onLogEvent) {
        onLogEvent("scenario", {
          scenario: scenario.id, expected: scenario.expectedEmotion,
          selected: optionId, correct: true, attempts: attempts + 1,
        });
      }
    } else {
      // ❌ WRONG — show teaching prompt, then RESET buttons for retry
      setPhase("wrong");

      // Log the wrong answer to backend (therapist sees it)
      HardwareAPI.logGameEvent("scenario", {
        scenario_id: scenario.id,
        expected: scenario.expectedEmotion,
        selected: optionId,
        correct: false,
        attempts: attempts + 1,
      });

      setBotMessage(scenario.teachingPrompt);
      setBotMood("encouraging");

      // After 2.5 seconds, RESET selection so child gets a fresh try
      setTimeout(() => {
        setSelectedId(null);
        setPhase("answering");
        setBotMessage("Let's try again! " + scenario.question);
        setBotMood("thinking");
      }, 2500);
    }
  };

  const handleNext = () => {
    if (scenarioIndex < scenarios.length - 1) {
      setScenarioIndex((i) => i + 1);
      setPhase("story");
      setSelectedId(null);
      setAttempts(0);
      setBotMessage(scenarios[scenarioIndex + 1].narration);
      setBotMood("neutral");
    } else {
      if (onActivityComplete) onActivityComplete();
      else onNavigate("stress-check");
    }
  };

  // ── INTRO ──
  if (showIntro) {
    return (
      <div style={{ minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif", padding: "32px 32px 160px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 540 }}>
          <BackButton onClick={() => onNavigate("home")} color={palette.pink} />
        </div>
        <div style={{ maxWidth: 480, margin: "48px auto 0", textAlign: "center" }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: palette.dark, margin: "0 0 24px" }}>
            Let's Learn Emotions!
          </h1>
          <div style={{
            background: palette.white, borderRadius: 24, padding: "28px 32px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.06)", margin: "0 0 12px", textAlign: "left",
          }}>
            <p style={{ fontSize: 19, fontWeight: 600, color: palette.dark, lineHeight: 1.7, margin: 0 }}>
              {STORY_INTRO}
            </p>
          </div>
          <p style={{ fontSize: 14, color: palette.gray, fontWeight: 600, margin: "0 0 28px", fontStyle: "italic" }}>
            Stories are in a different order each time!
          </p>
          <button
            onClick={() => {
              setShowIntro(false);
              setBotMessage(scenarios[0].narration);
              setBotMood("neutral");
            }}
            style={{
              background: palette.pink, color: palette.white, border: "none", borderRadius: 28,
              padding: "16px 48px", fontSize: 22, fontWeight: 800, cursor: "pointer",
              fontFamily: "'Nunito', sans-serif", boxShadow: "0 4px 16px rgba(244,184,193,0.4)",
            }}
          >
            Let's Start! →
          </button>
        </div>
        <CompanionBot
          message="Hi! I'll read you stories about Peter and Maria. After each story, tell me how they feel!"
          mood="happy"
          autoSpeak={true}
          position="bottom"
        />
      </div>
    );
  }

  // ── SCENARIO ──
  const buttonsDisabled = phase === "wrong" || phase === "correct" || phase === "story";

  return (
    <div style={{ minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif", padding: "32px 32px 160px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 540 }}>
        <BackButton onClick={() => onNavigate("home")} color={palette.pink} />
      </div>

      <div style={{ maxWidth: 540, margin: "12px auto 0", textAlign: "center", width: "100%" }}>
        {/* Header + score */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 14, color: palette.gray, margin: 0, fontWeight: 700 }}>
            Story {scenarioIndex + 1} of {scenarios.length}
          </p>
          <div style={{
            background: palette.mintLight, borderRadius: 12, padding: "4px 14px",
            fontSize: 13, fontWeight: 800, color: palette.dark,
          }}>
            Score: {score.correct}/{score.total}
          </div>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 900, color: palette.dark, margin: "0 0 10px" }}>
          {scenario.title}
        </h1>

        {/* Story card — always visible */}
        <div style={{
          background: palette.white, borderRadius: 20, padding: "16px 20px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)", margin: "0 auto 14px",
          textAlign: "left",
        }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: palette.dark, lineHeight: 1.6, margin: 0 }}>
            {scenario.narration}
          </p>
        </div>

        {/* Scene illustration — scenario-specific */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <SceneIllustration
            scenarioId={scenario.id}
            character={scenario.character}
            isCorrect={phase === "correct"}
          />
        </div>

        {/* "I'm Ready" button — only during story phase */}
        {phase === "story" && (
          <button
            onClick={handleReady}
            style={{
              background: palette.pink, color: palette.white, border: "none", borderRadius: 24,
              padding: "14px 44px", fontSize: 20, fontWeight: 800, cursor: "pointer",
              fontFamily: "'Nunito', sans-serif", boxShadow: "0 4px 16px rgba(244,184,193,0.3)",
              marginBottom: 14, transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            I'm Ready! →
          </button>
        )}

        {/* Question banner */}
        {(phase === "answering" || phase === "wrong") && (
          <div style={{
            background: palette.pinkLight, borderRadius: 16, padding: "12px 18px",
            margin: "0 auto 12px", maxWidth: 400,
          }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: palette.dark, margin: 0 }}>
              {scenario.question}
            </p>
          </div>
        )}

        {/* Emotion buttons */}
        {(phase === "answering" || phase === "wrong") && (
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
            {scenario.options.map((opt) => {
              const style = EMOTION_STYLES[opt.id] || EMOTION_STYLES.happy;
              const isSelected = selectedId === opt.id;
              const isWrong = isSelected && phase === "wrong";

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  disabled={buttonsDisabled}
                  style={{
                    width: 120, padding: "18px 10px", borderRadius: 22,
                    border: `3px solid ${isWrong ? "#E53935" : style.border}`,
                    background: isWrong ? "#FFEBEE" : style.bgLight,
                    cursor: buttonsDisabled ? "not-allowed" : "pointer",
                    opacity: buttonsDisabled && !isWrong ? 0.5 : 1,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 6, fontFamily: "'Nunito', sans-serif",
                    transition: "all 0.2s",
                    animation: isWrong ? "shake 0.4s ease" : "none",
                  }}
                >
                  <span style={{ fontSize: 40 }}>{opt.icon}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: isWrong ? "#C62828" : style.text }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Wrong answer feedback */}
        {phase === "wrong" && (
          <div style={{
            background: palette.purpleLight, borderRadius: 16, padding: "14px 20px",
            margin: "0 auto 14px", maxWidth: 420, animation: "fadeIn 0.3s ease",
          }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: palette.dark, margin: 0 }}>
              {scenario.teachingPrompt}
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: palette.gray, margin: "6px 0 0" }}>
              Buttons will reset in a moment — try again! 💜
            </p>
          </div>
        )}

        {/* Correct — next button */}
        {phase === "correct" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{
              background: "#C8E6C9", borderRadius: 16, padding: "14px 20px",
              margin: "0 auto 16px", maxWidth: 420,
            }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#2E7D32", margin: 0 }}>
                That's right! Great job! ✨
              </p>
            </div>

            <button
              onClick={handleNext}
              style={{
                background: palette.mint, color: palette.white, border: "none", borderRadius: 28,
                padding: "14px 44px", fontSize: 20, fontWeight: 800, cursor: "pointer",
                fontFamily: "'Nunito', sans-serif", boxShadow: "0 4px 16px rgba(126,206,193,0.4)",
              }}
            >
              {scenarioIndex < scenarios.length - 1 ? "Next Story →" : "All Done! 🎉"}
            </button>
          </div>
        )}

        {/* Attempt counter (visible to child as gentle hint) */}
        {attempts > 1 && phase !== "correct" && (
          <p style={{ fontSize: 13, color: palette.gray, fontWeight: 600, marginTop: 8, fontStyle: "italic" }}>
            Attempt {attempts + 1} — take your time, you'll get it!
          </p>
        )}

        {/* Progress */}
        <div style={{ marginTop: 14 }}>
          <ProgressDots total={scenarios.length} currentIndex={scenarioIndex} activeColor={palette.pink} doneColor={palette.pinkLight} />
        </div>
      </div>

      {/* Companion Bot */}
      <CompanionBot
        message={botMessage}
        mood={botMood}
        autoSpeak={true}
        visible={true}
        position="bottom"
      />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
      `}</style>
    </div>
  );
}
