import React, { useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '@api/client';
import { SearchResultList } from '@features/search/components/SearchResultList';
import { RelationshipSearch } from '@features/search/components/RelationshipSearch';

type Tab = 'members' | 'trees' | 'relationship';

interface TreeSummary {
  id: string;
  name: string;
  description: string | null;
  role: string;
  person_count: number;
  member_count: number;
}

const ROLE_LABEL: Record<string, string> = {
  OWNER:  'Owner',
  ADMIN:  'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get('q') ?? '';

  const [tab, setTab]               = useState<Tab>('members');
  const [treeFilter, setTreeFilter]   = useState('');
  const [selectedTreeId, setSelectedTreeId] = useState<string>('');

  const { data: trees, isLoading: treesLoading } = useQuery({
    queryKey: ['trees'],
    queryFn:  () => get<TreeSummary[]>('/trees'),
    staleTime: 60_000,
  });

  const filteredTrees = trees?.filter((t) =>
    t.name.toLowerCase().includes(treeFilter.toLowerCase())
  );

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchParams(e.target.value ? { q: e.target.value } : {});
    },
    [setSearchParams],
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Search</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          ['members',      'Members'],
          ['trees',        'Trees'],
          ['relationship', 'Relationship'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Members tab */}
      {tab === 'members' && (
        <>
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={urlQ}
                onChange={handleQueryChange}
                placeholder="Search people by name…"
                autoFocus
                autoComplete="off"
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-4 text-sm
                           shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none
                           focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={selectedTreeId}
              onChange={(e) => setSelectedTreeId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm
                         text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1
                         focus:ring-indigo-500 min-w-[180px]"
            >
              <option value="">All trees</option>
              {trees?.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <SearchResultList treeId={selectedTreeId || undefined} />
        </>
      )}

      {/* Trees tab */}
      {tab === 'trees' && (
        <>
          <div className="relative mb-6">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
              placeholder="Filter trees by name…"
              autoFocus
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-4 text-sm
                         shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none
                         focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {treesLoading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!treesLoading && filteredTrees?.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
              <TreeIcon />
              <p className="text-sm">
                {treeFilter ? `No trees matching "${treeFilter}".` : 'No family trees yet.'}
              </p>
            </div>
          )}

          {filteredTrees && filteredTrees.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
              {filteredTrees.map((tree) => (
                <li key={tree.id}>
                  <Link
                    to={`/trees/${tree.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-2xl select-none">🌳</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{tree.name}</p>
                      {tree.description && (
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{tree.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {tree.person_count} {tree.person_count === 1 ? 'person' : 'people'}
                        {' · '}
                        {tree.member_count} {tree.member_count === 1 ? 'collaborator' : 'collaborators'}
                        {' · '}
                        {ROLE_LABEL[tree.role] ?? tree.role}
                      </p>
                    </div>
                    <ChevronIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Relationship tab */}
      {tab === 'relationship' && (
        <RelationshipSearch trees={trees ?? []} />
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 3v18M5 8l7-5 7 5M5 16l7-5 7 5" />
    </svg>
  );
}
