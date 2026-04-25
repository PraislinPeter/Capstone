import { useState, useRef, useEffect } from 'react';
import { 
  Rocket, 
  Smile, 
  Hand, 
  Heart, 
  Coffee, 
  Video, 
  ShieldCheck, 
  LogOut 
} from 'lucide-react';
import './App.css'; // Assuming Tailwind is set up here

const SERVER_URL = "localhost:8000"; // Update this to your FastAPI server

export default function ChildDashboard() {
  // --- Navigation & User State ---
  const [step, setStep] = useState('lobby'); // 'lobby' or 'session'
  const [patientId, setPatientId] = useState('');

  // --- UI State ---
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [connText, setConnText] = useState('Waiting to connect...');
  const [isHovering, setIsHovering] = useState(null);

  // --- Mutable Refs ---
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const intervalRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSession();
  }, []);

  // --- Lobby Actions ---
  const handleJoinLobby = (e) => {
    e.preventDefault();
    if (patientId.trim() !== '') {
      setStep('session');
    }
  };

  const handleLeaveSession = () => {
    stopSession();
    setStep('lobby');
    setPatientId('');
  };

  // --- Session Actions ---
  const startSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
      const ws = new WebSocket(`${wsProtocol}${SERVER_URL}/ws/stream/${patientId}/child`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsSessionActive(true);
        setConnText('Connected to your Therapist! 👋');
        startStreaming();
      };

      ws.onclose = () => {
        stopSession();
        setConnText('Connection Closed');
      };

      ws.onerror = () => {
        setConnText('Oops! Having trouble connecting.');
      };

    } catch (err) {
      console.error("Media access error:", err);
      alert("Could not access the camera. Can you ask an adult for help?");
    }
  };

  const startStreaming = () => {
    const ws = wsRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    intervalRef.current = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN && video && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.5);
        ws.send(JSON.stringify({ image: base64Image }));
      }
    }, 333);

    try {
      recorderRef.current = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
    } catch (e) {
      recorderRef.current = new MediaRecorder(streamRef.current);
    }

    recorderRef.current.ondataavailable = async (e) => {
      if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.readAsDataURL(e.data);
        reader.onloadend = () => {
          ws.send(JSON.stringify({ audio: reader.result }));
        };
      }
    };
    
    recorderRef.current.start(1000);
  };

  const stopSession = () => {
    setIsSessionActive(false);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: "stop" }));
      wsRef.current.close();
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setConnText('Waiting to connect...');
  };

  // --- Quick Communication ---
  const sendQuickMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Sends a custom event that the therapist dashboard can listen for
      wsRef.current.send(JSON.stringify({ event: "child_message", text: message }));
      
      // Temporary visual feedback for the child
      const oldText = connText;
      setConnText(`Sent: "${message}" ✅`);
      setTimeout(() => setConnText(oldText), 3000);
    }
  };

  // ==========================================
  // RENDER: LOBBY SCREEN
  // ==========================================
  if (step === 'lobby') {
    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-sky-100 max-w-md w-full text-center border-4 border-sky-100 relative overflow-hidden">
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-100 rounded-bl-full -z-10 opacity-50"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-100 rounded-tr-full -z-10 opacity-50"></div>

          <div className="w-24 h-24 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={48} className="text-sky-500" />
          </div>
          <h2 className="text-3xl font-black text-slate-700 mb-2">Welcome!</h2>
          <p className="text-slate-500 font-medium mb-8">Enter your magic number to enter your safe space.</p>
          
          <form onSubmit={handleJoinLobby} className="flex flex-col gap-4">
            <input 
              type="text" 
              placeholder="Magic Number (ID)" 
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="px-6 py-4 rounded-2xl border-2 border-sky-200 text-xl text-center text-slate-700 font-bold focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all placeholder:font-normal placeholder:text-slate-300"
              required
            />
            <button 
              type="submit" 
              disabled={!patientId.trim()}
              className="bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white font-black text-xl px-8 py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-sky-200 disabled:shadow-none flex items-center justify-center gap-3"
            >
              Let's Go! <Rocket size={24} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: SESSION SCREEN
  // ==========================================
  return (
    <div className="min-h-screen bg-indigo-50 p-6 md:p-10 flex flex-col font-sans">
      
      {/* Friendly Header */}
      <div className="flex justify-between items-center bg-white px-8 py-4 rounded-full shadow-sm mb-8 border border-indigo-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <Smile className="text-indigo-500" size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-700">My Safe Space</h1>
        </div>
        
        {!isSessionActive && (
          <button 
            onClick={handleLeaveSession} 
            className="text-slate-400 hover:text-rose-500 font-bold text-sm flex items-center gap-2 transition-colors px-4 py-2 rounded-full hover:bg-rose-50"
          >
            <LogOut size={16} /> Leave Room
          </button>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Video & Main Controls */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Video Container (Styled like a friendly screen) */}
          <div className="bg-white p-4 rounded-[2.5rem] shadow-lg border-4 border-white flex-1 relative overflow-hidden group">
            <div className="w-full h-full bg-slate-100 rounded-[2rem] overflow-hidden relative shadow-inner flex flex-col items-center justify-center">
              
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover transition-opacity duration-700 ${isSessionActive ? 'opacity-100' : 'opacity-0'}`}
                style={{ transform: "scaleX(-1)" }}
              ></video>

              {/* Waiting State Overlay */}
              {!isSessionActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-24 h-24 bg-teal-100 text-teal-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-teal-100">
                    <Video size={40} />
                  </div>
                  <h3 className="text-2xl font-black text-slate-700 mb-2">Ready to say hello?</h3>
                  <p className="text-slate-500 font-medium">Your camera is off right now.</p>
                </div>
              )}
            </div>

            {/* Connection Status Badge */}
            {isSessionActive && (
              <div className="absolute top-8 left-8 bg-white/90 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 shadow-sm font-bold text-sm text-slate-600">
                <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></span>
                {connText}
              </div>
            )}
          </div>

          {/* Big Friendly Action Buttons */}
          <div className="flex gap-4">
            {!isSessionActive ? (
              <button 
                onClick={startSession}
                className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-black text-2xl py-6 rounded-3xl transition-all active:scale-95 shadow-xl shadow-emerald-200 border-b-4 border-emerald-600 flex items-center justify-center gap-3"
              >
                <Smile size={32} /> Say Hello!
              </button>
            ) : (
              <button 
                onClick={stopSession}
                className="flex-1 bg-rose-400 hover:bg-rose-500 text-white font-black text-2xl py-6 rounded-3xl transition-all active:scale-95 shadow-xl shadow-rose-200 border-b-4 border-rose-600 flex items-center justify-center gap-3"
              >
                See You Later!
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Communication Board */}
        <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-6 shadow-lg border border-slate-100 flex flex-col">
          <h3 className="text-lg font-black text-slate-700 mb-6 flex items-center gap-2">
            Quick Chat
          </h3>
          
          <div className="flex-1 flex flex-col gap-4">
            <CommButton 
              icon={<Hand size={28} />} 
              label="I need a break" 
              color="bg-amber-100" 
              textColor="text-amber-600"
              active={isSessionActive}
              onClick={() => sendQuickMessage("I need a break")}
            />
            <CommButton 
              icon={<Smile size={28} />} 
              label="I feel happy" 
              color="bg-emerald-100" 
              textColor="text-emerald-600"
              active={isSessionActive}
              onClick={() => sendQuickMessage("I feel happy")}
            />
            <CommButton 
              icon={<Heart size={28} />} 
              label="I like this" 
              color="bg-pink-100" 
              textColor="text-pink-600"
              active={isSessionActive}
              onClick={() => sendQuickMessage("I like this")}
            />
            <CommButton 
              icon={<Coffee size={28} />} 
              label="I want to drink" 
              color="bg-blue-100" 
              textColor="text-blue-600"
              active={isSessionActive}
              onClick={() => sendQuickMessage("I want a drink")}
            />
          </div>

          {!isSessionActive && (
            <p className="text-center text-slate-400 text-sm font-medium mt-6">
              Connect to chat with your therapist!
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

// Sub-component for the big friendly chat buttons
function CommButton({ icon, label, color, textColor, active, onClick }) {
  return (
    <button 
      disabled={!active}
      onClick={onClick}
      className={`flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 w-full text-left font-bold text-lg
        ${active ? `${color} ${textColor} hover:scale-105 active:scale-95 shadow-sm border-b-4 border-black/5` : 'bg-slate-50 text-slate-300 cursor-not-allowed'}
      `}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/50`}>
        {icon}
      </div>
      {label}
    </button>
  );
}