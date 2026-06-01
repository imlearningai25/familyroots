import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

async function register(body: {
  email: string;
  password: string;
  given_name: string;
  family_name: string;
  tenant_slug: string;
}) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? 'Registration failed');
  }
  return res.json();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function RegisterPage() {
  const navigate   = useNavigate();
  const storeLogin = useAuthStore((s) => s.login);

  const [givenName,   setGivenName]   = useState('');
  const [familyName,  setFamilyName]  = useState('');
  const [tenantSlug,  setTenantSlug]  = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  function handleGivenNameChange(v: string) {
    setGivenName(v);
    if (!slugTouched) {
      setTenantSlug(slugify(`${v}-${familyName}`));
    }
  }

  function handleFamilyNameChange(v: string) {
    setFamilyName(v);
    if (!slugTouched) {
      setTenantSlug(slugify(`${givenName}-${v}`));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const data = await register({ email, password, given_name: givenName, family_name: familyName, tenant_slug: tenantSlug });
      storeLogin(data.access_token, {
        id: data.user_id,
        tenantId: data.tenant_id,
        email,
        displayName: `${givenName} ${familyName}`.trim() || email,
        avatarUrl: undefined,
        isEmailVerified: false,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🌳</div>
          <h1 className="text-2xl font-bold text-slate-900">FamilyRoots</h1>
          <p className="text-sm text-slate-500 mt-1">Create your free account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  First name
                </label>
                <input
                  type="text"
                  autoComplete="given-name"
                  value={givenName}
                  onChange={(e) => handleGivenNameChange(e.target.value)}
                  required
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Alice"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Last name
                </label>
                <input
                  type="text"
                  autoComplete="family-name"
                  value={familyName}
                  onChange={(e) => handleFamilyNameChange(e.target.value)}
                  required
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Smith"
                />
              </div>
            </div>

            {/* Organisation slug */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Organisation ID
                <span className="ml-1 text-xs text-slate-400 font-normal">(your unique family workspace)</span>
              </label>
              <div className="flex items-center h-10 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent overflow-hidden">
                <span className="pl-3 pr-1 text-sm text-slate-400 select-none shrink-0">familyroots.app/</span>
                <input
                  type="text"
                  value={tenantSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setTenantSlug(slugify(e.target.value));
                  }}
                  required
                  minLength={3}
                  maxLength={100}
                  pattern="^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$"
                  className="flex-1 h-full pr-3 text-sm bg-transparent focus:outline-none"
                  placeholder="smith-family"
                />
              </div>
            </div>

            {/* Email */}
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
                placeholder="alice@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="8+ chars, uppercase & digit"
              />
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className={`w-full h-10 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
                  confirm && confirm !== password ? 'border-red-400' : 'border-slate-300'
                }`}
                placeholder="Re-enter password"
              />
              {confirm && confirm !== password && (
                <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
              )}
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
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
