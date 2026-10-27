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

/** How a placed obstacle is drawn. Positions and block radii stay on the prop. */
export function propForm(kind: Prop['kind']): 'pillar' | 'rock' | 'posts' | 'tent' | 'cart' | 'figure' {
  if (kind === 'tree') return 'pillar';
  if (kind === 'fence') return 'posts';
  if (kind === 'rock' || kind === 'stump') return 'rock';
  if (kind === 'tent') return 'tent';
  if (kind === 'wagon') return 'cart';
  return 'figure';
}

/** World size of one baked floor diamond. */
export const FLOOR_STEP = 80 / 0.85;
/** Half of the 5-tile collision-free lane corridor. */
export const LANE_CLEAR_HALF = FLOOR_STEP * 2.5;
/** Half of a straight 6-tile base gate. */
export const GATE_HALF = FLOOR_STEP * 3;
/** Decorative props stay this far past the cobble edge. */
export const DECOR_MARGIN = FLOOR_STEP * 2;

const OPENING = 150;
/** Decorative props stop here so total clutter is half of the old 407. */
const DECOR_BUDGET = 196;

export interface Gate {
  x: number;
  y: number;
  axisX: number;
  axisY: number;
  perpX: number;
  perpY: number;
  /** Distance from the banner to the palisade, along the axis. */
  wall: number;
  /** How far the clear slot runs past the palisade toward the lanes. */
  reach: number;
  half: number;
}

const cache = new WeakMap<ActDef, Prop[]>();
const gateCache = new WeakMap<ActDef, Gate[]>();

/** Deliberate Act I props: edge forests and a straight gate at each camp. */
export function sceneryFor(map: ActDef): Prop[] {
  const hit = cache.get(map);
  if (hit) return hit;
  const props = build(map);
  cache.set(map, props);
  return props;
}

export function campGates(map: ActDef): Gate[] {
  const hit = gateCache.get(map);
  if (hit) return hit;
  const gates = map.paths?.length
    ? [makeGate(map, map.playerBase, true), makeGate(map, map.enemyBase, false)]
    : [];
  gateCache.set(map, gates);
  return gates;
}

/** Straight slot through a camp gate. Props do not block it. */
export function inGateSlot(map: ActDef, x: number, y: number): boolean {
  for (const gate of campGates(map)) {
    const dx = x - gate.x;
    const dy = y - gate.y;
    const along = dx * gate.axisX + dy * gate.axisY;
    const perp = dx * gate.perpX + dy * gate.perpY;
    if (Math.abs(perp) > gate.half) continue;
    if (along < -gate.wall - 12 || along > gate.reach) continue;
    return true;
  }
  return false;
}

function wrap(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function lanesOf(map: ActDef): Vec[][] {
  if (map.paths?.length) return map.paths.map((path) => path.lane);
  return [map.lane];
}

function decorLimit(map: ActDef): number {
  return map.laneWidth / 2 + DECOR_MARGIN;
}

function nearLane(map: ActDef, x: number, y: number, limit: number): boolean {
  return lanesOf(map).some((lane) => distToPolyline({ x, y }, lane) < limit);
}

function makeGate(map: ActDef, base: Vec, ally: boolean): Gate {
  const mouths = lanesOf(map).map((lane) => (ally ? lane[0] : lane[lane.length - 1]));
  const angles = mouths.map((mouth) => Math.atan2(mouth.y - base.y, mouth.x - base.x));
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < angles.length; i++) {
    const rel = wrap(angles[i] - angles[0]);
    lo = Math.min(lo, rel);
    hi = Math.max(hi, rel);
  }
  const mid = angles[0] + (lo + hi) / 2;
  const axisX = Math.cos(mid);
  const axisY = Math.sin(mid);
  const flank = GATE_HALF + 26 * 0.3;
  const plazaRoom = Math.sqrt(Math.max(0, map.plaza * map.plaza - flank * flank));
  const minDist = Math.min(...mouths.map((mouth) => Math.hypot(mouth.x - base.x, mouth.y - base.y)));
  let wall = Math.min(plazaRoom - 6, minDist - 40);
  const span = hi - lo;
  const postsClear = (dist: number) => {
    const gx = base.x + axisX * dist;
    const gy = base.y + axisY * dist;
    for (const sign of [-1, 1]) {
      const x = gx + -axisY * sign * flank;
      const y = gy + axisX * sign * flank;
      if (nearLane(map, x, y, decorLimit(map))) return false;
    }
    return true;
  };
  while (wall > 72 && (2 * wall * Math.sin(span / 2) > GATE_HALF * 2 - 20 || !postsClear(wall))) wall -= 2;
  const x = base.x + axisX * wall;
  const y = base.y + axisY * wall;
  const reach = Math.max(
    ...mouths.map((mouth) => (mouth.x - x) * axisX + (mouth.y - y) * axisY),
  );
  return {
    x,
    y,
    axisX,
    axisY,
    perpX: -axisY,
    perpY: axisX,
    wall,
    reach: Math.max(reach, FLOOR_STEP) + 16,
    half: GATE_HALF,
  };
}

function place(props: Prop[], prop: Prop): void {
  props.push(prop);
}

function decorCount(props: Prop[]): number {
  return props.filter((prop) => prop.kind === 'tree' || prop.kind === 'stump' || prop.kind === 'rock' || prop.kind === 'fence').length;
}

function clearOfWilds(map: ActDef, x: number, y: number, pad: number): boolean {
  if (x < 48 || y < 48 || x > map.width - 48 || y > map.height - 48) return false;
  if (nearLane(map, x, y, decorLimit(map))) return false;
  if (inGateSlot(map, x, y)) return false;
  if (Math.hypot(x - map.playerBase.x, y - map.playerBase.y) < map.plaza) return false;
  if (Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) < map.plaza) return false;
  if (map.river && distToPolyline({ x, y }, map.river) < 70) return false;
  const spots = [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])];
  return spots.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= OPENING + pad);
}

function build(map: ActDef): Prop[] {
  const props: Prop[] = [];
  if (!map.paths?.length) return props;
  for (const gate of campGates(map)) placePalisade(props, map, gate);
  campFurnish(props, map, map.playerBase, campGates(map)[0], true);
  // Item 7: mirrored bases get the same furnishings.
  campFurnish(props, map, map.enemyBase, campGates(map)[1], mirroredBases(map));
  placeBoulders(props, map);
  plantForests(props, map);
  return props;
}

/** Lane-margin boulder walls. Centers stay outside the 2-tile decor margin. */
function placeBoulders(props: Prop[], map: ActDef): void {
  const offset = decorLimit(map) + 8;
  const cap = 72;
  let count = 0;
  for (const lane of lanesOf(map)) {
    for (const spot of samplePolyline(lane, 176)) {
      if (Math.hypot(spot.x - lane[0].x, spot.y - lane[0].y) < 220) continue;
      const end = lane[lane.length - 1];
      if (Math.hypot(spot.x - end.x, spot.y - end.y) < 220) continue;
      for (const sign of [-1, 1]) {
        if (count >= cap) return;
        const x = spot.x + spot.nx * sign * offset;
        const y = spot.y + spot.ny * sign * offset;
        if (!boulderSite(map, props, x, y)) continue;
        place(props, { kind: 'rock', variant: 3 + (count % 3), x, y, flip: sign < 0, block: 48 });
        count += 1;
      }
    }
  }
}

function samplePolyline(lane: Vec[], spacing: number): { x: number; y: number; nx: number; ny: number }[] {
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  let pending = spacing;
  for (let i = 1; i < lane.length; i++) {
    const dx = lane[i].x - lane[i - 1].x;
    const dy = lane[i].y - lane[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const ux = dx / len;
    const uy = dy / len;
    let at = 0;
    while (at + pending <= len) {
      at += pending;
      pending = spacing;
      out.push({ x: lane[i - 1].x + ux * at, y: lane[i - 1].y + uy * at, nx: -uy, ny: ux });
    }
    pending -= len - at;
  }
  return out;
}

function boulderSite(map: ActDef, props: Prop[], x: number, y: number): boolean {
  if (x < 80 || y < 80 || x > map.width - 80 || y > map.height - 80) return false;
  if (nearLane(map, x, y, decorLimit(map) - 1)) return false;
  if (inGateSlot(map, x, y)) return false;
  if (Math.hypot(x - map.playerBase.x, y - map.playerBase.y) < map.plaza) return false;
  if (Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) < map.plaza) return false;
  if (map.river && distToPolyline({ x, y }, map.river) < 80) return false;
  const spots = [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])];
  if (spots.some((spot) => Math.hypot(x - spot.x, y - spot.y) < OPENING)) return false;
  return props.every((prop) => Math.hypot(prop.x - x, prop.y - y) > 70);
}

/** Fence posts flanking a straight 6-tile opening. Nothing is placed inside the slot. */
function placePalisade(props: Prop[], map: ActDef, gate: Gate): void {
  const foot = 26 * 0.3;
  const inner = GATE_HALF + foot;
  const spacing = 46;
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const off = inner + i * spacing;
      const x = gate.x + gate.perpX * sign * off;
      const y = gate.y + gate.perpY * sign * off;
      if (x < 40 || y < 40 || x > map.width - 40 || y > map.height - 40) continue;
      if (nearLane(map, x, y, decorLimit(map))) continue;
      if (inGateSlot(map, x, y)) continue;
      place(props, { kind: 'fence', variant: i === 0 ? 2 : i % 2, x, y, flip: sign < 0, block: 26 });
    }
  }
}

function campFurnish(props: Prop[], map: ActDef, base: Vec, gate: Gate, npc: boolean): void {
  const seats: { kind: Prop['kind']; variant: number; dist: number; side: number; block: number; flip: boolean }[] = [
    { kind: 'tent', variant: 0, dist: 200, side: 80, block: 42, flip: false },
    { kind: 'tent', variant: 1, dist: 175, side: -100, block: 40, flip: true },
    { kind: 'wagon', variant: 0, dist: 230, side: 10, block: 36, flip: false },
  ];
  if (npc) seats.push({ kind: 'npc', variant: 0, dist: 70, side: 120, block: 20, flip: false });
  for (const seat of seats) {
    let placed = false;
    for (const dist of [seat.dist, seat.dist + 40, seat.dist - 30]) {
      if (placed) break;
      for (const side of [seat.side, seat.side + 50, seat.side - 50]) {
        const x = base.x - gate.axisX * dist + gate.perpX * side;
        const y = base.y - gate.axisY * dist + gate.perpY * side;
        if (x < 64 || y < 64 || x > map.width - 64 || y > map.height - 64) continue;
        if (inGateSlot(map, x, y)) continue;
        if (nearLane(map, x, y, LANE_CLEAR_HALF + 8)) continue;
        place(props, { kind: seat.kind, variant: seat.variant, x, y, flip: seat.flip, block: seat.block });
        placed = true;
        break;
      }
    }
  }
}

/** Solid tree bands on the outer map edges, away from every lane. */
function plantForests(props: Prop[], map: ActDef): void {
  const margin = 68;
  const step = 74;
  const depth = 36;
  const left: Vec[] = [];
  const right: Vec[] = [];
  const top: Vec[] = [];
  const bottom: Vec[] = [];
  for (let y = margin; y <= map.height - margin; y += step) {
    left.push({ x: margin, y }, { x: margin + depth, y: y + step * 0.5 });
    right.push({ x: map.width - margin, y }, { x: map.width - margin - depth, y: y + step * 0.5 });
  }
  for (let x = margin + step; x <= map.width - margin - step; x += step) {
    top.push({ x, y: margin }, { x: x + step * 0.5, y: margin + depth });
    bottom.push({ x, y: map.height - margin }, { x: x + step * 0.5, y: map.height - margin - depth });
  }
  const bands = [left, right, top, bottom];
  const longest = Math.max(...bands.map((band) => band.length));
  for (let i = 0; i < longest; i++) {
    for (const band of bands) {
      if (decorCount(props) >= DECOR_BUDGET) return;
      const spot = band[i];
      if (!spot || !clearOfWilds(map, spot.x, spot.y, 28)) continue;
      if (props.some((prop) => prop.kind === 'tree' && Math.hypot(prop.x - spot.x, prop.y - spot.y) < 30)) continue;
      place(props, {
        kind: 'tree',
        variant: (Math.round(spot.x / 40) + Math.round(spot.y / 40)) % 5,
        x: spot.x,
        y: spot.y,
        flip: spot.x > map.width / 2,
        block: 38,
      });
    }
  }
}

/** Item 7: both sides are the same town (Sanctuary), so the camps are mirrored. */
export function mirroredBases(map: ActDef): boolean {
  return !!map.towns && map.towns.ally === map.towns.enemy;
}
