import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ChildDashboard from './ChildDashboard';

// A simple landing/entry component for the child
const ChildEntry = () => {
  return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[3rem] shadow-2xl p-10 text-center border-8 border-white">
        <div className="w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-bounce">
          <span className="text-4xl">🎨</span>
        </div>
        <h1 className="text-4xl font-black text-slate-800 mb-2">Kids Zone</h1>
        <p className="text-slate-500 font-medium mb-8">Ready to play with your book?</p>
        
        {/* In a real app, this ID might come from a login or a QR code scan */}
        <button 
          onClick={() => window.location.href = '/play/1'} 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-lg transition-transform hover:scale-105 text-xl"
        >
          START PLAYING! 🚀
        </button>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Entry page to "log in" or start */}
        <Route path="/" element={<ChildEntry />} />

        {/* The main sensory dashboard path */}
        <Route path="/play/:patientId" element={<ChildDashboardContainer />} />

        {/* Fallback to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

// Helper to pull the Patient ID from the URL
import { useParams } from 'react-router-dom';
function ChildDashboardContainer() {
  const { patientId } = useParams();
  return <ChildDashboard patientId={patientId} />;
}