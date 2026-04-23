import { useState } from 'react';
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-200`}>
      {/* Logo — click to toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
      >
        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
          <BrainCircuit size={20} />
        </div>
        {!collapsed && (
          <h1 className="font-bold text-base leading-tight whitespace-nowrap">
            Clinician<span className="text-indigo-600">.AI</span>
          </h1>
        )}
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-1 mt-2">
        <NavItem
          icon={<Users size={20} />}
          label="All Patients"
          active={location.pathname === '/'}
          onClick={() => navigate('/')}
          collapsed={collapsed}
        />
        <NavItem
          icon={<UserPlus size={20} />}
          label="New Registration"
          active={location.pathname === '/register'}
          onClick={() => navigate('/register')}
          collapsed={collapsed}
        />
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-slate-100">
        <button className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all ${collapsed ? 'justify-center' : ''}`}>
          <LogOut size={16} />
          {!collapsed && <span>Sign Out</span>}
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

function NavItem({ icon, label, active, onClick, collapsed }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${collapsed ? 'justify-center' : ''} ${active ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
    >
      {icon}
      {!collapsed && <span className="text-sm">{label}</span>}
    </button>
  );
}