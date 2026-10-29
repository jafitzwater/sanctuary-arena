/** Remember-list batch 1 [JOSEPH t200u, t201u, t223u]: wave stagger, tower damage, pool restore. */
import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { TOWER_DAMAGE_MULT, TOWER_TIERS } from '../src/game/data/acts/types';
import { barbarian } from '../src/game/data/classes/barbarian';
import { POOL_SHARE, poolRestore } from '../src/game/data/orbs';
import { WAVE_SIZE, WAVE_STAGGER } from '../src/game/data/waves';
import { createMatch, updateSim } from '../src/game/sim';
import { emptyInput } from '../src/game/types';

// 1. Stagger: minion k of every wave arrives (k - 1) * 0.5 s after minion 1, every roadway, both teams.
{
  assert.equal(WAVE_STAGGER, 0.5);
  const sim = createMatch(sanctuary, barbarian, 1);
  sim.time = Math.max(sim.time, sim.map.openingWait ?? 0);
  const seen = new Set(sim.units.map((u) => u.id));
  const born: Record<string, number[]> = {};
  sim.waveIn = 0.05;
  let start = -1;
  for (let i = 0; i < 80; i++) {
    updateSim(sim, emptyInput(), 0.05);
    for (const u of sim.units) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      if (u.kind !== 'minion' || u.team === 'wild' || u.affix) continue;
      if (start < 0) start = sim.time;
      (born[`${u.team}:${u.path}`] ??= []).push(sim.time);
    }
  }
  const paths = sim.map.paths!.length;
  assert.equal(Object.keys(born).length, 2 * paths, 'both teams, every roadway');
  for (const [key, times] of Object.entries(born)) {
    assert.equal(times.length, WAVE_SIZE, `${key}: whole wave arrives`);
    times.forEach((t, k) => assert.ok(Math.abs(t - start - k * WAVE_STAGGER) < 0.051, `${key} minion ${k + 1} at ${(t - start).toFixed(2)} s`));
  }
  assert.equal(sim.waveQueue.length, 0, 'queue drained');
  // Deterministic: same seed, same steps, same spawn positions.
  const twin = createMatch(sanctuary, barbarian, 1);
  twin.time = Math.max(twin.time, twin.map.openingWait ?? 0);
  twin.waveIn = 0.05;
  for (let i = 0; i < 80; i++) updateSim(twin, emptyInput(), 0.05);
  const pos = (s: typeof sim) => s.units.filter((u) => u.kind === 'minion' && u.team !== 'wild').map((u) => `${u.id}:${u.x.toFixed(3)},${u.y.toFixed(3)}`).join('|');
  assert.equal(pos(twin), pos(sim), 'deterministic');
}

// 2. Tower damage -15% [TEMP]; range, interval and HP unchanged; Worldstone untouched.
{
  assert.equal(TOWER_DAMAGE_MULT, 0.85);
  const sim = createMatch(sanctuary, barbarian, 1);
  const towers = sim.units.filter((u) => u.kind === 'tower');
  assert.ok(towers.length > 0);
  for (const tower of towers) {
    const spec = sim.map.towers.find((t) => t.name === tower.name && t.x === tower.x && t.y === tower.y)!;
    const tier = TOWER_TIERS[spec.tier];
    assert.ok(Math.abs(tower.ad - tier.ad * 0.85) < 1e-9, `${tower.name} ad ${tower.ad}`);
    assert.equal(tower.attackRange, tier.range);
    assert.equal(tower.attackInterval, tier.interval);
    assert.equal(tower.maxHp, tier.hp);
  }
  const base = sim.units.find((u) => u.kind === 'base' && u.team === 'enemy')!;
  assert.equal(base.ad, sim.map.enemyBase.ad, 'Worldstone damage unchanged');
}

// 3. Pool restores 75% of max health and max mana, capped at max.
{
  assert.equal(POOL_SHARE, 0.75);
  assert.equal(poolRestore(0, 400), 300);
  assert.equal(poolRestore(50, 400), 350);
  assert.equal(poolRestore(200, 400), 400, 'capped');
  assert.equal(poolRestore(0, 1000), 750);
  assert.equal(poolRestore(10, 120), 100);
  assert.equal(poolRestore(0, 78), 59);
}
console.log('remember batch 1 ok');
