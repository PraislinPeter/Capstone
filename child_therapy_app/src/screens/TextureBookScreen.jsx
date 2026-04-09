import React, { useState, useEffect } from "react";
import palette from "../constants/palette";
import TEXTURES from "../constants/textures";
import HardwareAPI from "../api/hardware";
import BackButton from "../components/BackButton";
import ProgressDots from "../components/ProgressDots";
import CompanionBot from "../components/CompanionBot";

/**
 * TextureBookScreen — Phase 1 with integrated companion chatbot.
 *
 * Flow per texture:
 *   1. Bot narrates: "This is felt. It feels soft and warm..."
 *   2. Child touches the physical texture (or taps card)
 *   3. Touch detected → Bot asks: "How does this make you feel?"
 *   4. Child taps an emoji option (😊 Happy / 😢 Sad / 😌 Calm)
 *   5. Bot gives praise → Next texture
 */

const FEELING_OPTIONS = [
  { id: "happy", label: "Happy", icon: "😊" },
  { id: "sad", label: "Sad", icon: "😢" },
  { id: "calm", label: "Calm", icon: "😌" },
];

export default function TextureBookScreen({ onNavigate, onLogEvent, onActivityComplete }) {
  const [textureIndex, setTextureIndex] = useState(0);
  const [touchState, setTouchState] = useState("idle"); // idle | detecting | detected | asking | responded
  const [botMessage, setBotMessage] = useState("");
  const [botMood, setBotMood] = useState("neutral");
  const [botOptions, setBotOptions] = useState(null);
  const [childFeeling, setChildFeeling] = useState(null);

  const tex = TEXTURES[textureIndex];

  // On new texture, bot narrates the introduction
  useEffect(() => {
    const narration = tex.chatbot?.narration || `This is ${tex.name}. Go ahead and touch it!`;
    setBotMessage(narration);
    setBotMood("neutral");
    setBotOptions(null);
    setChildFeeling(null);
  }, [textureIndex, tex]);

  const handleStartTouch = async () => {
    setTouchState("detecting");
    setBotMessage("I can see you're exploring... take your time!");
    setBotMood("encouraging");
    setBotOptions(null);
    HardwareAPI.logEvent("texture_touch_start", { texture: tex.id });

    const result = await HardwareAPI.simulateTouch();
    if (result.detected) {
      setTouchState("detected");

      // Log the touch event
      HardwareAPI.logGameEvent("texture", {
        texture_id: tex.id,
        duration_ms: 2000,
      });
      if (onLogEvent) onLogEvent("texture", { texture: tex.id });

      // After a brief pause, bot asks how they feel
      setTimeout(() => {
        setTouchState("asking");
        const question = tex.chatbot?.question || "How does this make you feel?";
        setBotMessage(question);
        setBotMood("thinking");
        setBotOptions(FEELING_OPTIONS);
      }, 1200);
    }
  };

  const handleFeelingSelect = (feelingId) => {
    setChildFeeling(feelingId);
    setTouchState("responded");
    setBotOptions(null);

    // Log the feeling response
    HardwareAPI.logGameEvent("texture_feeling", {
      texture_id: tex.id,
      feeling: feelingId,
    });

    // Bot gives praise
    const praise = tex.chatbot?.praise || "Great job showing me how you feel!";
    setBotMessage(praise);
    setBotMood("celebrating");
  };

  const handleNextTexture = () => {
    if (textureIndex < TEXTURES.length - 1) {
      setTextureIndex((i) => i + 1);
      setTouchState("idle");
    } else {
      if (onActivityComplete) onActivityComplete();
      else onNavigate("home");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif",
      padding: "32px 32px 140px", display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ width: "100%", maxWidth: 540 }}>
        <BackButton onClick={() => onNavigate("home")} />
      </div>

      <div style={{ maxWidth: 540, margin: "24px auto 0", textAlign: "center", width: "100%" }}>
        <p style={{ fontSize: 14, color: palette.gray, margin: "0 0 6px", fontWeight: 700 }}>
          Texture {textureIndex + 1} of {TEXTURES.length}
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: palette.dark, margin: "0 0 8px" }}>
          Touch the {tex.name}
        </h1>
        <p style={{ fontSize: 16, color: palette.gray, margin: "0 0 6px", fontWeight: 600 }}>
          Find the {tex.name.toLowerCase()} page in your texture book and touch it!
        </p>
        <p style={{ fontSize: 13, color: palette.gray, margin: "0 0 24px", fontStyle: "italic" }}>
          {tex.sensoryCategory}
        </p>

        {/* Texture card */}
        <div
          onClick={touchState === "idle" ? handleStartTouch : undefined}
          style={{
            width: "100%", maxWidth: 400, height: 280, borderRadius: 28,
            background: touchState === "responded"
              ? palette.dark
              : `linear-gradient(145deg, ${tex.color}, ${tex.color}CC)`,
            margin: "0 auto", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12,
            cursor: touchState === "idle" ? "pointer" : "default",
            boxShadow: `0 12px 40px ${tex.color}50`,
            transition: "all 0.5s ease", position: "relative", overflow: "hidden",
          }}
        >
          {touchState === "idle" && (
            <>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "10px 24px", backdropFilter: "blur(8px)" }}>
                <span style={{ color: palette.white, fontSize: 15, fontWeight: 600 }}>Tap here or touch the book</span>
              </div>
              <span style={{ fontSize: 48 }}>{tex.emoji}</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: palette.white }}>{tex.name}</span>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{tex.description}</span>
            </>
          )}

          {touchState === "detecting" && (
            <>
              <div style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.3)", borderTopColor: palette.white, animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 24, fontWeight: 800, color: palette.white }}>{tex.name}</span>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>Detecting touch...</span>
            </>
          )}

          {(touchState === "detected" || touchState === "asking") && (
            <div style={{ background: palette.white, borderRadius: 20, padding: "18px 36px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: palette.dark }}>Touch Detected! ✨</span>
            </div>
          )}

          {touchState === "responded" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {childFeeling === "happy" ? "😊" : childFeeling === "sad" ? "😢" : "😌"}
              </div>
              <div style={{ background: palette.white, borderRadius: 20, padding: "14px 28px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: palette.dark }}>
                  You feel {childFeeling}! Great sharing! ✨
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Next button */}
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {touchState === "responded" && (
            <button
              onClick={handleNextTexture}
              style={{
                background: palette.mint, color: palette.white, border: "none", borderRadius: 28,
                padding: "14px 40px", fontSize: 20, fontWeight: 800, cursor: "pointer",
                fontFamily: "'Nunito', sans-serif", boxShadow: "0 4px 16px rgba(126,206,193,0.4)",
                transition: "transform 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {textureIndex < TEXTURES.length - 1 ? "Next Texture →" : "All Done! 🎉"}
            </button>
          )}
          <ProgressDots total={TEXTURES.length} currentIndex={textureIndex} activeColor={palette.mint} doneColor={palette.mintLight} />
        </div>
      </div>

      {/* Companion Bot — fixed at bottom */}
      <CompanionBot
        message={botMessage}
        options={botOptions}
        onSelect={handleFeelingSelect}
        mood={botMood}
        autoSpeak={true}
        visible={true}
        position="bottom"
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
