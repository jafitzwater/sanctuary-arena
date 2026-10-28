/**
 * Item 16, batch 4: health orbs and pools.
 * [JOSEPH] answer 3: "Orbs: small pickups on main roadways every ~200-300 units, instant resource
 *   or temp buff. Pools: larger off-road areas, stand in them briefly, stronger effect. 4-6 orbs
 *   on primary path, 2-3 pools in side areas, approximate coordinates. (Doc timings: 180s refill,
 *   50% of current.)"
 * [DOC] "Once consumed by anyone, they refill after 3 minutes. A health orb restores only health.
 *   A pool restores health and mana. Both only do 50% of what that character currently has."
 */
import assert from 'node:assert/strict';
import { ORB_REFILL, ORB_SHARE, orbRestore, orbSpots, POOL_STAND } from '../../src/game/data/orbs';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { emptyInput } from '../../src/game/types';
import { createMatch, updateSim } from '../../src/game/sim';

// [JOSEPH] "180s refill, 50% of current."
assert.equal(ORB_REFILL, 180);
assert.equal(ORB_SHARE, 0.5);
assert.equal(orbRestore(100, 400), 150);
assert.equal(orbRestore(300, 400), 400, 'capped at max');

const spots = orbSpots(sanctuary.paths ?? []);
const orbs = spots.filter((s) => s.kind === 'orb');
const pools = spots.filter((s) => s.kind === 'pool');
// [JOSEPH] "4-6 orbs on primary path", "2-3 pools in side areas"
assert.ok(orbs.length >= 4 && orbs.length <= 6, `orbs ${orbs.length}`);
assert.ok(pools.length >= 2 && pools.length <= 3, `pools ${pools.length}`);
// [JOSEPH] "every ~200-300 units" (measured along the lane; straight-line gap may be shorter on bends)
for (let i = 1; i < orbs.length; i++) {
  const gap = Math.hypot(orbs[i].x - orbs[i - 1].x, orbs[i].y - orbs[i - 1].y);
  assert.ok(gap >= 150 && gap <= 320, `orb gap ${gap}`);
}

// Sim: an orb is taken on touch and restores 50% of current health only.
const sim = createMatch(sanctuary, barbarian, 1);
sim.time = Math.max(sim.time, sim.map.openingWait ?? 0); // past the opening wait
assert.equal(sim.orbs.length, spots.length);
const hero = sim.units.find((u) => u.id === sim.playerId)!;
const orb = sim.orbs.find((o) => o.kind === 'orb')!;
hero.x = orb.x;
hero.y = orb.y;
hero.hp = 100;
hero.mana = 5;
updateSim(sim, emptyInput(), 0.05);
assert.ok(hero.hp >= 149 && hero.hp <= 152, `orb hp ${hero.hp}`);
assert.ok(hero.mana < 7, 'orb restores only health');
assert.ok(orb.refill > ORB_REFILL - 1, 'orb refills after 180 s');

// A pool needs a brief stand, then restores health and mana by 50% of current.
const pool = sim.orbs.find((o) => o.kind === 'pool')!;
hero.x = pool.x;
hero.y = pool.y;
hero.hp = 100;
hero.mana = 20;
let t = 0;
while (t < POOL_STAND * 0.5) { updateSim(sim, emptyInput(), 0.05); t += 0.05; }
assert.equal(pool.refill, 0, 'pool not taken instantly');
while (pool.refill === 0 && t < POOL_STAND * 2) { updateSim(sim, emptyInput(), 0.05); t += 0.05; }
assert.ok(pool.refill > 0, 'pool taken after standing');
assert.ok(hero.hp >= 148 && hero.hp <= 160, `pool hp ${hero.hp}`);
// Allows ~1 s of natural regen before the pool triggers.
assert.ok(hero.mana >= 30 && hero.mana <= 40, `pool mana ${hero.mana}`);
// Refill
let w = 0;
const left = orb.refill;
assert.ok(left > ORB_REFILL - 3 && left <= ORB_REFILL, `orb refill left ${left}`);
while (orb.refill > 0 && w < 200) { updateSim(sim, emptyInput(), 0.05); w += 0.05; }
assert.ok(Math.abs(w - left) <= 0.2, `orb back after ${w}s`);
console.log('item 16 ok');
