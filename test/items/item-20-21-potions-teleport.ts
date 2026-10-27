// Gap-list items 20 and 21. Sources (refined-design-document-oct27.md, numbers-table.md):
// "Both add 1/5th the size of the health or mana of the character, depending on the potion used."
// "The teleport takes 3 seconds."
import assert from 'node:assert/strict';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { potionAmount, TELEPORT_SECONDS, tryPotion } from '../../src/game/combat';
import { player } from '../../src/game/query';
import { createMatch, updateSim } from '../../src/game/sim';
import { emptyInput } from '../../src/game/types';

assert.equal(TELEPORT_SECONDS, 3);
assert.equal(potionAmount(500), 100);

const sim = createMatch(sanctuary, barbarian, 1);
const hero = player(sim);
sim.potions.health = 1;
sim.potions.mana = 1;
hero.hp = 1;
tryPotion(sim, 'health');
assert.equal(hero.hp, 1 + Math.round(hero.maxHp / 5));
hero.mana = 0;
tryPotion(sim, 'mana');
assert.equal(hero.mana, Math.round(hero.maxMana / 5));

const input = { ...emptyInput(), recall: true };
updateSim(sim, input, 0.016);
assert.equal(hero.recall, TELEPORT_SECONDS);
