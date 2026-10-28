/**
 * Item 17, batch 4: hiding grass.
 * [JOSEPH] answer 4: "6-8 patches at chokepoints/near lane bushes; units inside are invisible
 *   unless an enemy is inside or has true sight."
 * [DOC] "Only friendlies on the same team can see a character hiding there. They are revealed by
 *   leaving the grass."
 */
import assert from 'node:assert/strict';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { grassPatches, hiddenUnits, patchOf } from '../../src/game/data/grass';
import { nearestEnemy } from '../../src/game/query';
import { createMatch, updateSim } from '../../src/game/sim';
import { emptyInput } from '../../src/game/types';

const patches = grassPatches(sanctuary.paths ?? []);
// [JOSEPH] "6-8 patches"
assert.ok(patches.length >= 6 && patches.length <= 8, `patches ${patches.length}`);

// Pure rule: hidden alone or with friends; seen when an enemy is in the same patch.
const g = patches[0];
const a = { id: 1, team: 'ally', alive: true, x: g.x, y: g.y };
const b = { id: 2, team: 'ally', alive: true, x: g.x + 10, y: g.y };
const e = { id: 3, team: 'enemy', alive: true, x: g.x + 600, y: g.y + 600 };
assert.ok(patchOf(patches, e.x, e.y) !== 0);
let hidden = hiddenUnits(patches, [a, b, e]);
assert.ok(hidden.has(1) && hidden.has(2), 'friends share grass and stay hidden');
assert.ok(!hidden.has(3));
hidden = hiddenUnits(patches, [a, { ...e, x: g.x - 10, y: g.y }]);
assert.ok(!hidden.has(1) && !hidden.has(3), '"unless an enemy is inside"');

// Sim: an enemy outside the grass cannot target the hidden hero; leaving reveals him.
const sim = createMatch(sanctuary, barbarian, 1);
sim.time = Math.max(sim.time, sim.map.openingWait ?? 0); // past the opening wait
const hero = sim.units.find((u) => u.id === sim.playerId)!;
const foe = sim.units.find((u) => u.alive && u.team !== hero.team && u.kind === 'champion')!;
hero.x = g.x;
hero.y = g.y;
foe.x = g.x + g.r + 60;
foe.y = g.y;
updateSim(sim, emptyInput(), 0.05);
assert.equal(hero.hidden, true, 'hero in grass is hidden');
assert.equal(nearestEnemy(sim, foe, 1000, (u) => u.id === hero.id), null, 'enemy cannot pick a hidden hero');
assert.notEqual(foe.targetId, hero.id);
hero.x = g.x + g.r + 30;
updateSim(sim, emptyInput(), 0.05);
assert.equal(hero.hidden, false, '"revealed by leaving the grass"');
assert.ok(nearestEnemy(sim, foe, 1000, (u) => u.id === hero.id), 'visible again once out');
console.log('item 17 ok');
