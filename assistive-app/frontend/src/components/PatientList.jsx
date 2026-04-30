import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, History, UserPlus, UserCog } from 'lucide-react';
import { API_BASE } from '../config';

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // --- FETCH DATA FROM BACKEND ---
  useEffect(() => {
    fetch(`${API_BASE}/patients`)
      .then((res) => res.json())
      .then((data) => {
        setPatients(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching patients:", err);
        setLoading(false);
      });
  }, []);

  const handleStartSession = (patient) => {
    navigate(`/dashboard/${patient.id}`, { state: { patient } });
  };

  const handleViewHistory = (patient) => {
    navigate(`/history/${patient.id}`, { state: { patient } });
  };

  if (loading) return <div className="p-8 text-slate-500">Loading clinical records...</div>;

  return (
    <div className="space-y-4">
      {patients.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-3xl border border-dashed border-slate-200">
          <Users className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500">No patients registered in the system.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {patients.map((p) => (
            <div key={p.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-xl">
                  {p.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{p.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">MRN: {p.external_id}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => handleStartSession(p)}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  <Activity size={16} /> Start
                </button>
                <button 
                  onClick={() => handleViewHistory(p)}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-600 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-colors border border-slate-100"
                >
                  <History size={16} /> History
                </button>
                <button 
                  onClick={() => navigate(`/edit/${p.id}`)}
                  className="px-3 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-100"
                  title="Edit Patient Info"
                >
                  <UserCog size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}