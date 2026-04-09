import React, { useState } from 'react';
import { BrainCircuit, Mail, Lock, User, ShieldCheck } from 'lucide-react';

export default function TherapistAuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    fullName: '',
    role: 'therapist',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }

    if (mode === 'signup') {
      if (!form.fullName.trim()) {
        setError('Full name is required.');
        return;
      }
      if (form.password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      const url =
        mode === 'signup'
          ? 'http://localhost:8000/auth/signup'
          : 'http://localhost:8000/auth/login';

      const body =
        mode === 'signup'
          ? {
              name: form.fullName,
              email: form.email,
              password: form.password,
              role: form.role,
            }
          : {
              email: form.email,
              password: form.password,
            };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Authentication failed.');
        setLoading(false);
        return;
      }

      localStorage.setItem('clinicianAuth', JSON.stringify(data));
      onAuthSuccess(data);
    } catch (err) {
      console.error(err);
      setError('Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-6xl grid md:grid-cols-2 bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
        <div className="bg-indigo-600 text-white p-10 flex flex-col justify-between">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-6">
              <BrainCircuit size={30} />
            </div>
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-200 font-bold mb-3">
              AURA
            </p>
            <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4">
              Therapist & Caregiver Portal
            </h1>
            <p className="text-indigo-100 text-sm leading-6 max-w-md">
              Secure access to live session analysis, patient records, and caregiver-ready summaries.
            </p>
          </div>

          <div className="space-y-4 mt-10">
            <Feature text="Live emotion analysis dashboard" />
            <Feature text="Patient session archive and playback" />
            <Feature text="Therapist and caregiver role access" />
          </div>
        </div>

        <div className="p-10 md:p-12 flex flex-col justify-center bg-white">
          <div className="mb-8">
            <div className="inline-flex bg-slate-100 rounded-xl p-1 mb-8">
              <button
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`px-6 py-2.5 text-sm font-bold rounded-lg transition ${
                  mode === 'login' ? 'bg-white shadow text-slate-900' : 'text-slate-500'
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
                className={`px-5 py-2 text-sm font-bold rounded-lg transition ${
                  mode === 'signup' ? 'bg-white shadow text-slate-900' : 'text-slate-500'
                }`}
              >
                Create Account
              </button>
            </div>

            <h2 className="text-2xl font-black text-slate-900 mb-2">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-slate-500">
              {mode === 'login'
                ? 'Sign in to access the clinician dashboard.'
                : 'Create a therapist or caregiver account for the platform.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <InputField
                  icon={<User size={18} />}
                  name="fullName"
                  placeholder="Full name"
                  value={form.fullName}
                  onChange={handleChange}
                />

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="therapist">Therapist</option>
                    <option value="caregiver">Caregiver</option>
                  </select>
                </div>
              </>
            )}

            <InputField
              icon={<Mail size={18} />}
              name="email"
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={handleChange}
            />

            <InputField
              icon={<Lock size={18} />}
              name="password"
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
            />

            {mode === 'signup' && (
              <InputField
                icon={<ShieldCheck size={18} />}
                name="confirmPassword"
                type="password"
                placeholder="Confirm password"
                value={form.confirmPassword}
                onChange={handleChange}
              />
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition shadow-lg shadow-indigo-200 text-base"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function InputField({ icon, ...props }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5 bg-white focus-within:ring-2 focus-within:ring-indigo-200">
      <div className="text-slate-400">{icon}</div>
      <input
        {...props}
        className="w-full outline-none text-sm text-slate-700 placeholder:text-slate-400"
      />
    </div>
  );
}

function Feature({ text }) {
  return (
    <div className="flex items-center gap-3 text-sm font-medium text-white/95">
      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
        <ShieldCheck size={16} />
      </div>
      <span>{text}</span>
    </div>
  );
}