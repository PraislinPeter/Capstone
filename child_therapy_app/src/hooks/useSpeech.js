import { useCallback, useRef } from "react";

/**
 * useSpeech — text-to-speech hook using Web Speech API.
 *
 * Design choice: Slow rate (0.85) and stable pitch for autistic children
 * per Kurumada et al. (2024) — avoid rapid prosodic shifts.
 */
export default function useSpeech() {
  const utteranceRef = useRef(null);

  const speak = useCallback((text, onEnd) => {
    if (!window.speechSynthesis || !text) {
      if (onEnd) onEnd();
      return;
    }

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.85;   // slower for clarity
    utt.pitch = 1.0;   // neutral, stable pitch
    utt.volume = 1.0;

    // Try to pick a clear English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.name.includes("Female")
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utt.voice = preferred;

    if (onEnd) utt.onend = onEnd;
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return { speak, stop };
}
