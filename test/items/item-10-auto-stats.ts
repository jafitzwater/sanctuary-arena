// Gap-list item 10. Sources (refined-design-document-oct27.md, numbers-table.md):
// "Stat points always auto-populate. Each level gives 5 points."
// "Barbarian 2 strength, 2 vitality, 1 dexterity, 0 energy" (and the other four rows).
import assert from 'node:assert/strict';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { STAT_GROWTH } from '../../src/game/data/classes/statGrowth';
import { grantXp, xpToNext } from '../../src/game/combat';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { createMatch } from '../../src/game/sim';

for (const [id, g] of Object.entries(STAT_GROWTH)) {
  assert.equal(g.str + g.dex + g.vit + g.energy, 5, `${id} gets 5 points`);
}
assert.deepEqual(STAT_GROWTH.barbarian, { str: 2, vit: 2, dex: 1, energy: 0 });
assert.deepEqual(STAT_GROWTH.amazon, { dex: 2, vit: 2, str: 1, energy: 0 });
assert.deepEqual(STAT_GROWTH.sorceress, { energy: 2, vit: 2, str: 1, dex: 0 });
assert.deepEqual(STAT_GROWTH.necromancer, STAT_GROWTH.sorceress);
assert.deepEqual(STAT_GROWTH.paladin, { str: 2, dex: 2, vit: 1, energy: 0 });

const sim = createMatch(sanctuary, barbarian, 1);
const a = { ...sim.attributes };
grantXp(sim, xpToNext(1));
assert.equal(sim.level, 2);
assert.equal(sim.statPoints, 0, 'nothing left to spend by hand');
assert.deepEqual(sim.attributes, { str: a.str + 2, vit: a.vit + 2, dex: a.dex + 1, energy: a.energy });
