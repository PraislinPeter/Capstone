import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';

const TEXTURES = [
  { id: 1, name: "Beads", type: "bumpy", color: "bg-red-600", pattern: "radial-gradient(circle, #fff 10%, transparent 10%)", bgSize: "10px 10px" },
  { id: 2, name: "Mesh", type: "hard", color: "bg-blue-400", pattern: "linear-gradient(45deg, #000 25%, transparent 25%)", bgSize: "4px 4px" },
  { id: 3, name: "Peach", type: "fuzzy", color: "bg-teal-300", pattern: "", effect: "opacity-80" },
  { id: 4, name: "Carpet", type: "bumpy", color: "bg-orange-500", pattern: "repeating-conic-gradient(#0000 0% 25%, #0001 0% 50%)", bgSize: "8px 8px" },
  { id: 5, name: "Velvet", type: "smooth", color: "bg-green-600", pattern: "", effect: "blur-[1px]" },
  { id: 6, name: "Corduroy", type: "bumpy", color: "bg-orange-600", pattern: "linear-gradient(90deg, transparent 45%, #0002 50%, transparent 55%)", bgSize: "15px 100%" },
  { id: 7, name: "Bubble", type: "bumpy", color: "bg-yellow-300", pattern: "radial-gradient(circle, #fff3 40%, transparent 50%)", bgSize: "20px 20px" },
  { id: 8, name: "Pink Cloth", type: "smooth", color: "bg-pink-400", pattern: "", effect: "" },
  { id: 9, name: "Pineapple", type: "bumpy", color: "bg-rose-500", pattern: "repeating-linear-gradient(45deg, #0001, #0001 2px, transparent 2px, transparent 10px)", bgSize: "" },
  { id: 10, name: "Soft Pink", type: "fuzzy", color: "bg-pink-200", pattern: "", effect: "" },
  { id: 11, name: "Purple", type: "fuzzy", color: "bg-purple-600", pattern: "", effect: "" },
  { id: 12, name: "Leather", type: "hard", color: "bg-red-700", pattern: "url('https://www.transparenttextures.com/patterns/leather.png')", bgSize: "" },
  { id: 13, name: "Oxford", type: "smooth", color: "bg-yellow-500", pattern: "repeating-linear-gradient(0deg, #0001, #0001 1px, transparent 1px, transparent 2px)", bgSize: "" },
  { id: 14, name: "Gray Drop", type: "bumpy", color: "bg-slate-500", pattern: "radial-gradient(#000 10%, transparent 11%)", bgSize: "10px 10px" },
  { id: 15, name: "Snake", type: "smooth", color: "bg-emerald-400", pattern: "linear-gradient(135deg, #0001 25%, transparent 25%)", bgSize: "20px 20px" },
  { id: 16, name: "Mirror", type: "smooth", color: "bg-slate-100", pattern: "linear-gradient(135deg, #fff 0%, #cbd5e1 100%)", effect: "border-slate-300 shadow-inner" },
];

export default function ChildDashboard({ patientId = "1" }) {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [questionStep, setQuestionStep] = useState(1);
  const [breathingBreak, setBreathingBreak] = useState(false);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const requestRef = useRef();

  // Set srcObject after the video element renders (sessionStarted flips to true)
  useEffect(() => {
    if (sessionStarted && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [sessionStarted]);

  // START SESSION & INITIALIZE WEBSOCKET
const startSession = async () => {
  try {
    // 1. Request Camera and Audio
    // We request 640x480 to match the backend cv2.VideoWriter settings
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: true,
    });

    streamRef.current = stream;

    // 2. Initialize WebSocket
    // Uses the camelCase 'patientId' prop to match the backend route
    const socket = new WebSocket(`ws://localhost:8000/ws/stream/${patientId}/child`);

    socket.onopen = () => {
      console.log("✅ Child websocket connected");
      setSessionStarted(true);
      
      // Start the Image Streaming Loop immediately upon connection
      startStreamingLoop();
    };

    socket.onclose = () => {
      console.log("⚠️ Child websocket disconnected");
      setSessionStarted(false);
      if (requestRef.current) clearTimeout(requestRef.current);
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    // 3. Handle messages from Backend (e.g., session_db_id)
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "session_started") {
          console.log("Session active in DB:", data.session_db_id);
        }
      } catch (err) {
        console.error("Invalid websocket message:", err);
      }
    };

    wsRef.current = socket;
  } catch (err) {
    console.error("Setup failed:", err);
    alert("Camera access is required to start the session.");
  }
};
// --- Add this inside ChildDashboard ---
const handleEndSession = () => {
  // 1. Play a closing sound
  playVoice('too_much'); 

  // 2. Notify Therapist & Backend
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ 
      event: "stop" 
    }));
  }

  // 3. Stop Hardware
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
  }
  if (wsRef.current) {
    wsRef.current.close();
  }
  if (requestRef.current) {
    clearTimeout(requestRef.current);
  }

  // 4. Return to Start Screen
  setSessionStarted(false);
  setActiveQuestion(null);
  setCurrentPageIndex(0);
};
// 4. THE DATA PUSHER LOOP
// This captures the 'liveImage' and sends it to the therapist
const startStreamingLoop = () => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = 640;
  canvas.height = 480;

  const sendFrame = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN && videoRef.current) {
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // Convert to Base64 JPEG with 0.5 compression for speed
      const imageData = canvas.toDataURL("image/jpeg", 0.5);

      // Must send with key "image" to match backend expectation
      wsRef.current.send(JSON.stringify({
        image: imageData,
      }));
    }
    // 5 FPS (200ms) matches the backend VideoWriter and stability
    requestRef.current = window.setTimeout(sendFrame, 200);
  };

  sendFrame();
};

  // CLEANUP ON UNMOUNT
  useEffect(() => {
    return () => {
      if (requestRef.current) clearTimeout(requestRef.current);
      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const playVoice = (fileName, onFinished) => {
    if (window.currentAudio) {
      window.currentAudio.pause();
      window.currentAudio.currentTime = 0;
    }
    const audio = new Audio(`/audio/${fileName}.m4a`);
    window.currentAudio = audio;
    if (onFinished) audio.onended = onFinished;
    audio.play().catch(e => console.error("Audio error:", e));
  };

  const handlePageClick = (texture) => {
    if (activeQuestion) return;
    
    // Notifies Therapist Dashboard (Line 680 in main.py)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: "child_interaction",
        texture_name: texture.name,
        page: texture.id,
      }));
    }

    const audioName = texture.name.toLowerCase().replace(' ', '_');
    playVoice(audioName, () => {
      setTimeout(() => {
        setQuestionStep(1);
        setActiveQuestion(texture);
        playVoice('prompt');
      }, 600);
    });
  };

  const handleInitialChoice = (choice) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: "child_feedback",
        feedback_type: "emotion_choice",
        value: choice === 'like' ? 'Like' : 'Too Much',
        texture_name: activeQuestion?.name,
      }));
    }
    if (choice === 'like') {
      playVoice('like_it', () => {
        setTimeout(() => {
          setQuestionStep(2);
          playVoice('attribute_prompt');
        }, 800);
      });
    } else {
      const textureName = activeQuestion?.name;
      setActiveQuestion(null);
      setBreathingBreak(true);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          event: "break_started",
          texture_name: textureName,
        }));
      }
      playVoice('breathe');
    }
  };

  const handleBreakEnd = () => {
    setBreathingBreak(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: "break_ended" }));
    }
  };

  const handleAttributeChoice = (selectedAttr) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: "child_feedback",
        feedback_type: "attribute_choice",
        value: selectedAttr.charAt(0).toUpperCase() + selectedAttr.slice(1),
        texture_name: activeQuestion?.name,
      }));
    }
    const correctAttr = activeQuestion.type;
    const textureFile = activeQuestion.name.toLowerCase().replace(' ', '_');
    if (selectedAttr === correctAttr) {
      playVoice(`${textureFile}_confirm`, () => {
        setTimeout(() => {
          setActiveQuestion(null);
          setQuestionStep(1);
        }, 1500);
      });
    } else {
      playVoice(`wrong_${selectedAttr}`);
    }
  };

  const pages = [];
  for (let i = 0; i < TEXTURES.length; i += 2) pages.push(TEXTURES.slice(i, i + 2));
  const activePages = pages[currentPageIndex];

  if (!sessionStarted) {
    return (
      <div className="fixed inset-0 bg-indigo-600 flex flex-col items-center justify-center p-10 text-center">
        <div className="bg-white p-16 rounded-[5rem] shadow-2xl border-b-[20px] border-indigo-200 animate-in fade-in zoom-in duration-500">
          <Sparkles className="text-yellow-400 w-32 h-32 mb-8 mx-auto animate-pulse" />
          <h1 className="text-7xl font-black text-slate-800 mb-6 uppercase tracking-tighter tracking-widest">Sensory Book</h1>
          <p className="text-2xl font-bold text-slate-500 mb-12">Ready to explore textures together?</p>
          <button onClick={startSession} className="group flex items-center gap-6 bg-emerald-500 text-white px-20 py-10 rounded-[3rem] text-5xl font-black shadow-xl hover:bg-emerald-600 hover:scale-105 active:scale-95 transition-all">
            <PlayCircle size={80} fill="white" /> START SESSION
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-4 lg:p-12 overflow-hidden">
      <video ref={videoRef} autoPlay playsInline className="absolute opacity-0 pointer-events-none w-1 h-1" />

      {breathingBreak && <BreathingBreak onReady={handleBreakEnd} />}

<button
  onClick={handleEndSession}
  className="absolute top-8 right-8 bg-rose-100 hover:bg-rose-500 hover:text-white text-rose-600 px-8 py-4 rounded-3xl font-black text-xl flex items-center gap-3 transition-all border-b-8 border-rose-200 active:border-b-0 active:translate-y-2 shadow-lg z-[50]"
>
  <div className="bg-rose-500 text-white rounded-full p-1">
    <ChevronLeft size={24} strokeWidth={4} />
  </div>
  ALL DONE
</button>
      {activeQuestion && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[5rem] p-12 max-w-5xl w-full shadow-2xl border-[16px] border-indigo-50 relative">
            {questionStep === 1 ? (
              <div className="animate-in fade-in zoom-in duration-300">
                <h3 className="text-5xl font-black mb-12 text-slate-800 uppercase tracking-tighter">The <span className="text-indigo-600">{activeQuestion.name}</span> feels...</h3>
                <div className="grid grid-cols-2 gap-10">
                  <button onClick={() => handleInitialChoice('like')} className="p-12 bg-emerald-50 rounded-[4rem] border-4 border-emerald-200 hover:border-emerald-500 transform hover:scale-105 transition-all shadow-xl text-4xl font-black text-emerald-800">
                    <div className="text-[10rem] mb-6">😊</div> I LIKE IT
                  </button>
                  <button onClick={() => handleInitialChoice('dislike')} className="p-12 bg-rose-50 rounded-[4rem] border-4 border-rose-200 hover:border-rose-500 transform hover:scale-105 transition-all shadow-xl text-4xl font-black text-rose-800">
                    <div className="text-[10rem] mb-6">😖</div> TOO MUCH
                  </button>
                </div>
              </div>
            ) : (
              <div className="animate-in slide-in-from-right duration-500">
                <h3 className="text-5xl font-black mb-12 text-slate-800 uppercase tracking-tighter">Is it...</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <AttributeBtn label="Bumpy" icon="⛰️" color="amber" onClick={() => handleAttributeChoice('bumpy')} />
                  <AttributeBtn label="Smooth" icon="🧊" color="cyan" onClick={() => handleAttributeChoice('smooth')} />
                  <AttributeBtn label="Hard" icon="🧱" color="slate" onClick={() => handleAttributeChoice('hard')} />
                  <AttributeBtn label="Fuzzy" icon="☁️" color="pink" onClick={() => handleAttributeChoice('fuzzy')} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full h-full flex flex-col gap-8 max-w-[1800px]">
        <div className="flex-1 flex bg-white rounded-[5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.25)] border-b-[24px] border-slate-200 overflow-hidden">
          {activePages.map((texture, idx) => (
            <div key={texture.id} onClick={() => handlePageClick(texture)} className={`flex-1 relative cursor-pointer transform transition-all active:scale-[0.99] ${idx === 0 ? 'border-r-8 border-slate-100' : ''} ${texture.color}`} style={{ backgroundImage: texture.pattern, backgroundSize: texture.bgSize }}>
              <div className="absolute bottom-12 left-12 px-12 py-5 bg-white/95 rounded-full font-black text-slate-800 text-3xl uppercase tracking-widest shadow-2xl">{texture.name}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-10 pb-4">
          <NavBtn icon={<ChevronLeft size={80} />} disabled={currentPageIndex === 0} onClick={() => { setCurrentPageIndex(p => p - 1); playVoice('prev_page'); }} />
          <div className="bg-white/80 backdrop-blur-md px-12 py-6 rounded-full shadow-xl flex items-center gap-6 border-2 border-white">
            <Sparkles className="text-yellow-400" size={48} />
            <span className="font-black text-slate-500 text-3xl tracking-widest uppercase">Page {currentPageIndex + 1} of {pages.length}</span>
          </div>
          <NavBtn icon={<ChevronRight size={80} />} disabled={currentPageIndex >= pages.length - 1} onClick={() => { setCurrentPageIndex(p => p + 1); playVoice('next_page'); }} />
        </div>
      </div>
    </div>
  );
}

function BreathingBreak({ onReady }) {
  const DURATION = 30;
  const PHASE_MS = 5000;
  const [countdown, setCountdown] = useState(DURATION);
  const [phase, setPhase] = useState('in');
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio('/audio/calm_music.mp3');
    audio.loop = true;
    audio.volume = 0.4;
    audio.play().catch(e => console.error("Music error:", e));
    audioRef.current = audio;

    const autoEnd = setTimeout(onReady, DURATION * 1000);

    const tick = setInterval(() => {
      setCountdown(p => (p <= 1 ? 0 : p - 1));
    }, 1000);

    const breathCycle = setInterval(() => {
      setPhase(p => (p === 'in' ? 'out' : 'in'));
    }, PHASE_MS);

    return () => {
      audio.pause();
      audio.currentTime = 0;
      clearTimeout(autoEnd);
      clearInterval(tick);
      clearInterval(breathCycle);
    };
  }, [onReady]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-b from-sky-300 to-indigo-400 px-10 text-center">
      <style>{`
        @keyframes bubble-in  { from { transform: scale(1);   opacity: 0.6; } to { transform: scale(1.65); opacity: 1; } }
        @keyframes bubble-out { from { transform: scale(1.65); opacity: 1; } to { transform: scale(1);   opacity: 0.6; } }
        .bubble-phase-in  { animation: bubble-in  5s ease-in-out forwards; }
        .bubble-phase-out { animation: bubble-out 5s ease-in-out forwards; }
      `}</style>

      <h2 className="text-6xl font-black text-white drop-shadow-lg mb-14 leading-tight">
        Let's Take a Breath 💙
      </h2>

      {/* Breathing bubble */}
      <div className="relative flex items-center justify-center mb-10">
        <div
          className={`w-56 h-56 rounded-full bg-white/30 backdrop-blur-sm shadow-2xl border-8 border-white/50 flex items-center justify-center ${phase === 'in' ? 'bubble-phase-in' : 'bubble-phase-out'}`}
        >
          <div className="w-36 h-36 rounded-full bg-white/50 shadow-inner flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-white/80" />
          </div>
        </div>
      </div>

      <p className="text-5xl font-black text-white drop-shadow-md mb-4 transition-opacity duration-500">
        {phase === 'in' ? 'Breathe In...' : 'Breathe Out...'}
      </p>

      <p className="text-2xl text-white/70 font-bold mb-16 tabular-nums">{countdown}s</p>

      <button
        onClick={onReady}
        className="bg-white text-indigo-600 font-black text-4xl px-20 py-10 rounded-[3rem] shadow-2xl border-b-8 border-indigo-100 hover:scale-105 active:scale-95 active:border-b-0 transition-all"
      >
        ✨ I'M READY
      </button>
    </div>
  );
}

function AttributeBtn({ label, icon, color, onClick }) {
  const colors = {
    amber: "bg-amber-50 border-amber-300 text-amber-900 hover:border-amber-600",
    cyan: "bg-cyan-50 border-cyan-300 text-cyan-900 hover:border-cyan-600",
    slate: "bg-slate-50 border-slate-300 text-slate-900 hover:border-slate-600",
    pink: "bg-pink-50 border-pink-300 text-pink-900 hover:border-pink-600"
  };
  return (
    <button onClick={onClick} className={`p-10 rounded-[4rem] border-4 transition-all transform hover:scale-105 shadow-xl ${colors[color]}`}>
      <div className="text-8xl mb-4">{icon}</div>
      <p className="font-black uppercase text-2xl">{label}</p>
    </button>
  );
}

function NavBtn({ icon, disabled, onClick }) {
  return (
    <button disabled={disabled} onClick={onClick} className="p-10 bg-white rounded-full shadow-2xl disabled:opacity-5 hover:scale-110 active:scale-90 transition-all text-indigo-600 border-b-[12px] border-indigo-50">{icon}</button>
  );
}