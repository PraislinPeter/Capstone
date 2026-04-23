import React, { useEffect, useState } from 'react';
import { Brain, Hand, RefreshCw, AlertTriangle, MessageCircle, Heart, TrendingUp, BookOpen, Lightbulb, Shield, Zap, Eye } from 'lucide-react';

const EMO_ICON = { happy: "😊", sad: "😢", calm: "😌", angry: "😠" };

const INSIGHT_STYLES = {
  positive:    { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", icon: "✅", iconBg: "bg-emerald-100" },
  clinical:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-800",    icon: "🧠", iconBg: "bg-blue-100" },
  observation: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   icon: "👁️", iconBg: "bg-amber-100" },
  attention:   { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-800",    icon: "⚠️", iconBg: "bg-rose-100" },
};

const CAT_COLORS = {
  "calming":        { bg: "bg-teal-50",   bar: "bg-teal-500",   text: "text-teal-700",   border: "border-teal-200" },
  "high-intensity": { bg: "bg-orange-50", bar: "bg-orange-500", text: "text-orange-700", border: "border-orange-200" },
  "aversive":       { bg: "bg-rose-50",   bar: "bg-rose-500",   text: "text-rose-700",   border: "border-rose-200" },
  "neutral":        { bg: "bg-slate-50",  bar: "bg-slate-500",  text: "text-slate-700",  border: "border-slate-200" },
  "medium":         { bg: "bg-indigo-50", bar: "bg-indigo-500", text: "text-indigo-700",  border: "border-indigo-200" },
};

export default function GameMetricsPanel({ patientId, isActive = true }) {
  const [analysis, setAnalysis] = useState(null);
  const [rawEvents, setRawEvents] = useState([]);
  const [polling, setPolling] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  useEffect(() => {
    if (!patientId || !polling) return;

    const fetchData = async () => {
      try {
        const [evRes, anRes] = await Promise.all([
          fetch(`http://localhost:8000/api/game-events/latest/${patientId}`),
          fetch(`http://localhost:8000/api/game-events/analysis/${patientId}`),
        ]);
        const events = await evRes.json();
        const anal = await anRes.json();
        if (Array.isArray(events)) setRawEvents(events);
        if (anal && anal.status !== "no_session") setAnalysis(anal);
        setLastFetch(new Date().toLocaleTimeString());
      } catch {}
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [patientId, polling]);

  const hasData = rawEvents.length > 0 && analysis;
  const summary = analysis?.summary || {};
  const textures = analysis?.textures || {};
  const sensory = analysis?.sensory_profile || {};
  const insights = analysis?.insights || [];
  const breakCount = rawEvents.filter(e => e.event_type === "break_request").length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Brain size={14} className="text-indigo-500" /> Texture Book — Clinical Progress
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

      {!hasData && (
        <div className="text-center py-8 text-slate-400">
          <Hand size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs font-bold">Waiting for child to start the Texture Book...</p>
          <p className="text-[10px] mt-1">Touch events, question answers, and feelings will appear here in real time</p>
        </div>
      )}

      {hasData && (
        <div className="space-y-6">

          {/* ═══ ROW 1: Summary Cards ═══ */}
          <div className="grid grid-cols-5 gap-3">
            <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Explored</p>
              <p className="text-xl font-black text-emerald-700">{summary.textures_explored}/{summary.textures_total}</p>
              <p className="text-[9px] text-emerald-500 font-semibold">textures</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
              <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-1">Questions</p>
              <p className="text-xl font-black text-blue-700">{summary.total_correct}/{summary.total_questions}</p>
              <p className="text-[9px] text-blue-500 font-semibold">correct</p>
            </div>
            <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-100">
              <p className="text-[9px] font-bold text-violet-600 uppercase tracking-wider mb-1">Accuracy</p>
              <p className="text-xl font-black text-violet-700">{summary.overall_accuracy}%</p>
              <p className="text-[9px] text-violet-500 font-semibold">overall</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Wrong</p>
              <p className="text-xl font-black text-amber-700">{summary.total_wrong}</p>
              <p className="text-[9px] text-amber-500 font-semibold">attempts</p>
            </div>
            <div className={`rounded-xl p-3 text-center border ${breakCount > 0 ? 'bg-purple-50 border-purple-100' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${breakCount > 0 ? 'text-purple-600' : 'text-slate-400'}`}>Breaks</p>
              <p className={`text-xl font-black ${breakCount > 0 ? 'text-purple-700' : 'text-slate-300'}`}>{breakCount}</p>
              <p className={`text-[9px] font-semibold ${breakCount > 0 ? 'text-purple-500' : 'text-slate-300'}`}>requested</p>
            </div>
          </div>

          {/* ═══ ROW 2: Per-Texture Detail + Sensory Profile ═══ */}
          <div className="grid grid-cols-12 gap-4">

            {/* Per-texture detail — left 7 cols */}
            <div className="col-span-7">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Hand size={12} className="text-emerald-500" /> Per-Texture Breakdown
              </h4>
              <div className="space-y-2 pr-1">
                {Object.entries(textures).map(([id, s]) => (
                  <div key={id} className={`rounded-xl p-3 border transition-all ${
                    s.touched ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-40'
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{s.emoji}</span>
                      <span className={`text-[11px] font-bold flex-1 ${s.touched ? 'text-slate-800' : 'text-slate-400'}`}>
                        {s.name}
                      </span>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        s.category === 'calming' ? 'bg-teal-100 text-teal-700' :
                        s.category === 'aversive' ? 'bg-rose-100 text-rose-700' :
                        s.category === 'high-intensity' ? 'bg-orange-100 text-orange-700' :
                        s.category === 'medium' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {s.category}
                      </span>
                    </div>

                    {s.touched ? (
                      <div className="flex items-center gap-4 text-[9px] flex-wrap">
                        <div className="flex items-center gap-1 text-emerald-600">
                          <MessageCircle size={10} />
                          <span className="font-bold">
                            {s.questions_correct}/{s.questions_total} correct
                            {s.accuracy_pct !== null && <span className="ml-1 opacity-60">({s.accuracy_pct}%)</span>}
                          </span>
                        </div>
                        {s.questions_wrong > 0 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle size={10} />
                            <span className="font-bold">{s.questions_wrong} wrong</span>
                          </div>
                        )}
                        {s.feeling && (
                          <div className="flex items-center gap-1 text-violet-600">
                            <Heart size={10} />
                            <span className="font-bold capitalize">{EMO_ICON[s.feeling] || ''} {s.feeling}</span>
                          </div>
                        )}
                        {s.touch_duration_ms && (
                          <div className="flex items-center gap-1 text-slate-500">
                            <span className="font-mono">{(s.touch_duration_ms / 1000).toFixed(1)}s touch</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-300">Not yet explored</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Sensory Profile — right 5 cols */}
            <div className="col-span-5">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <TrendingUp size={12} className="text-blue-500" /> Sensory Profile
              </h4>
              <div className="space-y-3">
                {Object.entries(sensory).map(([cat, data]) => {
                  const colors = CAT_COLORS[cat] || CAT_COLORS.neutral;
                  const pct = data.accuracy_pct || 0;
                  return (
                    <div key={cat} className={`rounded-xl p-3 border ${colors.bg} ${colors.border}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold ${colors.text}`}>{data.label}</span>
                        <span className={`text-[9px] font-bold ${colors.text}`}>
                          {data.textures_touched}/{data.textures_total} touched
                        </span>
                      </div>

                      {data.questions_total > 0 ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                              <div className={`h-full ${colors.bar} rounded-full transition-all duration-700`}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-[10px] font-black ${colors.text}`}>{pct}%</span>
                          </div>
                          <p className={`text-[8px] ${colors.text} opacity-70 font-semibold`}>
                            {data.questions_correct}/{data.questions_total} correct
                            {data.feelings.length > 0 && ` · Felt: ${data.feelings.map(f => EMO_ICON[f] || f).join(' ')}`}
                          </p>
                        </>
                      ) : (
                        <p className={`text-[9px] ${colors.text} opacity-50`}>
                          {data.engagement === 'none' ? 'No interaction yet' : 'Touched but no questions answered'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ═══ ROW 3: Clinical Insights ═══ */}
          {insights.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Lightbulb size={12} className="text-amber-500" /> Clinical Insights
              </h4>
              <div className="space-y-2">
                {insights.map((insight, i) => {
                  const style = INSIGHT_STYLES[insight.type] || INSIGHT_STYLES.observation;
                  return (
                    <div key={i} className={`rounded-xl p-3 border ${style.bg} ${style.border} flex gap-3`}>
                      <div className={`w-8 h-8 rounded-lg ${style.iconBg} flex items-center justify-center shrink-0 text-base`}>
                        {style.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-bold ${style.text} mb-0.5`}>{insight.title}</p>
                        <p className={`text-[10px] ${style.text} opacity-80 leading-relaxed`}>{insight.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
