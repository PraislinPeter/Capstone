import React, { useState, useRef, useEffect, useCallback } from "react";
import palette from "../constants/palette";
import BackButton from "../components/BackButton";

/**
 * BreatheScreen — guided breathing with calming ambient sounds.
 *
 * Music uses Web Audio API — no external files needed.
 * Creates a warm ambient drone (C major chord with slow LFO) that
 * fades in when breathing starts and fades out when done.
 */

// ── Ambient Sound Engine ──
function createAmbientSound(audioCtx) {
  const master = audioCtx.createGain();
  master.gain.value = 0;
  master.connect(audioCtx.destination);

  // Warm chord: C3, E3, G3, C4 with gentle detuning
  const frequencies = [130.81, 164.81, 196.00, 261.63];
  const oscillators = frequencies.map((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = Math.random() * 4 - 2; // subtle warmth

    const gain = audioCtx.createGain();
    gain.gain.value = i === 0 ? 0.12 : 0.06; // root note louder

    // Slow tremolo for movement
    const lfo = audioCtx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.15 + i * 0.05;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();

    osc.connect(gain);
    gain.connect(master);
    osc.start();

    return { osc, gain, lfo };
  });

  // Soft rain-like noise
  const bufferSize = audioCtx.sampleRate * 2;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.015;
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 400;
  noise.connect(noiseFilter);
  noiseFilter.connect(master);
  noise.start();

  return {
    fadeIn: (duration = 2) => {
      master.gain.cancelScheduledValues(audioCtx.currentTime);
      master.gain.setValueAtTime(master.gain.value, audioCtx.currentTime);
      master.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + duration);
    },
    fadeOut: (duration = 2) => {
      master.gain.cancelScheduledValues(audioCtx.currentTime);
      master.gain.setValueAtTime(master.gain.value, audioCtx.currentTime);
      master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);
    },
    stop: () => {
      master.gain.cancelScheduledValues(audioCtx.currentTime);
      master.gain.setValueAtTime(0, audioCtx.currentTime);
      oscillators.forEach(({ osc, lfo }) => {
        try { osc.stop(); lfo.stop(); } catch {}
      });
      try { noise.stop(); } catch {}
    },
  };
}

export default function BreatheScreen({ onNavigate, onBreakComplete }) {
  const [breathPhase, setBreathPhase] = useState("idle"); // idle | inhale | exhale | done
  const [breathCount, setBreathCount] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (ambientRef.current) ambientRef.current.stop();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const toggleMusic = useCallback(() => {
    if (!musicOn) {
      // Start ambient sounds
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      ambientRef.current = createAmbientSound(audioCtxRef.current);
      ambientRef.current.fadeIn(2);
      setMusicOn(true);
    } else {
      // Stop
      if (ambientRef.current) {
        ambientRef.current.fadeOut(1.5);
        setTimeout(() => {
          if (ambientRef.current) ambientRef.current.stop();
          if (audioCtxRef.current) audioCtxRef.current.close();
          ambientRef.current = null;
          audioCtxRef.current = null;
        }, 2000);
      }
      setMusicOn(false);
    }
  }, [musicOn]);

  const startBreathing = () => {
    setBreathPhase("inhale");
    setBreathCount(0);

    // Auto-start music if not already playing
    if (!musicOn) toggleMusic();

    let count = 0;
    let phase = "inhale";

    timerRef.current = setInterval(() => {
      phase = phase === "inhale" ? "exhale" : "inhale";
      count++;
      setBreathPhase(phase);
      setBreathCount(count);

      if (count >= 10) {
        clearInterval(timerRef.current);
        setBreathPhase("done");
      }
    }, 3000);
  };

  const handleFinish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ambientRef.current) {
      ambientRef.current.fadeOut(1.5);
      setTimeout(() => {
        if (ambientRef.current) ambientRef.current.stop();
        if (audioCtxRef.current) audioCtxRef.current.close();
      }, 2000);
    }
    if (onBreakComplete) onBreakComplete();
    else onNavigate("home");
  };

  const handleBack = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ambientRef.current) ambientRef.current.stop();
    if (audioCtxRef.current) audioCtxRef.current.close();
    onNavigate("stress-check");
  };

  const isActive = breathPhase === "inhale" || breathPhase === "exhale";
  const isDone = breathPhase === "done";
  const scale = breathPhase === "inhale" ? 1.3 : breathPhase === "exhale" ? 0.85 : 1;

  return (
    <div style={{
      minHeight: "100vh", background: palette.bg, fontFamily: "'Nunito', sans-serif",
      padding: 32, display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ width: "100%", maxWidth: 540 }}>
        <BackButton onClick={handleBack} label="Back" color={palette.purple} />
      </div>

      <div style={{ maxWidth: 520, margin: "20px auto 0", textAlign: "center", width: "100%" }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: palette.mint, margin: "0 0 8px", fontStyle: "italic" }}>
          Breathe with me...
        </h1>
        <p style={{ fontSize: 18, color: palette.gray, fontWeight: 600, margin: "0 0 32px" }}>
          {isDone
            ? "You did amazing! 🌟"
            : isActive
            ? breathPhase === "inhale"
              ? "Breathe in slowly... 🌬️"
              : "And breathe out gently... 💨"
            : "Let's relax together"}
        </p>

        {/* Breathing circle */}
        <div
          style={{
            width: 200, height: 200, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.mintLight}, ${palette.mint})`,
            margin: "0 auto 32px", display: "flex", alignItems: "center", justifyContent: "center",
            transform: `scale(${scale})`,
            transition: "transform 2.8s ease-in-out",
            boxShadow: `0 12px 48px ${palette.mint}50`,
            cursor: !isActive && !isDone ? "pointer" : "default",
          }}
          onClick={!isActive && !isDone ? startBreathing : undefined}
        >
          <svg width="60" height="50" viewBox="0 0 60 50" fill="none">
            <path d="M5 16 H30 Q42 16 38 8 Q34 0 26 6" stroke={palette.white} strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <path d="M5 28 H38 Q52 28 48 20 Q44 12 36 18" stroke={palette.white} strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <path d="M12 40 H34 Q46 40 42 34 Q38 28 30 32" stroke={palette.white} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>

        {/* Breath counter */}
        {isActive && (
          <p style={{ fontSize: 14, color: palette.gray, fontWeight: 700, margin: "0 0 24px" }}>
            Breath {Math.ceil(breathCount / 2) + 1} of 5
          </p>
        )}

        {/* Start button */}
        {!isActive && !isDone && (
          <button
            onClick={startBreathing}
            style={{
              background: palette.mint, color: palette.white, border: "none", borderRadius: 28,
              padding: "16px 48px", fontSize: 20, fontWeight: 800, cursor: "pointer",
              fontFamily: "'Nunito', sans-serif", boxShadow: "0 4px 16px rgba(126,206,193,0.4)",
              marginBottom: 28,
            }}
          >
            Start Breathing
          </button>
        )}

        {/* Calming options — music + deep breaths */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
          {/* Music toggle */}
          <button
            onClick={toggleMusic}
            style={{
              width: 200, padding: "24px 16px", borderRadius: 20,
              background: musicOn ? palette.pinkLight : palette.white,
              boxShadow: "0 4px 16px rgba(0,0,0,0.05)", textAlign: "center",
              border: musicOn ? `2px solid ${palette.pink}` : "2px solid transparent",
              cursor: "pointer", transition: "all 0.3s",
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: "50%", margin: "0 auto 10px",
              background: musicOn ? palette.pink : palette.pinkLight,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              transition: "background 0.3s",
            }}>
              {musicOn ? "🔊" : "🎵"}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: palette.dark, marginBottom: 2 }}>
              {musicOn ? "Music Playing" : "Calming Music"}
            </div>
            <div style={{ fontSize: 13, color: palette.gray, fontWeight: 600 }}>
              {musicOn ? "Tap to stop" : "Tap to listen"}
            </div>
          </button>

          {/* Deep breaths info */}
          <div style={{
            width: 200, padding: "24px 16px", borderRadius: 20,
            background: palette.white, boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
            textAlign: "center", border: "2px solid transparent",
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", margin: "0 auto 10px",
              background: palette.purpleLight, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 22,
            }}>
              💜
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: palette.dark, marginBottom: 2 }}>Deep Breaths</div>
            <div style={{ fontSize: 13, color: palette.gray, fontWeight: 600 }}>Follow the circle above</div>
          </div>
        </div>

        {/* I feel better now */}
        {(isDone || isActive) && (
          <button
            onClick={handleFinish}
            style={{
              background: palette.coral, color: palette.white, border: "none", borderRadius: 28,
              padding: "16px 48px", fontSize: 20, fontWeight: 800, cursor: "pointer",
              fontFamily: "'Nunito', sans-serif", boxShadow: "0 4px 16px rgba(244,151,142,0.4)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            I feel better now 💛
          </button>
        )}
      </div>
    </div>
  );
}
