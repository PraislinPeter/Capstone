import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { BrainCircuit, UserPlus, Users, LogOut } from 'lucide-react';

import PatientList from './components/PatientList';
import PatientRegistration from './components/PatientRegistration';
import PatientEdit from './components/PatientEdit'; // Ensure this is imported
import DashboardView from './components/DashboardView';
import HistoryView from './components/HistoryView';

export default function App() {
  return (
    <BrowserRouter>
      {/* h-screen ensures the app takes the full window height */}
      <div className="flex h-screen bg-[#F8FAFC] text-slate-900 overflow-hidden w-full">
        <Sidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden w-full min-w-0">
          <Header />
          
          {/* CONTENT WRAPPER: 
              - Removed 'container' or 'max-w' classes 
              - Added 'w-full' and 'h-full'
          */}
          <div className="flex-1 overflow-y-auto p-6 w-full h-full">
            <Routes>
              <Route path="/" element={<PatientList />} />
              <Route path="/register" element={<PatientRegistration />} />
              <Route path="/edit/:id" element={<PatientEdit />} />
              <Route path="/dashboard/:id" element={<DashboardView />} />
              <Route path="/history/:id" element={<HistoryView />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

// ... Keep your Sidebar, Header, and NavItem components as they were ...
// (If you need me to repost them, let me know, but they likely don't need changes)
function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    // CHANGED: w-64 -> w-80 (This makes it 320px wide instead of 256px)
    <aside className="w-[450px] bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
          <BrainCircuit size={24} />
        </div>
        <h1 className="font-bold text-lg leading-tight">Clinician<span className="text-indigo-600">.AI</span></h1>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        <NavItem 
          icon={<Users size={20} />} 
          label="All Patients" 
          active={location.pathname === '/'} 
          onClick={() => navigate('/')} 
        />
        <NavItem 
          icon={<UserPlus size={20} />} 
          label="New Registration" 
          active={location.pathname === '/register'} 
          onClick={() => navigate('/register')} 
        />
      </nav>
      
      <div className="p-4 border-t border-slate-100">
         <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-500 hover:text-rose-600">
           <LogOut size={16} /> Sign Out
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

function NavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}>
      {icon} <span className="text-sm">{label}</span>
    </button>
  );
}