import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, Clock, Calendar, ChevronRight, Film, 
  BarChart3, ArrowLeft, Download 
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const EMOTION_MAP = {
  happy: { color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  sad: { color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
  angry: { color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' },
  fear: { color: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-100' },
  surprise: { color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
  neutral: { color: 'bg-slate-400', text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
};

const getEmotionStyle = (emo) => EMOTION_MAP[emo?.toLowerCase()] || EMOTION_MAP.neutral;

export default function HistoryView({ patient: propPatient }) {
  const navigate = useNavigate();
  const location = useLocation();
  const patient = location.state?.patient || propPatient;
  
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const videoPlayerRef = useRef(null);

  useEffect(() => {
    if (!patient?.id) return;
    fetch(`http://localhost:8000/history/${patient.id}`)
      .then(res => res.json())
      .then(data => {
        setSessions(data);
        if (data.length > 0) setSelectedSession(data[0]); 
      })
      .catch(err => console.error("Failed to load history:", err));
  }, [patient?.id]);

  const seekTo = (timeStr) => {
    if (videoPlayerRef.current && timeStr) {
      const parts = timeStr.split(":").map(Number);
      let totalSeconds = 0;
      if (parts.length === 2) {
        totalSeconds = (parts[0] * 60) + parts[1];
      } else if (parts.length === 3) {
        totalSeconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
      }

      if (!isNaN(totalSeconds)) {
        videoPlayerRef.current.currentTime = totalSeconds;
        videoPlayerRef.current.play().catch(e => console.log("Play interrupted:", e));
      }
    }
  };

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full">
        <p className="text-slate-500 mb-4">No patient data found.</p>
        <button onClick={() => navigate('/')} className="text-indigo-600 font-bold flex items-center gap-2">
          <ArrowLeft size={18}/> Return to Patient List
        </button>
      </div>
    );
  }

  return (
    // Top-level container: w-full h-full to obey parent layout
    <div className="flex flex-col w-full h-full space-y-6">
      
      {/* Header Section */}
      <div className="flex items-center justify-between shrink-0 w-full">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-medium transition-colors"
        >
          <ArrowLeft size={18} /> Back to Patients
        </button>
        <div className="text-right">
          <h2 className="text-xl font-bold text-slate-800">{patient.name}'s Records</h2>
          <p className="text-xs text-slate-400 font-mono">Patient ID: {patient.external_id}</p>
        </div>
      </div>

      {/* Main Content Grid - Responsive Layout */}
      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0 w-full overflow-hidden">
        
        {/* Left Sidebar: Session List */}
        {/* Uses col-span-12 on mobile, col-span-3 on large screens */}
        <div className="col-span-12 lg:col-span-3 bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <Film size={16} className="text-indigo-500" /> Recorded Sessions
            </h3>
            <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
              {sessions.length} Found
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {sessions.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Calendar size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No sessions recorded yet.</p>
              </div>
            ) : (
              sessions.map(s => (
                <button 
                  key={s.id} 
                  onClick={() => setSelectedSession(s)} 
                  className={`w-full text-left p-5 border-b border-slate-50 transition-all hover:bg-slate-50 ${selectedSession?.id === s.id ? 'bg-indigo-50 border-r-4 border-r-indigo-500' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-sm text-slate-800">{s.date}</span>
                    <ChevronRight size={14} className={selectedSession?.id === s.id ? 'text-indigo-500' : 'text-slate-300'} />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1"><Clock size={10} /> {s.duration}</span>
                    <span className="flex items-center gap-1"><BarChart3 size={10} /> {s.timeline?.length || 0} Events</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Content: Split View (Video + Timeline) */}
        {/* Uses col-span-12 on mobile, col-span-9 on large screens */}
        <div className="col-span-12 lg:col-span-9 flex flex-col h-full overflow-hidden space-y-6">
          {selectedSession ? (
            <>
              {/* VIDEO SECTION: Fixed Height (Shrink-0) */}
              <div className="shrink-0 bg-slate-900 rounded-3xl overflow-hidden shadow-2xl aspect-video relative group w-full">
                <video 
                  key={selectedSession.id} 
                  ref={videoPlayerRef}
                  controls 
                  preload="auto"
                  className="w-full h-full object-contain bg-black"
                  src={`http://localhost:8000${selectedSession.video_url}`} 
                />
                
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                   <a 
                    href={`http://localhost:8000${selectedSession.video_url}`} 
                    download 
                    className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20"
                   >
                     <Download size={18} />
                   </a>
                </div>
              </div>

              {/* TIMELINE SECTION: Flex-1 (Takes remaining space and scrolls) */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar bg-white rounded-3xl border border-slate-200 p-8 shadow-sm w-full">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h4 className="font-black text-slate-800 text-lg">Affective Timeline Analysis</h4>
                    <p className="text-sm text-slate-400">Click a log entry to replay that specific emotional marker.</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <BarChart3 size={20} className="text-slate-400" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {selectedSession.timeline?.length > 0 ? (
                    selectedSession.timeline.map((event, idx) => {
                      const style = getEmotionStyle(event.emotion);
                      return (
                        <button 
                          key={idx} 
                          onClick={() => seekTo(event.time)} 
                          className="group flex items-center gap-6 p-4 rounded-2xl bg-slate-50 border border-slate-100 w-full hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all text-left"
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${style.bg} ${style.text}`}>
                            <Play size={14} fill="currentColor" />
                          </div>
                          
                          <div className="flex-1 flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-indigo-500">{event.time}</span>
                              <span className="text-[10px] text-slate-300 uppercase tracking-tighter">Seek Point</span>
                            </div>
                            
                            <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${style.bg} ${style.text} ${style.border}`}>
                              {event.emotion}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                      No emotional shifts detected in this session.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center w-full">
              <Film size={48} className="mb-4 opacity-10" />
              <h3 className="text-xl font-bold text-slate-400">No Session Selected</h3>
              <p className="text-sm max-w-xs mx-auto mt-2">Select a recording from the left panel to begin clinical review.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}