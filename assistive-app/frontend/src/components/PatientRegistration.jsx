import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Save, AlertCircle } from 'lucide-react';

export default function PatientRegistration() {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    external_id: '',
    dob: '',
    gender: 'Male',
    contact_info: '',
    medical_history: ''
  });
  
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Auto-generate next MRN on mount
  useEffect(() => {
    fetch('http://localhost:8000/patients')
      .then(res => res.json())
      .then(data => {
        let maxNum = 0;
        const year = new Date().getFullYear();
        data.forEach(p => {
          const match = p.external_id?.match(/PAT-\d{4}-(\d+)/);
          if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
        });
        const nextMRN = `PAT-${year}-${String(maxNum + 1).padStart(3, '0')}`;
        setFormData(prev => ({ ...prev, external_id: nextMRN }));
      })
      .catch(() => {
        setFormData(prev => ({ ...prev, external_id: `PAT-${Date.now()}` }));
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    
    try {
      const res = await fetch('http://localhost:8000/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        navigate('/');
      } else {
        const errData = await res.json().catch(() => null);
        const detail = errData?.detail || 'Registration failed.';
        
        if (detail.toLowerCase().includes('mrn') || detail.toLowerCase().includes('duplicate') || detail.toLowerCase().includes('already')) {
          setError(`MRN "${formData.external_id}" is already taken. Please use a different Medical Record Number.`);
        } else {
          setError(detail);
        }
      }
    } catch (err) {
      setError('Could not connect to the server. Is the backend running?');
      console.error(err);
    } finally {
      setSubmitting(false);
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
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <AlertCircle size={20} className="text-rose-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-rose-700">Registration Error</p>
            <p className="text-sm text-rose-600 mt-1">{error}</p>
          </div>
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
              onChange={e => { setFormData({...formData, name: e.target.value}); setError(''); }}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Medical Record No. (MRN)</label>
            <input 
              required type="text" 
              className={`w-full p-3 rounded-xl border outline-none focus:ring-2 ${
                error && error.includes('MRN') 
                  ? 'border-rose-300 focus:ring-rose-200 bg-rose-50' 
                  : 'border-slate-200 focus:ring-indigo-200'
              }`}
              placeholder="e.g. PAT-2026-001"
              value={formData.external_id}
              onChange={e => { setFormData({...formData, external_id: e.target.value}); setError(''); }}
            />
            <p className="text-[10px] text-slate-400 mt-1">Auto-generated. Edit if needed.</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Date of Birth</label>
            <input 
              required type="date" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-200 outline-none"
              value={formData.dob}
              onChange={e => setFormData({...formData, dob: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Gender</label>
            <select 
              className="w-full p-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-200 outline-none"
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
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="Phone or Email"
              value={formData.contact_info}
              onChange={e => setFormData({...formData, contact_info: e.target.value})}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">Clinical Notes / History</label>
            <textarea 
              rows="3"
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="Any relevant background info..."
              value={formData.medical_history}
              onChange={e => setFormData({...formData, medical_history: e.target.value})}
            />
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <button type="button" onClick={() => navigate('/')} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={submitting}
            className={`flex-1 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 ${
              submitting ? 'bg-indigo-400 text-indigo-100 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <Save size={18} className="inline mr-2" /> 
            {submitting ? 'Saving...' : 'Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}
