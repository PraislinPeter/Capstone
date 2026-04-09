import React from "react";
import palette from "../constants/palette";

/**
 * ProgressDots — shows progress through a list of steps.
 *
 * Props:
 *   total        – total number of steps
 *   currentIndex – which step is active (0-based)
 *   activeColor  – color for the current dot
 *   doneColor    – color for completed dots
 */
export default function ProgressDots({
  total,
  currentIndex,
  activeColor = palette.mint,
  doneColor = palette.mintLight,
}) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: i === currentIndex ? activeColor : i < currentIndex ? doneColor : "#DDD",
            transition: "all 0.3s",
          }}
        />
      ))}
    </div>
  );
}
