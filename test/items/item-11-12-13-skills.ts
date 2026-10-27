// Gap-list items 11, 12, 13. Sources (refined-design-document-oct27.md, kits-final.md, numbers-table.md):
// "In order: bash, shout, leap attack, battle orders, whirlwind."
// "Skills unlock at level 1, level 3, level 5, and level 7. More than 4 skills use the remaining points after level 7."
// "Skills max at level 5. The level cap is 15."
// "At skill level 1 the mana cost is 10%, level 2 is 15%, level 3 is 20%, and so on."
import assert from 'node:assert/strict';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { grantXp, MAX_LEVEL, manaCost, manaPct } from '../../src/game/combat';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { createMatch } from '../../src/game/sim';
import { SKILLS } from '../../src/game/skills';

const skills = barbarian.skills;
assert.deepEqual(skills.map((s) => s.id), ['bash', 'shout', 'leap-attack', 'battle-orders', 'whirlwind']);
assert.deepEqual(skills.slice(0, 4).map((s) => s.unlockLevel), [1, 3, 5, 7]);
assert.ok(skills[4].unlockLevel > 7, 'whirlwind comes after level 7');
assert.ok(skills.every((s) => s.maxRank === 5));
assert.ok(skills.every((s) => SKILLS[s.id]), 'every doc skill has a handler');
assert.equal(MAX_LEVEL, 15);

const sim = createMatch(sanctuary, barbarian, 1);
grantXp(sim, 1e7);
assert.equal(sim.level, 15);

assert.deepEqual([1, 2, 3, 4, 5].map((r) => Math.round(manaPct(r) * 100)), [10, 15, 20, 25, 30]);
assert.equal(manaCost(skills[0], 1, 200), 20);
assert.equal(manaCost(skills[0], 5, 200), 60);
