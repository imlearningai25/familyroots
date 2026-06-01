import React, { useState, useEffect, useRef } from 'react';
import { useNameSearch, useRelationship } from '../useSearch';
import type { PersonHit, RelationshipPath } from '../types';

interface Tree { id: string; name: string; }

interface Props {
  trees: Tree[];
}

export function RelationshipSearch({ trees }: Props) {
  const [treeId, setTreeId]   = useState('');
  const [person1, setPerson1] = useState<PersonHit | null>(null);
  const [person2, setPerson2] = useState<PersonHit | null>(null);

  const enabled = !!(treeId && person1 && person2);
  const { data, isFetching } = useRelationship(
    treeId,
    person1?.person_id ?? '',
    person2?.person_id ?? '',
    enabled,
  );

  function handleTreeChange(id: string) {
    setTreeId(id);
    setPerson1(null);
    setPerson2(null);
  }

  return (
    <div className="space-y-6">
      {/* Tree selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Family tree</label>
        <select
          value={treeId}
          onChange={(e) => handleTreeChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm
                     text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Select a tree…</option>
          {trees.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Person pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PersonPicker
          label="Person 1"
          treeId={treeId}
          value={person1}
          onChange={setPerson1}
          placeholder="Search first person…"
          excludeId={person2?.person_id}
        />
        <PersonPicker
          label="Person 2"
          treeId={treeId}
          value={person2}
          onChange={setPerson2}
          placeholder="Search second person…"
          excludeId={person1?.person_id}
        />
      </div>

      {/* Divider with "vs" */}
      {(person1 || person2) && (
        <div className="flex items-center gap-3 -mt-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">vs</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {/* Result */}
      {enabled && (
        isFetching
          ? <Spinner />
          : data
            ? <RelationshipResult
                rel={data.relationship}
                name1={personName(person1!)}
                name2={personName(person2!)}
              />
            : null
      )}
    </div>
  );
}

// ── Person picker ──────────────────────────────────────────────────────────────

function PersonPicker({
  label, treeId, value, onChange, placeholder, excludeId,
}: {
  label: string;
  treeId: string;
  value: PersonHit | null;
  onChange: (p: PersonHit | null) => void;
  placeholder: string;
  excludeId?: string;
}) {
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [debounced, setDebounced] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useNameSearch(debounced, {}, treeId || undefined);

  const hits = data?.hits.filter((h) => h.person_id !== excludeId).slice(0, 6) ?? [];

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  if (value) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-indigo-300 bg-indigo-50">
          <div className="h-7 w-7 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
            {(value.given_name?.[0] ?? value.surname?.[0] ?? '?').toUpperCase()}
          </div>
          <p className="flex-1 text-sm font-medium text-gray-900 truncate min-w-0">
            {personName(value)}
          </p>
          <button
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0 leading-none"
            title="Clear"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => debounced.length >= 2 && setOpen(true)}
          placeholder={treeId ? placeholder : 'Select a tree first…'}
          disabled={!treeId}
          autoComplete="off"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-3 text-sm
                     shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none
                     focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        {open && debounced.length >= 2 && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {isFetching ? (
              <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">No results.</p>
            ) : (
              hits.map((hit) => (
                <button
                  key={hit.person_id}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                  onMouseDown={() => { onChange(hit); setQuery(''); setOpen(false); }}
                >
                  <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 flex-shrink-0">
                    {(hit.given_name?.[0] ?? hit.surname?.[0] ?? '?').toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-900">{personName(hit)}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Result ─────────────────────────────────────────────────────────────────────

function RelationshipResult({
  rel, name1, name2,
}: {
  rel: RelationshipPath;
  name1: string;
  name2: string;
}) {
  if (!rel.found) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
        <div className="text-3xl mb-3">🔍</div>
        <p className="font-medium text-gray-700">No connection found</p>
        <p className="text-sm text-gray-400 mt-1">
          {name1} and {name2} are not connected in this tree.
        </p>
      </div>
    );
  }

  const label = rel.relationship_label
    ?? `${rel.distance} ${rel.distance === 1 ? 'step' : 'steps'} apart`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-4">
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">
          Relationship
        </p>
        <p className="text-xl font-bold text-gray-900 mt-1">{label}</p>
        <p className="text-sm text-gray-500 mt-0.5">
          {name1} → {name2} · {rel.distance} {rel.distance === 1 ? 'step' : 'steps'}
        </p>
      </div>

      {/* Path */}
      {rel.path.length > 0 && (
        <div className="px-5 py-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Connection path
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {rel.path.map((step, i) => (
              <React.Fragment key={step.person_id}>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                    {step.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="text-sm text-gray-800 font-medium whitespace-nowrap">
                    {step.name}
                  </span>
                </div>
                {i < rel.path.length - 1 && (
                  <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function personName(hit: PersonHit): string {
  return [hit.given_name, hit.surname].filter(Boolean).join(' ') || 'Unknown';
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
