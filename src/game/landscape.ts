import type { ActDef } from './data/acts/types';
import { distToPolyline, type Vec } from './math';

export interface Prop {
  kind: 'tree' | 'rock' | 'fence' | 'tent' | 'npc';
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

function offPath(map: ActDef, x: number, y: number, radius: number): boolean {
  const limit = map.laneWidth / 2 + PATH_SHOULDER + radius + 4;
  if (lanesOf(map).some((lane) => distToPolyline({ x, y }, lane) < limit)) return false;
  const spots = [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])];
  return spots.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= OPENING + radius);
}

function place(props: Prop[], map: ActDef, prop: Prop): void {
  if (prop.block <= 0 && (prop.kind === 'tree' || prop.kind === 'fence' || prop.kind === 'tent')) {
    const radius = prop.kind === 'tree' ? 38 : prop.kind === 'fence' ? 24 : 42;
    if (offPath(map, prop.x, prop.y, radius)) prop.block = radius;
  }
  props.push(prop);
}

function borderClear(map: ActDef, x: number, y: number): boolean {
  if (Math.hypot(x - map.playerBase.x, y - map.playerBase.y) <= map.fountainRadius) return false;
  if (Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) <= map.fountainRadius) return false;
  if (map.river && distToPolyline({ x, y }, map.river) < 78) return false;
  if (onRoad(map, x, y, 24)) return false;
  const spots = [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])];
  return spots.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= OPENING);
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

  // Contiguous borders: a run of trees, then fences, then rocks, on both sides of every lane.
  const groups: { kind: Prop['kind']; count: number; step: number; block: number; variants: number }[] = [
    { kind: 'tree', count: 4, step: 80, block: 0, variants: 5 },
    { kind: 'fence', count: 3, step: 52, block: 0, variants: 2 },
    { kind: 'rock', count: 2, step: 72, block: 34, variants: 3 },
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

  const camp = map.playerBase;
  place(props, map, { kind: 'tent', variant: 0, x: camp.x - 190, y: camp.y - 70, flip: false, block: 46 });
  place(props, map, { kind: 'tent', variant: 1, x: camp.x + 30, y: camp.y - 210, flip: true, block: 42 });
  place(props, map, { kind: 'tent', variant: 2, x: camp.x + 220, y: camp.y + 90, flip: false, block: 40 });
  place(props, map, { kind: 'npc', variant: 0, x: camp.x - 20, y: camp.y - 78, flip: false, block: 20 });
  place(props, map, { kind: 'fence', variant: 0, x: camp.x - 250, y: camp.y + 40, flip: false, block: 28 });
  place(props, map, { kind: 'fence', variant: 1, x: camp.x - 250, y: camp.y + 120, flip: false, block: 28 });
  place(props, map, { kind: 'rock', variant: 1, x: camp.x + 250, y: camp.y - 150, flip: false, block: 34 });

  const lair = map.enemyBase;
  place(props, map, { kind: 'rock', variant: 0, x: lair.x + 40, y: lair.y - 180, flip: false, block: 36 });
  place(props, map, { kind: 'rock', variant: 2, x: lair.x + 180, y: lair.y + 30, flip: false, block: 34 });
  place(props, map, { kind: 'fence', variant: 0, x: lair.x - 40, y: lair.y - 200, flip: true, block: 26 });
  place(props, map, { kind: 'tree', variant: 4, x: lair.x + 220, y: lair.y - 80, flip: false, block: 0 });
  return props;
}
