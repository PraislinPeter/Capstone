import React from "react";

/**
 * SceneIllustration — renders a scenario-specific visual using emoji compositions.
 * Each scenario gets a unique scene that shows what's actually happening in the story.
 */

const SCENES = {
  peter_veggies:  { emoji: "🥦", bg: "#E8F5E9", label: "Peter", secondary: "😣", desc: "doesn't like veggies" },
  peter_birthday: { emoji: "🎂", bg: "#FFF8E1", label: "Peter", secondary: "🎈", desc: "birthday party!" },
  peter_knee:     { emoji: "🩹", bg: "#E3F2FD", label: "Peter", secondary: "😢", desc: "scraped his knee" },
  peter_drawing:  { emoji: "🖍️", bg: "#FFF3E0", label: "Peter", secondary: "🌈", desc: "drew a rainbow" },
  peter_leftout:  { emoji: "🛝", bg: "#F3E5F5", label: "Peter", secondary: "😔", desc: "left out at playground" },
  maria_teddy:    { emoji: "🧸", bg: "#FCE4EC", label: "Maria", secondary: "🤗", desc: "hugs her teddy" },
  maria_meal:     { emoji: "🍝", bg: "#FFF8E1", label: "Maria", secondary: "😋", desc: "favourite meal!" },
  maria_stairs:   { emoji: "🪜", bg: "#E8F5E9", label: "Maria", secondary: "😌", desc: "climbing carefully" },
  maria_dress:    { emoji: "👗", bg: "#FCE4EC", label: "Maria", secondary: "💃", desc: "new pink dress!" },
  maria_shoes:    { emoji: "👟", bg: "#E8EAF6", label: "Maria", secondary: "🎀", desc: "tying her laces" },
};

export default function SceneIllustration({ scenarioId, character, isCorrect }) {
  const scene = SCENES[scenarioId] || { emoji: "📖", bg: "#F5F5F5", label: character || "?", secondary: "❓", desc: "" };
  const isPeter = character === "peter";

  return (
    <div style={{
      width: 200, height: 200, borderRadius: 24, background: scene.bg,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", position: "relative", overflow: "hidden",
      boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
      transition: "all 0.4s ease",
    }}>
      {/* Sparkles on correct */}
      {isCorrect && (
        <>
          <div style={{ position: "absolute", top: 8, right: 14, fontSize: 18, animation: "sparkle 1s ease infinite" }}>✨</div>
          <div style={{ position: "absolute", bottom: 14, left: 12, fontSize: 14, animation: "sparkle 1.3s ease infinite 0.3s" }}>✨</div>
          <div style={{ position: "absolute", top: 14, left: 14, fontSize: 12, animation: "sparkle 1.6s ease infinite 0.6s" }}>⭐</div>
        </>
      )}

      {/* Main scene emoji */}
      <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4, transition: "transform 0.3s", transform: isCorrect ? "scale(1.1)" : "scale(1)" }}>
        {scene.emoji}
      </div>

      {/* Secondary reaction emoji */}
      <div style={{ fontSize: 28, position: "absolute", top: 16, right: 20, opacity: 0.9 }}>
        {scene.secondary}
      </div>

      {/* Character tag */}
      <div style={{
        position: "absolute", bottom: 8,
        background: isPeter ? "#BBDEFB" : "#F8BBD0",
        borderRadius: 10, padding: "3px 12px", fontSize: 11, fontWeight: 800,
        color: "#2D3436", textTransform: "capitalize",
      }}>
        {scene.label}
      </div>

      {/* Scene description */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#666", marginTop: 2,
        textAlign: "center", padding: "0 12px",
      }}>
        {scene.desc}
      </div>

      <style>{`
        @keyframes sparkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
