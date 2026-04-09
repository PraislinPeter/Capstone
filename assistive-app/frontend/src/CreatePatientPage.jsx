import React, { useState } from 'react';

export default function CreatePatientPage({ onSave, onCancel, nextPatientNumber }) {
  const [form, setForm] = useState({
  patient_code: `P-${String(nextPatientNumber).padStart(3, '0')}`,
  full_name: '',
  age: '',
  caregiver_name: '',
  diagnosis: '',
  notes: '',
});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    onSave(form);
  };

  return (
    <div className="w-full max-w-4xl">
      <div className="mb-6">
        <h2 className="text-3xl font-black text-slate-900">Create Patient Profile</h2>
        <p className="mt-2 text-sm text-slate-500">
          Add a child profile before starting a session.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input label="Patient Code" name="patient_code" value={form.patient_code} onChange={handleChange} />
          <Input label="Full Name" name="full_name" value={form.full_name} onChange={handleChange} />
          <Input label="Age" name="age" value={form.age} onChange={handleChange} />
          <Input label="Caregiver Name" name="caregiver_name" value={form.caregiver_name} onChange={handleChange} />
          <Input label="Diagnosis" name="diagnosis" value={form.diagnosis} onChange={handleChange} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Notes</label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={5}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700"
          >
            Save Patient
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      <input
        {...props}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  );
}