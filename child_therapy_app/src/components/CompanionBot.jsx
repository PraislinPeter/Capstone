import React, { useState, useEffect, useRef } from "react";
import palette from "../constants/palette";
import useSpeech from "../hooks/useSpeech";

/**
 * CompanionBot — scripted chatbot companion for the child.
 *
 * NOT free-form AI. This is a predictable, scripted companion that:
 *   - Speaks text aloud via Web Speech API
 *   - Shows a speech bubble with the current message
 *   - Presents tappable emoji options when asking "How do you feel?"
 *   - Gives positive reinforcement with animated feedback
 *
 * Predictability is therapeutically critical for autistic children.
 * Every interaction follows the same pattern: speak → show options → respond.
 *
 * Props:
 *   message       — text to display in the speech bubble (and speak aloud)
 *   options       — [{ id, label, icon }] tappable choices (or null for no choices)
 *   onSelect      — callback(optionId) when child taps an option
 *   mood          — "neutral" | "happy" | "encouraging" | "calm" — changes bot face
 *   autoSpeak     — if true, speaks the message via TTS on mount/change
 *   visible       — show/hide the bot
 *   position      — "bottom" (default) | "inline" — where to render
 */

const BOT_FACES = {
  neutral: "🤖",
  happy: "😊",
  encouraging: "💪",
  calm: "😌",
  celebrating: "🎉",
  thinking: "🤔",
};

export default function CompanionBot({
  message,
  options = null,
  onSelect,
  mood = "neutral",
  autoSpeak = true,
  visible = true,
  position = "bottom",
}) {
  const { speak, stop } = useSpeech();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showBubble, setShowBubble] = useState(false);
  const prevMessage = useRef("");

  // Animate in when message changes
  useEffect(() => {
    if (message && message !== prevMessage.current) {
      prevMessage.current = message;
      setShowBubble(false);
      setSelectedId(null);

      // Small delay for animation
      const t = setTimeout(() => setShowBubble(true), 100);

      // Speak if enabled
      if (autoSpeak) {
        setIsSpeaking(true);
        speak(message, () => setIsSpeaking(false));
      }

      return () => clearTimeout(t);
    }
  }, [message, autoSpeak, speak]);

  // Cleanup TTS on unmount
  useEffect(() => () => stop(), [stop]);

  const handleOptionTap = (optionId) => {
    setSelectedId(optionId);
    if (onSelect) onSelect(optionId);
  };

  if (!visible || !message) return null;

  const isInline = position === "inline";

  return (
    <div
      style={{
        ...(isInline
          ? { width: "100%", maxWidth: 480, margin: "0 auto" }
          : {
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              width: "90%",
              maxWidth: 480,
            }),
        fontFamily: "'Nunito', sans-serif",
        animation: showBubble ? "botSlideIn 0.4s ease" : "none",
        opacity: showBubble ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      <div
        style={{
          background: palette.white,
          borderRadius: 24,
          padding: "16px 20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          border: `2px solid ${palette.mintLight}`,
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        {/* Bot avatar */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${palette.mintLight}, ${palette.mint})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            flexShrink: 0,
            animation: isSpeaking ? "botPulse 1.5s ease-in-out infinite" : "none",
          }}
        >
          {BOT_FACES[mood] || BOT_FACES.neutral}
        </div>

        {/* Speech content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Message text */}
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: palette.dark,
              margin: "0 0 4px",
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>

          {/* Speaking indicator */}
          {isSpeaking && (
            <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: palette.mint,
                    animation: `botDot 0.8s ease-in-out ${i * 0.15}s infinite`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Tappable options */}
          {options && options.length > 0 && !selectedId && (
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleOptionTap(opt.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 18px",
                    borderRadius: 16,
                    border: `2px solid ${palette.mintLight}`,
                    background: palette.white,
                    cursor: "pointer",
                    fontFamily: "'Nunito', sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    color: palette.dark,
                    transition: "all 0.2s",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = palette.mintLight;
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = palette.white;
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span style={{ fontSize: 22 }}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Selected response confirmation */}
          {selectedId && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 14px",
                background: "#E8F5E9",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                color: "#2E7D32",
                animation: "fadeIn 0.3s ease",
              }}
            >
              Thanks for sharing! ✨
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes botSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes botPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes botDot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
