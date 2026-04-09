import React from "react";
import palette from "../constants/palette";
import RobotMascot from "../components/RobotMascot";

/**
 * HomeScreen — main menu with Texture Book and Learn Emotions cards.
 *
 * Props:
 *   onNavigate(screenName)
 *   completedActivities — { textures: bool, scenarios: bool }
 */
export default function HomeScreen({ onNavigate, completedActivities = {} }) {
  const cardStyle = (gradient, shadow) => ({
    width: 280, height: 220, borderRadius: 28, border: "none",
    background: gradient, cursor: "pointer", display: "flex",
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 12, boxShadow: shadow, transition: "transform 0.2s, box-shadow 0.2s",
    fontFamily: "'Nunito', sans-serif", position: "relative", overflow: "hidden",
  });

  return (
    <div style={{
      minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 32,
    }}>
      {/* Robot mascot */}
      <div style={{ marginBottom: 24, transform: "scale(0.85)" }}>
        <RobotMascot />
      </div>

      <h1 style={{ fontSize: 42, fontWeight: 900, color: palette.dark, margin: "0 0 6px", textAlign: "center" }}>
        Hi there, friend!
      </h1>
      <p style={{ fontSize: 20, color: palette.gray, margin: "0 0 36px", fontWeight: 600, textAlign: "center" }}>
        What would you like to do today?
      </p>

      {/* Activity cards */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Texture Book */}
        <button
          style={cardStyle(
            "linear-gradient(145deg, #7ECEC1, #5BBFB0)",
            "0 8px 32px rgba(126,206,193,0.35)"
          )}
          onClick={() => onNavigate("texture-book")}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-6px) scale(1.02)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}
        >
          {completedActivities.textures && (
            <div style={{
              position: "absolute", top: 12, right: 12,
              background: palette.white, borderRadius: 12, padding: "4px 10px",
              fontSize: 11, fontWeight: 800, color: palette.mint,
            }}>
              ✓ Done
            </div>
          )}
          <span style={{ fontSize: 52 }}>📖</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: palette.white }}>Texture Book</span>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
            Touch and explore
          </span>
        </button>

        {/* Learn Emotions */}
        <button
          style={cardStyle(
            "linear-gradient(145deg, #F4B8C1, #E8929E)",
            "0 8px 32px rgba(244,184,193,0.35)"
          )}
          onClick={() => onNavigate("scenarios")}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-6px) scale(1.02)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}
        >
          {completedActivities.scenarios && (
            <div style={{
              position: "absolute", top: 12, right: 12,
              background: palette.white, borderRadius: 12, padding: "4px 10px",
              fontSize: 11, fontWeight: 800, color: palette.pink,
            }}>
              ✓ Done
            </div>
          )}
          <span style={{ fontSize: 52 }}>🎭</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: palette.white }}>Learn Emotions</span>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
            Stories with Peter & Maria
          </span>
        </button>
      </div>

      {/* Calm-down shortcut */}
      <button
        onClick={() => onNavigate("stress-check")}
        style={{
          marginTop: 28, background: palette.purpleLight, color: palette.purple,
          border: "none", borderRadius: 20, padding: "12px 32px",
          fontSize: 16, fontWeight: 700, cursor: "pointer",
          fontFamily: "'Nunito', sans-serif",
          transition: "transform 0.15s, background 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.04)";
          e.currentTarget.style.background = palette.purple;
          e.currentTarget.style.color = palette.white;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.background = palette.purpleLight;
          e.currentTarget.style.color = palette.purple;
        }}
      >
        Need a break? 💜
      </button>
    </div>
  );
}
