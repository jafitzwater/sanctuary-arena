// Gap-list item 19, batch 4. Source [JOSEPH] (joseph-answers-oct27.md, answer 1):
// "Gear: 4 slots Helmet, Armor, Weapon, Belt. Better = higher required level + higher base
//  stat/tier; ties = more useful affixes for class. Price base = itemLevel*50"
// Doc: "An item cannot be sold. It can only be overwritten for a better item."
import assert from 'node:assert/strict';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { isBetterGear, itemById, ITEMS } from '../../src/game/data/items';
import { tryBuy } from '../../src/game/combat';
import { player } from '../../src/game/query';
import { createMatch } from '../../src/game/sim';

const gear = ITEMS.filter((i) => !i.consumable);
assert.deepEqual([...new Set(gear.map((i) => i.slot))].sort(), ['armor', 'belt', 'helm', 'weapon'], '4 slots');
for (const item of gear) assert.equal(item.cost, (item.unlockLevel ?? 1) * 50, `${item.id} price = itemLevel*50`);
assert.equal(itemById('health-potion')!.cost, 45, 'potion prices unchanged');

const clb = itemById('clb')!, ssd = itemById('ssd')!, qui = itemById('qui')!, lea = itemById('lea')!;
assert.ok(isBetterGear(ssd, clb), 'higher level + higher damage is better');
assert.ok(!isBetterGear(clb, ssd), 'lower is not better');
assert.ok(!isBetterGear(clb, clb), 'a tie is not better');
assert.ok(isBetterGear(lea, qui));

const sim = createMatch(sanctuary, barbarian, 1);
const hero = player(sim);
hero.x = sim.map.playerBase.x;
hero.y = sim.map.playerBase.y;
sim.time = 100;
sim.level = 3;
sim.attributes.str = 60;
sim.gold = 1000;
tryBuy(sim, 'clb');
assert.equal(sim.loadout.weapon, 'clb');
assert.equal(sim.gold, 950);
tryBuy(sim, 'ssd');
assert.equal(sim.loadout.weapon, 'ssd');
assert.equal(sim.gold, 800, 'no sell-back refund for the club');
tryBuy(sim, 'clb');
assert.equal(sim.loadout.weapon, 'ssd', 'cannot overwrite with a worse item');
assert.equal(sim.gold, 800);
