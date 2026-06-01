import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

interface TreeSummary {
  id: string;
  name: string;
  description: string | null;
  role: string;
  person_count: number;
  member_count: number;
}

export default function ReportsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [trees,   setTrees]   = useState<TreeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/trees`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load data');
        return r.json();
      })
      .then(setTrees)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const totalPeople  = trees.reduce((s, t) => s + t.person_count, 0);
  const totalMembers = trees.reduce((s, t) => s + t.member_count, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Reports</h1>
      <p className="text-sm text-gray-500 mb-8">Overview of your family trees and genealogy data.</p>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Family trees',  value: trees.length,  icon: '🌳' },
              { label: 'Total people',  value: totalPeople,   icon: '👤' },
              { label: 'Collaborators', value: totalMembers,  icon: '👥' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-2xl mb-2">{icon}</div>
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <div className="text-sm text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {trees.length > 0 ? (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Tree breakdown</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Tree</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Role</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">People</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trees.map((tree, i) => (
                      <tr key={tree.id} className={i < trees.length - 1 ? 'border-b border-gray-100' : ''}>
                        <td className="px-5 py-3">
                          <Link
                            to={`/trees/${tree.id}`}
                            className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                          >
                            {tree.name}
                          </Link>
                          {tree.description && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{tree.description}</p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-500 capitalize">{tree.role.toLowerCase()}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{tree.person_count}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{tree.member_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <div className="text-5xl mb-4">📊</div>
              <p className="text-lg font-medium text-gray-600">No data yet</p>
              <p className="text-sm mt-1">Create a family tree to see reports here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
