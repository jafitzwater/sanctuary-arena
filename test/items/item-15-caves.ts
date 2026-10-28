// Gap-list item 15, batch 4.
// Doc: "Those bosses are the Countess, Radament ..., the Council ..., and Izule ..."
//      "A boss drops a health potion and a mana potion instead."
//      "A boss is back after 3 minutes, with a notice of respawn. If there is no attack for
//       60 seconds in the cave, that boss's health goes back to 100%."
// [JOSEPH] "Countess HP800 dmg25-40 ... Radament HP1200 ... Council 3x ~1000HP ... Izual HP2000 ...
//           (Respawn 180s, reset 60s per doc.)"
import assert from 'node:assert/strict';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { CAVE_RESET, CAVE_RESPAWN } from '../../src/game/data/caves';
import { UNIT_DEFS } from '../../src/game/data/units';
import { kill } from '../../src/game/combat';
import { player } from '../../src/game/query';
import { createMatch, updateSim } from '../../src/game/sim';
import { emptyInput } from '../../src/game/types';

assert.equal(CAVE_RESPAWN, 180);
assert.equal(CAVE_RESET, 60);
assert.equal(UNIT_DEFS.countess.hp, 800);
assert.equal(UNIT_DEFS.countess.ad, 33);
assert.equal(UNIT_DEFS.radament.hp, 1200);
assert.equal(UNIT_DEFS['council-member'].hp, 1000);
assert.equal(UNIT_DEFS.izual.hp, 2000);
const dens = sanctuary.dens!;
assert.deepEqual(dens.map((d) => [d.unit, d.count]), [['countess', 1], ['radament', 1], ['council-member', 3], ['izual', 1]]);
assert.ok(dens.every((d) => d.cave && d.respawn === 180), 'only caves, 180 s');

const sim = createMatch(sanctuary, barbarian, 1);
// Isolate the cave from AI champions: at the single LoL-style MS [JOSEPH] the bots' timing changed and one
// wanders into the Countess near t=90 s, which would restart the quiet clock this test measures.
sim.units = sim.units.filter((u) => !(u.kind === 'champion' && u.bot));
const pack = (id: number) => sim.units.filter((u) => u.alive && u.pack === id);
assert.equal(pack(3).length, 3, 'the Council is 3');
const countess = pack(1)[0];
assert.equal(countess.maxHp, 800, 'no wave or den scaling on cave bosses');

// Reset after 60 s with no attack.
countess.hp = 500;
const t0 = sim.time;
while (sim.time - t0 < 30) updateSim(sim, emptyInput(), 0.05);
assert.ok(countess.alive);
countess.hp = Math.min(countess.hp, 400); // an attack restarts the clock
const t1 = sim.time;
while (sim.time - t1 < 55) updateSim(sim, emptyInput(), 0.05);
assert.ok(countess.hp < countess.maxHp, 'no reset before 60 s of quiet');
while (sim.time - t1 < 62) updateSim(sim, emptyInput(), 0.05);
assert.equal(countess.hp, countess.maxHp, 'health back to 100%');

// Player kill drops one health and one mana potion; respawn after 180 s with a notice.
sim.potions.health = 0;
sim.potions.mana = 0;
kill(sim, countess, player(sim));
assert.equal(sim.potions.health, 1);
assert.equal(sim.potions.mana, 1);
const t2 = sim.time;
while (sim.time - t2 < 179) updateSim(sim, emptyInput(), 0.05);
assert.equal(pack(1).length, 0, 'not back before 3 minutes');
while (pack(1).length === 0 && sim.time - t2 < 182) updateSim(sim, emptyInput(), 0.05);
assert.equal(pack(1).length, 1, 'back after 3 minutes');
