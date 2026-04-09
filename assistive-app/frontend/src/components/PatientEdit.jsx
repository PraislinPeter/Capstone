import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, UserCog } from 'lucide-react';

export default function PatientEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    name: '',
    external_id: '',
    dob: '',
    gender: 'Male',
    contact_info: '',
    medical_history: ''
  });

  // 1. Fetch SPECIFIC Patient Data on Mount
  useEffect(() => {
    // CHANGE: Fetch specific ID instead of the whole list
    fetch(`http://localhost:8000/patients/${id}`) 
      .then(res => res.json())
      .then(data => {
        // Set state with the data from the backend
        setFormData({
            name: data.name || '',
            external_id: data.external_id || '',
            // Ensure DOB is valid for input type="date"
            dob: data.dob || '', 
            gender: data.gender || 'Male',
            // Match the key from the Python backend return statement
            contact_info: data.contact_info || '', 
            medical_history: data.medical_history || '' 
        });
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching details:", err);
        setLoading(false);
      });
  }, [id]);

  // 2. Handle Update
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`http://localhost:8000/patients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        alert("Patient Updated Successfully");
        navigate('/');
      } else {
        const errorData = await res.json();
        alert(`Error: ${errorData.detail || "Update failed"}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading patient details...</div>;

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
      <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
        <div className="bg-amber-100 text-amber-600 p-2 rounded-xl">
          <UserCog size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Edit Patient Details</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
            <input 
              required
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">MRN</label>
            <input 
              required
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
              value={formData.external_id}
              readOnly 
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Date of Birth</label>
            <input 
              type="date" 
              className="w-full p-3 rounded-xl border border-slate-200"
              value={formData.dob}
              onChange={e => setFormData({...formData, dob: e.target.value})}
            />
          </div>

          {/* Added Gender Select */}
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

          {/* Added Contact Info Input */}
          <div className="col-span-2">
             <label className="block text-sm font-bold text-slate-700 mb-1">Contact Info</label>
             <input 
               type="text"
               className="w-full p-3 rounded-xl border border-slate-200"
               value={formData.contact_info}
               onChange={e => setFormData({...formData, contact_info: e.target.value})}
             />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">Clinical Notes</label>
            <textarea 
              rows="3"
              className="w-full p-3 rounded-xl border border-slate-200"
              value={formData.medical_history}
              onChange={e => setFormData({...formData, medical_history: e.target.value})}
            />
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <button type="button" onClick={() => navigate('/')} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 shadow-lg shadow-amber-200">
            <Save size={18} className="inline mr-2" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}