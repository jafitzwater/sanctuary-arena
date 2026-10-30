// Base layout, Wild Rift style [JOSEPH t309u]: spawn pen behind the Worldstone with a 15 s barrier,
// base walls with lane-only entry, bots and minions still leave the base down the lanes.
import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { barbarian } from '../src/game/data/classes/barbarian';
import {
  BASE_WALL_HALF,
  BASE_WALL_RADIUS,
  SPAWN_BARRIER_RADIUS,
  barrierCenter,
  barrierSeconds,
  barrierUp,
  baseFront,
  inBaseWall,
} from '../src/game/baseLayout';
import { wallBlocks } from '../src/game/basePath';
import { LANE_CLEAR_HALF } from '../src/game/landscape';
import { distToPolyline } from '../src/game/math';
import { createMatch, updateSim } from '../src/game/sim';
import { walkable } from '../src/game/terrain';
import { emptyInput, type Sim, type Unit } from '../src/game/types';

const map = sanctuary;
const lanes = (map.paths ?? []).map((path) => path.lane);
const sides = [
  { side: 'ally' as const, base: map.playerBase },
  { side: 'enemy' as const, base: map.enemyBase },
];
const inCorridor = (x: number, y: number) => lanes.some((lane) => distToPolyline({ x, y }, lane) <= LANE_CLEAR_HALF);

// --- Barrier timing -------------------------------------------------------------------------------------------
assert.equal(barrierSeconds(map), 15, 'barrier lasts 15 s');
assert.ok(barrierUp(map, 0) && barrierUp(map, 14.9), 'barrier up before 15 s');
assert.ok(!barrierUp(map, 15.01), 'barrier down after 15 s');

// --- Spawn behind the Worldstone, inside the barrier, both sides ------------------------------------------------
const sim = createMatch(map, barbarian, 7);
const champs = sim.units.filter((u) => u.kind === 'champion');
assert.equal(champs.length, 8, 'four champions a side, player included');
for (const { side, base } of sides) {
  const front = baseFront(map, side);
  const pen = barrierCenter(map, side);
  // The pen centre sits on the far side of the Worldstone from the lanes.
  assert.ok((pen.x - base.x) * front.x + (pen.y - base.y) * front.y < -100, `${side} pen is behind the Worldstone`);
  for (const c of champs.filter((u) => u.team === side)) {
    const behind = (c.x - base.x) * front.x + (c.y - base.y) * front.y;
    assert.ok(behind < -100, `${c.name} spawns behind the ${side} Worldstone (${behind.toFixed(0)})`);
    assert.ok(Math.hypot(c.x - pen.x, c.y - pen.y) + c.radius * 0.3 <= SPAWN_BARRIER_RADIUS, `${c.name} spawns inside the barrier`);
    assert.ok(walkable(map, c.x, c.y), `${c.name} spawn is walkable`);
  }
  // Large enough for everyone: seats do not overlap.
  const mine = champs.filter((u) => u.team === side);
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      assert.ok(Math.hypot(mine[i].x - mine[j].x, mine[i].y - mine[j].y) >= mine[i].radius, 'spawn seats apart');
    }
  }
}

// --- Barrier blocks until 15 s, then drops -----------------------------------------------------------------------
{
  const s = createMatch(map, barbarian, 7);
  const hero = s.units.find((u) => u.id === s.playerId) as Unit;
  const pen = barrierCenter(map, 'ally');
  const outside = (u: Unit) => {
    const c = barrierCenter(map, u.team as 'ally' | 'enemy');
    return Math.hypot(u.x - c.x, u.y - c.y) > SPAWN_BARRIER_RADIUS + 1;
  };
  const step = (sim: Sim, until: number) => {
    while (sim.time < until) {
      const input = emptyInput();
      // The player pushes out of the pen the whole time.
      input.destX = map.enemyBase.x;
      input.destY = map.enemyBase.y;
      updateSim(sim, input, 1 / 30);
      if (sim.time < 14.9) {
        for (const c of sim.units.filter((u) => u.kind === 'champion' && u.alive)) {
          assert.ok(!outside(c), `${c.name} stays inside the barrier at ${sim.time.toFixed(2)} s`);
        }
      }
    }
  };
  step(s, 14.9);
  assert.ok(Math.hypot(hero.x - pen.x, hero.y - pen.y) <= SPAWN_BARRIER_RADIUS, 'player held at 14.9 s');
  step(s, 22);
  assert.ok(outside(hero), 'player leaves the pen once the barrier drops');
  for (const c of s.units.filter((u) => u.kind === 'champion' && u.bot)) assert.ok(outside(c), `bot ${c.name} leaves the pen`);
}

// --- Lane-only entry: the wall band blocks everywhere except the three lane gaps ------------------------------------
for (const { side, base } of sides) {
  // Every wall-band sample on open ground is blocked unless it lies in a lane corridor.
  for (let a = 0; a < Math.PI * 2; a += 0.002) {
    for (const r of [BASE_WALL_RADIUS - BASE_WALL_HALF + 2, BASE_WALL_RADIUS, BASE_WALL_RADIUS + BASE_WALL_HALF - 2]) {
      const x = base.x + Math.cos(a) * r;
      const y = base.y + Math.sin(a) * r;
      assert.ok(inBaseWall(map, x, y));
      if (!inCorridor(x, y)) assert.ok(!walkable(map, x, y), `${side} wall open at ${x.toFixed(0)},${y.toFixed(0)}`);
    }
  }
  // Gaps along the wall centre line: exactly one per lane.
  let gaps = 0;
  let prev = false;
  let first: boolean | null = null;
  for (let a = 0; a < Math.PI * 2; a += 0.002) {
    const open = walkable(map, base.x + Math.cos(a) * BASE_WALL_RADIUS, base.y + Math.sin(a) * BASE_WALL_RADIUS);
    if (first === null) first = open;
    if (open && !prev) gaps += 1;
    prev = open;
  }
  if (first && prev) gaps -= 1;
  assert.equal(gaps, lanes.length, `${side} wall has one gap per lane`);

  // Flood fill out of the base on a grid: escapes with the lane gaps, sealed without them.
  const cell = 20;
  const span = BASE_WALL_RADIUS + BASE_WALL_HALF + 200;
  const n = Math.ceil((span * 2) / cell);
  const flood = (maskGaps: boolean) => {
    const seen = new Uint8Array(n * n);
    const start = barrierCenter(map, side);
    const sx = Math.floor((start.x - (base.x - span)) / cell);
    const sy = Math.floor((start.y - (base.y - span)) / cell);
    const queue = [sx + sy * n];
    seen[queue[0]] = 1;
    let escaped = 0;
    const blocked = (x: number, y: number) => {
      if (!walkable(map, x, y)) return true;
      if (!maskGaps) return false;
      const d = Math.hypot(x - base.x, y - base.y);
      return Math.abs(d - BASE_WALL_RADIUS) <= BASE_WALL_HALF + 120 && inCorridor(x, y);
    };
    while (queue.length) {
      const k = queue.pop() as number;
      const cx = k % n;
      const cy = (k - cx) / n;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const id = nx + ny * n;
        if (seen[id]) continue;
        const x = base.x - span + (nx + 0.5) * cell;
        const y = base.y - span + (ny + 0.5) * cell;
        if (blocked(x, y)) continue;
        seen[id] = 1;
        if (Math.hypot(x - base.x, y - base.y) > BASE_WALL_RADIUS + BASE_WALL_HALF + 60) escaped += 1;
        queue.push(id);
      }
    }
    return escaped;
  };
  assert.ok(flood(false) > 0, `${side} base is reachable through the lanes`);
  assert.equal(flood(true), 0, `${side} base is sealed when the lane gaps are closed (no other gaps)`);
}
assert.ok(wallBlocks(map).length > 50, 'wall blocks for the renderer');

// --- Short bot match: nobody stands in a wall, everyone gets out of the base -------------------------------------
{
  const s = createMatch(map, barbarian, 11);
  const out = new Set<number>();
  while (s.time < 75) {
    updateSim(s, emptyInput(), 1 / 30);
    for (const u of s.units) {
      if (!u.alive || u.leap || (u.kind !== 'minion' && u.kind !== 'champion')) continue;
      assert.ok(walkable(map, u.x, u.y), `${u.name} on unwalkable ground at ${u.x.toFixed(0)},${u.y.toFixed(0)}`);
      const home = u.team === 'ally' ? map.playerBase : map.enemyBase;
      if (Math.hypot(u.x - home.x, u.y - home.y) > BASE_WALL_RADIUS + BASE_WALL_HALF + 50) out.add(u.id);
    }
  }
  for (const c of s.units.filter((u) => u.kind === 'champion' && u.bot)) {
    assert.ok(out.has(c.id), `bot ${c.name} walked out of its base walls`);
  }
  assert.ok(s.units.some((u) => u.kind === 'minion' && out.has(u.id) && u.team === 'ally'), 'ally minions leave the base');
  assert.ok(s.units.some((u) => u.kind === 'minion' && out.has(u.id) && u.team === 'enemy'), 'enemy minions leave the base');
}

console.log('base-layout ok');
