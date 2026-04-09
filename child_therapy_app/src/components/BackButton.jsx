import React from "react";
import palette from "../constants/palette";

/**
 * BackButton — rounded pill navigation button.
 *
 * Props:
 *   onClick  – handler when clicked
 *   label    – button text (default "Back")
 *   color    – background color (default mint)
 */
export default function BackButton({ onClick, label = "Back", color = palette.mint }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: color,
        color: palette.white,
        border: "none",
        borderRadius: 28,
        padding: "12px 28px",
        fontSize: 18,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "'Nunito', sans-serif",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
      }}
    >
      <span style={{ fontSize: 20 }}>←</span> {label}
    </button>
  );
}
