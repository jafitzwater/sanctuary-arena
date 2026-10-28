/**
 * Gap-list item 16, batch 4: health orbs and pools.
 * Doc (refined-design-document-oct27.md):
 *   "Health orbs and pools spawn on the roadways, off to the side, at the very center of the
 *    map on each roadway. Once consumed by anyone, they refill after 3 minutes. A health orb
 *    restores only health. A pool restores health and mana. Both only do 50% of what that
 *    character currently has."
 * [JOSEPH] (joseph-answers-oct27.md, answer 3):
 *   "Orbs: small pickups on main roadways every ~200-300 units, instant resource or temp buff.
 *    Pools: larger off-road areas, stand in them briefly, stronger effect. 4-6 orbs on primary
 *    path, 2-3 pools in side areas, approximate coordinates. (Doc timings: 180s refill, 50% of
 *    current.)"
 * Implements: 5 orbs on the center roadway ("primary path" [DERIVED]), 250 units apart,
 * around its midpoint, off to the side; 3 pools, one beside the midpoint of each roadway
 * (fits the doc's "each roadway" and Joseph's "2-3"); 180 s refill; 50% of current.
 * Tech design: pure data, no Phaser import.
 * Excluded (NEEDS JOSEPH): the "temp buff" option, the pool's "stronger effect" (the doc says
 * both do 50%), exact coordinates. TEMP: stand time, pickup radii, side offsets.
 */
import { mapLen } from './mapScale';
import type { PathDef } from './acts/types';

export const ORB_REFILL = 180; // [DOC] "refill after 3 minutes" / [JOSEPH] "180s refill"
export const ORB_SHARE = 0.5; // [DOC] "50% of what that character currently has" / [JOSEPH] "50% of current"
export const ORB_COUNT = 5; // [JOSEPH] "4-6 orbs on primary path"
export const ORB_SPACING = 250; // [JOSEPH] "every ~200-300 units"
export const ORB_RADIUS = 30; // [TEMP] pickup radius ("small pickups")
export const ORB_SIDE = mapLen(60); // [TEMP] "off to the side", near the road edge; follows MAP_SCALE (pass 2 item 1)
export const POOL_RADIUS = 70; // [TEMP] "larger"
export const POOL_SIDE = mapLen(200); // [TEMP] beside the roadway ("off-road areas"); follows MAP_SCALE (pass 2 item 1)
export const POOL_STAND = 1; // [TEMP] seconds ("stand in them briefly")

export type OrbKind = 'orb' | 'pool';
export interface OrbSpot {
  kind: OrbKind;
  x: number;
  y: number;
}

/** Point and unit normal at a given distance along a polyline. */
function along(lane: { x: number; y: number }[], at: number): { x: number; y: number; nx: number; ny: number } {
  let left = at;
  for (let i = 0; i < lane.length - 1; i++) {
    const a = lane[i];
    const b = lane[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (left <= seg || i === lane.length - 2) {
      const t = Math.max(0, Math.min(1, left / seg));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx: -(b.y - a.y) / seg, ny: (b.x - a.x) / seg };
    }
    left -= seg;
  }
  const p = lane[0];
  return { x: p.x, y: p.y, nx: 0, ny: 1 };
}

function length(lane: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 0; i < lane.length - 1; i++) total += Math.hypot(lane[i + 1].x - lane[i].x, lane[i + 1].y - lane[i].y);
  return total;
}

export function orbSpots(paths: PathDef[]): OrbSpot[] {
  const spots: OrbSpot[] = [];
  const primary = paths.find((path) => path.id === 'center') ?? paths[0];
  if (primary) {
    const mid = length(primary.lane) / 2;
    for (let i = 0; i < ORB_COUNT; i++) {
      const offset = (i - (ORB_COUNT - 1) / 2) * ORB_SPACING;
      const p = along(primary.lane, mid + offset);
      const side = i % 2 === 0 ? 1 : -1;
      spots.push({ kind: 'orb', x: Math.round(p.x + p.nx * ORB_SIDE * side), y: Math.round(p.y + p.ny * ORB_SIDE * side) });
    }
  }
  for (const path of paths) {
    const p = along(path.lane, length(path.lane) / 2);
    spots.push({ kind: 'pool', x: Math.round(p.x + p.nx * POOL_SIDE), y: Math.round(p.y + p.ny * POOL_SIDE) });
  }
  return spots;
}

/** [DOC] "Both only do 50% of what that character currently has." Capped at the maximum. */
export function orbRestore(current: number, max: number): number {
  return Math.min(max, current + Math.round(current * ORB_SHARE));
}
