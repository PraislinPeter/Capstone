import React, { useEffect, useState } from 'react';
import { Brain, Eye, AlertTriangle, Heart, RefreshCw, Lightbulb, Camera, Fingerprint } from 'lucide-react';

const EMO_ICON = { happy: "😊", sad: "😢", calm: "😌", neutral: "😐", angry: "😠", fear: "😨", surprise: "😮", disgust: "🤢" };
const MATCH_STYLES = {
  exact_match: { label: "Match", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  similar:     { label: "Similar", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
  mismatch:    { label: "Mismatch", bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500" },
};
const INSIGHT_STYLES = {
  positive:    { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", icon: "✅" },
  clinical:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-800",    icon: "🧠" },
  observation: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   icon: "👁️" },
  attention:   { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-800",    icon: "⚠️" },
};

export default function EmotionCorrelationPanel({ patientId }) {
  const [data, setData] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!patientId || !polling) return;
    const fetchData = () => {
      fetch(`http://localhost:8000/api/game-events/emotion-correlation/${patientId}`)
        .then(r => r.json())
        .then(d => { if (d && d.status !== "no_session") setData(d); })
        .catch(() => {});
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [patientId, polling]);

  if (!data || !data.has_emotion_data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
          <Camera size={14} className="text-violet-500" /> Emotion–Activity Correlation
        </h3>
        <div className="text-center py-6 text-slate-400">
          <Camera size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs font-bold">Waiting for camera emotion data...</p>
          <p className="text-[10px] mt-1">
            {data?.message || "Connect the Pi camera or start a webcam session to see how detected emotions map to the child's interactions."}
          </p>
        </div>
      </div>
    );
  }

  const correlations = data.texture_correlations || {};
  const performance = data.performance_emotions || {};
  const insights = data.insights || [];
  const hasCorrelations = Object.keys(correlations).length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Camera size={14} className="text-violet-500" /> Emotion–Activity Correlation
        </h3>
        <button onClick={() => setPolling(p => !p)}
          className={`text-[9px] font-bold px-2 py-1 rounded-md flex items-center gap-1 ${
            polling ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'
          }`}
        >
          <RefreshCw size={10} className={polling ? 'animate-spin' : ''} style={polling ? {animationDuration: '5s'} : {}} />
          {polling ? 'Live' : 'Paused'}
        </button>
      </div>

      {hasCorrelations && (
        <div className="space-y-5">

          {/* ── Self-Report vs Camera ── */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Fingerprint size={12} className="text-violet-500" /> Self-Reported vs Camera-Detected
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(correlations).map(([texId, tc]) => {
                const matchStyle = MATCH_STYLES[tc.match_status] || {};
                return (
                  <div key={texId} className={`rounded-xl p-3 border ${matchStyle.bg || 'bg-slate-50'} ${matchStyle.border || 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{tc.emoji}</span>
                      <span className="text-[11px] font-bold text-slate-700 flex-1">{tc.name}</span>
                      {tc.match_status && (
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${matchStyle.bg} ${matchStyle.text} border ${matchStyle.border}`}>
                          {matchStyle.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <div className="flex items-center gap-1">
                        <Heart size={10} className="text-violet-500" />
                        <span className="font-bold text-violet-700">
                          Said: {tc.self_reported_feeling ? `${EMO_ICON[tc.self_reported_feeling] || ''} ${tc.self_reported_feeling}` : '—'}
                        </span>
                      </div>
                      <span className="text-slate-300">vs</span>
                      <div className="flex items-center gap-1">
                        <Eye size={10} className="text-indigo-500" />
                        <span className="font-bold text-indigo-700">
                          Camera: {tc.camera_detected_emotion ? `${EMO_ICON[tc.camera_detected_emotion] || ''} ${tc.camera_detected_emotion}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Emotion During Correct vs Wrong ── */}
          {(performance.during_correct_answers || performance.during_wrong_answers) && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Brain size={12} className="text-blue-500" /> Emotional State vs Performance
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200 text-center">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase mb-2">During Correct Answers</p>
                  <p className="text-2xl mb-1">{EMO_ICON[performance.during_correct_answers] || '—'}</p>
                  <p className="text-xs font-bold text-emerald-700 capitalize">{performance.during_correct_answers || 'No data'}</p>
                </div>
                <div className="rounded-xl p-4 bg-rose-50 border border-rose-200 text-center">
                  <p className="text-[9px] font-bold text-rose-600 uppercase mb-2">During Wrong Answers</p>
                  <p className="text-2xl mb-1">{EMO_ICON[performance.during_wrong_answers] || '—'}</p>
                  <p className="text-xs font-bold text-rose-700 capitalize">{performance.during_wrong_answers || 'No data'}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Correlation Insights ── */}
          {insights.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Lightbulb size={12} className="text-amber-500" /> Correlation Insights
              </h4>
              <div className="space-y-2">
                {insights.map((insight, i) => {
                  const style = INSIGHT_STYLES[insight.type] || INSIGHT_STYLES.observation;
                  return (
                    <div key={i} className={`rounded-xl p-3 border ${style.bg} ${style.border} flex gap-3`}>
                      <span className="text-base shrink-0">{style.icon}</span>
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
