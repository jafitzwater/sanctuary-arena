import type { ActDef } from './data/acts/types';
import { clamp, nearestOnPolyline, type Vec } from './math';
import { resolveSanctuary } from './terrain';

/** Keep a point on the road, a clearing, or inside a base plaza. */
export function clampToPlayable(map: ActDef, x: number, y: number, from?: Vec): Vec {
  if (map.paths?.length) return resolveSanctuary(map, x, y, from);
  let px = clamp(x, 28, map.width - 28);
  let py = clamp(y, 28, map.height - 28);
  if (map.roam) return { x: px, y: py };
  const plazas = [map.playerBase, map.enemyBase];
  for (const base of plazas) {
    if (Math.hypot(px - base.x, py - base.y) <= map.plaza) return { x: px, y: py };
  }
  const lanes = map.paths?.length ? map.paths.map((path) => path.lane) : [map.lane];
  let near = nearestOnPolyline({ x: px, y: py }, lanes[0]);
  for (const lane of lanes.slice(1)) {
    const next = nearestOnPolyline({ x: px, y: py }, lane);
    if (next.dist < near.dist) near = next;
  }
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
