import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Save } from 'lucide-react';

export default function PatientRegistration({ onComplete }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    external_id: '',
    dob: '',
    gender: 'Male',
    contact_info: '',
    medical_history: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auto-generate next MRN on mount
  useEffect(() => {
    fetch('http://localhost:8000/patients')
      .then(res => res.json())
      .then(patients => {
        // Find the highest existing MRN number
        let maxNum = 0;
        if (Array.isArray(patients)) {
          patients.forEach(p => {
            const match = p.external_id?.match(/PAT-\d{4}-(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          });
        }
        const nextNum = String(maxNum + 1).padStart(3, '0');
        const year = new Date().getFullYear();
        setFormData(prev => ({ ...prev, external_id: `PAT-${year}-${nextNum}` }));
        setLoading(false);
      })
      .catch(() => {
        setFormData(prev => ({ ...prev, external_id: `PAT-2026-001` }));
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('http://localhost:8000/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        if (onComplete) onComplete();
        else navigate('/');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Registration failed — MRN may already exist.");
      }
    } catch (err) {
      setError("Cannot reach backend. Is it running?");
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
      <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
        <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
          <UserPlus size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-800">New Patient Registration</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
            <input
              required type="text"
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Medical Record No. (MRN)</label>
            <input
              required type="text"
              className="w-full p-3 rounded-xl border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              value={loading ? "Generating..." : formData.external_id}
              onChange={e => setFormData({...formData, external_id: e.target.value})}
            />
            <p className="text-[10px] text-slate-400 mt-1"></p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Date of Birth</label>
            <input
              required type="date"
              className="w-full p-3 rounded-xl border border-slate-200"
              value={formData.dob}
              onChange={e => setFormData({...formData, dob: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Gender</label>
            <select
              className="w-full p-3 rounded-xl border border-slate-200 bg-white"
              value={formData.gender}
              onChange={e => setFormData({...formData, gender: e.target.value})}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Contact Info</label>
            <input
              type="text"
              className="w-full p-3 rounded-xl border border-slate-200"
              placeholder="Phone or Email"
              value={formData.contact_info}
              onChange={e => setFormData({...formData, contact_info: e.target.value})}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">Clinical Notes / History</label>
            <textarea
              rows="3"
              className="w-full p-3 rounded-xl border border-slate-200"
              placeholder="Any relevant background info..."
              value={formData.medical_history}
              onChange={e => setFormData({...formData, medical_history: e.target.value})}
            />
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <button type="button" onClick={() => onComplete ? onComplete() : navigate('/')} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50">
            <Save size={18} className="inline mr-2" /> Register Patient
          </button>
        </div>
      </form>
    </div>
  );
}
