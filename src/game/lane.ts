import type { ActDef } from './data/acts/types';
import { clamp, nearestOnPolyline, type Vec } from './math';

/** Keep a point on the road, its jungle shoulder, or inside a base plaza. */
export function clampToPlayable(map: ActDef, x: number, y: number): Vec {
  let px = clamp(x, 28, map.width - 28);
  let py = clamp(y, 28, map.height - 28);
  const plazas = [map.playerBase, map.enemyBase];
  for (const base of plazas) {
    if (Math.hypot(px - base.x, py - base.y) <= map.plaza) return { x: px, y: py };
  }
  const near = nearestOnPolyline({ x: px, y: py }, map.lane);
  const limit = map.laneWidth / 2 + map.jungle;
  if (near.dist > limit) {
    const dx = px - near.point.x;
    const dy = py - near.point.y;
    const d = near.dist || 1;
    px = near.point.x + (dx / d) * limit;
    py = near.point.y + (dy / d) * limit;
  }
  return { x: px, y: py };
}
