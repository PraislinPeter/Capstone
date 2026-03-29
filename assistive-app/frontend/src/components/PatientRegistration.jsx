import React, { useState } from 'react';
import { UserPlus, Save, X } from 'lucide-react';

export default function PatientRegistration({ onComplete }) {
  const [formData, setFormData] = useState({
    name: '',
    external_id: '',
    dob: '',
    gender: 'Male',
    contact_info: '',
    medical_history: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        alert("Patient Registered Successfully");
        onComplete(); // Go back to list
      } else {
        alert("Error: MRN might already exist");
      }
    } catch (err) {
      console.error(err);
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

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          {/* Name */}
          <div className="col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
            <input 
              required
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          {/* MRN */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Medical Record No. (MRN)</label>
            <input 
              required
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200"
              placeholder="e.g. PAT-2026-001"
              value={formData.external_id}
              onChange={e => setFormData({...formData, external_id: e.target.value})}
            />
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Date of Birth</label>
            <input 
              required
              type="date" 
              className="w-full p-3 rounded-xl border border-slate-200"
              value={formData.dob}
              onChange={e => setFormData({...formData, dob: e.target.value})}
            />
          </div>

          {/* Gender */}
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

          {/* Contact */}
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

          {/* Notes */}
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
          <button type="button" onClick={onComplete} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200">
            <Save size={18} className="inline mr-2" /> Register Patient
          </button>
        </div>
      </form>
    </div>
  );
}