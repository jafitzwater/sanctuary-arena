/**
 * Gap-list item 17, batch 4: hiding grass.
 * Doc (refined-design-document-oct27.md): "Specific areas have hidden spots similar to League
 *   grass. Only friendlies on the same team can see a character hiding there. They are revealed
 *   by leaving the grass."
 * [JOSEPH] (joseph-answers-oct27.md, answer 4): "6-8 patches at chokepoints/near lane bushes;
 *   units inside are invisible unless an enemy is inside or has true sight."
 * Implements: 7 patches (two beside each roadway at 1/3 and 2/3 of its length, one more beside
 * the center roadway's midpoint). A unit inside a patch is hidden from every other team unless a
 * living unit of another team stands in the same patch. Leaving the patch reveals it.
 * Tech design: pure data and a pure visibility rule, no Phaser import.
 * Excluded (NEEDS JOSEPH): "true sight" (no such system or source exists yet); exact patch
 * placement (the map has no bushes or marked chokepoints). TEMP: radius, side offset.
 */
import type { PathDef } from './acts/types';

export const GRASS_COUNT = 7; // [JOSEPH] "6-8 patches"
export const GRASS_RADIUS = 80; // [TEMP]
export const GRASS_SIDE = 140; // [TEMP] beside the road edge (road half-width 84)

export interface GrassPatch {
  x: number;
  y: number;
  r: number;
}

function pointAt(lane: { x: number; y: number }[], frac: number): { x: number; y: number; nx: number; ny: number } {
  let total = 0;
  for (let i = 0; i < lane.length - 1; i++) total += Math.hypot(lane[i + 1].x - lane[i].x, lane[i + 1].y - lane[i].y);
  let left = total * frac;
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
  return { x: lane[0].x, y: lane[0].y, nx: 0, ny: 1 };
}

export function grassPatches(paths: PathDef[]): GrassPatch[] {
  const patches: GrassPatch[] = [];
  const at = (path: PathDef, frac: number, side: number) => {
    const p = pointAt(path.lane, frac);
    patches.push({ x: Math.round(p.x + p.nx * GRASS_SIDE * side), y: Math.round(p.y + p.ny * GRASS_SIDE * side), r: GRASS_RADIUS });
  };
  for (const path of paths) {
    at(path, 1 / 3, 1);
    at(path, 2 / 3, -1);
  }
  const center = paths.find((path) => path.id === 'center');
  if (center && patches.length < GRASS_COUNT) at(center, 0.5, 1);
  return patches;
}

export function patchOf(patches: GrassPatch[], x: number, y: number): number {
  for (let i = 0; i < patches.length; i++) {
    if (Math.hypot(x - patches[i].x, y - patches[i].y) <= patches[i].r) return i;
  }
  return -1;
}

/**
 * [DOC]/[JOSEPH] Returns the ids of units hidden from all other teams: inside a patch with no
 * living unit of another team in the same patch.
 */
export function hiddenUnits(
  patches: GrassPatch[],
  units: { id: number; team: string; alive: boolean; x: number; y: number }[],
): Set<number> {
  const inside = new Map<number, { id: number; team: string }[]>();
  for (const unit of units) {
    if (!unit.alive) continue;
    const p = patchOf(patches, unit.x, unit.y);
    if (p < 0) continue;
    const list = inside.get(p) ?? [];
    list.push(unit);
    inside.set(p, list);
  }
  const hidden = new Set<number>();
  for (const list of inside.values()) {
    for (const unit of list) {
      if (!list.some((other) => other.team !== unit.team)) hidden.add(unit.id);
    }
  }
  return hidden;
}
