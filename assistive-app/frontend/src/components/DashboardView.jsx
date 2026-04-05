import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  Clock,
  Circle,
  TrendingUp,
  Activity,
  Video,
  AlertCircle,
  ArrowLeft,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Plus,
} from 'lucide-react';

// --- Utility: Emotion Styling ---
const EMOTION_MAP = {
  happy:    { color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  sad:      { color: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-100' },
  angry:    { color: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-100' },
  fear:     { color: 'bg-purple-500',  text: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-100' },
  surprise: { color: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100' },
  neutral:  { color: 'bg-slate-400',   text: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-100' },
  disgust:  { color: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-100' }
};

const getEmotionStyle = (emo) => EMOTION_MAP[emo?.toLowerCase()] || EMOTION_MAP.neutral;

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CHANGE 1: IMAGE QUALITY ANALYZER                                    ║
// ║  Checks brightness/contrast of each frame before sending.            ║
// ║  Warns the user if lighting is bad (which kills accuracy).           ║
// ╚══════════════════════════════════════════════════════════════════════╝
function analyzeFrameQuality(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  let totalBrightness = 0;
  let pixelCount = 0;
  const brightnessValues = [];

  // Sample every 16th pixel for speed
  for (let i = 0; i < data.length; i += 64) { // 4 channels * 16 skip
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b); // Perceived luminance
    totalBrightness += brightness;
    brightnessValues.push(brightness);
    pixelCount++;
  }

  const avgBrightness = totalBrightness / pixelCount;

  // Contrast: standard deviation of brightness
  const variance = brightnessValues.reduce((sum, val) => sum + (val - avgBrightness) ** 2, 0) / pixelCount;
  const contrast = Math.sqrt(variance);

  return {
    brightness: avgBrightness,       // 0-255, ideal: 80-180
    contrast,                        // 0-128, ideal: > 40
    isTooLight: avgBrightness > 200,
    isTooDark: avgBrightness < 50,
    isLowContrast: contrast < 30,
    quality: avgBrightness > 50 && avgBrightness < 200 && contrast > 30 ? 'good' : 'poor'
  };
}

export default function DashboardView() {
  // --- Router ---
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const patient = location.state?.patient || { id, name: "Unknown Patient", external_id: "N/A" };

  // --- Refs ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ws = useRef(null);
  const mediaRecorderRef = useRef(null);
  const intervalRef = useRef(null);
  const timelineEndRef = useRef(null);
  const streamRef = useRef(null);

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║  CHANGE 2: SEND QUEUE + BACKPRESSURE                              ║
  // ║  If the WebSocket can't keep up (slow network), we drop frames     ║
  // ║  instead of queueing stale data. Stale frames = wrong emotions.    ║
  // ╚════════════════════════════════════════════════════════════════════╝
  const pendingRef = useRef(0); // Track how many messages are in-flight

  // --- State ---
  const [isRecording, setIsRecording] = useState(false);
  const [sessionTime, setSessionTime] = useState("00:00");
  const [timeline, setTimeline] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [frameQuality, setFrameQuality] = useState('good');
  const [qualityDetails, setQualityDetails] = useState(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [emotionHistory, setEmotionHistory] = useState([]);
  const [liveSessionId, setLiveSessionId] = useState(null);
  const [noteText, setNoteText] = useState('');

  const [currentMetrics, setCurrentMetrics] = useState({
    emotion: "Ready",
    scores: { happy: 0, neutral: 0, sad: 0, angry: 0, fear: 0, surprise: 0, disgust: 0 },
  });

  // Auto-scroll timeline
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCleanup();
  }, []);

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║  CHANGE 3: HIGHER-RES CAPTURE + CAMERA CONSTRAINTS                ║
  // ║  We capture at native resolution and downscale on the canvas.      ║
  // ║  Also request specific camera settings for better face detection.  ║
  // ╚════════════════════════════════════════════════════════════════════╝
  const startSession = async () => {
    setTimeline([]);
    setEmotionHistory([]);
    setFrameQuality('good');
    setQualityDetails(null);
    setIsBuffering(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },       // Capture higher, downscale for sending
          height: { ideal: 720 },
          frameRate: { ideal: 15 },      // Don't need 30fps for emotion detection
          facingMode: 'user',
          // These are hints — browsers may ignore them, but when supported they help
          ...(navigator.mediaDevices.getSupportedConstraints?.().autoGainControl && {
            autoGainControl: true
          }),
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,        // Cleaner audio → better audio emotion
          autoGainControl: true,
          sampleRate: { ideal: 16000 },  // Match backend's expected rate
        }
      });

      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      ws.current = new WebSocket(`ws://localhost:8000/ws/stream/${patient.id}`);

      ws.current.onopen = () => {
        setIsConnected(true);
        pendingRef.current = 0;
        startMediaProcessing(stream);
      };

      ws.current.onclose = () => setIsConnected(false);

      ws.current.onmessage = (event) => {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        setIsBuffering(pendingRef.current > 2);
        const response = JSON.parse(event.data);

        if (response.status === "session_started") {
          setLiveSessionId(response.session_db_id);
          return;
        }

        if (response.status === "finished") {
          stopCleanup();
          return;
        }

        setSessionTime(response.timestamp);

        const scores = response.scores || {};
        const confidence = scores[response.emotion] ?? 0;

        setCurrentMetrics({ emotion: response.emotion, scores, confidence });

        setEmotionHistory(prev => {
          const next = [...prev, response.emotion];
          return next.slice(-12); // keep last 12 for the trend strip
        });

        setTimeline(prev => {
          const lastEntry = prev[prev.length - 1];
          if (!lastEntry || lastEntry.emotion !== response.emotion) {
            return [...prev, { time: response.timestamp, emotion: response.emotion, confidence }];
          }
          return prev;
        });
      };

      setIsRecording(true);
    } catch (err) {
      console.error(err);
      alert("Camera/Mic access denied. Please allow permissions.");
    }
  };

  const startMediaProcessing = (stream) => {
    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  CHANGE 4: AUDIO CHUNK SIZE = 500ms                             ║
    // ║  250ms chunks are too small for emotion classification.          ║
    // ║  500ms gives the backend enough context per chunk while          ║
    // ║  still being responsive. The backend accumulates 3s anyway.     ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.readAsDataURL(e.data);
        reader.onloadend = () => { 
          ws.current.send(JSON.stringify({ audio: reader.result })); 
        };
      }
    };
    mediaRecorder.start(500); // Was 250ms — 500ms gives better audio chunks

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  CHANGE 5: ADAPTIVE FRAME SENDING WITH BACKPRESSURE             ║
    // ║  - Send at ~5 FPS (200ms interval)                              ║
    // ║  - Skip sending if >2 messages are pending (backpressure)       ║
    // ║  - Check frame quality every 30 frames                          ║
    // ║  - Send at higher JPEG quality (0.75 instead of 0.6) so the    ║
    // ║    face detection model gets cleaner input                      ║
    // ╚══════════════════════════════════════════════════════════════════╝
    let frameCounter = 0;

    intervalRef.current = setInterval(() => {
      if (ws.current?.readyState !== WebSocket.OPEN || !videoRef.current || !canvasRef.current) return;
      
      // BACKPRESSURE: If too many messages in flight, skip this frame.
      // Sending stale/queued frames makes predictions lag behind reality.
      if (pendingRef.current > 2) {
        setIsBuffering(true);
        return;
      }
      setIsBuffering(false);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      // Quality check every ~30 frames (~6 seconds)
      frameCounter++;
      if (frameCounter % 30 === 0) {
        const quality = analyzeFrameQuality(canvas);
        setFrameQuality(quality.quality);
        setQualityDetails(quality);
      }

      // Higher JPEG quality = better face features for the model
      const imageSrc = canvas.toDataURL('image/jpeg', 0.75);
      ws.current.send(JSON.stringify({ image: imageSrc }));
      pendingRef.current++;

    }, 200);
  };

  const stopSession = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ event: "stop" }));
    } else {
      stopCleanup();
    }
  };

  const handleAddLiveNote = () => {
    if (!noteText.trim() || !liveSessionId) return;
    const [m, s] = sessionTime.split(':').map(Number);
    const seconds = m * 60 + (s || 0);
    fetch(`http://localhost:8000/sessions/${liveSessionId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds, timestamp_str: sessionTime, note_text: noteText.trim() }),
    }).catch(() => {});
    setNoteText('');
  };

  const stopCleanup = () => {
    setIsRecording(false);
    setIsConnected(false);
    setLiveSessionId(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  };

  const emotionStyles = getEmotionStyle(currentMetrics.emotion);
  const hasSignal = isRecording && isConnected;
  const confidencePct = Math.round((currentMetrics.confidence ?? 0) * 100);

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-medium transition-colors"
        >
          <ArrowLeft size={18} /> Back to Patient List
        </button>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-slate-400">
            Patient: <span className="text-slate-900">{patient.name}</span>
          </span>
          <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono">
            {patient.external_id}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* ───── Metrics Column ───── */}
        <div className="col-span-3 space-y-6 flex flex-col">
          {/* Timer */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={14} className="text-indigo-500" /> Elapsed Time
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-black text-slate-800 tabular-nums">{sessionTime}</span>
              <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                hasSignal 
                  ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' 
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}>
                <Circle size={8} fill="currentColor" /> {hasSignal ? 'Live' : 'Ready'}
              </div>
            </div>
          </div>

          {/* Dominant Affect + Scores */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex-1 flex flex-col min-h-0">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-indigo-500" /> Dominant Affect
            </h3>
            
            <div className={`mb-4 p-6 rounded-2xl text-center border transition-all duration-500 shadow-sm ${emotionStyles.bg} ${emotionStyles.border}`}>
              <h4 className={`text-4xl font-black capitalize ${emotionStyles.text}`}>
                {currentMetrics.emotion}
              </h4>
              {hasSignal && (
                <p className={`text-xs font-bold mt-2 opacity-60 ${emotionStyles.text}`}>
                  {confidencePct}% confidence
                </p>
              )}
            </div>

            {/* Emotion trend strip — last 12 detections */}
            {emotionHistory.length > 0 && (
              <div className="mb-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recent trend</p>
                <div className="flex gap-1 flex-wrap">
                  {emotionHistory.map((emo, i) => (
                    <div
                      key={i}
                      title={emo}
                      className={`w-5 h-5 rounded-full transition-all duration-300 ${getEmotionStyle(emo).color}`}
                      style={{ opacity: 0.4 + (i / emotionHistory.length) * 0.6 }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(currentMetrics.scores)
                .sort((a, b) => b[1] - a[1])
                .map(([emo, score]) => (
                  <div key={emo}>
                    <div className="flex justify-between text-[10px] font-bold mb-1.5 capitalize text-slate-500">
                      <span>{emo}</span>
                      <span>{(score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-700 ease-out ${getEmotionStyle(emo).color}`} 
                        style={{ width: `${score * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* ───── Video Column ───── */}
        <div className="col-span-6 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-3xl border-4 border-white shadow-2xl overflow-hidden flex flex-col relative aspect-video group">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} width="640" height="480" className="hidden" />
            
            {/* ╔════════════════════════════════════════════════════════════╗
                ║  CHANGE 6: LIGHTING QUALITY INDICATOR                      ║
                ║  Shows a warning overlay when frame quality is poor.       ║
                ║  Bad lighting is the #1 cause of wrong predictions.        ║
                ╚════════════════════════════════════════════════════════════╝ */}
            {isRecording && frameQuality === 'poor' && (
              <div className="absolute top-4 left-4 right-4 bg-amber-500/90 backdrop-blur-sm text-white text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-3 z-10 shadow-lg">
                {qualityDetails?.isTooDark ? <Moon size={16} /> : <Sun size={16} />}
                <div>
                  <p className="text-sm">
                    {qualityDetails?.isTooDark && "Low light detected — accuracy reduced"}
                    {qualityDetails?.isTooLight && "Overexposed — move away from light source"}
                    {qualityDetails?.isLowContrast && !qualityDetails?.isTooDark && !qualityDetails?.isTooLight && "Low contrast — adjust lighting"}
                  </p>
                  <p className="opacity-70 mt-0.5">Improve lighting for better emotion detection</p>
                </div>
              </div>
            )}

            {!isRecording ? (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center text-white p-12 text-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/50">
                  <Video size={40} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Ready to Start Session?</h2>
                <p className="text-slate-400 text-sm mb-8 max-w-xs">
                  Analysis will begin immediately. Video and audio are encrypted.
                </p>
                <button 
                  onClick={startSession} 
                  className="bg-white text-indigo-600 hover:bg-indigo-50 font-black px-10 py-4 rounded-2xl transition-all active:scale-95 shadow-xl"
                >
                  START CLINICAL ANALYSIS
                </button>
              </div>
            ) : (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 transition-opacity">
                <button 
                  onClick={stopSession} 
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black px-12 py-4 rounded-2xl shadow-2xl flex items-center gap-3 active:scale-95 transition-all"
                >
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse" /> END SESSION
                </button>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="bg-indigo-900 text-indigo-100 p-4 rounded-2xl flex items-center gap-4 border border-indigo-800/50">
            <div className={`p-2 rounded-lg ${hasSignal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
              <Activity size={20} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-wider opacity-60">Neural Engine Status</p>
              <p className="text-sm font-medium">
                {hasSignal ? "Live Stream Optimized" : "Offline"} 
                <span className="mx-2 opacity-30">|</span> 
                {hasSignal ? "Acoustic & Visual Fusion Active" : "Waiting..."}
              </p>
            </div>
            {/* ╔════════════════════════════════════════════════════╗
                ║  CHANGE 7: SIGNAL QUALITY INDICATORS               ║
                ║  Visual feedback for connection + frame quality     ║
                ╚════════════════════════════════════════════════════╝ */}
            {hasSignal && (
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${
                  frameQuality === 'good' 
                    ? 'bg-emerald-500/20 text-emerald-300' 
                    : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {frameQuality === 'good' ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {frameQuality === 'good' ? 'Clear' : 'Noisy'}
                </div>
                <div className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${
                  isBuffering
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {isBuffering ? 'Buffering' : 'Realtime'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ───── Timeline Column ───── */}
        <div className="col-span-3 flex flex-col h-full bg-white rounded-2xl border border-slate-200 p-5 shadow-sm min-h-0">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 shrink-0">
            <Activity size={14} className="text-indigo-500" /> Chronological Log
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {timeline.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 opacity-40">
                <AlertCircle size={32} />
                <p className="text-xs font-bold">No events logged yet</p>
              </div>
            )}
            {timeline.map((entry, i) => {
              const style = getEmotionStyle(entry.emotion);
              return (
                <div key={i} className={`p-3 rounded-xl border-l-4 transition-all ${style.bg} ${style.border} border-l-current`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-black font-mono text-slate-400 uppercase">
                      {entry.time}
                    </span>
                    {entry.confidence != null && (
                      <span className={`text-[9px] font-bold ${style.text} opacity-60`}>
                        {Math.round(entry.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-bold capitalize ${style.text}`}>{entry.emotion}</p>
                </div>
              );
            })}
            <div ref={timelineEndRef} />
          </div>

          {/* Live note input — only visible during active session */}
          {isRecording && liveSessionId && (
            <div className="shrink-0 pt-3 mt-2 border-t border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Note at {sessionTime}
              </p>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddLiveNote(); }}
                placeholder="Clinical observation..."
                rows={2}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <button
                onClick={handleAddLiveNote}
                disabled={!noteText.trim()}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
              >
                <Plus size={11} /> Add at {sessionTime}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
