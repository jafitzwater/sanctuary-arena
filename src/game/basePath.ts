/**
 * Base layout pathing [JOSEPH t309u]: steering around the base walls (through the lane gaps) and around the
 * Worldstone body, so heroes, bots and minions never grind on a wall. Stateless: every call picks the next aim
 * point from the unit position and its goal. Also the wall runs the renderer draws.
 */
import type { ActDef } from './data/acts/types';
import { mapLen } from './data/mapScale';
import { LANE_CLEAR_HALF } from './landscape';
import { distToPolyline, type Vec } from './math';
import { walkableNoWalls } from './terrain';
import { BASE_WALL_HALF, BASE_WALL_RADIUS, baseLayoutOn } from './baseLayout';

/** [TEMP] Lane gap aim points sit this far inside / outside the wall band. */
export const GATE_AIM_DEPTH = mapLen(140);
/** [TEMP] Outside a base, units walk around the wall on this extra clearance. */
export const WALL_AROUND_CLEAR = mapLen(160);
/** [TEMP] Angle stepped per aim point when walking around a base wall from outside. */
const AROUND_STEP = 0.3;

interface LaneGate {
  /** Lane crossing of the wall centre line. */
  mid: Vec;
  /** Lane point inside the base, just in from the wall. */
  inner: Vec;
  /** Lane point outside the base, just out from the wall. */
  outer: Vec;
}

interface BaseRing {
  base: Vec;
  gates: LaneGate[];
}

const ringCache = new WeakMap<ActDef, BaseRing[]>();

function lanes(map: ActDef): Vec[][] {
  return map.paths?.length ? map.paths.map((path) => path.lane) : [map.lane];
}

function inLaneCorridor(map: ActDef, x: number, y: number): boolean {
  const p = { x, y };
  for (const lane of lanes(map)) if (distToPolyline(p, lane) <= LANE_CLEAR_HALF) return true;
  return false;
}

/** First point along `lane` (walked from its end nearest `base`) at distance `r` from `base`. */
function laneAtRadius(lane: Vec[], base: Vec, r: number): Vec {
  const pts = Math.hypot(lane[0].x - base.x, lane[0].y - base.y) <= Math.hypot(lane[lane.length - 1].x - base.x, lane[lane.length - 1].y - base.y)
    ? lane
    : [...lane].reverse();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 8));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (Math.hypot(x - base.x, y - base.y) >= r) return { x, y };
    }
  }
  return pts[pts.length - 1];
}

/** Per base: the Worldstone and the lane gaps through its wall. */
export function baseRings(map: ActDef): BaseRing[] {
  const hit = ringCache.get(map);
  if (hit) return hit;
  const rings = [map.playerBase, map.enemyBase].map((b) => {
    const base = { x: b.x, y: b.y };
    return {
      base,
      gates: lanes(map).map((lane) => ({
        mid: laneAtRadius(lane, base, BASE_WALL_RADIUS),
        inner: laneAtRadius(lane, base, BASE_WALL_RADIUS - BASE_WALL_HALF - GATE_AIM_DEPTH),
        outer: laneAtRadius(lane, base, BASE_WALL_RADIUS + BASE_WALL_HALF + GATE_AIM_DEPTH),
      })),
    };
  });
  ringCache.set(map, rings);
  return rings;
}

/** Does the straight segment a -> b cross this base's wall anywhere other than a lane gap? */
function crossesWall(map: ActDef, base: Vec, a: Vec, b: Vec): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - base.x;
  const fy = a.y - base.y;
  const qa = dx * dx + dy * dy;
  if (qa < 1e-6) return false;
  const qb = 2 * (fx * dx + fy * dy);
  const ra = Math.hypot(fx, fy);
  const rb = Math.hypot(b.x - base.x, b.y - base.y);
  const lo = BASE_WALL_RADIUS - BASE_WALL_HALF;
  const hi = BASE_WALL_RADIUS + BASE_WALL_HALF;
  // Quick reject: the whole segment is inside the wall's inner edge or never reaches its outer edge.
  if (Math.max(ra, rb) < lo) return false;
  const tMin = Math.max(0, Math.min(1, -(fx * dx + fy * dy) / qa));
  if (Math.hypot(fx + dx * tMin, fy + dy * tMin) > hi) return false;
  for (const r of [lo, BASE_WALL_RADIUS, hi]) {
    const qc = fx * fx + fy * fy - r * r;
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const t of [(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)]) {
      if (t < 0 || t > 1) continue;
      if (!inLaneCorridor(map, a.x + dx * t, a.y + dy * t)) return true;
    }
  }
  return false;
}

/** Next aim point from `from` toward `to` that does not walk into a base wall (the goal itself when clear). */
export function wallDetour(map: ActDef, from: Vec, to: Vec): Vec {
  if (!baseLayoutOn(map)) return to;
  // Walls in the order the unit meets them: the base it stands in first (get out through a gap), then the
  // nearest wall ahead. Otherwise a far target inside the other base would aim at that base's gap through this wall.
  const ahead = baseRings(map)
    .filter((ring) => crossesWall(map, ring.base, from, to))
    .map((ring) => ({ ring, gap: Math.hypot(from.x - ring.base.x, from.y - ring.base.y) - BASE_WALL_RADIUS }))
    .sort((a, b) => (a.gap < 0 ? -1e9 : a.gap) - (b.gap < 0 ? -1e9 : b.gap));
  for (const { ring } of ahead) {
    const base = ring.base;
    const rf = Math.hypot(from.x - base.x, from.y - base.y);
    const rt = Math.hypot(to.x - base.x, to.y - base.y);
    const fromIn = rf < BASE_WALL_RADIUS;
    const toIn = rt < BASE_WALL_RADIUS;
    if (fromIn !== toIn) {
      // In <-> out: go through the lane gap with the shortest total walk.
      let best = ring.gates[0];
      let cost = Infinity;
      for (const gate of ring.gates) {
        const c = Math.hypot(gate.mid.x - from.x, gate.mid.y - from.y) + Math.hypot(to.x - gate.mid.x, to.y - gate.mid.y);
        if (c < cost) {
          cost = c;
          best = gate;
        }
      }
      const inGap = Math.hypot(from.x - best.mid.x, from.y - best.mid.y) <= LANE_CLEAR_HALF;
      const near = fromIn ? best.inner : best.outer;
      const far = fromIn ? best.outer : best.inner;
      const atNear = Math.hypot(from.x - near.x, from.y - near.y) <= mapLen(48);
      return inGap || atNear ? far : near;
    }
    if (!fromIn) {
      // Both outside but the straight line cuts through the base: walk around the wall on the short side.
      const af = Math.atan2(from.y - base.y, from.x - base.x);
      const at = Math.atan2(to.y - base.y, to.x - base.x);
      let delta = at - af;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const step = Math.sign(delta || 1) * Math.min(Math.abs(delta), AROUND_STEP);
      const r = Math.max(rf, BASE_WALL_RADIUS + BASE_WALL_HALF + WALL_AROUND_CLEAR);
      return { x: base.x + Math.cos(af + step) * r, y: base.y + Math.sin(af + step) * r };
    }
    // Both inside (only from inside the band itself): let the terrain slide resolve it.
  }
  return to;
}

/** Steer around a solid round body (the Worldstone) that sits on the straight line from -> to. */
export function bodyDetour(from: Vec, to: Vec, body: Vec, clear: number): Vec | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  if (Math.hypot(to.x - body.x, to.y - body.y) <= clear + mapLen(24)) return null;
  const ux = dx / len;
  const uy = dy / len;
  const bx = body.x - from.x;
  const by = body.y - from.y;
  const along = bx * ux + by * uy;
  if (along <= 0 || along >= len) return null;
  const px = bx - ux * along;
  const py = by - uy * along;
  const off = Math.hypot(px, py);
  if (off >= clear) return null;
  // Side step: the tangent-ish point on the side of the line away from the body centre.
  const nx = off > 0.5 ? -px / off : -uy;
  const ny = off > 0.5 ? -py / off : ux;
  const pad = clear + mapLen(16);
  return { x: body.x + nx * pad, y: body.y + ny * pad };
}

/**
 * Leap / charge / teleport landings stop in front of a base wall instead of hopping it (walls block movement
 * for every character; the lane gaps stay open).
 */
export function stopAtBaseWall(map: ActDef, from: Vec, to: Vec): Vec {
  if (!baseLayoutOn(map)) return to;
  const rings = baseRings(map).filter((ring) => crossesWall(map, ring.base, from, to));
  if (!rings.length) return to;
  // Walk the segment and keep the last point before the first wall cell.
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 6));
  let last = { x: from.x, y: from.y };
  for (let k = 1; k <= steps; k++) {
    const x = from.x + ((to.x - from.x) * k) / steps;
    const y = from.y + ((to.y - from.y) * k) / steps;
    const wall = rings.some(
      (ring) => Math.abs(Math.hypot(x - ring.base.x, y - ring.base.y) - BASE_WALL_RADIUS) <= BASE_WALL_HALF + mapLen(4),
    );
    if (wall && !inLaneCorridor(map, x, y)) break;
    last = { x, y };
  }
  return last;
}

/** One stone ruin wall block for the renderer: centre, unit tangent, length along the wall. */
export interface WallBlock {
  x: number;
  y: number;
  tx: number;
  ty: number;
  len: number;
  seed: number;
}

/** [TEMP] Wall block length along the arc (the renderer draws one ruin block per sample). */
export const WALL_BLOCK_LEN = mapLen(64);

const blockCache = new WeakMap<ActDef, WallBlock[]>();

/** Blocks of every base wall that stands on open ground (where it actually blocks), lane gaps left out. */
export function wallBlocks(map: ActDef): WallBlock[] {
  const hit = blockCache.get(map);
  if (hit) return hit;
  const out: WallBlock[] = [];
  if (baseLayoutOn(map)) {
    const n = Math.ceil((Math.PI * 2 * BASE_WALL_RADIUS) / WALL_BLOCK_LEN);
    [map.playerBase, map.enemyBase].forEach((base, side) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const x = base.x + cx * BASE_WALL_RADIUS;
        const y = base.y + cy * BASE_WALL_RADIUS;
        if (x < 0 || y < 0 || x > map.width || y > map.height) continue;
        // Gaps: leave the block out where a lane corridor would cut into it.
        if (inLaneCorridor(map, x, y)) continue;
        const open = [-1, 0, 1].some((k) =>
          walkableNoWalls(map, base.x + cx * (BASE_WALL_RADIUS + k * BASE_WALL_HALF), base.y + cy * (BASE_WALL_RADIUS + k * BASE_WALL_HALF)),
        );
        if (!open) continue;
        out.push({ x, y, tx: -cy, ty: cx, len: WALL_BLOCK_LEN, seed: side * 1000 + i });
      }
    });
  }
  blockCache.set(map, out);
  return out;
}
