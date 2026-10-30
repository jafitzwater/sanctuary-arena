/**
 * Base layout, Wild Rift style [JOSEPH t309u]. Pure geometry, no rendering.
 *
 * (1) Every hero and bot of a side spawns behind its own Worldstone, inside a glowing barrier ring large enough
 *     for the whole side. The barrier holds until the opening wait ends (the act's `openingWait`, 15 s), then drops.
 * (2) Each base is closed by a stone ruin wall: an arc centred on the Worldstone that runs between the lanes, so
 *     the only way into (or out of) a base is along a lane. The three base towers (the lane seals, the only towers
 *     inside a base) sit inside that wall. The wall only exists where the ground was open, so the gaps are exactly
 *     the lane corridors (terrain.ts checks the corridor first, then this wall).
 *
 * Sizes, stats, economy, art scale and tower / base sizing are unchanged. Values marked [TEMP] are not confirmed
 * by Joseph yet (see NEEDS JOSEPH in sanctuary-status.md).
 */
import { mapLen } from './data/mapScale';
import type { ActDef } from './data/acts/types';
import type { Vec } from './math';

/** [TEMP] Base wall arc radius from the Worldstone centre. Encloses the 3 lane seals (~1800-2300 out). */
export const BASE_WALL_RADIUS = mapLen(2600);
/** [TEMP] Half thickness of the base wall (the wall is 2x this wide). */
export const BASE_WALL_HALF = mapLen(40);
// t315u (9,000 map): the spawn pen is a size, not map layout. It holds 5 unscaled heroes and must clear the
// unscaled Worldstone (radius 74) and stay inside the unscaled shop radius, so it does not follow MAP_SCALE.
/** [TEMP] Spawn barrier centre: this far behind the Worldstone, away from the lanes. */
export const SPAWN_BARRIER_BEHIND = 200;
/** [TEMP] Spawn barrier ring radius (whole side fits; the far edge stays inside the shop radius for potions). */
export const SPAWN_BARRIER_RADIUS = 110;
/** [TEMP] Spawn seats: seat 0 at the barrier centre, the rest on a ring this far out. */
export const SPAWN_SEAT_RING = 56;
/** Fallback barrier time when an act has no `openingWait` (doc: "There is a 15 second wait to start"). */
export const SPAWN_BARRIER_SECONDS = 15;

type Side = 'ally' | 'enemy';

/** The Wild Rift base layout is on for the 3-lane Sanctuary map only (Act I keeps its single lane clamp). */
export function baseLayoutOn(map: ActDef): boolean {
  return !!map.paths?.length;
}

export function baseOf(map: ActDef, side: Side): Vec {
  return side === 'ally' ? map.playerBase : map.enemyBase;
}

const frontCache = new WeakMap<ActDef, { ally: Vec; enemy: Vec }>();

/** Unit vector from a Worldstone toward its lanes (mean direction to the three lane mouths). */
export function baseFront(map: ActDef, side: Side): Vec {
  let hit = frontCache.get(map);
  if (!hit) {
    const front = (base: Vec, ally: boolean): Vec => {
      let sx = 0;
      let sy = 0;
      for (const path of map.paths ?? [{ lane: map.lane }]) {
        const lane = path.lane;
        const mouth = ally ? lane[0] : lane[lane.length - 1];
        const d = Math.hypot(mouth.x - base.x, mouth.y - base.y) || 1;
        sx += (mouth.x - base.x) / d;
        sy += (mouth.y - base.y) / d;
      }
      const n = Math.hypot(sx, sy) || 1;
      return { x: sx / n, y: sy / n };
    };
    hit = { ally: front(map.playerBase, true), enemy: front(map.enemyBase, false) };
    frontCache.set(map, hit);
  }
  return hit[side];
}

/** Centre of a side's spawn barrier, behind its Worldstone. */
export function barrierCenter(map: ActDef, side: Side): Vec {
  const base = baseOf(map, side);
  const f = baseFront(map, side);
  return { x: base.x - f.x * SPAWN_BARRIER_BEHIND, y: base.y - f.y * SPAWN_BARRIER_BEHIND };
}

/** Seconds the spawn barrier stays up from match start. */
export function barrierSeconds(map: ActDef): number {
  return map.openingWait ?? SPAWN_BARRIER_SECONDS;
}

/** The spawn barrier is up (blocks heroes and bots) until the opening wait ends. */
export function barrierUp(map: ActDef, time: number): boolean {
  return baseLayoutOn(map) && time < barrierSeconds(map);
}

/** Spawn seat `index` of a side (0 = barrier centre, then around a ring facing the lanes). */
export function spawnSeat(map: ActDef, side: Side, index: number): Vec {
  const c = barrierCenter(map, side);
  if (index <= 0) return c;
  const f = baseFront(map, side);
  const ang = Math.atan2(f.y, f.x) + Math.PI / 3 + ((index - 1) * Math.PI * 2) / 3;
  return { x: c.x + Math.cos(ang) * SPAWN_SEAT_RING, y: c.y + Math.sin(ang) * SPAWN_SEAT_RING };
}

/** Keep a point inside a side's barrier ring (`room` = how far the centre of the unit may go). */
export function holdInBarrier(map: ActDef, side: Side, x: number, y: number, room = SPAWN_BARRIER_RADIUS): Vec {
  const c = barrierCenter(map, side);
  const dx = x - c.x;
  const dy = y - c.y;
  const d = Math.hypot(dx, dy);
  if (d <= room) return { x, y };
  return { x: c.x + (dx / d) * room, y: c.y + (dy / d) * room };
}

/** Inside a base wall band (before the lane corridor cut; terrain.walkable checks the corridor first). */
export function inBaseWall(map: ActDef, x: number, y: number): boolean {
  if (!baseLayoutOn(map)) return false;
  for (const base of [map.playerBase, map.enemyBase]) {
    if (Math.abs(Math.hypot(x - base.x, y - base.y) - BASE_WALL_RADIUS) <= BASE_WALL_HALF) return true;
  }
  return false;
}
