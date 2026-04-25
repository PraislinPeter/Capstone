import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Camera, Mic, StopCircle, MessageCircle } from 'lucide-react';

// 1. Texture Configuration (Matching your physical book)
const TEXTURES = [
  { id: 1, name: "Beads", color: "bg-red-600", pattern: "radial-gradient(circle, #fff 10%, transparent 10%)", bgSize: "10px 10px" },
  { id: 2, name: "Mesh", color: "bg-blue-400", pattern: "linear-gradient(45deg, #000 25%, transparent 25%)", bgSize: "4px 4px" },
  { id: 3, name: "Peach", color: "bg-teal-300", pattern: "", effect: "opacity-80" },
  { id: 4, name: "Carpet", color: "bg-orange-500", pattern: "repeating-conic-gradient(#0000 0% 25%, #0001 0% 50%)", bgSize: "8px 8px" },
  { id: 5, name: "Velvet", color: "bg-green-600", pattern: "", effect: "blur-[1px]" },
  { id: 6, name: "Corduroy", color: "bg-orange-600", pattern: "linear-gradient(90deg, transparent 45%, #0002 50%, transparent 55%)", bgSize: "15px 100%" },
  { id: 7, name: "Bubble", color: "bg-yellow-300", pattern: "radial-gradient(circle, #fff3 40%, transparent 50%)", bgSize: "20px 20px" },
  { id: 8, name: "Pink Cloth", color: "bg-pink-400", pattern: "", effect: "" },
  { id: 9, name: "Pineapple", color: "bg-rose-500", pattern: "repeating-linear-gradient(45deg, #0001, #0001 2px, transparent 2px, transparent 10px)", bgSize: "" },
  { id: 10, name: "Soft Pink", color: "bg-pink-200", pattern: "", effect: "" },
  { id: 11, name: "Purple", color: "bg-purple-600", pattern: "", effect: "" },
  { id: 12, name: "Leather", color: "bg-red-700", pattern: "url('https://www.transparenttextures.com/patterns/leather.png')", bgSize: "" },
  { id: 13, name: "Oxford", color: "bg-yellow-500", pattern: "repeating-linear-gradient(0deg, #0001, #0001 1px, transparent 1px, transparent 2px)", bgSize: "" },
  { id: 14, name: "Gray Drop", color: "bg-slate-500", pattern: "radial-gradient(#000 10%, transparent 11%)", bgSize: "10px 10px" },
  { id: 15, name: "Snake", color: "bg-emerald-400", pattern: "linear-gradient(135deg, #0001 25%, transparent 25%)", bgSize: "20px 20px" },
  { id: 16, name: "Mirror", color: "bg-slate-100", pattern: "linear-gradient(135deg, #fff 0%, #cbd5e1 100%)", effect: "border-slate-300 shadow-inner" },
];

export default function ChildDashboard({ patientId }) {
  const [isLive, setIsLive] = useState(false);
  const [activePage, setActivePage] = useState(null);
  const [currentEmotion, setCurrentEmotion] = useState("neutral");
  
  const wsRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    if (!isLive) return;

    const socket = new WebSocket(`ws://localhost:8000/ws/stream/${patientId}/child`);
    wsRef.current = socket; 

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "page_changed") {
        setActivePage(data.page);
        playSensorySound('page');
      }
      if (data.status === "processing") {
        setCurrentEmotion(data.emotion);
      }
    };

    return () => socket.close();
  }, [isLive, patientId]);

  const startSession = async () => {
    setIsLive(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoRef.current.srcObject = stream;

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.5);
        wsRef.current.send(JSON.stringify({ image: base64Image }));
      }
    }, 200);

    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.readAsDataURL(e.data);
        reader.onloadend = () => {
          wsRef.current.send(JSON.stringify({ audio: reader.result }));
        };
      }
    };
    mediaRecorder.start(1000);
    mediaRecorderRef.current = mediaRecorder;
  };

  const handleTextureTap = (texture) => {
    setActivePage(texture.id);
    playSensorySound('tap');
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        event: "child_interaction", 
        type: "texture_tap",
        page: texture.id,
        texture_name: texture.name // Fixed: Explicitly passing the name
      }));
    }
  };

  const playSensorySound = (type) => {
    const url = type === 'tap' 
      ? 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3' 
      : 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3';
    new Audio(url).play().catch(() => {});
  };

  return (
    <div className={`min-h-screen transition-colors duration-1000 p-8 ${getEmotionBg(currentEmotion)}`}>
      <div className="max-w-6xl mx-auto grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="relative rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl bg-slate-900 aspect-video">
            <video ref={videoRef} autoPlay muted className="w-full h-full object-cover mirror" />
            <canvas ref={canvasRef} width="640" height="480" className="hidden" />
            <div className={`absolute inset-0 pointer-events-none opacity-30 animate-pulse ${getEmotionGlow(currentEmotion)}`} />
            {!isLive && (
              <button onClick={startSession} className="absolute inset-0 m-auto w-24 h-24 bg-indigo-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl">
                <Camera size={40} />
              </button>
            )}
          </div>
          <div className="flex gap-4">
             <button onClick={() => setIsLive(false)} className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg">
                <StopCircle /> STOP SESSION
             </button>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7">
          <h2 className="text-3xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <Sparkles className="text-yellow-500" /> Sensory Book
          </h2>
          <div className="grid grid-cols-4 gap-4 p-6 bg-white/80 backdrop-blur-md rounded-[3rem] shadow-xl border-8 border-white/50">
            {TEXTURES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTextureTap(t)}
                className={`relative aspect-square rounded-2xl transition-all duration-300 overflow-hidden group border-4 ${activePage === t.id ? 'border-indigo-500 scale-105 shadow-2xl z-10' : 'border-slate-800'} ${t.color} ${t.effect || ''}`}
                style={{ backgroundImage: t.pattern, backgroundSize: t.bgSize }}
              >
                {activePage === t.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/20">
                     <Sparkles className="text-white animate-spin-slow" size={32} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getEmotionBg(emo) {
  const themes = { happy: "bg-emerald-100", sad: "bg-blue-100", angry: "bg-rose-100", surprise: "bg-amber-100", neutral: "bg-indigo-50" };
  return themes[emo] || themes.neutral;
}

function getEmotionGlow(emo) {
  const glows = { happy: "bg-emerald-400", sad: "bg-blue-400", angry: "bg-rose-400", surprise: "bg-amber-400", neutral: "transparent" };
  return glows[emo] || "transparent";
}