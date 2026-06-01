/**
 * FamilyTreePage — full-screen canvas route.
 *
 * Route: /trees/:treeId
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TreeCanvas } from '@features/tree/canvas/TreeCanvas';
import { useCanvasStore } from '@store/canvas.store';
import { useAuthStore } from '@store/auth.store';
import { queryKeys } from '@queries/keys';
import type { ApiTreeGraph } from '@features/tree/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

async function fetchTreeGraph(treeId: string, token: string | null): Promise<ApiTreeGraph> {
  const res = await fetch(`${API_BASE}/trees/${treeId}/graph`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load tree');
  return res.json();
}

async function createPerson(
  treeId: string,
  token: string | null,
  fields: { givenName: string; surname: string; sex: string; isLiving: boolean },
): Promise<string> {
  const res = await fetch(`${API_BASE}/trees/${treeId}/persons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({
      given_name: fields.givenName,
      surname: fields.surname,
      sex: fields.sex,
      is_living: fields.isLiving,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? 'Failed to create person');
  }
  const data = await res.json();
  return data.id as string;
}

// ── Shared person fields ───────────────────────────────────────────────────

interface PersonFields {
  givenName: string;
  surname: string;
  sex: string;
  isLiving: boolean;
}

const EMPTY_FIELDS: PersonFields = { givenName: '', surname: '', sex: 'UNKNOWN', isLiving: true };

function PersonFormFields({
  values,
  onChange,
}: {
  values: PersonFields;
  onChange: (v: PersonFields) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">First name</label>
          <input
            value={values.givenName}
            onChange={(e) => onChange({ ...values, givenName: e.target.value })}
            className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Given name"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Last name</label>
          <input
            value={values.surname}
            onChange={(e) => onChange({ ...values, surname: e.target.value })}
            className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Surname"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Sex</label>
        <select
          value={values.sex}
          onChange={(e) => onChange({ ...values, sex: e.target.value })}
          className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="UNKNOWN">Unknown</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={values.isLiving}
          onChange={(e) => onChange({ ...values, isLiving: e.target.checked })}
          className="rounded border-slate-300"
        />
        Currently living
      </label>
    </>
  );
}

// ── Add Person Modal (standalone, from top bar) ────────────────────────────

interface AddPersonModalProps {
  treeId: string;
  token: string | null;
  onClose: () => void;
  onAdded: () => void;
}

function AddPersonModal({ treeId, token, onClose, onAdded }: AddPersonModalProps) {
  const [fields,  setFields]  = useState<PersonFields>(EMPTY_FIELDS);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await createPerson(treeId, token, fields);
      onAdded();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-bold text-slate-900 mb-4">Add person</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <PersonFormFields values={fields} onChange={setFields} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {loading ? 'Adding…' : 'Add person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Relation Modal (Add Parent / Child / Spouse) ───────────────────────

type RelationMode = 'parent' | 'child' | 'spouse';

const RELATION_CONFIG: Record<RelationMode, { label: string; linkBody: (id: string) => Record<string, unknown>; linkPath: (anchor: string) => string }> = {
  parent: {
    label: 'Add Parent',
    linkPath: (anchor) => `parents`,
    linkBody: (newId) => ({ parent_id: newId, parentage_type: 'BIOLOGICAL', union_type: 'UNKNOWN' }),
  },
  child: {
    label: 'Add Child',
    linkPath: (anchor) => `children`,
    linkBody: (newId) => ({ child_id: newId, parentage_type: 'BIOLOGICAL', union_type: 'UNKNOWN' }),
  },
  spouse: {
    label: 'Add Spouse',
    linkPath: (anchor) => `spouses`,
    linkBody: (newId) => ({ spouse_id: newId, union_type: 'MARRIAGE' }),
  },
};

interface AddRelationModalProps {
  mode: RelationMode;
  anchorPersonId: string;
  anchorName: string;
  treeId: string;
  token: string | null;
  candidates: CandidatePerson[];
  onClose: () => void;
  onAdded: () => void;
}

const SEX_INITIAL_COLOR: Record<string, string> = {
  MALE:    'bg-blue-100 text-blue-600',
  FEMALE:  'bg-pink-100 text-pink-600',
  OTHER:   'bg-purple-100 text-purple-600',
  UNKNOWN: 'bg-gray-100 text-gray-500',
};

function AddRelationModal({
  mode, anchorPersonId, anchorName, treeId, token, candidates, onClose, onAdded,
}: AddRelationModalProps) {
  const [inputMode,  setInputMode]  = useState<'new' | 'existing'>('new');
  const [fields,     setFields]     = useState<PersonFields>(EMPTY_FIELDS);
  const [search,     setSearch]     = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const cfg = RELATION_CONFIG[mode];

  async function link(personId: string, force = false) {
    const suffix = force ? '?force=true' : '';
    const res = await fetch(
      `${API_BASE}/trees/${treeId}/persons/${anchorPersonId}/${cfg.linkPath(anchorPersonId)}${suffix}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify(cfg.linkBody(personId)),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail ?? 'Failed to link relationship');
    }
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const newId = await createPerson(treeId, token, fields);
      await link(newId);
      onAdded();
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  async function handleExistingSubmit() {
    if (!selectedId) return;
    const candidate = candidates.find((c) => c.id === selectedId);
    const force = mode === 'child' && (candidate?.hasParents ?? false);
    setLoading(true); setError('');
    try {
      await link(selectedId, force);
      onAdded();
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  const filtered = candidates.filter((p) =>
    `${p.displayGivenName} ${p.displaySurname}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCandidate = candidates.find((c) => c.id === selectedId);

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-bold text-slate-900 mb-0.5">{cfg.label}</h2>
        {anchorName && <p className="text-xs text-slate-400 mb-4">for {anchorName}</p>}

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4">
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setInputMode(m); setError(''); setSelectedId(null); setSearch(''); }}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                inputMode === m ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {m === 'new' ? 'New person' : 'Existing member'}
            </button>
          ))}
        </div>

        {inputMode === 'new' ? (
          <form onSubmit={handleNewSubmit} className="space-y-3">
            <PersonFormFields values={fields} onChange={setFields} />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                {loading ? 'Adding…' : cfg.label}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">
                  {candidates.length === 0 ? 'No other members in this tree' : 'No matches'}
                </p>
              )}
              {filtered.map((p) => {
                const name = `${p.displayGivenName} ${p.displaySurname}`.trim() || 'Unknown';
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                      isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${SEX_INITIAL_COLOR[p.sex] ?? SEX_INITIAL_COLOR.UNKNOWN}`}>
                      {name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className={`text-sm flex-1 truncate ${isSelected ? 'text-brand-700 font-medium' : 'text-slate-700'}`}>
                      {name}
                    </span>
                    {p.hasParents && mode === 'child' && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                        has parents
                      </span>
                    )}
                    {isSelected && !p.hasParents && <span className="text-brand-500 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedCandidate?.hasParents && mode === 'child' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This person already has parents recorded. Linking here will replace their existing parent connection.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExistingSubmit}
                disabled={loading || !selectedId}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {loading ? 'Linking…' : `Link as ${mode}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Child to union modal ───────────────────────────────────────────────

interface CandidatePerson {
  id: string;
  displayGivenName: string;
  displaySurname: string;
  sex: string;
  hasParents: boolean; // already a child in another family group
}

interface AddChildToUnionModalProps {
  parent1Id: string;
  parent2Id: string | null;
  parent1Name: string;
  parent2Name: string;
  treeId: string;
  token: string | null;
  candidates: CandidatePerson[]; // existing persons that can be linked
  onClose: () => void;
  onAdded: () => void;
}

function AddChildToUnionModal({
  parent1Id, parent2Id, parent1Name, parent2Name,
  treeId, token, candidates, onClose, onAdded,
}: AddChildToUnionModalProps) {
  const [mode,       setMode]       = useState<'new' | 'existing'>('new');
  const [fields,     setFields]     = useState<PersonFields>(EMPTY_FIELDS);
  const [search,     setSearch]     = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const unionLabel = parent2Id
    ? `${parent1Name} & ${parent2Name}`
    : parent1Name;

  async function linkChild(childId: string, force = false) {
    const body: Record<string, unknown> = {
      child_id: childId,
      parentage_type: 'BIOLOGICAL',
      union_type: 'UNKNOWN',
    };
    if (parent2Id) body.other_parent_id = parent2Id;
    const url = `${API_BASE}/trees/${treeId}/persons/${parent1Id}/children${force ? '?force=true' : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail ?? 'Failed to link child');
    }
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const newId = await createPerson(treeId, token, fields);
      await linkChild(newId);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExistingSubmit() {
    if (!selectedId) return;
    const candidate = candidates.find((c) => c.id === selectedId);
    setLoading(true);
    setError('');
    try {
      await linkChild(selectedId, candidate?.hasParents ?? false);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = candidates.filter((p) => {
    const name = `${p.displayGivenName} ${p.displaySurname}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });


  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-bold text-slate-900 mb-0.5">Add Child</h2>
        <p className="text-xs text-slate-400 mb-4">for {unionLabel}</p>

        {/* Mode tabs */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4">
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(''); setSelectedId(null); }}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {m === 'new' ? 'New person' : 'Existing person'}
            </button>
          ))}
        </div>

        {mode === 'new' ? (
          <form onSubmit={handleNewSubmit} className="space-y-3">
            <PersonFormFields values={fields} onChange={setFields} />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                {loading ? 'Adding…' : 'Add child'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">
                  {candidates.length === 0 ? 'No available persons in this tree' : 'No matches'}
                </p>
              )}
              {filtered.map((p) => {
                const name = `${p.displayGivenName} ${p.displaySurname}`.trim() || 'Unknown';
                const initial = name[0]?.toUpperCase() ?? '?';
                const colorCls = SEX_INITIAL_COLOR[p.sex] ?? SEX_INITIAL_COLOR.UNKNOWN;
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                      isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${colorCls}`}>
                      {initial}
                    </div>
                    <span className={`text-sm flex-1 truncate ${isSelected ? 'text-brand-700 font-medium' : 'text-slate-700'}`}>
                      {name}
                    </span>
                    {p.hasParents && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                        has parents
                      </span>
                    )}
                    {isSelected && !p.hasParents && <span className="text-brand-500 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedId && candidates.find((c) => c.id === selectedId)?.hasParents && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This person already has parents recorded. Linking here will
                replace their existing parent connection.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExistingSubmit}
                disabled={loading || !selectedId}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {loading ? 'Linking…' : 'Link as child'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit person modal ──────────────────────────────────────────────────────

interface EditPersonFields {
  givenName: string;
  surname: string;
  sex: string;
  status: 'living' | 'deceased' | 'unknown';
}

interface EditPersonModalProps {
  personId: string;
  initial: EditPersonFields;
  treeId: string;
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditPersonModal({ personId, initial, treeId, token, onClose, onSaved }: EditPersonModalProps) {
  const [fields,  setFields]  = useState<EditPersonFields>(initial);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/persons/${personId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          given_name:  fields.givenName,
          surname:     fields.surname,
          sex:         fields.sex,
          is_living:   fields.status === 'living',
          is_deceased: fields.status === 'deceased',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail ?? 'Failed to save');
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-bold text-slate-900 mb-4">Edit person</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">First name</label>
              <input
                value={fields.givenName}
                onChange={(e) => setFields((f) => ({ ...f, givenName: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Given name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Last name</label>
              <input
                value={fields.surname}
                onChange={(e) => setFields((f) => ({ ...f, surname: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Surname"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Sex</label>
            <select
              value={fields.sex}
              onChange={(e) => setFields((f) => ({ ...f, sex: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['living', 'deceased', 'unknown'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFields((f) => ({ ...f, status: s }))}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                    fields.status === s ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Selection panel (right drawer) ────────────────────────────────────────

interface SelectionPanelProps {
  personId: string | null;
  personName: string;
  treeId: string;
  token: string | null;
  onClose: () => void;
  onAddParent: () => void;
  onAddChild: () => void;
  onAddSpouse: () => void;
  onSetFocus: () => void;
  onDeleted: () => void;
  onEdit: () => void;
}

function SelectionPanel({
  personId, personName, treeId, token,
  onClose, onAddParent, onAddChild, onAddSpouse, onSetFocus, onDeleted, onEdit,
}: SelectionPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState('');

  if (!personId) return null;

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/persons/${personId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail ?? 'Failed to delete');
      }
      onDeleted();
    } catch (err: any) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-72 bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-slate-700">Person</span>
          {personName && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{personName}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          <Link
            to={`/trees/${treeId}/persons/${personId}`}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200"
          >
            👤 Open Profile
          </Link>
          <button onClick={onEdit}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            ✏️ Edit
          </button>
          <button onClick={onAddParent}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            ➕ Add Parent
          </button>
          <button onClick={onAddChild}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            ➕ Add Child
          </button>
          <button onClick={onAddSpouse}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            ➕ Add Spouse
          </button>
          <button onClick={onSetFocus}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            🎯 Set as Focus
          </button>

          {/* Divider */}
          <div className="pt-2 border-t border-slate-100" />

          {!confirmDelete ? (
            <button
              onClick={() => { setDeleteError(''); setConfirmDelete(true); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 border border-red-100"
            >
              🗑 Delete person
            </button>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs text-red-700 font-medium">
                Remove <span className="font-semibold">{personName || 'this person'}</span> from the tree?
              </p>
              {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmDelete(false); setDeleteError(''); }}
                  disabled={deleting}
                  className="flex-1 h-7 text-xs border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-7 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Members modal ─────────────────────────────────────────────────────────

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string | null;
  email: string;
  display_name: string;
}

const ROLE_COLOR: Record<string, string> = {
  OWNER:  'bg-brand-100 text-brand-700',
  ADMIN:  'bg-purple-100 text-purple-700',
  EDITOR: 'bg-green-100 text-green-700',
  VIEWER: 'bg-gray-100 text-gray-500',
};

function MembersModal({
  treeId, token, currentUserId, onClose,
}: {
  treeId: string;
  token: string | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const [members,  setMembers]  = useState<Member[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/trees/${treeId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then((r) => r.json())
      .then(setMembers)
      .catch(() => setError('Failed to load members'))
      .finally(() => setLoading(false));
  }, [treeId, token]);

  const myRole = members.find((m) => m.user_id === currentUserId)?.role ?? '';
  const canRemove = myRole === 'OWNER' || myRole === 'ADMIN';

  async function handleRemove(member: Member) {
    setRemoving(member.user_id);
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/members/${member.user_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail ?? 'Failed to remove member');
      }
      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-slate-900">Members</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">✕</button>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-red-600 px-2">{error}</p>}
          {!loading && members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-500 flex-shrink-0">
                {(m.display_name[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{m.display_name}</p>
                <p className="text-xs text-slate-400 truncate">{m.email}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLOR[m.role] ?? ROLE_COLOR.VIEWER}`}>
                {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
              </span>
              {canRemove && m.user_id !== currentUserId && m.role !== 'OWNER' && (
                <button
                  onClick={() => handleRemove(m)}
                  disabled={removing === m.user_id}
                  className="ml-1 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors flex-shrink-0"
                  title="Remove member"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────

function TreeTopBar({
  treeName,
  personCount,
  onAddPerson,
  onMembers,
  onResetLayout,
}: {
  treeName: string;
  personCount: number;
  onAddPerson: () => void;
  onMembers: () => void;
  onResetLayout: () => void;
}) {
  return (
    <div className="absolute top-0 left-0 right-0 h-12 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center px-4 gap-3 z-30">
      <Link to="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors text-sm">
        ← Dashboard
      </Link>
      <div className="w-px h-5 bg-slate-200" />
      <span className="font-semibold text-slate-800 text-sm truncate">{treeName}</span>
      <span className="text-xs text-slate-400">{personCount} people</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onResetLayout}
          title="Snap nodes back to layout and fit view"
          className="px-3 py-1.5 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
        >
          ↺ Reset layout
        </button>
        <button
          onClick={onMembers}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Members
        </button>
        <button
          onClick={onAddPerson}
          className="px-3 py-1.5 bg-brand-500 text-white text-xs font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          + Add person
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FamilyTreePage() {
  const { treeId } = useParams<{ treeId: string }>();

  const [panelPersonId,     setPanelPersonId]     = useState<string | null>(null);
  const [showAddPerson,     setShowAddPerson]     = useState(false);
  const [relationMode,      setRelationMode]      = useState<RelationMode | null>(null);
  const [showMembers,       setShowMembers]       = useState(false);
  const [unionChildFgId,    setUnionChildFgId]    = useState<string | null>(null);
  const [showEdit,          setShowEdit]          = useState(false);

  const setTreeId        = useCanvasStore((s) => s.setTreeId);
  const resetCanvas      = useCanvasStore((s) => s.reset);
  const setFocusPerson   = useCanvasStore((s) => s.setFocusPersonId);
  const bumpLayoutReset  = useCanvasStore((s) => s.bumpLayoutReset);
  const accessToken      = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (treeId) setTreeId(treeId);
    return () => resetCanvas();
  }, [treeId, setTreeId, resetCanvas]);

  const { data: graph, isLoading, refetch } = useQuery({
    queryKey: queryKeys.trees.detail(treeId ?? ''),
    queryFn:  () => fetchTreeGraph(treeId ?? '', accessToken),
    enabled:  !!treeId && !!accessToken,
    staleTime: 5 * 60_000,
  });

  const handlePersonSelect = useCallback((personId: string) => {
    setPanelPersonId(personId);
  }, []);

  const handlePanelClose = useCallback(() => {
    setPanelPersonId(null);
    useCanvasStore.getState().setSelectedPersonId(null);
  }, []);

  const handleAdded = useCallback(() => { refetch(); }, [refetch]);

  const panelPersonName = useMemo(() => {
    if (!panelPersonId || !graph) return '';
    const p = graph.persons.find((p) => p.id === panelPersonId);
    return p ? `${p.displayGivenName} ${p.displaySurname}`.trim() : '';
  }, [panelPersonId, graph]);

  function closeRelationModal() {
    setRelationMode(null);
  }

  function handleRelationAdded() {
    closeRelationModal();
    handleAdded();
  }

  function handleSetFocus() {
    if (panelPersonId) setFocusPerson(panelPersonId);
    handlePanelClose();
  }

  const treeName    = (graph as any)?.treeName ?? 'Family Tree';
  const personCount = graph?.persons.length ?? 0;

  return (
    <div className="fixed inset-0 flex flex-col">
      <TreeTopBar
        treeName={treeName}
        personCount={personCount}
        onAddPerson={() => setShowAddPerson(true)}
        onMembers={() => setShowMembers(true)}
        onResetLayout={bumpLayoutReset}
      />

      <div className="flex-1 relative mt-12">
        <TreeCanvas
          graph={graph ?? null}
          isLoading={isLoading}
          onPersonSelect={handlePersonSelect}
          onFamilyGroupSelect={(fgId) => {
            setPanelPersonId(null);
            setUnionChildFgId(fgId);
          }}
        />

        <SelectionPanel
          key={panelPersonId ?? '__empty__'}
          personId={panelPersonId}
          personName={panelPersonName}
          treeId={treeId ?? ''}
          token={accessToken}
          onClose={handlePanelClose}
          onAddParent={() => setRelationMode('parent')}
          onAddChild={()  => setRelationMode('child')}
          onAddSpouse={() => setRelationMode('spouse')}
          onSetFocus={handleSetFocus}
          onDeleted={() => { handlePanelClose(); handleAdded(); }}
          onEdit={() => setShowEdit(true)}
        />
      </div>

      {showAddPerson && (
        <AddPersonModal
          treeId={treeId ?? ''}
          token={accessToken}
          onClose={() => setShowAddPerson(false)}
          onAdded={handleAdded}
        />
      )}

      {relationMode && panelPersonId && (() => {
        const alreadyHasParents = new Set(
          (graph?.familyGroups ?? []).flatMap((g) => Object.keys(g.children))
        );
        let excludeIds: Set<string>;
        if (relationMode === 'parent') {
          const existingParents = (graph?.familyGroups ?? [])
            .filter((fg) => Object.keys(fg.children).includes(panelPersonId))
            .flatMap((fg) => fg.parentIds);
          excludeIds = new Set([panelPersonId, ...existingParents]);
        } else if (relationMode === 'child') {
          const existingChildren = (graph?.familyGroups ?? [])
            .filter((fg) => fg.parentIds.includes(panelPersonId))
            .flatMap((fg) => Object.keys(fg.children));
          excludeIds = new Set([panelPersonId, ...existingChildren]);
        } else {
          const existingSpouses = (graph?.familyGroups ?? [])
            .filter((fg) => fg.parentIds.includes(panelPersonId))
            .flatMap((fg) => fg.parentIds.filter((id) => id !== panelPersonId));
          excludeIds = new Set([panelPersonId, ...existingSpouses]);
        }
        const candidates = (graph?.persons ?? [])
          .filter((p) => !excludeIds.has(p.id))
          .map((p) => ({ ...p, hasParents: alreadyHasParents.has(p.id) }));
        return (
          <AddRelationModal
            mode={relationMode}
            anchorPersonId={panelPersonId}
            anchorName={panelPersonName}
            treeId={treeId ?? ''}
            token={accessToken}
            candidates={candidates}
            onClose={closeRelationModal}
            onAdded={handleRelationAdded}
          />
        );
      })()}

      {showEdit && panelPersonId && (() => {
        const p = graph?.persons.find((x) => x.id === panelPersonId);
        if (!p) return null;
        const initial: EditPersonFields = {
          givenName: p.displayGivenName,
          surname:   p.displaySurname,
          sex:       p.sex,
          status:    p.isLiving ? 'living' : p.isDeceased ? 'deceased' : 'unknown',
        };
        return (
          <EditPersonModal
            personId={panelPersonId}
            initial={initial}
            treeId={treeId ?? ''}
            token={accessToken}
            onClose={() => setShowEdit(false)}
            onSaved={() => { setShowEdit(false); handleAdded(); }}
          />
        );
      })()}

      {showMembers && (
        <MembersModal
          treeId={treeId ?? ''}
          token={accessToken}
          currentUserId={useAuthStore.getState().user?.id ?? ''}
          onClose={() => setShowMembers(false)}
        />
      )}

      {(() => {
        if (!unionChildFgId || !graph) return null;
        const fg = graph.familyGroups.find((f) => f.id === unionChildFgId);
        if (!fg) return null;
        const [p1Id, p2Id] = fg.parentIds;
        const personName = (id: string) => {
          const p = graph.persons.find((p) => p.id === id);
          return p ? `${p.displayGivenName} ${p.displaySurname}`.trim() : 'Unknown';
        };
        // Exclude parents and existing children from the candidate list
        const excludeIds = new Set([
          p1Id,
          ...(p2Id ? [p2Id] : []),
          ...Object.keys(fg.children),
        ]);
        // Track which persons are already children in any family group
        const alreadyHasParents = new Set(
          graph.familyGroups.flatMap((g) => Object.keys(g.children))
        );
        const candidates = graph.persons
          .filter((p) => !excludeIds.has(p.id))
          .map((p) => ({ ...p, hasParents: alreadyHasParents.has(p.id) }));
        return (
          <AddChildToUnionModal
            parent1Id={p1Id}
            parent2Id={p2Id ?? null}
            parent1Name={personName(p1Id)}
            parent2Name={p2Id ? personName(p2Id) : ''}
            treeId={treeId ?? ''}
            token={accessToken}
            candidates={candidates}
            onClose={() => setUnionChildFgId(null)}
            onAdded={() => { setUnionChildFgId(null); handleAdded(); }}
          />
        );
      })()}
    </div>
  );
}
