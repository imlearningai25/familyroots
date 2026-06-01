import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

type Tab = 'profile' | 'security';

interface UserProfile {
  given_name: string | null;
  family_name: string | null;
  email: string;
  locale: string;
  timezone: string;
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
  return (
    <a
      href={`/settings/${tab}`}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </a>
  );
}

export default function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const storeUser   = useAuthStore((s) => s.user);
  const setUser     = useAuthStore((s) => s.setUser);

  const activeTab: Tab = tab === 'security' ? 'security' : 'profile';

  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);

  const [givenName,   setGivenName]   = useState('');
  const [familyName,  setFamilyName]  = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg,  setProfileMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [pwSaving,    setPwSaving]    = useState(false);
  const [pwMsg,       setPwMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setProfile(data);
        setGivenName(data.given_name ?? '');
        setFamilyName(data.family_name ?? '');
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ given_name: givenName.trim() || null, family_name: familyName.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to save profile');
      }
      const updated: UserProfile = await res.json();
      setProfile(updated);
      if (storeUser) {
        setUser({
          ...storeUser,
          displayName: `${updated.given_name ?? ''} ${updated.family_name ?? ''}`.trim() || storeUser.email,
        });
      }
      setProfileMsg({ ok: true, text: 'Profile saved.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err.message });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: 'Passwords do not match.' });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      const res = await fetch(`${API_BASE}/users/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to change password');
      }
      setPwMsg({ ok: true, text: 'Password changed successfully.' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      setPwMsg({ ok: false, text: err.message });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="flex gap-1 mb-8 border-b border-gray-200">
        <TabLink tab="profile"  active={activeTab === 'profile'} />
        <TabLink tab="security" active={activeTab === 'security'} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === 'profile' ? (
        <form onSubmit={handleProfileSave} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                type="text"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                placeholder="Given name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="Family name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={profile?.email ?? ''}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{profileMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileSaving}
              className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handlePasswordChange} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters, at least one uppercase letter and one digit.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{pwMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwSaving || !currentPw || !newPw || !confirmPw}
              className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {pwSaving ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
