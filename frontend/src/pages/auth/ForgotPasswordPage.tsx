import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // 204 = success; any other non-ok = error
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? 'Something went wrong. Please try again.');
      }
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🌳</div>
          <h1 className="text-2xl font-bold text-slate-900">FamilyRoots</h1>
          <p className="text-sm text-slate-500 mt-1">Reset your password</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
          {submitted ? (
            <div className="text-center space-y-3">
              <div className="text-4xl">📬</div>
              <p className="text-sm font-medium text-slate-800">Check your inbox</p>
              <p className="text-sm text-slate-500">
                If <span className="font-medium">{email}</span> is registered, you'll receive a reset link shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-slate-500">
                Enter your email and we'll send you a link to reset your password.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-5">
          <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
