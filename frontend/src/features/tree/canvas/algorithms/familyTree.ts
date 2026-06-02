/**
 * familyTreeLayout — genealogy-aware top-to-bottom layout.
 *
 * Guarantees:
 *   - Two parents in a couple are placed side-by-side with a small gap.
 *   - The family-group node is centred between the couple.
 *   - Children are distributed evenly below their family-group node.
 *   - Subtree widths are computed bottom-up so no subtrees overlap.
 */

import type { ApiTreeGraph, PositionedNode } from '../../types';
import {
  PERSON_NODE_WIDTH  as PW,
  PERSON_NODE_HEIGHT as PH,
  FAMILY_NODE_SIZE   as FS,
} from '../../types';

const COUPLE_GAP  = 24;   // gap between the two parents in a couple
const DEFAULT_SIBLING_GAP = 40;
const DEFAULT_V_GAP       = 80;

export function familyTreeLayout(
  graph: ApiTreeGraph,
  opts: { nodeHGap?: number; nodeVGap?: number } = {},
): PositionedNode[] {
  const sibGap = opts.nodeHGap ?? DEFAULT_SIBLING_GAP;
  const vGap   = opts.nodeVGap ?? DEFAULT_V_GAP;

  // ── Lookup maps ──────────────────────────────────────────────────────
  const fgById = new Map(graph.familyGroups.map((fg) => [fg.id, fg]));

  // childId → fgId  (family group where this person is a child)
  const personParentFG = new Map<string, string>();
  // parentId → fgId[]  (family groups where this person is a parent)
  const personChildFGs = new Map<string, string[]>();

  for (const fg of graph.familyGroups) {
    for (const cId of Object.keys(fg.children)) {
      personParentFG.set(cId, fg.id);
    }
    for (const pId of fg.parentIds) {
      const list = personChildFGs.get(pId) ?? [];
      list.push(fg.id);
      personChildFGs.set(pId, list);
    }
  }

  // ── Memoised subtree widths ──────────────────────────────────────────
  const wMemo = new Map<string, number>();

  function personW(id: string): number {
    const k = `p:${id}`;
    if (wMemo.has(k)) return wMemo.get(k)!;
    const fgIds = personChildFGs.get(id) ?? [];
    // Sum widths across all family groups this person parents (multiple unions)
    const w = fgIds.length > 0
      ? fgIds.reduce((acc, fgId, i) => acc + fgW(fgId) + (i > 0 ? sibGap : 0), 0)
      : PW;
    wMemo.set(k, w);
    return w;
  }

  function fgW(fgId: string): number {
    const k = `fg:${fgId}`;
    if (wMemo.has(k)) return wMemo.get(k)!;
    const fg = fgById.get(fgId)!;
    const coupleW = fg.parentIds.length >= 2 ? PW + COUPLE_GAP + PW : PW;
    const children = Object.keys(fg.children);
    if (children.length === 0) { wMemo.set(k, coupleW); return coupleW; }
    const childrenW = children.reduce(
      (acc, cId, i) => acc + personW(cId) + (i > 0 ? sibGap : 0), 0,
    );
    const w = Math.max(coupleW, childrenW);
    wMemo.set(k, w);
    return w;
  }

  // ── Recursive placement ──────────────────────────────────────────────
  const result: PositionedNode[] = [];
  const placedPersons = new Set<string>();
  const placedFGs     = new Set<string>();

  function placeFG(fgId: string, leftX: number, topY: number) {
    if (placedFGs.has(fgId)) return;
    placedFGs.add(fgId);

    const fg  = fgById.get(fgId)!;
    const myW = fgW(fgId);
    const cx  = leftX + myW / 2;          // horizontal centre of this subtree

    // Parents — placed side by side centred on cx
    const [p1Id, p2Id] = fg.parentIds;
    if (p1Id && p2Id) {
      if (!placedPersons.has(p1Id)) {
        result.push({ id: p1Id, x: cx - COUPLE_GAP / 2 - PW, y: topY });
        placedPersons.add(p1Id);
      }
      if (!placedPersons.has(p2Id)) {
        result.push({ id: p2Id, x: cx + COUPLE_GAP / 2, y: topY });
        placedPersons.add(p2Id);
      }
    } else if (p1Id && !placedPersons.has(p1Id)) {
      result.push({ id: p1Id, x: cx - PW / 2, y: topY });
      placedPersons.add(p1Id);
    }

    // Family-group node — centred between parents, halfway down to children
    const fgY = topY + PH + vGap / 2 - FS / 2;
    result.push({ id: fgId, x: cx - FS / 2, y: fgY });

    // Children — centred under the family-group node
    const children = Object.keys(fg.children);
    if (children.length === 0) return;

    const childRowY   = fgY + FS + vGap / 2;
    const totalChildW = children.reduce(
      (acc, cId, i) => acc + personW(cId) + (i > 0 ? sibGap : 0), 0,
    );
    let childX = leftX + (myW - totalChildW) / 2;

    for (const cId of children) {
      const cw = personW(cId);
      if (!placedPersons.has(cId)) {
        const cFGIds = personChildFGs.get(cId) ?? [];
        if (cFGIds.length > 0) {
          // Place all family groups this child leads as a parent
          let fgX = childX;
          for (const cFgId of cFGIds) {
            placeFG(cFgId, fgX, childRowY);
            fgX += fgW(cFgId) + sibGap;
          }
        } else {
          result.push({ id: cId, x: childX + cw / 2 - PW / 2, y: childRowY });
          placedPersons.add(cId);
        }
      }
      childX += cw + sibGap;
    }
  }

  // Root family groups = those whose parents have no parent family group
  const rootFGs = graph.familyGroups.filter((fg) =>
    fg.parentIds.every((pid) => !personParentFG.has(pid)),
  );

  let x = 40;
  for (const fg of rootFGs) {
    placeFG(fg.id, x, 40);
    x += fgW(fg.id) + sibGap * 2;
  }

  // Persons not reached (isolated — no family group at all)
  for (const p of graph.persons) {
    if (!placedPersons.has(p.id)) {
      result.push({ id: p.id, x, y: 40 });
      x += PW + sibGap;
    }
  }

  // Family-group nodes not reached (orphaned)
  for (const fg of graph.familyGroups) {
    if (!placedFGs.has(fg.id)) {
      result.push({ id: fg.id, x, y: 40 });
      x += FS + sibGap;
    }
  }

  return result;
}
