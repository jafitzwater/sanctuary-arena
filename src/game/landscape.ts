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

  for (const road of roads) {
    const len = lengthOf(road.lane);
    let n = 0;
    for (let dist = 140; dist < len - 80; dist += 200) {
      const side = n % 2 === 0 ? 1 : -1;
      const at = sideAt(road.lane, dist, side * (map.laneWidth / 2 + 88));
      n += 1;
      if (inPlaza(map, at.x, at.y, 0.85)) continue;
      if (map.river && distToPolyline(at, map.river) < 78) continue;
      if (onRoad(map, at.x, at.y, 24)) continue;
      if (road.id === 'north' && n % 2 === 0) {
        props.push({ kind: 'fence', variant: n % 2, x: at.x, y: at.y, flip: side < 0, block: 0 });
      } else if (road.id === 'south' && n % 3 === 0) {
        props.push({ kind: 'rock', variant: n % 3, x: at.x, y: at.y, flip: false, block: 0 });
      } else {
        props.push({ kind: 'tree', variant: n % 5, x: at.x, y: at.y, flip: side < 0, block: 0 });
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
      props.push({
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
      props.push({ kind: 'tree', variant: (den.id + k) % 5, x, y, flip: k % 2 === 0, block: 0 });
    }
  }

  const camp = map.playerBase;
  props.push(
    { kind: 'tent', variant: 0, x: camp.x - 190, y: camp.y - 70, flip: false, block: 46 },
    { kind: 'tent', variant: 1, x: camp.x + 30, y: camp.y - 210, flip: true, block: 42 },
    { kind: 'tent', variant: 2, x: camp.x + 220, y: camp.y + 90, flip: false, block: 40 },
    { kind: 'npc', variant: 0, x: camp.x - 20, y: camp.y - 78, flip: false, block: 20 },
    { kind: 'fence', variant: 0, x: camp.x - 250, y: camp.y + 40, flip: false, block: 28 },
    { kind: 'fence', variant: 1, x: camp.x - 250, y: camp.y + 120, flip: false, block: 28 },
    { kind: 'rock', variant: 1, x: camp.x + 250, y: camp.y - 150, flip: false, block: 34 },
  );

  const lair = map.enemyBase;
  props.push(
    { kind: 'rock', variant: 0, x: lair.x + 40, y: lair.y - 180, flip: false, block: 36 },
    { kind: 'rock', variant: 2, x: lair.x + 180, y: lair.y + 30, flip: false, block: 34 },
    { kind: 'fence', variant: 0, x: lair.x - 40, y: lair.y - 200, flip: true, block: 26 },
    { kind: 'tree', variant: 4, x: lair.x + 220, y: lair.y - 80, flip: false, block: 0 },
  );
  return props;
}
