// Gap-list item 10, batch 4. Source [JOSEPH] (joseph-answers-oct27.md, answer 6):
// "Starting stats lvl1: Amazon Str20 Dex25 Vit20 Ene15. Barbarian 30/20/25/10.
//  Necromancer 15/15/15/25. Paladin 25/20/25/15. Sorceress 10/15/10/35."
import assert from 'node:assert/strict';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { STARTING_STATS } from '../../src/game/data/classes/startingStats';
import { ROSTER } from '../../src/game/data/classes/roster';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { createMatch } from '../../src/game/sim';

assert.deepEqual(STARTING_STATS.amazon, { str: 20, dex: 25, vit: 20, energy: 15 });
assert.deepEqual(STARTING_STATS.barbarian, { str: 30, dex: 20, vit: 25, energy: 10 });
assert.deepEqual(STARTING_STATS.necromancer, { str: 15, dex: 15, vit: 15, energy: 25 });
assert.deepEqual(STARTING_STATS.paladin, { str: 25, dex: 20, vit: 25, energy: 15 });
assert.deepEqual(STARTING_STATS.sorceress, { str: 10, dex: 15, vit: 10, energy: 35 });
assert.deepEqual(Object.keys(STARTING_STATS).sort(), ROSTER.map((c) => c.id).sort(), 'one row per roster class');

const sim = createMatch(sanctuary, barbarian, 1);
assert.deepEqual(sim.attributes, { str: 30, dex: 20, vit: 25, energy: 10 }, 'barbarian starts at level 1 with [JOSEPH] stats');
