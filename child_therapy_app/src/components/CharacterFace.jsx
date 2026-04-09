import React from "react";
import palette from "../constants/palette";

/**
 * CharacterFace — cartoon child character whose expression changes
 * based on the current emotion being practiced.
 *
 * Props:
 *   emotionId – one of "happy" | "sad" | "angry" | "surprised"
 */
export default function CharacterFace({ emotionId }) {
  return (
    <svg width="180" height="260" viewBox="0 0 180 260">
      {/* Hair */}
      <ellipse cx="90" cy="72" rx="50" ry="25" fill="#8D6E63" />

      {/* Face */}
      <circle cx="90" cy="100" r="48" fill="#FFDAB9" />

      {/* Cheeks */}
      <circle cx="62" cy="108" r="8" fill="#FFCDD2" opacity="0.5" />
      <circle cx="118" cy="108" r="8" fill="#FFCDD2" opacity="0.5" />

      {/* Eyes */}
      {emotionId === "happy" || emotionId === "surprised" ? (
        <>
          <circle cx="74" cy="95" r="5" fill={palette.dark} />
          <circle cx="106" cy="95" r="5" fill={palette.dark} />
          <circle cx="76" cy="93" r="1.5" fill={palette.white} />
          <circle cx="108" cy="93" r="1.5" fill={palette.white} />
        </>
      ) : (
        <>
          <ellipse cx="74" cy="95" rx="5" ry="4" fill={palette.dark} />
          <ellipse cx="106" cy="95" rx="5" ry="4" fill={palette.dark} />
        </>
      )}

      {/* Eyebrows — angry */}
      {emotionId === "angry" && (
        <>
          <line x1="64" y1="82" x2="82" y2="86" stroke={palette.dark} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="116" y1="82" x2="98" y2="86" stroke={palette.dark} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {/* Eyebrows + tear — sad */}
      {emotionId === "sad" && (
        <>
          <line x1="64" y1="86" x2="82" y2="82" stroke={palette.dark} strokeWidth="2" strokeLinecap="round" />
          <line x1="116" y1="86" x2="98" y2="82" stroke={palette.dark} strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="116" cy="108" rx="3" ry="5" fill="#90CAF9" opacity="0.8" />
        </>
      )}

      {/* Mouth — happy */}
      {emotionId === "happy" && (
        <path d="M72 115 Q90 135 108 115" fill="none" stroke="#E91E63" strokeWidth="3" strokeLinecap="round" />
      )}
      {/* Mouth — sad */}
      {emotionId === "sad" && (
        <path d="M75 122 Q90 112 105 122" fill="none" stroke={palette.dark} strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* Mouth — angry */}
      {emotionId === "angry" && (
        <line x1="75" y1="120" x2="105" y2="120" stroke={palette.dark} strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* Mouth — surprised */}
      {emotionId === "surprised" && (
        <ellipse cx="90" cy="120" rx="10" ry="12" fill="none" stroke={palette.dark} strokeWidth="2.5" />
      )}

      {/* Body */}
      <rect x="60" y="152" width="60" height="80" rx="12" fill={palette.mintLight} />

      {/* Arms */}
      <rect x="36" y="158" width="22" height="8" rx="4" fill="#FFDAB9" />
      <rect x="122" y="158" width="22" height="8" rx="4" fill="#FFDAB9" />
    </svg>
  );
}
