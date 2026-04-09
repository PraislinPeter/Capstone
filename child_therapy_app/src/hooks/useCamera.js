import { useRef, useCallback, useEffect } from "react";

/**
 * useCamera — captures webcam frames for emotion detection.
 *
 * FIX: Creates a hidden <video> element programmatically.
 * The old version returned a videoRef that was never attached to any DOM element,
 * so captureFrame() always returned null (video was null).
 *
 * Now the hook creates its own hidden video + canvas internally.
 * No DOM rendering needed from the parent component.
 */
export default function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const start = useCallback(async () => {
    try {
      // ███ FIX: Create hidden video element if it doesn't exist ███
      if (!videoRef.current) {
        const video = document.createElement("video");
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.style.position = "fixed";
        video.style.top = "-9999px";
        video.style.left = "-9999px";
        video.style.width = "1px";
        video.style.height = "1px";
        video.style.opacity = "0";
        video.style.pointerEvents = "none";
        document.body.appendChild(video);
        videoRef.current = video;
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      // Wait for video to be ready
      await new Promise((resolve) => {
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(resolve).catch(resolve);
        };
        // Timeout fallback
        setTimeout(resolve, 3000);
      });

      console.log("[CAM] ✅ Camera started, video dimensions:",
        videoRef.current.videoWidth, "x", videoRef.current.videoHeight);

    } catch (err) {
      console.warn("[CAM] Camera not available:", err.message);
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Clean up hidden video element
    if (videoRef.current && videoRef.current.parentNode) {
      videoRef.current.srcObject = null;
      videoRef.current.parentNode.removeChild(videoRef.current);
      videoRef.current = null;
    }
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return null;
    if (!video.videoWidth || !video.videoHeight) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.6);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    videoRef,
    start,
    stop,
    captureFrame,
    isActive: !!streamRef.current,
  };
}
