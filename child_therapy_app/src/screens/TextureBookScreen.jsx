import React, { useState, useEffect, useMemo, useRef } from "react";
import palette from "../constants/palette";
import TEXTURES from "../constants/textures";
import HardwareAPI from "../api/hardware";
import ProgressDots from "../components/ProgressDots";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FEELING_OPTIONS = [
  { id: "happy", label: "Happy", icon: "😊", bg: "#FFF8E1", border: "#FFC107", color: "#F57F17" },
  { id: "calm", label: "Calm", icon: "😌", bg: "#E8F5E9", border: "#81C784", color: "#2E7D32" },
  { id: "sad", label: "Sad", icon: "😢", bg: "#E3F2FD", border: "#64B5F6", color: "#1565C0" },
  { id: "angry", label: "Angry", icon: "😠", bg: "#FBE9E7", border: "#EF9A9A", color: "#C62828" },
];

const FEELING_EMOJI = { happy: "😊", calm: "😌", sad: "😢", angry: "😠" };

export default function TextureBookScreen({ onNavigate, onLogEvent, onStressSignal, onActivityComplete }) {
  const textures = useMemo(() => shuffle(TEXTURES), []);

  const [textureIndex, setTextureIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState("ready");
  const [selectedId, setSelectedId] = useState(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [childFeeling, setChildFeeling] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);

  const tex = textures[textureIndex];
  const questions = tex.questions || [];
  const currentQ = questions[questionIndex];

  useEffect(() => {
    // Create a fresh backend session for this playthrough
    HardwareAPI.createGameSession();
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const handleReady = () => {
    setPhase(questions[0]?.type === "touch" ? "touch" : "question");
  };

  const handleTouch = async () => {
    setPhase("detecting");
    HardwareAPI.logEvent("texture_touch_start", { texture: tex.id });
    const result = await HardwareAPI.simulateTouch();
    if (result.detected) {
      HardwareAPI.logGameEvent("texture", { texture_id: tex.id, duration_ms: 2000 });
      if (onLogEvent) onLogEvent("texture", { texture: tex.id });
      setPhase("touched"); // let the child take their time before questions
    }
  };

  const handleAnswer = (optionId) => {
    if (phase !== "question") return;
    setSelectedId(optionId);
    const correct = optionId === currentQ.correctId;
    if (onStressSignal) onStressSignal(correct);
    HardwareAPI.logGameEvent("texture_question", {
      texture_id: tex.id, question_id: currentQ.id,
      selected: optionId, expected: currentQ.correctId, correct,
    });
    if (correct) {
      setQuestionsAnswered((c) => c + 1);
      setPhase("correct");
      setTimeout(() => { setSelectedId(null); advanceToNextQuestion(); }, 2000);
    } else {
      setPhase("wrong");
      setCountdown(3);
      let c = 3;
      countdownRef.current = setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) { clearInterval(countdownRef.current); setSelectedId(null); setPhase("question"); }
      }, 1000);
    }
  };

  const handleFeeling = (feelingId) => {
    setChildFeeling(feelingId);
    setPhase("done");
    HardwareAPI.logGameEvent("texture_feeling", {
      texture_id: tex.id, feeling: feelingId, questions_answered: questionsAnswered,
    });
  };

  const handleBreakRequest = () => {
    HardwareAPI.logGameEvent("break_request", { texture_id: tex.id, phase });
    onNavigate("stress-check");
  };

  const advanceToNextQuestion = () => {
    const nextIdx = questionIndex + 1;
    if (nextIdx < questions.length) {
      setQuestionIndex(nextIdx);
      setSelectedId(null);
      setPhase(questions[nextIdx].type === "touch" ? "touch" : "question");
    } else {
      setPhase("feeling");
    }
  };

  const handleNextTexture = () => {
    if (textureIndex < textures.length - 1) {
      setTextureIndex((i) => i + 1);
      setQuestionIndex(0); setPhase("ready"); setSelectedId(null);
      setQuestionsAnswered(0); setChildFeeling(null);
    } else {
      if (onActivityComplete) onActivityComplete();
      else onNavigate("home");
    }
  };

  // Show break button during active phases (not during ready, done, or detecting)
  const showBreakBtn = ["touch", "touched", "question", "feeling", "wrong", "correct"].includes(phase);

  return (
    <div style={{
      minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "24px 20px 32px",
    }}>

      {/* ── Top bar: back + progress ── */}
      <div style={{ width: "100%", maxWidth: 480, marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <button onClick={() => onNavigate("home")}
            style={{ background: "none", border: "none", fontSize: 14, fontWeight: 700,
              color: palette.gray, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
            ← Back
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: palette.gray }}>
            {textureIndex + 1} of {textures.length}
          </span>
        </div>
        <div style={{ height: 8, background: palette.mintLight + "60", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4, background: palette.mint,
            width: `${((textureIndex + (phase === "done" ? 1 : 0)) / textures.length) * 100}%`,
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* ── Main content (vertically centered) ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", width: "100%", maxWidth: 480,
      }}>

        {/* ═══ READY ═══ */}
        {phase === "ready" && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: 72, marginBottom: 24 }}>{tex.emoji}</div>
            <h1 style={{ fontSize: 34, fontWeight: 900, color: palette.dark, margin: "0 0 40px" }}>
              {tex.name}
            </h1>
            <button onClick={handleReady} style={{
              width: "100%", padding: "22px 20px", borderRadius: 20, border: "none",
              background: palette.mint, color: palette.white, fontSize: 24, fontWeight: 800,
              cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            }}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              I'm Ready! 👋
            </button>
          </div>
        )}

        {/* ═══ TOUCH ═══ */}
        {phase === "touch" && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: palette.dark, margin: "0 0 28px", lineHeight: 1.4 }}>
              Find the <strong>{tex.name}</strong> page in your book
            </p>
            <button onClick={handleTouch} style={{
              width: "100%", height: 200, borderRadius: 24,
              background: `linear-gradient(145deg, ${tex.color}, ${tex.color}CC)`,
              border: "none", cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              boxShadow: `0 8px 32px ${tex.color}40`,
            }}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              <span style={{ fontSize: 56 }}>{tex.emoji}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: palette.white }}>
                Tap here when you've found it!
              </span>
            </button>
          </div>
        )}

        {/* ═══ DETECTING ═══ */}
        {phase === "detecting" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              border: `6px solid ${palette.mintLight}`, borderTopColor: palette.mint,
              animation: "spin 0.8s linear infinite", margin: "0 auto 28px",
            }} />
            <p style={{ fontSize: 24, fontWeight: 800, color: palette.dark, margin: "0 0 8px" }}>
              Feeling the {tex.name}...
            </p>
            <p style={{ fontSize: 16, color: palette.gray, fontWeight: 600 }}>
              Take your time exploring! 🌟
            </p>
          </div>
        )}

        {/* ═══ TOUCHED — ready gate before questions ═══ */}
        {phase === "touched" && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: 64, marginBottom: 16, animation: "popIn 0.4s ease" }}>✅</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: palette.dark, margin: "0 0 8px" }}>
              Great job!
            </h2>
            <p style={{ fontSize: 20, fontWeight: 700, color: palette.gray, margin: "0 0 40px", lineHeight: 1.4 }}>
              You felt the {tex.name}! {tex.emoji}
            </p>
            <button onClick={() => advanceToNextQuestion()} style={{
              width: "100%", padding: "22px 20px", borderRadius: 20, border: "none",
              background: palette.mint, color: palette.white, fontSize: 22, fontWeight: 800,
              cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            }}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              I'm Ready to Answer! 📝
            </button>
          </div>
        )}

        {/* ═══ QUESTION ═══ */}
        {phase === "question" && currentQ && currentQ.type !== "touch" && (
          <div style={{ width: "100%" }}>
            <div style={{
              background: palette.white, borderRadius: 20, padding: "20px 24px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)", marginBottom: 24, textAlign: "center",
            }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: palette.dark, margin: 0, lineHeight: 1.4 }}>
                {currentQ.text}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {currentQ.options.map((opt) => (
                <button key={opt.id} onClick={() => handleAnswer(opt.id)}
                  style={{
                    width: "100%", padding: "20px 24px", borderRadius: 18,
                    border: `3px solid ${palette.mintLight}`, background: palette.white,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
                    fontFamily: "'Nunito', sans-serif",
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}>
                  <span style={{ fontSize: 36, flexShrink: 0 }}>{opt.icon}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: palette.dark, textAlign: "left" }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CORRECT ═══ */}
        {phase === "correct" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 72, marginBottom: 20, animation: "popIn 0.4s ease" }}>✨</div>
            <h2 style={{ fontSize: 34, fontWeight: 900, color: "#2E7D32", margin: 0 }}>That's right!</h2>
          </div>
        )}

        {/* ═══ WRONG ═══ */}
        {phase === "wrong" && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{
              background: "#FFF3E0", borderRadius: 20, padding: "24px",
              border: "2px solid #FFE0B2", marginBottom: 28, textAlign: "left",
            }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: "#E65100", margin: "0 0 12px", textAlign: "center" }}>
                Not quite — that's okay! 💜
              </p>
              <p style={{ fontSize: 17, fontWeight: 600, color: "#BF360C", margin: 0, lineHeight: 1.5 }}>
                {currentQ.teachingPrompt}
              </p>
            </div>
            <div style={{
              width: 80, height: 80, borderRadius: "50%", background: palette.purpleLight,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
            }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: palette.purple }}>{countdown}</span>
            </div>
            <p style={{ fontSize: 16, color: palette.gray, fontWeight: 700 }}>
              Let's try again in {countdown}...
            </p>
          </div>
        )}

        {/* ═══ FEELING ═══ */}
        {phase === "feeling" && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>{tex.emoji}</div>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: palette.dark, margin: "0 0 8px" }}>
              You explored {tex.name}!
            </h2>
            <p style={{ fontSize: 20, fontWeight: 700, color: palette.gray, margin: "0 0 28px" }}>
              How does touching it make YOU feel?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {FEELING_OPTIONS.map((opt) => (
                <button key={opt.id} onClick={() => handleFeeling(opt.id)}
                  style={{
                    width: "100%", padding: "20px 24px", borderRadius: 20,
                    border: `3px solid ${opt.border}`, background: opt.bg,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
                    fontFamily: "'Nunito', sans-serif",
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}>
                  <span style={{ fontSize: 40, flexShrink: 0 }}>{opt.icon}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: opt.color }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ DONE ═══ */}
        {phase === "done" && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: 64, marginBottom: 16, animation: "popIn 0.4s ease" }}>
              {FEELING_EMOJI[childFeeling] || "😊"}
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: palette.dark, margin: "0 0 12px" }}>
              Thank you for sharing!
            </h2>
            <p style={{ fontSize: 16, color: palette.gray, fontWeight: 600, margin: "0 0 32px" }}>
              You answered {questionsAnswered} questions about {tex.name}
            </p>
            <button onClick={handleNextTexture} style={{
              width: "100%", padding: "22px 20px", borderRadius: 20, border: "none",
              background: palette.mint, color: palette.white, fontSize: 22, fontWeight: 800,
              cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            }}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              {textureIndex < textures.length - 1 ? "Next Texture →" : "All Done! 🎉"}
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom: break button + progress dots ── */}
      <div style={{ width: "100%", maxWidth: 480, paddingTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {showBreakBtn && (
          <button onClick={handleBreakRequest}
            style={{
              background: "none", border: `2px solid ${palette.purpleLight}`,
              borderRadius: 16, padding: "10px 28px", fontSize: 15, fontWeight: 700,
              color: palette.purple, cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.background = palette.purple;
              e.currentTarget.style.color = palette.white;
            }}
            onTouchEnd={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = palette.purple;
            }}>
            I need a break 💜
          </button>
        )}
        <ProgressDots total={textures.length} currentIndex={textureIndex} activeColor={palette.mint} doneColor={palette.mintLight} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes popIn { 0% { transform: scale(0.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
