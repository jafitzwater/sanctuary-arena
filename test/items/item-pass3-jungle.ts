// Pass 3 order item 2: open interior jungle, caves deep in the middle jungle, tower filter re-check.
import assert from 'node:assert/strict';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { TOWER_TIERS } from '../../src/game/data/acts/types';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { mapLen } from '../../src/game/data/mapScale';
import { inJungleInterior } from '../../src/game/landscape';
import { distToPolyline } from '../../src/game/math';
import { createMatch, spawnMinion, updateSim } from '../../src/game/sim';
import { walkable } from '../../src/game/terrain';
import { emptyInput } from '../../src/game/types';

const TOWER_MARGIN = 60;
const LANE_MIN = mapLen(260); // 195 px at MAP_SCALE 0.75
const lanes = (sanctuary.paths ?? []).map((path) => path.lane);
const dens = sanctuary.dens ?? [];
assert.equal(dens.length, 4);

for (const den of dens) {
  for (const tower of sanctuary.towers) {
    const gap = Math.hypot(tower.x - den.x, tower.y - den.y) - TOWER_TIERS[tower.tier].range;
    assert.ok(gap >= TOWER_MARGIN, `${den.unit} is ${gap.toFixed(0)} px outside ${tower.name} range (need ${TOWER_MARGIN})`);
  }
  for (const base of [sanctuary.playerBase, sanctuary.enemyBase]) {
    const gap = Math.hypot(base.x - den.x, base.y - den.y) - (base.attackRange ?? 0);
    assert.ok(gap >= TOWER_MARGIN, `${den.unit} clear of ${base.name}`);
  }
  const road = Math.min(...lanes.map((lane) => distToPolyline(den, lane)));
  assert.ok(road >= LANE_MIN, `${den.unit} is ${road.toFixed(0)} px from a road (need ${LANE_MIN})`);
  assert.ok(inJungleInterior(sanctuary, den.x, den.y), `${den.unit} sits in the middle jungle`);
  assert.ok(walkable(sanctuary, den.x, den.y), `${den.unit} cave floor is walkable`);
}
// Caves come in mirrored pairs.
for (const den of dens) {
  assert.ok(
    dens.some((other) => Math.hypot(sanctuary.width - den.x - other.x, sanctuary.height - den.y - other.y) <= 1),
    `${den.unit} has a mirrored cave`,
  );
}

// Every interior sample is walkable, and there is a lot of it.
let samples = 0;
for (let x = 0; x <= sanctuary.width; x += 30) {
  for (let y = 0; y <= sanctuary.height; y += 30) {
    if (!inJungleInterior(sanctuary, x, y)) continue;
    samples += 1;
    assert.ok(walkable(sanctuary, x, y), `jungle interior blocks at ${x},${y}`);
  }
}
assert.ok(samples > 1500, `interior has ${samples} samples`);
// Bases stay framed: the plaza edge region is not part of the open jungle.
assert.equal(inJungleInterior(sanctuary, sanctuary.playerBase.x, sanctuary.playerBase.y), false);
assert.equal(inJungleInterior(sanctuary, sanctuary.enemyBase.x, sanctuary.enemyBase.y), false);

// Tower targeting still skips wild units (NEEDS JOSEPH filter from pass 2, kept).
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const tower = sim.units.find((unit) => unit.kind === 'tower' && unit.team === 'ally')!;
  for (const unit of sim.units) if (unit.kind !== 'tower' && unit.kind !== 'base' && unit.kind !== 'champion') unit.alive = false;
  const wild = spawnMinion(sim, 'rogue', 'wild', tower.x + 60, tower.y);
  sim.units.push(wild);
  updateSim(sim, emptyInput(), 0.05);
  assert.notEqual(tower.targetId, wild.id, 'a tower does not target a wild unit');
  const foe = spawnMinion(sim, 'rogue', 'enemy', tower.x + 70, tower.y);
  sim.units.push(foe);
  updateSim(sim, emptyInput(), 0.05);
  assert.equal(tower.targetId, foe.id, 'the same tower still targets an enemy minion');
}
