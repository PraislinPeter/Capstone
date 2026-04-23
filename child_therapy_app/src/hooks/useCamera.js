import { useRef, useCallback, useEffect } from "react";

/**
 * useCamera — captures webcam frames for emotion detection.
 *
 * Creates a hidden <video> element programmatically so parents don't need
 * to attach a ref to any DOM node. Also exposes frame quality analysis
 * (brightness / contrast), ported from the clinician-side dashboard.
 *
 * Returns: { videoRef, start, stop, captureFrame, analyzeQuality, isActive }
 */
export default function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const start = useCallback(async () => {
    try {
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

      await new Promise((resolve) => {
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(resolve).catch(resolve);
        };
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

  /**
   * analyzeQuality — inspects the current camera frame and reports whether
   * the lighting/contrast is good enough for reliable emotion detection.
   *
   * Ported from teammate's DashboardView.jsx (Capstone-main branch), where
   * this ran on the clinician's laptop camera. Here it runs on the child's
   * device — which is actually the right place for it, since that's where
   * the camera input originates.
   *
   * Returns { status, brightness, contrast, details } or null if no frame.
   *   status: 'good' | 'low_light' | 'overexposed' | 'low_contrast'
   *
   * Brightness uses perceived luminance: 0.299*R + 0.587*G + 0.114*B
   * (weighted for how the human eye perceives each channel).
   */
  const analyzeQuality = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    if (!video.videoWidth || !video.videoHeight) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Sample every 10th pixel for speed — still thousands of samples
    let totalBrightness = 0;
    let sampleCount = 0;
    const brightnesses = [];

    for (let i = 0; i < data.length; i += 40) { // 4 bytes/pixel × 10 = 40
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += brightness;
      brightnesses.push(brightness);
      sampleCount++;
    }

    const avgBrightness = totalBrightness / sampleCount;

    // Contrast via standard deviation of brightness
    let variance = 0;
    for (const b of brightnesses) {
      variance += (b - avgBrightness) ** 2;
    }
    const contrast = Math.sqrt(variance / sampleCount);

    // Thresholds (0–255 scale). Tuned for typical indoor webcam use.
    let status = "good";
    let details = null;
    if (avgBrightness < 50) {
      status = "low_light";
      details = "Image too dark — try more lighting";
    } else if (avgBrightness > 210) {
      status = "overexposed";
      details = "Image too bright — try facing away from windows";
    } else if (contrast < 20) {
      status = "low_contrast";
      details = "Image looks washed out — try adjusting lighting";
    }

    return {
      status,
      brightness: Math.round(avgBrightness),
      contrast: Math.round(contrast),
      details,
    };
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    videoRef,
    start,
    stop,
    captureFrame,
    analyzeQuality,
    isActive: !!streamRef.current,
  };
}
