import React from "react";
import palette from "../constants/palette";
import RobotMascot from "../components/RobotMascot";

/**
 * HomeScreen — single activity: Texture Book (Book of Fabrics + Emotions).
 */
export default function HomeScreen({ onNavigate, activityComplete = false }) {
  return (
    <div style={{
      minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 32,
    }}>
      <div style={{ marginBottom: 28, transform: "scale(0.85)" }}>
        <RobotMascot />
      </div>

      <h1 style={{ fontSize: 42, fontWeight: 900, color: palette.dark, margin: "0 0 6px", textAlign: "center" }}>
        Hi there, friend!
      </h1>
      <p style={{ fontSize: 20, color: palette.gray, margin: "0 0 40px", fontWeight: 600, textAlign: "center" }}>
        Let's explore textures and learn together!
      </p>

      {/* Main activity card */}
      <button
        style={{
          width: 320, height: 260, borderRadius: 32, border: "none",
          background: "linear-gradient(145deg, #7ECEC1, #5BBFB0)",
          cursor: "pointer", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14,
          boxShadow: "0 10px 40px rgba(126,206,193,0.35)",
          transition: "transform 0.2s, box-shadow 0.2s",
          fontFamily: "'Nunito', sans-serif", position: "relative", overflow: "hidden",
        }}
        onClick={() => onNavigate("texture-book")}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-6px) scale(1.02)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}
      >
        {activityComplete && (
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: palette.white, borderRadius: 14, padding: "5px 12px",
            fontSize: 12, fontWeight: 800, color: palette.mint,
          }}>
            ✓ Done
          </div>
        )}
        <span style={{ fontSize: 60 }}>📖</span>
        <span style={{ fontSize: 28, fontWeight: 800, color: palette.white }}>Texture Book</span>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: 600, textAlign: "center", padding: "0 20px" }}>
          Touch, explore, and answer questions!
        </span>
      </button>

      {/* Break shortcut */}
      <button
        onClick={() => onNavigate("stress-check")}
        style={{
          marginTop: 28, background: palette.purpleLight, color: palette.purple,
          border: "none", borderRadius: 20, padding: "12px 32px",
          fontSize: 16, fontWeight: 700, cursor: "pointer",
          fontFamily: "'Nunito', sans-serif", transition: "transform 0.15s",
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
