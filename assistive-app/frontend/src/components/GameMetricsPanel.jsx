import React, { useEffect, useState } from 'react';
import { BookOpen, Brain, CheckCircle, XCircle, Clock, Hand, RefreshCw, AlertTriangle } from 'lucide-react';

const TEXTURE_META = {
  textured_paper:    { name: "Textured Paper",    emoji: "📄", category: "Neutral" },
  aluminum_foil:     { name: "Aluminum Foil",      emoji: "🪙", category: "High-intensity" },
  felt:              { name: "Felt",               emoji: "🧶", category: "Calming" },
  textured_aluminum: { name: "Textured Aluminum",  emoji: "⚙️",  category: "Medium" },
  sandpaper:         { name: "Sandpaper",          emoji: "🪨", category: "Aversive" },
  cotton_balls:      { name: "Cotton Balls",       emoji: "☁️",  category: "Calming" },
};

const SCENARIO_META = {
  peter_veggies:  { title: "Peter & Veggies",     char: "P" },
  peter_birthday: { title: "Peter's Birthday",    char: "P" },
  peter_knee:     { title: "Peter Scraped Knee",  char: "P" },
  maria_teddy:    { title: "Maria & Teddy Bear",  char: "M" },
  peter_drawing:  { title: "Peter's Drawing",     char: "P" },
  peter_leftout:  { title: "Peter Left Out",      char: "P" },
  maria_meal:     { title: "Maria's Meal",        char: "M" },
  maria_stairs:   { title: "Maria Climbing",      char: "M" },
  maria_dress:    { title: "Maria's Dress",       char: "M" },
  maria_shoes:    { title: "Maria Tying Shoes",   char: "M" },
};

const EMO_ICON = { happy: "😊", sad: "😢", calm: "😌", neutral: "😐" };

export default function GameMetricsPanel({ patientId, isActive = true }) {
  const [textureEvents, setTextureEvents] = useState([]);
  const [scenarioEvents, setScenarioEvents] = useState([]);
  const [polling, setPolling] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  useEffect(() => {
    if (!patientId || !polling) return;

    const fetchEvents = () => {
      fetch(`http://localhost:8000/api/game-events/latest/${patientId}`)
        .then(res => res.json())
        .then(data => {
          if (!Array.isArray(data)) return;
          setTextureEvents(data.filter(e => e.event_type === 'texture' || e.event_type === 'texture_feeling'));
          setScenarioEvents(data.filter(e => e.event_type === 'scenario'));
          setLastFetch(new Date().toLocaleTimeString());
        })
        .catch(() => {});
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, [patientId, polling]);

  const totalTex = Object.keys(TEXTURE_META).length;
  const totalScn = Object.keys(SCENARIO_META).length;
  const touchedCount = new Set(textureEvents.filter(e => e.event_type === 'texture').map(e => e.item_id)).size;

  // Group scenario events by item_id — get the LATEST per scenario (which is the final correct answer if they got it)
  const scenarioByItem = {};
  scenarioEvents.forEach(e => {
    if (!scenarioByItem[e.item_id]) scenarioByItem[e.item_id] = { events: [], latest: e };
    scenarioByItem[e.item_id].events.push(e);
    scenarioByItem[e.item_id].latest = e;
  });

  const completedScenarios = Object.values(scenarioByItem).filter(g => g.latest.correct);
  const correctCount = completedScenarios.length;
  const totalWrongAttempts = scenarioEvents.filter(e => !e.correct).length;
  const attemptedCount = Object.keys(scenarioByItem).length;
  const hasAnyData = touchedCount > 0 || scenarioEvents.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Brain size={14} className="text-indigo-500" /> Child game progress
        </h3>
        <div className="flex items-center gap-3">
          {lastFetch && <span className="text-[9px] text-slate-400 font-mono">Updated {lastFetch}</span>}
          <button
            onClick={() => setPolling(p => !p)}
            className={`text-[9px] font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors ${
              polling ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'
            }`}
          >
            <RefreshCw size={10} className={polling ? 'animate-spin' : ''} style={polling ? {animationDuration: '3s'} : {}} />
            {polling ? 'Live' : 'Paused'}
          </button>
        </div>
      </div>

      {!hasAnyData && (
        <div className="text-center py-8 text-slate-400">
          <Hand size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs font-bold">Waiting for child to start playing...</p>
          <p className="text-[10px] mt-1">Game events will appear here in real time</p>
        </div>
      )}

      {hasAnyData && (
        <div className="grid grid-cols-2 gap-6">
          {/* ── Texture book ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                <Hand size={14} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">Texture book</p>
                <p className="text-[10px] text-slate-400">{touchedCount} / {totalTex} explored</p>
              </div>
              <div className="ml-auto">
                <svg width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#10B981" strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(touchedCount / totalTex) * 94.2} 94.2`}
                    transform="rotate(-90 18 18)"
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                  />
                  <text x="18" y="19" textAnchor="middle" dominantBaseline="central" style={{ fontSize: '9px', fontWeight: 900 }} fill="#475569">
                    {touchedCount}/{totalTex}
                  </text>
                </svg>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TEXTURE_META).map(([id, meta]) => {
                const ev = textureEvents.find(e => e.item_id === id && e.event_type === 'texture');
                const done = !!ev;
                return (
                  <div key={id} className={`rounded-xl p-2.5 text-center border transition-all ${
                    done ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 opacity-40'
                  }`}>
                    <span className="text-lg block mb-1">{meta.emoji}</span>
                    <p className={`text-[10px] font-bold ${done ? 'text-emerald-700' : 'text-slate-400'}`}>{meta.name}</p>
                    {done && ev.duration_ms ? (
                      <p className="text-[9px] text-emerald-500 font-mono mt-0.5 flex items-center justify-center gap-0.5">
                        <Clock size={8} /> {(ev.duration_ms / 1000).toFixed(1)}s
                      </p>
                    ) : !done ? (
                      <p className="text-[9px] text-slate-300 mt-0.5">Waiting</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Scenarios ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
                <BookOpen size={14} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">Emotion stories</p>
                <p className="text-[10px] text-slate-400">
                  {correctCount} correct · {attemptedCount} / {totalScn} attempted
                </p>
              </div>
              <div className="ml-auto">
                <svg width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#7C3AED" strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(correctCount / totalScn) * 94.2} 94.2`}
                    transform="rotate(-90 18 18)"
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                  />
                  <text x="18" y="19" textAnchor="middle" dominantBaseline="central" style={{ fontSize: '9px', fontWeight: 900 }} fill="#475569">
                    {correctCount}/{totalScn}
                  </text>
                </svg>
              </div>
            </div>

            {/* Wrong attempt summary */}
            {totalWrongAttempts > 0 && (
              <div className="flex items-center gap-2 mb-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                <AlertTriangle size={12} className="text-amber-500" />
                <span className="text-[10px] font-bold text-amber-700">
                  {totalWrongAttempts} wrong attempt{totalWrongAttempts !== 1 ? 's' : ''} detected
                </span>
              </div>
            )}

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {Object.entries(SCENARIO_META).map(([id, meta]) => {
                const group = scenarioByItem[id];
                const done = !!group;
                const latestOk = group?.latest?.correct;
                const wrongCount = group ? group.events.filter(e => !e.correct).length : 0;

                return (
                  <div key={id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] transition-all ${
                    !done ? 'bg-slate-50 text-slate-400'
                    : latestOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    :            'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {!done && <span className="w-2 h-2 bg-slate-200 rounded-full" />}
                      {done && latestOk && <CheckCircle size={14} className="text-emerald-500" />}
                      {done && !latestOk && <XCircle size={14} className="text-rose-400" />}
                    </div>
                    <span className="font-bold flex-1 truncate">{meta.title}</span>
                    {done && (
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                        <span className="opacity-60">{EMO_ICON[group.latest.expected] || group.latest.expected}</span>
                        <span className="opacity-30">→</span>
                        <span>{EMO_ICON[group.latest.selected] || group.latest.selected}</span>
                        {wrongCount > 0 && (
                          <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                            {wrongCount} wrong
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
