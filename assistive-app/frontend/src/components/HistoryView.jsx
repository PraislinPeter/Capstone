import { useEffect, useRef, useState } from 'react';
import {
  Play, Clock, Calendar, ChevronRight, Film,
  BarChart3, ArrowLeft, Download, TrendingUp, ListVideo,
  FileText, MessageSquare, Plus, Trash2, AlertTriangle, CheckCircle
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  PieChart, Pie, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';

const EMOTION_MAP = {
  happy:    { color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-100', hex: '#10b981' },
  sad:      { color: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-100',    hex: '#3b82f6' },
  angry:    { color: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',     border: 'border-rose-100',    hex: '#f43f5e' },
  fear:     { color: 'bg-purple-500',  text: 'text-purple-700',  bg: 'bg-purple-50',   border: 'border-purple-100',  hex: '#a855f7' },
  surprise: { color: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-100',   hex: '#f59e0b' },
  neutral:  { color: 'bg-slate-400',   text: 'text-slate-700',   bg: 'bg-slate-50',    border: 'border-slate-100',   hex: '#94a3b8' },
  disgust:  { color: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-100',  hex: '#f97316' },
};

const EMOTIONS = ['happy', 'neutral', 'sad', 'angry', 'fear', 'surprise', 'disgust'];

const getEmotionStyle = (emo) => EMOTION_MAP[emo?.toLowerCase()] || EMOTION_MAP.neutral;
const getHex = (emo) => (EMOTION_MAP[emo?.toLowerCase()] || EMOTION_MAP.neutral).hex;

function parseSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + (parts[1] || 0);
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Session List Panel ──────────────────────────────────────────────────────
function SessionList({ sessions, selectedSession, onSelect }) {
  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
          <Film size={15} className="text-indigo-500" /> Sessions
        </h3>
        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
          {sessions.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Calendar size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">No sessions recorded yet.</p>
          </div>
        ) : (
          sessions.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className={`w-full text-left p-4 border-b border-slate-50 transition-all hover:bg-slate-50 ${
                selectedSession?.id === s.id ? 'bg-indigo-50 border-r-4 border-r-indigo-500' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-xs text-slate-800 leading-snug">{s.date}</span>
                <ChevronRight size={12} className={selectedSession?.id === s.id ? 'text-indigo-500' : 'text-slate-300'} />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1"><Clock size={9} /> {s.duration}</span>
                <span className="flex items-center gap-1"><BarChart3 size={9} /> {s.timeline?.length || 0}</span>
              </div>
              {s.timeline?.length > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {s.timeline.slice(0, 20).map((e, i) => (
                    <div key={i} className={`flex-1 ${getEmotionStyle(e.emotion).color}`} />
                  ))}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Video Panel ─────────────────────────────────────────────────────────────
function VideoPanel({ session, videoRef, onTimeUpdate }) {
  const [currentEmotion, setCurrentEmotion] = useState(null);

  // Reset overlay when session changes
  useEffect(() => { setCurrentEmotion(null); }, [session?.id]);

  const handleTimeUpdate = (e) => {
    const t = e.target.currentTime;
    onTimeUpdate?.(t);
    const tl = session?.timeline || [];
    let emo = null;
    for (let i = tl.length - 1; i >= 0; i--) {
      if (parseSeconds(tl[i].time) <= t) { emo = tl[i].emotion; break; }
    }
    setCurrentEmotion(emo);
  };

  const emotionStyle = getEmotionStyle(currentEmotion);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Video */}
      <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg relative group">
        <video
          key={session.id}
          ref={videoRef}
          controls
          preload="auto"
          className="w-full aspect-video object-contain bg-black"
          src={`http://localhost:8000${session.video_url}`}
          onTimeUpdate={handleTimeUpdate}
        />

        {/* Emotion overlay */}
        {currentEmotion && (
          <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-xl font-bold text-sm capitalize shadow-lg pointer-events-none ${emotionStyle.bg} ${emotionStyle.text}`}>
            {currentEmotion}
          </div>
        )}

        <a
          href={`http://localhost:8000${session.video_url}`}
          download
          className="absolute top-3 right-3 p-2 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Download size={15} />
        </a>
      </div>

      {/* Session metadata */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm grid grid-cols-3 gap-4 shrink-0">
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Date</p>
          <p className="text-xs font-bold text-slate-700">{session.date}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Duration</p>
          <p className="text-xs font-bold text-slate-700 font-mono">{session.duration}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Events</p>
          <p className="text-xs font-bold text-slate-700">{session.timeline?.length || 0} shifts</p>
        </div>
      </div>
    </div>
  );
}

// ── Notes Tab ───────────────────────────────────────────────────────────────
function NotesTab({ currentVideoSecs, onSeek, notes, onAddNote, onDeleteNote }) {
  const [noteText, setNoteText] = useState('');

  const handleAdd = () => {
    if (!noteText.trim()) return;
    onAddNote(noteText.trim());
    setNoteText('');
  };

  return (
    <div className="space-y-3">
      {/* Input area */}
      <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
        <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-2">
          Add note at {formatTime(currentVideoSecs)}
        </p>
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Type clinical observation..."
          rows={2}
          className="w-full text-xs p-2 rounded-lg border border-indigo-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd(); }}
        />
        <button
          onClick={handleAdd}
          disabled={!noteText.trim()}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
        >
          <Plus size={12} /> Add at {formatTime(currentVideoSecs)}
        </button>
      </div>

      {/* Notes list */}
      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-6">No notes yet. Play the video and add observations.</p>
        ) : (
          notes.map(note => (
            <div key={note.id} className="flex gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <button
                onClick={() => onSeek(note.timestamp_str)}
                className="shrink-0 px-2 py-0.5 bg-indigo-100 text-indigo-600 font-mono text-[10px] font-bold rounded hover:bg-indigo-200 transition-colors self-start mt-0.5"
              >
                {note.timestamp_str}
              </button>
              <p className="flex-1 text-xs text-slate-700 leading-relaxed">{note.note_text}</p>
              <button
                onClick={() => onDeleteNote(note.id)}
                className="shrink-0 text-slate-300 hover:text-rose-400 transition-colors self-start mt-0.5"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Analysis Panel ──────────────────────────────────────────────────────────
function AnalysisPanel({ session, sessions, onSeek, currentVideoSecs, trendInsights, notes, onAddNote, onDeleteNote }) {
  const [tab, setTab] = useState('distribution');
  const { timeline, duration } = session;

  const totalSecs = parseSeconds(duration) || parseSeconds(timeline?.[timeline.length - 1]?.time) + 5;

  // Time-weighted emotion totals
  const timeTotals = {};
  (timeline || []).forEach((entry, i) => {
    const start = parseSeconds(entry.time);
    const end = i < timeline.length - 1 ? parseSeconds(timeline[i + 1].time) : totalSecs;
    const dur = Math.max(0, end - start);
    const emo = entry.emotion?.toLowerCase() || 'neutral';
    timeTotals[emo] = (timeTotals[emo] || 0) + dur;
  });

  const donutData = Object.entries(timeTotals)
    .filter(([, v]) => v > 0)
    .map(([emo, secs]) => ({
      name: emo,
      value: Math.round((secs / totalSecs) * 100),
      fill: getHex(emo),
    }))
    .sort((a, b) => b.value - a.value);

  const dominant = donutData[0];

  const trendData = sessions.length >= 2
    ? sessions.slice().reverse().map((s) => {
        const counts = {};
        (s.timeline || []).forEach((e) => {
          const emo = e.emotion?.toLowerCase() || 'neutral';
          counts[emo] = (counts[emo] || 0) + 1;
        });
        const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
        const row = { date: s.date?.slice(0, 10) || s.id };
        EMOTIONS.forEach(emo => { row[emo] = Math.round(((counts[emo] || 0) / total) * 100); });
        return row;
      })
    : null;

  // Timeline strip segments
  const segments = (timeline || []).map((entry, i) => {
    const start = parseSeconds(entry.time);
    const end = i < timeline.length - 1 ? parseSeconds(timeline[i + 1].time) : totalSecs;
    return { ...entry, width: ((end - start) / totalSecs) * 100 };
  });

  const tabs = [
    { id: 'distribution', label: 'Distribution', icon: <BarChart3 size={12} /> },
    { id: 'notes',        label: 'Notes',         icon: <MessageSquare size={12} /> },
    { id: 'log',          label: 'Event Log',     icon: <ListVideo size={12} /> },
    ...(trendData ? [{ id: 'trend', label: 'Trend', icon: <TrendingUp size={12} /> }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Timeline strip — always visible at top */}
      <div className="p-4 border-b border-slate-100 shrink-0">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Session Timeline</p>
        <div className="flex w-full h-5 rounded-lg overflow-hidden border border-slate-100 cursor-pointer">
          {segments.map((seg, i) => (
            <div
              key={i}
              title={`${seg.time} — ${seg.emotion}`}
              onClick={() => onSeek(seg.time)}
              className={`h-full hover:opacity-75 transition-opacity ${getEmotionStyle(seg.emotion).color}`}
              style={{ width: `${seg.width}%`, minWidth: '2px' }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1">
          <span>0:00</span>
          <span>{duration}</span>
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-2">
          {Object.entries(EMOTION_MAP).map(([emo, s]) => (
            <div key={emo} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${s.color}`} />
              <span className="text-[9px] capitalize text-slate-400">{emo}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              tab === t.id
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">

        {tab === 'distribution' && (
          <>
            {dominant && (
              <div className={`px-3 py-2 rounded-xl text-[11px] font-bold ${getEmotionStyle(dominant.name).bg} ${getEmotionStyle(dominant.name).text}`}>
                Dominant: <span className="capitalize">{dominant.name}</span> — {dominant.value}% of session
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="w-32 h-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" innerRadius="50%" outerRadius="78%" paddingAngle={2} startAngle={90} endAngle={-270} />
                    <ReTooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {donutData.map(entry => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                    <span className="text-[11px] capitalize text-slate-600 flex-1">{entry.name}</span>
                    <span className="text-[11px] font-bold text-slate-700 tabular-nums">{entry.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'notes' && (
          <NotesTab
            sessionDbId={session.id}
            currentVideoSecs={currentVideoSecs}
            onSeek={onSeek}
            notes={notes}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
          />
        )}

        {tab === 'log' && (
          <div className="space-y-2">
            {timeline?.length > 0 ? timeline.map((event, idx) => {
              const style = getEmotionStyle(event.emotion);
              return (
                <button
                  key={idx}
                  onClick={() => onSeek(event.time)}
                  className="group flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 w-full hover:bg-white hover:shadow-sm hover:border-indigo-100 transition-all text-left"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.bg} ${style.text}`}>
                    <Play size={12} fill="currentColor" />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-indigo-500">{event.time}</span>
                  <div className={`ml-auto px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${style.bg} ${style.text} ${style.border} border`}>
                    {event.emotion}
                  </div>
                </button>
              );
            }) : (
              <p className="text-center text-slate-400 text-sm py-8">No events logged.</p>
            )}
          </div>
        )}

        {tab === 'trend' && trendData && (
          <>
            {trendInsights?.length > 0 && (
              <div className="space-y-2 mb-4">
                {trendInsights.map((insight, i) => (
                  <div key={i} className={`flex items-start gap-2 p-3 rounded-xl text-xs font-medium ${
                    insight.type === 'warning'
                      ? 'bg-amber-50 border border-amber-100 text-amber-800'
                      : 'bg-emerald-50 border border-emerald-100 text-emerald-800'
                  }`}>
                    {insight.type === 'warning'
                      ? <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      : <CheckCircle size={14} className="shrink-0 mt-0.5" />}
                    {insight.message}
                  </div>
                ))}
              </div>
            )}
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData} barSize={12} margin={{ top: 0, right: 0, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                <ReTooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 9, paddingTop: 6 }} />
                {EMOTIONS.map(emo => <Bar key={emo} dataKey={emo} stackId="a" fill={getHex(emo)} />)}
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-slate-400">Each bar = 100% of detected states for that session.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function HistoryView({ patient: propPatient }) {
  const navigate = useNavigate();
  const location = useLocation();
  const patient = location.state?.patient || propPatient;

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [currentVideoSecs, setCurrentVideoSecs] = useState(0);
  const [trendInsights, setTrendInsights] = useState([]);
  const [notes, setNotes] = useState([]);
  const videoPlayerRef = useRef(null);

  useEffect(() => {
    if (!patient?.id) return;
    Promise.all([
      fetch(`http://localhost:8000/history/${patient.id}`).then(r => r.json()),
      fetch(`http://localhost:8000/trends/${patient.id}`).then(r => r.json()),
    ]).then(([historyData, trendsData]) => {
      setSessions(historyData);
      if (historyData.length > 0) setSelectedSession(historyData[0]);
      setTrendInsights(trendsData.insights || []);
    }).catch(err => console.error('Failed to load patient data:', err));
  }, [patient?.id]);

  useEffect(() => {
    if (!selectedSession?.id) { setNotes([]); return; }
    fetch(`http://localhost:8000/sessions/${selectedSession.id}/notes`)
      .then(r => r.json())
      .then(setNotes)
      .catch(() => setNotes([]));
    setCurrentVideoSecs(0);
  }, [selectedSession?.id]);

  const handleAddNote = (noteText) => {
    if (!selectedSession?.id) return;
    const timestamp_str = formatTime(currentVideoSecs);
    fetch(`http://localhost:8000/sessions/${selectedSession.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds: Math.floor(currentVideoSecs), timestamp_str, note_text: noteText }),
    })
      .then(r => r.json())
      .then(note => setNotes(prev => [...prev, note].sort((a, b) => a.seconds - b.seconds)))
      .catch(() => {});
  };

  const handleDeleteNote = (noteId) => {
    fetch(`http://localhost:8000/notes/${noteId}`, { method: 'DELETE' })
      .then(() => setNotes(prev => prev.filter(n => n.id !== noteId)))
      .catch(() => {});
  };

  const seekTo = (timeStr) => {
    if (!videoPlayerRef.current || !timeStr) return;
    const secs = parseSeconds(timeStr);
    if (!isNaN(secs)) {
      videoPlayerRef.current.currentTime = secs;
      videoPlayerRef.current.play().catch(() => {});
    }
  };

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full">
        <p className="text-slate-500 mb-4">No patient data found.</p>
        <button onClick={() => navigate('/')} className="text-indigo-600 font-bold flex items-center gap-2">
          <ArrowLeft size={18} /> Return to Patient List
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-medium transition-colors text-sm">
          <ArrowLeft size={16} /> Back to Patients
        </button>
        <div className="flex items-center gap-3">
          {selectedSession && (
            <button
              onClick={async () => {
                const res = await fetch(`http://localhost:8000/report/${selectedSession.id}`);
                const html = await res.text();
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <FileText size={13} /> Generate Report
            </button>
          )}
          <div className="text-right">
            <h2 className="text-lg font-bold text-slate-800">{patient.name}'s Records</h2>
            <p className="text-[11px] text-slate-400 font-mono">ID: {patient.external_id}</p>
          </div>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">

        {/* Col 1 — Session list */}
        <div className="col-span-2 min-h-0">
          <SessionList sessions={sessions} selectedSession={selectedSession} onSelect={setSelectedSession} />
        </div>

        {/* Col 2 — Video + metadata */}
        <div className="col-span-5 min-h-0">
          {selectedSession ? (
            <VideoPanel session={selectedSession} videoRef={videoPlayerRef} onTimeUpdate={setCurrentVideoSecs} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-300 text-center p-10">
              <Film size={36} className="mb-3 opacity-20" />
              <p className="text-sm font-bold text-slate-400">Select a session</p>
            </div>
          )}
        </div>

        {/* Col 3 — Analysis */}
        <div className="col-span-5 min-h-0">
          {selectedSession ? (
            <AnalysisPanel
              session={selectedSession}
              sessions={sessions}
              onSeek={seekTo}
              currentVideoSecs={currentVideoSecs}
              trendInsights={trendInsights}
              notes={notes}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
            />
          ) : (
            <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-300">
              <BarChart3 size={36} className="opacity-20" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
