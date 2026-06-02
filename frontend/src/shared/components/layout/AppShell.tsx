import React, { useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';
import { usePortalThemeStore } from '@store/portalTheme.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export default function AppShell() {
  const user         = useAuthStore((s) => s.user);
  const logout       = useAuthStore((s) => s.logout);
  const accessToken  = useAuthStore((s) => s.accessToken);
  const [loggingOut, setLoggingOut] = useState(false);
  const portalTheme  = usePortalThemeStore((s) => s.theme);

  // Inject portal CSS custom properties onto <html> whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--portal-main-bg',       portalTheme.mainBg);
    root.style.setProperty('--portal-sidebar-bg',    portalTheme.sidebarBg);
    root.style.setProperty('--portal-sidebar-border',portalTheme.sidebarBorder);
    root.style.setProperty('--portal-nav-text',      portalTheme.navText);
    root.style.setProperty('--portal-nav-hover',     portalTheme.navHover);
    root.style.setProperty('--portal-nav-active-bg', portalTheme.navActiveBg);
    root.style.setProperty('--portal-nav-active-text',portalTheme.navActiveText);
    root.style.setProperty('--portal-logo-text',     portalTheme.logoText);
    document.body.style.setProperty('background',    portalTheme.mainBg);
    return () => { document.body.style.removeProperty('background'); };
  }, [portalTheme]);

  const isElevated = user?.appRole === 'ADMIN' || user?.appRole === 'AUDITOR';

  const isAdmin = user?.appRole === 'ADMIN';

  const nav = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/search',    label: 'Search' },
    { to: '/reports',   label: 'Reports' },
    ...(isElevated ? [{ to: '/activity', label: 'Activity' }] : []),
    ...(isAdmin    ? [{ to: '/admin',    label: 'Admin Dashboard' }]    : []),
    { to: '/settings',  label: 'Settings' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className="w-56 flex flex-col border-r"
        style={{ background: 'var(--portal-sidebar-bg)', borderColor: 'var(--portal-sidebar-border)' }}
      >
        <div
          className="h-14 flex items-center px-4 border-b"
          style={{ borderColor: 'var(--portal-sidebar-border)' }}
        >
          <span className="font-bold text-lg" style={{ color: 'var(--portal-logo-text)' }}>
            FamilyRoots
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `portal-nav-link${isActive ? ' active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: 'var(--portal-sidebar-border)' }}>
          <p className="text-xs truncate mb-2" style={{ color: 'var(--portal-nav-text)' }}>
            {user?.email}
          </p>
          <button
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await fetch(`${API_BASE}/auth/logout`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                });
              } finally {
                logout();
                window.location.href = '/login';
              }
            }}
            className="w-full text-left text-xs px-2 py-1 rounded disabled:opacity-50 hover:underline"
            style={{ color: 'var(--portal-nav-text)' }}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--portal-main-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
