/**
 * UnionEdge — edge from a PersonNode (parent) to a FamilyGroupNode.
 *
 * Visual styles by union type:
 *   MARRIAGE     ════  double line (SVG trick: two strokes)
 *   PARTNERSHIP  ────  single solid
 *   COHABITATION ╌╌╌╌  dashed
 *   UNKNOWN      ┄┄┄┄  dotted
 *
 * When a person has multiple unions of the same type, each edge shows
 * an ordinal label: "1st Marriage", "2nd Marriage", etc.
 */

import React, { memo } from 'react';
import {
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
} from 'reactflow';
import type { UnionEdgeData } from '../../types';
import { UNION_STROKE } from '../../types';
import { useThemeStore } from '@store/theme.store';

const UNION_COLORS: Record<UnionEdgeData['unionType'], string> = {
  MARRIAGE: '#f59e0b',
  PARTNERSHIP: '#10b981',
  COHABITATION: '#6366f1',
  UNKNOWN: '#94a3b8',
};

const UNION_TYPE_LABEL: Record<UnionEdgeData['unionType'], string> = {
  MARRIAGE: 'Marriage',
  PARTNERSHIP: 'Partnership',
  COHABITATION: 'Cohabitation',
  UNKNOWN: 'Union',
};

function ordinalSuffix(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function UnionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<UnionEdgeData>) {
  const edgeWidth  = useThemeStore((s) => s.theme.edgeWidth);
  const unionType  = data?.unionType ?? 'UNKNOWN';
  const color      = UNION_COLORS[unionType];
  const dashArray  = UNION_STROKE[unionType];
  const isSolid    = dashArray === 'solid';
  const isMarriage = unionType === 'MARRIAGE';

  const hl         = data?.isHighlighted;
  const opacity    = hl === true ? 1 : hl === false ? 0.15 : 1;
  const strokeW    = hl === true ? edgeWidth * 1.6 : edgeWidth;

  const ordinal    = data?.unionOrdinal;
  const ordinalLabel = ordinal != null
    ? `${ordinalSuffix(ordinal)} ${UNION_TYPE_LABEL[unionType]}`
    : undefined;

  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  if (isMarriage) {
    const offset = hl === true ? 2 : 1.5;
    const [pathA] = getStraightPath({ sourceX: sourceX - offset, sourceY, targetX: targetX - offset, targetY });
    const [pathB] = getStraightPath({ sourceX: sourceX + offset, sourceY, targetX: targetX + offset, targetY });
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;

    return (
      <>
        <g style={{ opacity, transition: 'opacity 0.25s' }}>
          <path d={pathA} stroke={color} strokeWidth={strokeW} fill="none" style={{ transition: 'stroke-width 0.25s' }} />
          <path d={pathB} stroke={color} strokeWidth={strokeW} fill="none" style={{ transition: 'stroke-width 0.25s' }} />
        </g>
        {ordinalLabel && (
          <EdgeLabelRenderer>
            <div
              className="absolute pointer-events-none"
              style={{ transform: `translate(-50%, -50%) translate(${midX}px,${midY}px)` }}
            >
              <span
                className="px-1 py-0.5 text-[9px] font-semibold rounded border shadow-sm whitespace-nowrap"
                style={{ background: '#fffbeb', borderColor: color, color }}
              >
                {ordinalLabel}
              </span>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  return (
    <>
      <path
        id={id}
        d={edgePath}
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={isSolid ? undefined : dashArray}
        fill="none"
        style={{ opacity, transition: 'stroke-width 0.25s, opacity 0.25s' }}
      />
      {ordinalLabel && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-none"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            <span
              className="px-1 py-0.5 text-[9px] font-semibold rounded border shadow-sm whitespace-nowrap"
              style={{ background: '#fff', borderColor: color, color }}
            >
              {ordinalLabel}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const UnionEdge = memo(UnionEdgeComponent);
UnionEdge.displayName = 'UnionEdge';
export default UnionEdge;
