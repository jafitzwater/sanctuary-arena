/**
 * ORDER "Map size and Diablo 2 theme from reference" item 3 [JOSEPH] (paint only, no mechanics):
 * "Blue base = Act 1 Rogue Encampment. Red base = Act 4 Pandemonium Fortress. Top lane: first third Blood Moor
 * (green forest), then Act 2 Dry Hills (desert). Mid lane: Blood Moor -> Act 3 Spider Forest (jungle/swamp/temple).
 * Bottom lane: Blood Moor -> Act 4 River of Flame (cracked fiery ground, lava). Central river = continuous lava river.
 * Four jungle areas: dense jungle (top), open plains (left-middle), desert (right near Red base), lava field
 * (bottom-center)." Item 4: the minimap is generated from this same data.
 *
 * Pure and DOM-free (test/map-12k.ts runs it). Zones only choose colors and flat decals; walkability, combat and
 * every other system ignore them.
 */
import type { ActDef } from './acts/types';
import { mapLen } from './mapScale';

export type ZoneId =
  | 'rogue-encampment'
  | 'pandemonium-fortress'
  | 'blood-moor'
  | 'dry-hills'
  | 'spider-forest'
  | 'river-of-flame'
  | 'lava-river'
  | 'jungle-dense'
  | 'jungle-plains'
  | 'jungle-desert'
  | 'jungle-lava';

export const ZONE_IDS: ZoneId[] = [
  'rogue-encampment',
  'pandemonium-fortress',
  'blood-moor',
  'dry-hills',
  'spider-forest',
  'river-of-flame',
  'lava-river',
  'jungle-dense',
  'jungle-plains',
  'jungle-desert',
  'jungle-lava',
];

/** [TEMP] Theme radii, world units (paint only). Map layout, so they follow MAP_SCALE (t315u, t326u). */
export const ZONE_SIZES = {
  /** Base theme around each Worldstone. */
  base: mapLen(1400),
  /** Lane theme band each side of a lane center line. */
  lane: mapLen(1000),
  /** Lava river theme each side of the river line (the old river + bank width, 46 + 46). */
  river: mapLen(92),
  /** [TEMP] Blood Moor covers the first third of each lane from the Blue side (order: "first third"). */
  bloodMoorShare: 1 / 3,
} as const;

/** Human labels (spec / minimap legend). */
export const ZONE_LABEL: Record<ZoneId, string> = {
  'rogue-encampment': 'Act 1 Rogue Encampment (Blue base)',
  'pandemonium-fortress': 'Act 4 Pandemonium Fortress (Red base)',
  'blood-moor': 'Act 1 Blood Moor (first third of every lane)',
  'dry-hills': 'Act 2 Dry Hills (top lane)',
  'spider-forest': 'Act 3 Spider Forest (mid lane)',
  'river-of-flame': 'Act 4 River of Flame (bottom lane)',
  'lava-river': 'Lava river (center river)',
  'jungle-dense': 'Dense jungle (top jungle)',
  'jungle-plains': 'Open plains (left-middle jungle)',
  'jungle-desert': 'Desert (right jungle near Red base)',
  'jungle-lava': 'Lava field (bottom-center jungle)',
};

/** Minimap colors per zone (also the base hue of the ground paint). */
export const ZONE_MINI: Record<ZoneId, string> = {
  'rogue-encampment': '#3a4a2a',
  'pandemonium-fortress': '#4a1e1a',
  'blood-moor': '#2a3c1e',
  'dry-hills': '#6e5a38',
  'spider-forest': '#1c3a24',
  'river-of-flame': '#4a2416',
  'lava-river': '#d0561c',
  'jungle-dense': '#163018',
  'jungle-plains': '#3e4a24',
  'jungle-desert': '#7a6440',
  'jungle-lava': '#3a1c14',
};

type Pt = { x: number; y: number };

function segProject(p: Pt, a: Pt, b: Pt): { d: number; u: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const d = Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u));
  return { d, u, len: Math.sqrt(len2) };
}

/** Distance to a polyline and the arc fraction (0 at the first point, 1 at the last) of the closest point. */
export function laneFraction(p: Pt, lane: Pt[]): { d: number; t: number } {
  let total = 0;
  for (let i = 1; i < lane.length; i++) total += Math.hypot(lane[i].x - lane[i - 1].x, lane[i].y - lane[i - 1].y);
  let best = Infinity;
  let bestAt = 0;
  let run = 0;
  for (let i = 1; i < lane.length; i++) {
    const s = segProject(p, lane[i - 1], lane[i]);
    if (s.d < best) {
      best = s.d;
      bestAt = run + s.u * s.len;
    }
    run += s.len;
  }
  return { d: best, t: total > 0 ? bestAt / total : 0 };
}

/** Which theme zone a world point belongs to. Precedence: lava river, bases, lanes, jungle quadrant. */
export function zoneAt(map: ActDef, x: number, y: number): ZoneId {
  return zoneOf(map, x, y, true);
}

/**
 * t330u 3D floors: the zone whose ground lies under (x, y) with the River of Lava ignored, so the lava
 * ribbon paints over the ground of the zone it crosses. Paint only; zoneAt is unchanged.
 */
export function groundZoneAt(map: ActDef, x: number, y: number): ZoneId {
  return zoneOf(map, x, y, false);
}

function zoneOf(map: ActDef, x: number, y: number, river: boolean): ZoneId {
  const p = { x, y };
  if (river && map.river && map.river.length > 1 && laneFraction(p, map.river).d <= ZONE_SIZES.river) return 'lava-river';
  if (Math.hypot(x - map.playerBase.x, y - map.playerBase.y) <= ZONE_SIZES.base) return 'rogue-encampment';
  if (Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) <= ZONE_SIZES.base) return 'pandemonium-fortress';
  let lane: { id: string; d: number; t: number } | null = null;
  for (const path of map.paths ?? []) {
    const f = laneFraction(p, path.lane);
    if (!lane || f.d < lane.d) lane = { id: path.id, d: f.d, t: f.t };
  }
  if (lane && lane.d <= ZONE_SIZES.lane) {
    if (lane.t < ZONE_SIZES.bloodMoorShare) return 'blood-moor';
    if (lane.id === 'north') return 'dry-hills';
    if (lane.id === 'south') return 'river-of-flame';
    return 'spider-forest';
  }
  // Jungle quarters, split by the two map diagonals (river: x = y, mid lane: x + y = W).
  const u = x / map.width;
  const v = y / map.height;
  const above = v < u; // top-right of the river diagonal
  const near = u + v < 1; // top-left of the mid-lane diagonal
  if (above && near) return 'jungle-dense';
  if (!above && near) return 'jungle-plains';
  if (above && !near) return 'jungle-desert';
  return 'jungle-lava';
}

export type ZoneBounds = { zone: ZoneId; minX: number; minY: number; maxX: number; maxY: number; share: number };

/** Axis-aligned bounds and area share of every zone, by sampling a grid (spec table + tests). */
export function zoneBounds(map: ActDef, step = 100): ZoneBounds[] {
  const acc = new Map<ZoneId, ZoneBounds>();
  let cells = 0;
  for (let y = step / 2; y < map.height; y += step) {
    for (let x = step / 2; x < map.width; x += step) {
      const zone = zoneAt(map, x, y);
      cells += 1;
      const b = acc.get(zone) ?? { zone, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, share: 0 };
      b.minX = Math.min(b.minX, x - step / 2);
      b.minY = Math.min(b.minY, y - step / 2);
      b.maxX = Math.max(b.maxX, x + step / 2);
      b.maxY = Math.max(b.maxY, y + step / 2);
      b.share += 1;
      acc.set(zone, b);
    }
  }
  return ZONE_IDS.filter((zone) => acc.has(zone)).map((zone) => {
    const b = acc.get(zone)!;
    return { ...b, share: b.share / cells };
  });
}

/** Low-res zone grid for the minimap (cols x rows cells over the whole map, row-major). */
export function zoneGrid(map: ActDef, cols: number, rows: number): ZoneId[] {
  const out: ZoneId[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(zoneAt(map, ((c + 0.5) * map.width) / cols, ((r + 0.5) * map.height) / rows));
    }
  }
  return out;
}

/** Ground paint per zone for the open-ground kinds; roads and yards get their own stone. */
export type ZonePaint = { fill: string; joint: string; fleck: string };

export function zoneGroundPaint(zone: ZoneId, kind: string): ZonePaint | null {
  const road = kind === 'path';
  const yard = kind === 'town';
  const open = kind === 'grass' || kind === 'blend' || kind === 'edge' || kind === 'bank' || kind === 'river' || kind === 'dark';
  if (!road && !yard && !open) return null;
  switch (zone) {
    case 'rogue-encampment':
    case 'blood-moor':
      return null; // the existing Act 1 Blood Moor / Rogue Encampment paint
    case 'pandemonium-fortress':
      if (yard) return { fill: '#3a2c30', joint: '#1a1014', fleck: '#8a3a2a' };
      if (road) return { fill: '#3a3236', joint: '#1c1418', fleck: '#6a4a44' };
      return { fill: '#2a1816', joint: '#160c0a', fleck: '#5a2a1c' };
    case 'dry-hills':
    case 'jungle-desert':
      if (road) return { fill: '#5e4c38', joint: '#3a2e20', fleck: '#8a7458' };
      return zone === 'dry-hills'
        ? { fill: '#5e4a2c', joint: '#44341e', fleck: '#8c744a' }
        : { fill: '#665032', joint: '#4a3822', fleck: '#94784c' };
    case 'spider-forest':
      if (road) return { fill: '#3a4236', joint: '#1e241c', fleck: '#5a6a4a' };
      return { fill: '#142618', joint: '#0a160c', fleck: '#2a5228' };
    case 'jungle-dense':
      return { fill: '#10200f', joint: '#08120a', fleck: '#24481e' };
    case 'jungle-plains':
      return { fill: '#2a3618', joint: '#1a2410', fleck: '#56662c' };
    case 'river-of-flame':
    case 'jungle-lava':
      if (road) return { fill: '#342a2a', joint: '#181010', fleck: '#5a3a30' };
      return zone === 'river-of-flame'
        ? { fill: '#261614', joint: '#120806', fleck: '#6a2814' }
        : { fill: '#2a1612', joint: '#140806', fleck: '#7a3016' };
    case 'lava-river':
      if (road) return null;
      return { fill: '#1e1210', joint: '#0e0606', fleck: '#5a2412' };
    default:
      return null;
  }
}
