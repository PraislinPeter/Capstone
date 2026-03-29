import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { 
  Clock, 
  Circle, 
  TrendingUp, 
  Activity, 
  Video, 
  AlertCircle,
  ArrowLeft
} from 'lucide-react';

// --- Utility: Emotion Styling ---
const EMOTION_MAP = {
  happy: { color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  sad: { color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
  angry: { color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' },
  fear: { color: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-100' },
  surprise: { color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
  neutral: { color: 'bg-slate-400', text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
  disgust: { color: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100' }
};

const getEmotionStyle = (emo) => EMOTION_MAP[emo?.toLowerCase()] || EMOTION_MAP.neutral;

export default function DashboardView() {
  // --- Router Hooks ---
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  // Get patient data from navigation state or fallback
  const patient = location.state?.patient || { id: id, name: "Unknown Patient", external_id: "N/A" };

  // --- Refs ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ws = useRef(null);
  const mediaRecorderRef = useRef(null);
  const intervalRef = useRef(null);
  const timelineEndRef = useRef(null);

  // --- State ---
  const [isRecording, setIsRecording] = useState(false);
  const [sessionTime, setSessionTime] = useState("00:00");
  const [timeline, setTimeline] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const [currentMetrics, setCurrentMetrics] = useState({
    emotion: "Ready", 
    scores: { happy: 0, neutral: 0, sad: 0, angry: 0, fear: 0, surprise: 0 }, 
  });

  // Auto-scroll timeline
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCleanup();
  }, []);

  const startSession = async () => {
    setTimeline([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, // Force resolution for easier backend processing
        audio: true 
      });
      
      if (videoRef.current) videoRef.current.srcObject = stream;

      // 1. Initialize WebSocket
      ws.current = new WebSocket(`ws://localhost:8000/ws/stream/${patient.id}`);
      
      ws.current.onopen = () => {
        setIsConnected(true);
        startMediaProcessing(stream); // Only start sending data once WS is open
      };

      ws.current.onclose = () => setIsConnected(false);

      ws.current.onmessage = (event) => {
        const response = JSON.parse(event.data);
        
        if (response.status === "finished") { 
          stopCleanup(); 
          return; 
        }
        
        setSessionTime(response.timestamp);

        setCurrentMetrics({
          emotion: response.emotion, 
          scores: response.scores || {},
        });

        setTimeline(prev => {
          const lastEntry = prev[prev.length - 1];
          // Only add to timeline if emotion changes OR it's been a while (deduplication handled by backend too)
          if (!lastEntry || lastEntry.emotion !== response.emotion) {
            return [...prev, { time: response.timestamp, emotion: response.emotion }];
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
    // 2. Setup Audio Recording (Event Driven - Sends immediately)
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.readAsDataURL(e.data);
        reader.onloadend = () => { 
          // Send Audio Packet
          ws.current.send(JSON.stringify({ audio: reader.result })); 
        };
      }
    };
    // Slice audio every 250ms for the backend buffer
    mediaRecorder.start(250); 

    // 3. Setup Video Processing (Interval Driven)
    intervalRef.current = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN && videoRef.current && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        
        // Send Video Packet
        const imageSrc = canvas.toDataURL('image/jpeg', 0.6); // 0.6 Quality is sufficient for AI
        ws.current.send(JSON.stringify({ image: imageSrc }));
      }
    }, 200); // 5 FPS (Backend skips frames, so we don't need to send 30fps)
  };

  const stopSession = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ event: "stop" }));
    } else {
      stopCleanup();
    }
  };

  const stopCleanup = () => {
    setIsRecording(false);
    setIsConnected(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    if (ws.current) {
        ws.current.close();
        ws.current = null;
    }
  };

  const emotionStyles = getEmotionStyle(currentMetrics.emotion);

  // Derived state for UI indicators
  const hasSignal = isRecording && isConnected;

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-medium transition-colors"
        >
          <ArrowLeft size={18} /> Back to Patient List
        </button>
        <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-slate-400">Patient: <span className="text-slate-900">{patient.name}</span></span>
            <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono">{patient.external_id}</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Metrics Column */}
        <div className="col-span-3 space-y-6 flex flex-col">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={14} className="text-indigo-500" /> Elapsed Time
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-black text-slate-800 tabular-nums">{sessionTime}</span>
              <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-black uppercase ${hasSignal ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                <Circle size={8} fill="currentColor" /> {hasSignal ? 'Live' : 'Ready'}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex-1 flex flex-col min-h-0">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-indigo-500" /> Dominant Affect
            </h3>
            
            <div className={`mb-8 p-6 rounded-2xl text-center border transition-all duration-500 shadow-sm ${emotionStyles.bg} ${emotionStyles.border}`}>
              <h4 className={`text-4xl font-black capitalize ${emotionStyles.text}`}>
                {currentMetrics.emotion}
              </h4>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(currentMetrics.scores).sort((a,b) => b[1]-a[1]).map(([emo, score]) => (
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

        {/* Video Feed Column */}
        <div className="col-span-6 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-3xl border-4 border-white shadow-2xl overflow-hidden flex flex-col relative aspect-video group">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} width="640" height="480" className="hidden" />
            
            {!isRecording ? (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center text-white p-12 text-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/50">
                    <Video size={40} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Ready to Start Session?</h2>
                <p className="text-slate-400 text-sm mb-8 max-w-xs">Analysis will begin immediately. Video and audio are encrypted.</p>
                <button onClick={startSession} className="bg-white text-indigo-600 hover:bg-indigo-50 font-black px-10 py-4 rounded-2xl transition-all active:scale-95 shadow-xl">
                  START CLINICAL ANALYSIS
                </button>
              </div>
            ) : (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 transition-opacity">
                <button onClick={stopSession} className="bg-rose-600 hover:bg-rose-700 text-white font-black px-12 py-4 rounded-2xl shadow-2xl flex items-center gap-3 active:scale-95 transition-all">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse" /> END SESSION
                </button>
              </div>
            )}
          </div>

          <div className="bg-indigo-900 text-indigo-100 p-4 rounded-2xl flex items-center gap-4 border border-indigo-800/50">
            <div className={`p-2 rounded-lg ${hasSignal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                <Activity size={20} />
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-60">Neural Engine Status</p>
                <p className="text-sm font-medium">
                    {hasSignal ? "Live Stream Optimized" : "Offline"} 
                    <span className="mx-2 opacity-30">|</span> 
                    {hasSignal ? "Acoustic & Visual Fusion Active" : "Waiting..."}
                </p>
            </div>
          </div>
        </div>

        {/* Timeline Column */}
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
                    <span className="text-[9px] font-black font-mono text-slate-400 uppercase">{entry.time}</span>
                  </div>
                  <p className={`text-sm font-bold capitalize ${style.text}`}>{entry.emotion}</p>
                </div>
              );
            })}
            <div ref={timelineEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}