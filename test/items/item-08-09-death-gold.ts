// Gap-list items 8 and 9. Sources (refined-design-document-oct27.md, numbers-table.md):
// "The first death takes 5 seconds. Each death after that adds 5 seconds."
// "They lose 25% of the gold they have."
// "The first character kill of the match pays 50% more gold."
// "A streak is 3 kills in a row, and that kill also pays 50% more gold."
import assert from 'node:assert/strict';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { deathGoldLoss, kill, killGoldMul, respawnSeconds } from '../../src/game/combat';
import { player } from '../../src/game/query';
import { createMatch } from '../../src/game/sim';

assert.deepEqual([1, 2, 3, 4].map(respawnSeconds), [5, 10, 15, 20]);
assert.equal(deathGoldLoss(400), 100);
assert.equal(killGoldMul(true, 1), 1.5);
assert.equal(killGoldMul(false, 1), 1);
assert.equal(killGoldMul(false, 2), 1);
assert.equal(killGoldMul(false, 3), 1.5);

const sim = createMatch(sanctuary, barbarian, 1);
const hero = player(sim);
const foes = sim.units.filter((u) => u.kind === 'champion' && u.team === 'enemy');
assert.ok(foes.length >= 3);
sim.gold = 0;
const g0 = foes[0].gold;
kill(sim, foes[0], hero); // first kill of the match
assert.equal(sim.gold, Math.round(g0 * 1.5));
assert.equal(foes[0].respawn, 5);
let before = sim.gold;
kill(sim, foes[1], hero); // 2nd in a row
assert.equal(sim.gold - before, foes[1].gold);
before = sim.gold;
kill(sim, foes[2], hero); // 3rd in a row
assert.equal(sim.gold - before, Math.round(foes[2].gold * 1.5));

sim.gold = 400;
kill(sim, hero, foes[3] ?? foes[0]);
assert.equal(sim.gold, 300);
assert.equal(hero.respawn, 5);
assert.equal(hero.streak, 0);
hero.alive = true;
kill(sim, hero, null);
assert.equal(hero.respawn, 10);
