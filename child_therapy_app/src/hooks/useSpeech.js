import { useCallback } from "react";

/**
 * useSpeech — silent stub.
 * CompanionBot still shows text in speech bubbles, just no audio.
 * To enable TTS later, replace with the Web Speech API version.
 */
export default function useSpeech() {
  const speak = useCallback((text, onEnd) => {
    if (onEnd) onEnd();
  }, []);

  const stop = useCallback(() => {}, []);

  return { speak, stop };
}
