import React from 'react';

export default function PatientHub({ patients, onCreate, onOpenProfile, onStartSession }) {
  return (
    <div className="w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Patient Hub</h2>
          <p className="mt-2 text-sm text-slate-500">
            Select a patient or create a new profile.
          </p>
        </div>

        <button
          onClick={onCreate}
          className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-sm"
        >
          + Add New Patient
        </button>
      </div>

      {patients.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-10 text-slate-400 shadow-sm">
          No patient profiles yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {patients.map((patient) => (
            <div
              key={patient.id}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-900 truncate">
                  {patient.full_name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {patient.patient_code} • Age {patient.age || '-'} • {patient.diagnosis || '-'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Caregiver: {patient.caregiver_name || '-'}
                </p>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => onOpenProfile(patient)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Open Profile
                </button>

                <button
                  onClick={() => onStartSession(patient)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                >
                  Start Session
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}