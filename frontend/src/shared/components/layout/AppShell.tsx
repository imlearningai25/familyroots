import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';

export default function AppShell() {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const nav = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/search',    label: 'Search' },
    { to: '/reports',   label: 'Reports' },
    { to: '/settings',  label: 'Settings' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-gray-100">
          <span className="font-bold text-brand-600 text-lg">FamilyRoots</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button
            onClick={() => {
              logout();
              window.location.href = '/login';
            }}
            className="w-full text-left text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-surface-muted">
        <Outlet />
      </main>
    </div>
  );
}
