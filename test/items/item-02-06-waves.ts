// Gap-list items 2 and 6. Sources (refined-design-document-oct27.md, numbers-table.md):
// "One wave on one roadway is 5 support mobs."
// "After the first wave, a new wave spawns every 60 seconds."
// "Each wave gets 1/5th stronger." [WO] 1.2x compounding
// "They spawn in series, two waves each, then loop: rogues, valkyries, Act 2 mercenaries, Act 3 mercenaries."
import assert from 'node:assert/strict';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { unitDef } from '../../src/game/data/units';
import { waveMob, waveStrength, WAVE_INTERVAL, WAVE_SIZE } from '../../src/game/data/waves';
import { createMatch, updateSim } from '../../src/game/sim';
import { emptyInput } from '../../src/game/types';

assert.equal(WAVE_SIZE, 5);
assert.equal(WAVE_INTERVAL, 60);
assert.equal(sanctuary.waves.interval, 60);
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(waveMob), [
  'rogue', 'rogue', 'valkyrie', 'valkyrie', 'act2-mercenary', 'act2-mercenary', 'act3-mercenary', 'act3-mercenary', 'rogue', 'rogue',
]);
assert.equal(waveStrength(1), 1);
assert.ok(Math.abs(waveStrength(3) - 1.44) < 1e-9);

const sim = createMatch(sanctuary, barbarian, 1);
const paths = sim.map.paths!.length;
const fresh = (team: string, defId: string) =>
  sim.units.filter((u) => u.kind === 'minion' && u.team === team && u.alive && u.defId === defId && !u.affix);
const step = (until: number) => {
  while (sim.waveNo < until) updateSim(sim, emptyInput(), 0.05);
};
step(1);
const t1 = sim.time;
for (const team of ['ally', 'enemy']) assert.equal(fresh(team, 'rogue').length, WAVE_SIZE * paths, `${team}: 5 per roadway`);
step(3);
assert.ok(Math.abs(sim.time - t1 - 2 * WAVE_INTERVAL) < 0.2, 'waves every 60 s');
for (const team of ['ally', 'enemy']) {
  const valk = fresh(team, 'valkyrie');
  assert.equal(valk.length, WAVE_SIZE * paths, `${team}: wave 3 is valkyries`);
  assert.equal(valk[0].maxHp, Math.round(unitDef('valkyrie').hp * 1.44));
}
console.log('items 2, 6 ok');
