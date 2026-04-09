import React from "react";
import palette from "../constants/palette";

/**
 * RobotMascot — the friendly robot character shown on the home screen.
 */
export default function RobotMascot() {
  return (
    <svg width="100" height="120" viewBox="0 0 100 120">
      {/* Antenna */}
      <line x1="50" y1="8" x2="50" y2="24" stroke={palette.mint} strokeWidth="3" />
      <circle cx="50" cy="6" r="5" fill={palette.coral} />
      {/* Head */}
      <rect x="22" y="24" width="56" height="44" rx="16" fill={palette.mintLight} stroke={palette.mint} strokeWidth="2" />
      {/* Eyes */}
      <circle cx="38" cy="44" r="6" fill={palette.dark} />
      <circle cx="62" cy="44" r="6" fill={palette.dark} />
      <circle cx="40" cy="42" r="2" fill={palette.white} />
      <circle cx="64" cy="42" r="2" fill={palette.white} />
      {/* Smile */}
      <path d="M38 55 Q50 64 62 55" fill="none" stroke={palette.coral} strokeWidth="2.5" strokeLinecap="round" />
      {/* Body */}
      <rect x="28" y="72" width="44" height="30" rx="10" fill={palette.mintLight} stroke={palette.mint} strokeWidth="2" />
      <circle cx="50" cy="84" r="5" fill={palette.coral} opacity="0.7" />
      {/* Arms */}
      <rect x="12" y="76" width="14" height="6" rx="3" fill={palette.mint} />
      <rect x="74" y="76" width="14" height="6" rx="3" fill={palette.mint} />
      {/* Hands */}
      <circle cx="12" cy="79" r="4" fill={palette.pinkLight} />
      <circle cx="88" cy="79" r="4" fill={palette.pinkLight} />
    </svg>
  );
}
