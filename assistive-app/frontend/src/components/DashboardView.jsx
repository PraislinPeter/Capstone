import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams, BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  Clock,
  Circle,
  TrendingUp,
  Activity,
  Video,
  AlertCircle,
  ArrowLeft,
  Plus,
  BrainCircuit, 
  UserPlus, 
  Users, 
  LogOut,
  Radio
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

export default function DashboardView() {
  // --- Router ---
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const patient = location.state?.patient || { id, name: "Unknown Patient", external_id: "N/A" };

  // --- Refs ---
  const ws = useRef(null);
  const timelineEndRef = useRef(null);

  // --- State ---
  const [sessionStatus, setSessionStatus] = useState("idle"); // idle, waiting, live, ended
  const [sessionTime, setSessionTime] = useState("00:00");
  const [timeline, setTimeline] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [liveImage, setLiveImage] = useState(null);
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

  const joinSession = () => {
    setTimeline([]);
    setEmotionHistory([]);
    setSessionStatus("waiting");
    setLiveImage(null);

    // Connect as THERAPIST
    ws.current = new WebSocket(`ws://localhost:8000/ws/stream/${patient.id}/therapist`);

    ws.current.onopen = () => {
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      setSessionStatus("ended");
    };

    ws.current.onmessage = (event) => {
      const response = JSON.parse(event.data);

      if (response.event === "session_started") {
        setLiveSessionId(response.session_db_id);
        setSessionStatus("live");
        return;
      }

      if (response.event === "session_ended" || response.event === "stream_disconnected") {
        setSessionStatus("ended");
        setLiveImage(null);
        return;
      }

      if (response.event === "live_stream") {
        setSessionStatus("live");
        if (response.image) setLiveImage(response.image);
        if (response.timestamp) setSessionTime(response.timestamp);

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
      }
    };
  };

  const stopCleanup = () => {
    setSessionStatus("idle");
    setIsConnected(false);
    setLiveImage(null);
    setLiveSessionId(null);
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
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

  const emotionStyles = getEmotionStyle(currentMetrics.emotion);
  const hasSignal = sessionStatus === "live";
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
            Monitoring Patient: <span className="text-slate-900">{patient.name}</span>
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
              <Clock size={14} className="text-indigo-500" /> Session Time
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-black text-slate-800 tabular-nums">{sessionTime}</span>
              <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                hasSignal 
                  ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' 
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}>
                <Circle size={8} fill="currentColor" /> {hasSignal ? 'Live' : 'Standby'}
              </div>
            </div>
          </div>

          {/* Dominant Affect + Scores */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex-1 flex flex-col min-h-0">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-indigo-500" /> Patient Affect
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

            {/* Emotion trend strip */}
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
            
            {/* LIVE IMAGE RECEIVED FROM WEBSOCKET */}
            {liveImage && (
              <img 
                src={liveImage} 
                alt="Patient Stream" 
                className="w-full h-full object-cover" 
                style={{ transform: "scaleX(-1)" }} 
              />
            )}

            {sessionStatus === "idle" && (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center text-white p-12 text-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/50">
                  <Video size={40} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Ready to Monitor?</h2>
                <p className="text-slate-400 text-sm mb-8 max-w-xs">
                  Connect to the stream to receive real-time emotional analysis from the patient's device.
                </p>
                <button 
                  onClick={joinSession} 
                  className="bg-white text-indigo-600 hover:bg-indigo-50 font-black px-10 py-4 rounded-2xl transition-all active:scale-95 shadow-xl"
                >
                  JOIN SESSION
                </button>
              </div>
            )}

            {sessionStatus === "waiting" && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-white text-center">
                <Radio size={48} className="text-indigo-500 animate-pulse mb-4" />
                <h2 className="text-xl font-bold mb-2">Waiting for Patient...</h2>
                <p className="text-slate-400 text-sm">
                  Connected to server. The stream will begin automatically when the patient starts the session.
                </p>
                <button 
                  onClick={stopCleanup}
                  className="mt-6 text-sm text-slate-400 hover:text-white underline"
                >
                  Cancel Connection
                </button>
              </div>
            )}

            {sessionStatus === "ended" && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-white text-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <Video size={32} className="text-slate-500" />
                </div>
                <h2 className="text-xl font-bold mb-2">Session Ended</h2>
                <p className="text-slate-400 text-sm mb-6">The patient has disconnected from the stream.</p>
                <button 
                  onClick={stopCleanup} 
                  className="bg-white text-slate-900 font-bold px-6 py-2 rounded-xl"
                >
                  Close Viewer
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
              <p className="text-xs font-bold uppercase tracking-wider opacity-60">Connection Status</p>
              <p className="text-sm font-medium">
                {hasSignal ? "Receiving Live Patient Feed" : sessionStatus === "waiting" ? "Awaiting Data Transfer..." : "Offline"} 
              </p>
            </div>
          </div>
        </div>

        {/* ───── Timeline Column ───── */}
        <div className="col-span-3 flex flex-col h-full bg-white rounded-2xl border border-slate-200 p-5 shadow-sm min-h-0">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 shrink-0">
            <Activity size={14} className="text-indigo-500" /> Clinical Log
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {timeline.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 opacity-40">
                <AlertCircle size={32} />
                <p className="text-xs font-bold">Waiting for events...</p>
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
          {hasSignal && liveSessionId && (
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

// ==========================================
// Main App Component & Layout
// ==========================================

export function App() {
  return (
    <BrowserRouter>
      {/* h-screen ensures the app takes the full window height */}
      <div className="flex h-screen bg-[#F8FAFC] text-slate-900 overflow-hidden w-full">
        <Sidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden w-full min-w-0">
          <Header />
          
          <div className="flex-1 overflow-y-auto p-6 w-full h-full">
            <Routes>
              {/* <Route path="/" element={<PatientList />} /> */}
              {/* <Route path="/register" element={<PatientRegistration />} /> */}
              {/* <Route path="/edit/:id" element={<PatientEdit />} /> */}
              <Route path="/dashboard/:id" element={<DashboardView />} />
              {/* <Route path="/history/:id" element={<HistoryView />} /> */}
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-200`}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
      >
        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
          <BrainCircuit size={20} />
        </div>
        {!collapsed && (
          <h1 className="font-bold text-base leading-tight whitespace-nowrap">
            Clinician<span className="text-indigo-600">.AI</span>
          </h1>
        )}
      </button>

      <nav className="flex-1 px-2 space-y-1 mt-2">
        <NavItem
          icon={<Users size={20} />}
          label="All Patients"
          active={location.pathname === '/'}
          onClick={() => navigate('/')}
          collapsed={collapsed}
        />
        <NavItem
          icon={<UserPlus size={20} />}
          label="New Registration"
          active={location.pathname === '/register'}
          onClick={() => navigate('/register')}
          collapsed={collapsed}
        />
      </nav>

      <div className="p-2 border-t border-slate-100">
        <button className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all ${collapsed ? 'justify-center' : ''}`}>
          <LogOut size={16} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

function Header() {
  const location = useLocation();
  let path = location.pathname.split('/')[1];
  if (!path) path = 'Patients';
  
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 w-full">
      <h2 className="font-semibold text-slate-800 capitalize">
        {path.replace('-', ' ')}
      </h2>
    </header>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${collapsed ? 'justify-center' : ''} ${active ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
    >
      {icon}
      {!collapsed && <span className="text-sm">{label}</span>}
    </button>
  );
}