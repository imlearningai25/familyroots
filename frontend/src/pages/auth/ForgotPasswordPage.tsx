import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '@shared/components/SEO';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export default function ForgotPasswordPage() {
  const [email,        setEmail]        = useState('');
  const [submitted,    setSubmitted]    = useState(false);
  const [unverified,   setUnverified]   = useState(false);
  const [resent,       setResent]       = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [resending,    setResending]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403 && String(err.type ?? '').includes('account-not-verified')) {
          setUnverified(true);
          return;
        }
        throw new Error(err.detail ?? 'Something went wrong. Please try again.');
      }
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    setResending(true);
    try {
      await fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <SEO
        title="Forgot Password"
        description="Reset your FamilyRoots password. Enter your email address to receive a secure password reset link."
        canonical="/forgot-password"
        noIndex
      />
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
          ) : unverified ? (
            <div className="space-y-4">
              <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800">Email not verified</p>
                <p className="text-sm text-amber-700 mt-1">
                  <span className="font-medium">{email}</span> has not been verified yet.
                  Please verify your account before resetting your password.
                </p>
              </div>
              {resent ? (
                <p className="text-sm text-center text-green-700">
                  Verification email sent — check your inbox.
                </p>
              ) : (
                <button
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="w-full h-10 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {resending ? 'Sending…' : 'Resend verification email'}
                </button>
              )}
              <button
                onClick={() => { setUnverified(false); setResent(false); }}
                className="w-full text-sm text-slate-500 hover:text-slate-700"
              >
                Try a different email
              </button>
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
    </>
  );
}
