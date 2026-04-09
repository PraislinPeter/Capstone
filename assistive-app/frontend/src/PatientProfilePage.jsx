import React from 'react';

export default function PatientProfilePage({ patient, onBack, onStartSession }) {
  if (!patient) {
    return <div className="text-slate-400">No patient selected.</div>;
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <button
        onClick={onBack}
        className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
      >
        Back
      </button>

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-3xl font-black text-slate-900">{patient.full_name}</h2>
          <p className="mt-1 text-sm text-slate-500">{patient.patient_code}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm">
          <Info label="Age" value={patient.age} />
          <Info label="Caregiver" value={patient.caregiver_name} />
          <Info label="Diagnosis" value={patient.diagnosis} />
          <Info label="Notes" value={patient.notes} />
        </div>

        <div className="mt-8">
          <button
            onClick={() => onStartSession(patient)}
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-bold">{label}</p>
      <p className="mt-2 text-slate-800 font-medium">{value || '-'}</p>
    </div>
  );
}