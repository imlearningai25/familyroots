/**
 * UnionEdge — edge from a PersonNode (parent) to a FamilyGroupNode.
 *
 * Visual styles by union type:
 *   MARRIAGE     ════  double line (SVG trick: two strokes)
 *   PARTNERSHIP  ────  single solid
 *   COHABITATION ╌╌╌╌  dashed
 *   UNKNOWN      ┄┄┄┄  dotted
 */

import React, { memo } from 'react';
import {
  BaseEdge,
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

  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  if (isMarriage) {
    const offset = hl === true ? 2 : 1.5;
    const [pathA] = getStraightPath({ sourceX: sourceX - offset, sourceY, targetX: targetX - offset, targetY });
    const [pathB] = getStraightPath({ sourceX: sourceX + offset, sourceY, targetX: targetX + offset, targetY });

    return (
      <g style={{ opacity, transition: 'opacity 0.25s' }}>
        <path d={pathA} stroke={color} strokeWidth={strokeW} fill="none" style={{ transition: 'stroke-width 0.25s' }} />
        <path d={pathB} stroke={color} strokeWidth={strokeW} fill="none" style={{ transition: 'stroke-width 0.25s' }} />
      </g>
    );
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: strokeW,
        strokeDasharray: isSolid ? undefined : dashArray,
        opacity,
        transition: 'stroke-width 0.25s, opacity 0.25s',
      }}
    />
  );
}

export const UnionEdge = memo(UnionEdgeComponent);
UnionEdge.displayName = 'UnionEdge';
export default UnionEdge;
