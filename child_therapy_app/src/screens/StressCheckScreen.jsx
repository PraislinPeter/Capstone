import React from "react";
import palette from "../constants/palette";
import BackButton from "../components/BackButton";

/**
 * StressCheckScreen — contextual check-in.
 *
 * Props:
 *   reason — "struggling" (auto-triggered after 3 wrong) | "check-in" (after activity) | null (manual)
 *   onNavigate(screenName)
 *   onBreakComplete() — returns child to home after break
 */

const MESSAGES = {
  struggling: {
    title: "Let's take a little break",
    subtitle: "That was tricky! It's totally okay — let's relax for a moment before we try again.",
    emoji: "🫂",
    btnLabel: "Let's Breathe Together",
  },
  "check-in": {
    title: "Great job finishing!",
    subtitle: "You worked so hard! Would you like a little break before doing more?",
    emoji: "🌟",
    btnLabel: "Take a Relaxing Break",
  },
  default: {
    title: "Are you feeling stressed?",
    subtitle: "It's okay to take a break whenever you need one.",
    emoji: "💜",
    btnLabel: "Take a Break",
  },
};

export default function StressCheckScreen({ onNavigate, reason, onBreakComplete }) {
  const msg = MESSAGES[reason] || MESSAGES.default;

  return (
    <div style={{
      minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif",
      padding: 32, display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ width: "100%", maxWidth: 540 }}>
        <BackButton onClick={() => onNavigate("home")} label="Back to Menu" color={palette.purple} />
      </div>

      <div style={{ maxWidth: 440, margin: "48px auto 0", textAlign: "center", animation: "fadeIn 0.5s ease" }}>
        {/* Animated emoji */}
        <div style={{
          margin: "0 auto 28px", width: 120, height: 120, borderRadius: "50%",
          background: `linear-gradient(135deg, ${palette.pinkLight}, ${palette.purpleLight})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 52, animation: "float 3s ease-in-out infinite",
          boxShadow: "0 12px 40px rgba(179,157,219,0.25)",
        }}>
          {msg.emoji}
        </div>

        <h1 style={{ fontSize: 34, fontWeight: 900, color: palette.dark, margin: "0 0 12px" }}>
          {msg.title}
        </h1>
        <p style={{ fontSize: 18, color: palette.gray, fontWeight: 600, margin: "0 0 40px", lineHeight: 1.6 }}>
          {msg.subtitle}
        </p>

        {/* Primary action — go to breathing exercise */}
        <button
          onClick={() => onNavigate("breathe")}
          style={{
            background: palette.mint, color: palette.white, border: "none", borderRadius: 28,
            padding: "18px 56px", fontSize: 22, fontWeight: 800, cursor: "pointer",
            fontFamily: "'Nunito', sans-serif",
            boxShadow: "0 8px 28px rgba(126,206,193,0.35)",
            transition: "transform 0.2s, box-shadow 0.2s",
            display: "block", margin: "0 auto 20px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-3px) scale(1.03)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}
        >
          {msg.btnLabel}
        </button>

        {/* Secondary — skip break */}
        <button
          onClick={() => {
            if (onBreakComplete) onBreakComplete();
            else onNavigate("home");
          }}
          style={{
            background: "transparent", color: palette.gray, border: `2px solid ${palette.gray}40`,
            borderRadius: 28, padding: "14px 40px", fontSize: 18, fontWeight: 700,
            cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = palette.coral;
            e.currentTarget.style.color = palette.coral;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = `${palette.gray}40`;
            e.currentTarget.style.color = palette.gray;
          }}
        >
          I'm okay, keep going!
        </button>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
