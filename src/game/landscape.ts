import type { ActDef } from './data/acts/types';
import { distToPolyline, type Vec } from './math';

export interface Prop {
  kind: 'tree' | 'rock' | 'fence' | 'tent' | 'npc' | 'stump' | 'wagon';
  variant: number;
  x: number;
  y: number;
  flip: boolean;
  /** Collision radius in world units. Zero does not block. */
  block: number;
}

const cache = new WeakMap<ActDef, Prop[]>();

/** Deliberate Act I props along the roads, the river banks, and the camps. */
export function sceneryFor(map: ActDef): Prop[] {
  const hit = cache.get(map);
  if (hit) return hit;
  const props = build(map);
  cache.set(map, props);
  return props;
}

function lengthOf(pts: Vec[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

function pointAt(pts: Vec[], dist: number): Vec {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (left <= len || i === pts.length - 1) {
      const f = len ? Math.min(1, left / len) : 0;
      return { x: pts[i - 1].x + dx * f, y: pts[i - 1].y + dy * f };
    }
    left -= len;
  }
  return pts[pts.length - 1];
}

function sideAt(pts: Vec[], dist: number, side: number): Vec {
  const at = pointAt(pts, dist);
  const prev = pointAt(pts, Math.max(0, dist - 12));
  const next = pointAt(pts, dist + 12);
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const mag = Math.hypot(dx, dy) || 1;
  return { x: at.x + (-dy / mag) * side, y: at.y + (dx / mag) * side };
}

function lanesOf(map: ActDef): Vec[][] {
  if (map.paths?.length) return map.paths.map((path) => path.lane);
  return [map.lane];
}

function onRoad(map: ActDef, x: number, y: number, pad: number): boolean {
  return lanesOf(map).some((lane) => distToPolyline({ x, y }, lane) < map.laneWidth / 2 + pad);
}

/** Same shoulder the walk check uses, so a solid stays off the path. */
const PATH_SHOULDER = 40;
const OPENING = 150;
/** Matches the walk check: four floor diamonds across each base mouth. */
const ENTRANCE_HALF = (80 / 0.85) * 2;

function offPath(map: ActDef, x: number, y: number, radius: number): boolean {
  const limit = map.laneWidth / 2 + PATH_SHOULDER + radius + 4;
  if (lanesOf(map).some((lane) => distToPolyline({ x, y }, lane) < limit)) return false;
  const spots = [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])];
  return spots.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= OPENING + radius);
}

function place(props: Prop[], map: ActDef, prop: Prop): void {
  if (prop.block <= 0) {
    const radius =
      prop.kind === 'tree' ? 38 :
      prop.kind === 'fence' ? 24 :
      prop.kind === 'tent' ? 42 :
      prop.kind === 'wagon' ? 36 :
      prop.kind === 'stump' ? 18 :
      0;
    if (radius > 0 && offPath(map, prop.x, prop.y, radius)) prop.block = radius;
  }
  props.push(prop);
}

function distToSegment(x: number, y: number, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

function inEntrance(map: ActDef, x: number, y: number): boolean {
  for (const lane of lanesOf(map)) {
    if (distToSegment(x, y, map.playerBase, lane[0]) <= ENTRANCE_HALF) return true;
    if (distToSegment(x, y, map.enemyBase, lane[lane.length - 1]) <= ENTRANCE_HALF) return true;
  }
  return false;
}

function borderClear(map: ActDef, x: number, y: number): boolean {
  if (map.river && distToPolyline({ x, y }, map.river) < 36) return false;
  if (onRoad(map, x, y, 24)) return false;
  if (inEntrance(map, x, y)) return false;
  const spots = [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])];
  return spots.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= 90);
}

function inPlaza(map: ActDef, x: number, y: number, scale: number): boolean {
  return (
    Math.hypot(x - map.playerBase.x, y - map.playerBase.y) < map.plaza * scale ||
    Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) < map.plaza * scale
  );
}

function build(map: ActDef): Prop[] {
  const props: Prop[] = [];
  const roads = map.paths?.length
    ? map.paths.map((path) => ({ id: path.id, lane: path.lane }))
    : [{ id: 'center', lane: map.lane }];

  // Contiguous borders: dead trees, then stumps, then stone piles, on both sides of every lane.
  const groups: { kind: Prop['kind']; count: number; step: number; block: number; variants: number }[] = [
    { kind: 'tree', count: 4, step: 62, block: 0, variants: 5 },
    { kind: 'stump', count: 3, step: 46, block: 0, variants: 3 },
    { kind: 'rock', count: 2, step: 58, block: 30, variants: 3 },
  ];
  for (const road of roads) {
    const len = lengthOf(road.lane);
    const sideOffset = map.laneWidth / 2 + 88;
    for (const side of [1, -1]) {
      let dist = 100;
      let variant = 0;
      while (dist < len - 100) {
        for (const group of groups) {
          for (let i = 0; i < group.count && dist < len - 100; i++) {
            const at = sideAt(road.lane, dist, side * sideOffset);
            dist += group.step;
            if (!borderClear(map, at.x, at.y)) continue;
            place(props, map, {
              kind: group.kind,
              variant: variant % group.variants,
              x: at.x,
              y: at.y,
              flip: side < 0,
              block: group.block,
            });
            variant += 1;
          }
        }
      }
    }
  }

  if (map.river && map.river.length > 1) {
    const len = lengthOf(map.river);
    let n = 0;
    for (let dist = 160; dist < len - 120; dist += 280) {
      const at = pointAt(map.river, dist);
      if (onRoad(map, at.x, at.y, 36)) continue;
      const bank = sideAt(map.river, dist, n % 2 === 0 ? 108 : -108);
      if (onRoad(map, bank.x, bank.y, 10) || inPlaza(map, bank.x, bank.y, 0.9)) {
        n += 1;
        continue;
      }
      place(props, map, {
        kind: n % 3 === 0 ? 'rock' : 'tree',
        variant: (n + 1) % 5,
        x: bank.x,
        y: bank.y,
        flip: n % 2 === 0,
        block: 0,
      });
      n += 1;
    }
  }

  for (const den of map.dens ?? []) {
    for (let k = 0; k < 6; k++) {
      const angle = (k / 6) * Math.PI * 2 + 0.35;
      const x = den.x + Math.cos(angle) * 220;
      const y = den.y + Math.sin(angle) * 220;
      if (onRoad(map, x, y, 8) || inPlaza(map, x, y, 0.8)) continue;
      if (map.river && distToPolyline({ x, y }, map.river) < 64) continue;
      place(props, map, { kind: 'tree', variant: (den.id + k) % 5, x, y, flip: k % 2 === 0, block: 0 });
    }
  }

  campAssembly(props, map, map.playerBase, true);
  campAssembly(props, map, map.enemyBase, false);
  return props;
}

/** Palisade, gate posts, tents, and a wagon around a banner, open toward its lanes. */
function campAssembly(props: Prop[], map: ActDef, base: Vec, npc: boolean): void {
  const lanes = lanesOf(map);
  const ally = base === map.playerBase;
  const mouths = lanes.map((lane) => (ally ? lane[0] : lane[lane.length - 1]));
  const radius = 270;
  const spots: { x: number; y: number; ang: number }[] = [];
  const count = 28;
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI + ((i + 0.5) / count) * Math.PI * 2;
    const x = base.x + Math.cos(ang) * radius;
    const y = base.y + Math.sin(ang) * radius;
    if (mouths.some((mouth) => distToSegment(x, y, base, mouth) <= ENTRANCE_HALF)) continue;
    if (x < 64 || y < 64 || x > map.width - 64 || y > map.height - 64) continue;
    spots.push({ x, y, ang });
  }
  let gateA = 0;
  let gateB = 0;
  let entrance = 0;
  if (spots.length >= 2) {
    let biggest = -1;
    for (let i = 0; i < spots.length; i++) {
      let gap = spots[(i + 1) % spots.length].ang - spots[i].ang;
      if (gap <= 0) gap += Math.PI * 2;
      if (gap > biggest) {
        biggest = gap;
        gateA = i;
        gateB = (i + 1) % spots.length;
        entrance = spots[i].ang + gap / 2;
      }
    }
  }
  let run = 0;
  let variant = 0;
  spots.forEach((spot, i) => {
    const gate = i === gateA || i === gateB;
    place(props, map, {
      kind: 'fence',
      variant: gate ? 2 : variant,
      x: spot.x,
      y: spot.y,
      flip: false,
      block: 26,
    });
    if (!gate) {
      run += 1;
      if (run === 4) {
        run = 0;
        variant = (variant + 1) % 2;
      }
    }
  });
  const back = entrance + Math.PI;
  const seat = (ang: number, dist: number) => ({
    x: base.x + Math.cos(ang) * dist,
    y: base.y + Math.sin(ang) * dist,
  });
  const furnish = (kind: Prop['kind'], variant: number, ang: number, dist: number, block: number, flip: boolean) => {
    const at = seat(ang, dist);
    if (at.x < 80 || at.y < 80 || at.x > map.width - 80 || at.y > map.height - 80) return;
    if (kind !== 'npc' && mouths.some((mouth) => distToSegment(at.x, at.y, base, mouth) <= ENTRANCE_HALF)) return;
    if (onRoad(map, at.x, at.y, 16)) return;
    place(props, map, { kind, variant, x: at.x, y: at.y, flip, block });
  };
  furnish('tent', 0, back, 230, 42, false);
  furnish('tent', 1, back + 0.55, 210, 40, true);
  furnish('wagon', 0, back - 0.5, 245, 36, false);
  if (npc) furnish('npc', 0, back, 96, 20, false);
}
