import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';
import { SEO } from '@shared/components/SEO';
import { usePortalThemeStore, PORTAL_PRESETS, PORTAL_PRESET_LABEL, type PortalTheme } from '@store/portalTheme.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

type Tab = 'profile' | 'security' | 'appearance';

interface UserProfile {
  given_name: string | null;
  family_name: string | null;
  email: string;
  app_role: 'ADMIN' | 'STANDARD' | 'AUDITOR';
  locale: string;
  timezone: string;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN:    'Admin',
  STANDARD: 'Standard',
  AUDITOR:  'Auditor',
};

const ROLE_BADGE: Record<string, string> = {
  ADMIN:    'bg-purple-100 text-purple-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  AUDITOR:  'bg-amber-100 text-amber-700',
};

// ── Appearance Tab (portal-wide theme) ────────────────────────────────────

function PortalColorField({
  label, field, value,
}: { label: string; field: keyof PortalTheme; value: string }) {
  const updateField = usePortalThemeStore((s) => s.updateField);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <label className="text-sm text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded border border-gray-300" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => updateField(field, e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
          title={value}
        />
        <span className="text-xs text-gray-400 font-mono w-16">{value}</span>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setPreset, reset } = usePortalThemeStore();

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Controls the overall look of the portal — sidebar, backgrounds, and navigation.
        Tree canvas appearance is customized inside the tree view.
      </p>

      {/* Presets */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Presets</h3>
        <div className="flex flex-wrap gap-2">
          {PORTAL_PRESETS.map((p) => (
            <button
              key={p.preset}
              onClick={() => setPreset(p.preset)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                theme.preset === p.preset
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <span className="flex gap-0.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: p.mainBg, border: `1px solid ${p.sidebarBorder}` }} />
                <span className="w-3 h-3 rounded-sm" style={{ background: p.sidebarBg, border: `1px solid ${p.sidebarBorder}` }} />
                <span className="w-3 h-3 rounded-sm" style={{ background: p.navActiveBg }} />
              </span>
              {PORTAL_PRESET_LABEL[p.preset]}
            </button>
          ))}
          {theme.preset === 'custom' && (
            <span className="flex items-center px-3 py-2 rounded-lg border-2 border-brand-500 bg-brand-50 text-sm font-medium text-brand-700">
              Custom
            </span>
          )}
        </div>
      </div>

      {/* Background */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Background</h3>
        <div className="bg-white rounded-xl border border-gray-200 px-4">
          <PortalColorField label="Main content background" field="mainBg"   value={theme.mainBg} />
          <PortalColorField label="Card / panel background" field="cardBg"   value={theme.cardBg} />
        </div>
      </div>

      {/* Sidebar */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Sidebar</h3>
        <div className="bg-white rounded-xl border border-gray-200 px-4">
          <PortalColorField label="Sidebar background"  field="sidebarBg"       value={theme.sidebarBg} />
          <PortalColorField label="Sidebar border"      field="sidebarBorder"   value={theme.sidebarBorder} />
          <PortalColorField label="Nav link text"       field="navText"         value={theme.navText} />
          <PortalColorField label="Nav link hover"      field="navHover"        value={theme.navHover} />
          <PortalColorField label="Active link bg"      field="navActiveBg"     value={theme.navActiveBg} />
          <PortalColorField label="Active link text"    field="navActiveText"   value={theme.navActiveText} />
          <PortalColorField label="Logo text"           field="logoText"        value={theme.logoText} />
        </div>
      </div>

      {/* Text */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Foreground</h3>
        <div className="bg-white rounded-xl border border-gray-200 px-4">
          <PortalColorField label="Primary text"  field="textPrimary" value={theme.textPrimary} />
          <PortalColorField label="Muted text"    field="textMuted"   value={theme.textMuted} />
        </div>
      </div>

      {/* Live preview */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Preview</h3>
        <div className="rounded-xl overflow-hidden border border-gray-200 flex" style={{ height: 160 }}>
          {/* Sidebar preview */}
          <div className="w-36 flex flex-col p-2 gap-1" style={{ background: theme.sidebarBg, borderRight: `1px solid ${theme.sidebarBorder}` }}>
            <p className="text-xs font-bold px-2 py-1 mb-1" style={{ color: theme.logoText }}>FamilyRoots</p>
            {['Dashboard', 'Settings'].map((l, i) => (
              <div key={l} className="px-2 py-1 rounded text-xs" style={{
                background: i === 0 ? theme.navActiveBg : 'transparent',
                color: i === 0 ? theme.navActiveText : theme.navText,
              }}>{l}</div>
            ))}
          </div>
          {/* Main preview */}
          <div className="flex-1 p-4 flex flex-col gap-2" style={{ background: theme.mainBg }}>
            <p className="text-sm font-semibold" style={{ color: theme.textPrimary }}>Family Trees</p>
            <div className="rounded-lg p-3 shadow-sm" style={{ background: theme.cardBg, border: `1px solid ${theme.sidebarBorder}` }}>
              <p className="text-xs font-medium" style={{ color: theme.textPrimary }}>The Shah Dynasty</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>24 people · 3 members</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Reset to Light
        </button>
      </div>
    </div>
  );
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

  const activeTab: Tab = tab === 'security' ? 'security' : tab === 'appearance' ? 'appearance' : 'profile';

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
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <SEO
        title="Settings"
        description="Manage your FamilyRoots account settings — profile, security, and appearance."
        noIndex
      />
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-5 md:mb-6">Settings</h1>

      <div className="flex gap-1 mb-8 border-b border-gray-200">
        <TabLink tab="profile"  active={activeTab === 'profile'} />
        <TabLink tab="security" active={activeTab === 'security'} />
        <TabLink tab="appearance" active={activeTab === 'appearance'} />
      </div>

      {activeTab === 'appearance' && <AppearanceTab />}

      {activeTab !== 'appearance' && loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === 'profile' ? (
        <form onSubmit={handleProfileSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
              {profile?.app_role && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[profile.app_role] ?? ROLE_BADGE.STANDARD}`}>
                  {ROLE_LABEL[profile.app_role] ?? profile.app_role}
                </span>
              )}
              <span className="text-xs text-gray-400">Assigned by an administrator</span>
            </div>
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
