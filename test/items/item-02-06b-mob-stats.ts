// Gap-list items 2/6, batch 4. Source [JOSEPH] (joseph-answers-oct27.md, answer 5):
// "Valkyrie 120HP 15-25 dmg +defense aura. Act2 merc 100HP 20-30 dmg poison/cold aura.
//  Act3 merc 90HP low melee, strong spell dmg, lightning/fire aura."
// Damage ranges use the midpoint [DERIVED]; auras and spell damage are not implemented (NEEDS JOSEPH).
import assert from 'node:assert/strict';
import { UNIT_DEFS } from '../../src/game/data/units';

assert.equal(UNIT_DEFS.valkyrie.hp, 120);
assert.equal(UNIT_DEFS.valkyrie.ad, 20);
assert.equal(UNIT_DEFS['act2-mercenary'].hp, 100);
assert.equal(UNIT_DEFS['act2-mercenary'].ad, 25);
assert.equal(UNIT_DEFS['act3-mercenary'].hp, 90);
assert.equal(UNIT_DEFS['act3-mercenary'].ad, UNIT_DEFS.rogue.ad, 'low melee keeps the Rogue value [TEMP]');
assert.equal(UNIT_DEFS.rogue.hp, 105, 'rogue unchanged');
