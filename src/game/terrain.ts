import type { ActDef } from './data/acts/types';
import { FLOOR_STEP, inGateSlot, LANE_CLEAR_HALF, sceneryFor } from './landscape';
import { clamp, distToPolyline, nearestOnPolyline, type Vec } from './math';

/** Outer cliff. Inside this margin the ground is open only on roads and clearings. */
const EDGE = 48;
/** Half-width of the impassable channel. Fords are where a road crosses it. */
const RIVER = 62;
const OPENING = 150;
const CORRIDOR = 64;
/** Bottom 30% of a sprite. Units, towers, and boulders share this band. */
export const FOOTPRINT = 0.3;

export type GroundKind = 'grass' | 'edge' | 'path' | 'town' | 'pale' | 'river' | 'bank' | 'dark' | 'blend';

function lanes(map: ActDef): Vec[][] {
  return map.paths?.length ? map.paths.map((path) => path.lane) : [map.lane];
}

function nearestRoad(map: ActDef, x: number, y: number): number {
  let best = Infinity;
  for (const lane of lanes(map)) best = Math.min(best, distToPolyline({ x, y }, lane));
  return best;
}

function inPlaza(map: ActDef, x: number, y: number): boolean {
  return (
    Math.hypot(x - map.playerBase.x, y - map.playerBase.y) <= map.plaza ||
    Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) <= map.plaza
  );
}

function openings(map: ActDef): Vec[] {
  return [
    ...(map.dens ?? []).map((den) => ({ x: den.x, y: den.y })),
    ...(map.shrines ?? []).map((shrine) => ({ x: shrine.x, y: shrine.y })),
    ...(map.pits ?? []).map((pit) => ({ x: pit.x, y: pit.y })),
  ];
}

function inOpening(map: ActDef, x: number, y: number): boolean {
  const roads = lanes(map);
  for (const spot of openings(map)) {
    if (Math.hypot(x - spot.x, y - spot.y) <= OPENING) return true;
    let anchor = { x: spot.x, y: spot.y };
    let best = Infinity;
    for (const lane of roads) {
      const near = nearestOnPolyline(spot, lane);
      if (near.dist < best) {
        best = near.dist;
        anchor = near.point;
      }
    }
    const dx = anchor.x - spot.x;
    const dy = anchor.y - spot.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) continue;
    const t = clamp(((x - spot.x) * dx + (y - spot.y) * dy) / len2, 0, 1);
    const px = spot.x + dx * t;
    const py = spot.y + dy * t;
    if (Math.hypot(x - px, y - py) <= CORRIDOR) return true;
  }
  return false;
}

function inCorridor(map: ActDef, x: number, y: number): boolean {
  return nearestRoad(map, x, y) <= LANE_CLEAR_HALF;
}

function hitProp(map: ActDef, x: number, y: number): boolean {
  if (!map.paths) return false;
  for (const prop of sceneryFor(map)) {
    if (prop.block <= 0) continue;
    if (Math.hypot(x - prop.x, y - prop.y) < prop.block * FOOTPRINT) return true;
  }
  return false;
}

/** Sanctuary collision. Act I ignores this and keeps the lane clamp. */
export function walkable(map: ActDef, x: number, y: number): boolean {
  if (!map.paths) return true;
  if (x < EDGE || y < EDGE || x > map.width - EDGE || y > map.height - EDGE) return false;
  if (inCorridor(map, x, y) || inGateSlot(map, x, y)) return true;
  if (hitProp(map, x, y)) return false;
  if (inOpening(map, x, y)) return true;
  const road = nearestRoad(map, x, y);
  if (map.river && map.river.length > 1 && distToPolyline({ x, y }, map.river) < RIVER && road > LANE_CLEAR_HALF) return false;
  if (inPlaza(map, x, y)) return true;
  return road <= LANE_CLEAR_HALF;
}

function anchor(map: ActDef, x: number, y: number): Vec {
  let best = { x: map.playerBase.x, y: map.playerBase.y };
  let dist = Math.hypot(x - best.x, y - best.y);
  for (const lane of lanes(map)) {
    const near = nearestOnPolyline({ x, y }, lane);
    if (near.dist < dist) {
      best = near.point;
      dist = near.dist;
    }
  }
  for (const spot of openings(map)) {
    const gap = Math.hypot(x - spot.x, y - spot.y);
    if (gap < dist) {
      best = spot;
      dist = gap;
    }
  }
  if (walkable(map, best.x, best.y)) return best;
  return { x: map.playerBase.x + 150, y: map.playerBase.y };
}

/** Last walkable point from `from` toward `to`. `from` itself must be walkable. */
function creep(map: ActDef, from: Vec, to: Vec): Vec {
  if (!walkable(map, from.x, from.y)) return from;
  if (walkable(map, to.x, to.y)) return to;
  let lo = from;
  let hi = to;
  for (let i = 0; i < 10; i++) {
    const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
    if (walkable(map, mid.x, mid.y)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Diagonal contact keeps the open world axis. A blocked corner slides along
 * x or y instead of retracting toward the nearest road.
 */
export function slide(map: ActDef, from: Vec, to: Vec): Vec {
  if (walkable(map, to.x, to.y)) return { x: to.x, y: to.y };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const axes = [
    { x: to.x, y: from.y, mag: Math.abs(dx) },
    { x: from.x, y: to.y, mag: Math.abs(dy) },
  ].sort((a, b) => b.mag - a.mag);
  let best = from;
  let bestMag = 0;
  for (const axis of axes) {
    const moved = creep(map, from, axis);
    const gain = Math.hypot(moved.x - from.x, moved.y - from.y);
    if (gain > bestMag) {
      best = moved;
      bestMag = gain;
    }
  }
  if (bestMag > 0.01) return best;
  if (walkable(map, from.x, from.y)) return { x: from.x, y: from.y };
  return settle(map, to.x, to.y);
}

/** Push a point out of cliffs, the river, and solid props. */
export function resolveSanctuary(map: ActDef, x: number, y: number, from?: Vec): Vec {
  if (from && map.paths) return slide(map, from, { x, y });
  return settle(map, x, y);
}

function settle(map: ActDef, x: number, y: number): Vec {
  let px = clamp(x, EDGE, map.width - EDGE);
  let py = clamp(y, EDGE, map.height - EDGE);
  if (map.paths && !inCorridor(map, px, py) && !inGateSlot(map, px, py)) {
    for (const prop of sceneryFor(map)) {
      if (prop.block <= 0) continue;
      const foot = prop.block * FOOTPRINT;
      const dx = px - prop.x;
      const dy = py - prop.y;
      const dist = Math.hypot(dx, dy);
      if (dist < foot) {
        const scale = (foot + 1) / (dist || 1);
        px = prop.x + dx * scale;
        py = prop.y + dy * scale;
      }
    }
  }
  if (walkable(map, px, py)) return { x: px, y: py };
  const home = anchor(map, px, py);
  let lo = home;
  let hi = { x: px, y: py };
  for (let i = 0; i < 12; i++) {
    const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
    if (walkable(map, mid.x, mid.y)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Tile class for the baked iso floor. Each lane is one cobble strip.
 * Around a Sanctuary banner the yard is wood or pale stone, and the road
 * stays cobble where it meets that yard.
 */
export function groundAt(map: ActDef, x: number, y: number): GroundKind {
  const camp = Math.hypot(x - map.playerBase.x, y - map.playerBase.y);
  const lair = Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y);
  const road = nearestRoad(map, x, y);
  const cobble = map.laneWidth / 2 + 10;
  if (road <= cobble) return 'path';
  if (map.river && map.river.length > 1) {
    const water = distToPolyline({ x, y }, map.river);
    if (water < 46) return 'river';
    if (water < 92) return 'bank';
  }
  const yard = map.paths ? map.fountainRadius : map.plaza;
  if (camp <= yard) return 'town';
  if (lair <= yard) return map.theme.decor === 'sanctuary' ? 'pale' : 'town';
  if (road <= cobble + FLOOR_STEP) return 'blend';
  return 'grass';
}
