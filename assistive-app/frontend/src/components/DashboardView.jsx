import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  Clock,
  Circle,
  TrendingUp,
  Activity,
  Video,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import GameMetricsPanel from "./GameMetricsPanel";

const EMOTION_MAP = {
  happy: { color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
  sad: { color: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" },
  angry: { color: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-100" },
  fear: { color: "bg-purple-500", text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-100" },
  surprise: { color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
  neutral: { color: "bg-slate-400", text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-100" },
  disgust: { color: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-100" },
};

const getEmotionStyle = (emo) => EMOTION_MAP[emo?.toLowerCase()] || EMOTION_MAP.neutral;

export default function DashboardView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const patient = location.state?.patient || { id, name: "Unknown Patient", external_id: "N/A" };

  const timelineEndRef = useRef(null);
  const pollRef = useRef(null);
  const sessionUuidRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [sessionTime, setSessionTime] = useState("00:00");
  const [timeline, setTimeline] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState({
    emotion: "Ready",
    scores: {
      happy: 0,
      neutral: 0,
      sad: 0,
      angry: 0,
      fear: 0,
      surprise: 0,
      disgust: 0,
    },
  });

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  useEffect(() => {
    return () => stopCleanup();
  }, []);

  const pollLiveState = async () => {
  if (!sessionUuidRef.current) return;

  try {
    const res = await fetch(`http://127.0.0.1:8000/sessions/${sessionUuidRef.current}/live`);
    const data = await res.json();

    if (!res.ok) return;

    console.log("THERAPIST POLL SESSION UUID:", sessionUuidRef.current);
    console.log("LIVE STATE:", data);

    if (data.status === "finished") {
      setSessionTime(data.timestamp || "00:00");
      setIsConnected(false);
      setIsRecording(false);
      return;
    }

    setIsConnected(data.status === "processing");
    setSessionTime(data.timestamp || "00:00");

    setCurrentMetrics({
      emotion: data.emotion || "neutral",
      scores: {
        happy: 0,
        neutral: 0,
        sad: 0,
        angry: 0,
        fear: 0,
        surprise: 0,
        disgust: 0,
        ...(data.scores || {}),
      },
    });

    if (data.emotion && data.timestamp && data.status === "processing") {
      setTimeline((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.emotion !== data.emotion || last.time !== data.timestamp) {
          return [...prev, { time: data.timestamp, emotion: data.emotion }];
        }
        return prev;
      });
    }
  } catch (err) {
    console.error("[THERAPIST] Poll failed:", err);
    setIsConnected(false);
  }
};

  const startSession = async () => {
    try {
      setTimeline([]);

      const res = await fetch("http://127.0.0.1:8000/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Failed to start session");
        return;
      }

      sessionUuidRef.current = data.session_uuid;
      console.log("THERAPIST START SESSION UUID:", data.session_uuid);
      setIsRecording(true);
      setIsConnected(true);

      await pollLiveState();

      pollRef.current = setInterval(() => {
        pollLiveState();
      }, 1000);
    } catch (err) {
      console.error(err);
      alert("Failed to connect to child session");
    }
  };

  const stopSession = async () => {
    try {
      if (sessionUuidRef.current) {
        await fetch(`http://127.0.0.1:8000/sessions/${sessionUuidRef.current}/end`, {
          method: "POST",
        });
      }
    } catch (err) {
      console.error("[THERAPIST] Failed to end session:", err);
    }

    stopCleanup();
  };

  const stopCleanup = () => {
    setIsRecording(false);
    setIsConnected(false);

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const emotionStyles = getEmotionStyle(currentMetrics.emotion);
  const hasSignal = isRecording && isConnected;

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
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

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Clock size={12} className="text-indigo-500" /> Elapsed Time
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-slate-800 tabular-nums">{sessionTime}</span>
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-black uppercase ${
                hasSignal
                  ? "bg-rose-50 text-rose-600 border border-rose-100 animate-pulse"
                  : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              <Circle size={7} fill="currentColor" /> {hasSignal ? "Live" : "Ready"}
            </div>
          </div>
        </div>

        <div className="col-span-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <TrendingUp size={12} className="text-indigo-500" /> Dominant Affect
          </h3>
          <div className={`p-3 rounded-xl text-center border transition-all ${emotionStyles.bg} ${emotionStyles.border}`}>
            <h4 className={`text-xl font-black capitalize ${emotionStyles.text}`}>
              {currentMetrics.emotion}
            </h4>
          </div>
        </div>

        <div className="col-span-6 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Activity size={12} className="text-indigo-500" /> Emotion Breakdown
          </h3>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            {Object.entries(currentMetrics.scores)
              .sort((a, b) => b[1] - a[1])
              .map(([emo, score]) => (
                <div key={emo}>
                  <div className="flex justify-between text-[9px] font-bold mb-0.5 capitalize text-slate-500">
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

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 flex flex-col gap-3">
          <div
            className="bg-slate-900 rounded-2xl border-2 border-slate-700 shadow-xl overflow-hidden relative"
            style={{ aspectRatio: "16/9" }}
          >
            {!isRecording ? (
              <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-md flex flex-col items-center justify-center text-white text-center p-8">
                <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/40">
                  <Video size={28} />
                </div>
                <h2 className="text-lg font-bold mb-1">Child Emotion Analysis</h2>
                <p className="text-slate-400 text-xs mb-2 max-w-sm">
                  Connected to the child-side camera pipeline. Live emotion results are displayed here.
                </p>
                <p className="text-slate-500 text-[10px] mb-5 max-w-xs">
                  This dashboard is now a viewer only. The child device is the source.
                </p>
                <button
                  onClick={startSession}
                  className="bg-white text-indigo-600 hover:bg-indigo-50 font-black px-8 py-3 rounded-xl transition-all active:scale-95 shadow-lg text-sm"
                >
                  START EMOTION ANALYSIS
                </button>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-8">
                <div className="text-6xl mb-4">📡</div>
                <h3 className="text-xl font-bold mb-2">Live Child Session Connected</h3>
                <p className="text-slate-300 text-sm mb-6">
                  Waiting for live updates from the child device stream.
                </p>
                <button
                  onClick={stopSession}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black px-8 py-3 rounded-xl shadow-lg flex items-center gap-2 active:scale-95 text-sm"
                >
                  <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" /> END SESSION
                </button>
              </div>
            )}
          </div>

          <div className="bg-indigo-900 text-indigo-100 p-3 rounded-xl flex items-center gap-3 border border-indigo-800/50">
            <div className={`p-1.5 rounded-lg ${hasSignal ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
              <Activity size={16} />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider opacity-60">Child Emotion Engine</p>
              <p className="text-xs font-medium">
                {hasSignal ? "Receiving Live Child Emotion Data" : "Waiting for Connection"}
                <span className="mx-1.5 opacity-30">|</span>
                {hasSignal ? "Viewer Mode Active" : "Start session to begin"}
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col" style={{ maxHeight: 380 }}>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 shrink-0">
            <Activity size={12} className="text-indigo-500" /> Chronological Log
          </h3>
          <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
            {timeline.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-40">
                <AlertCircle size={24} />
                <p className="text-[10px] font-bold mt-2">No events logged yet</p>
              </div>
            )}
            {timeline.map((entry, i) => {
              const st = getEmotionStyle(entry.emotion);
              return (
                <div key={i} className={`p-2.5 rounded-lg border-l-4 ${st.bg} ${st.border}`}>
                  <span className="text-[8px] font-black font-mono text-slate-400 uppercase">
                    {entry.time}
                  </span>
                  <p className={`text-xs font-bold capitalize ${st.text}`}>{entry.emotion}</p>
                </div>
              );
            })}
            <div ref={timelineEndRef} />
          </div>
        </div>
      </div>

      <GameMetricsPanel patientId={patient.id} isActive={true} />
    </div>
  );
}