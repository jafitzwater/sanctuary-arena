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
// Economy order [TEMP]: prices rebalanced by unlock level (old itemLevel*50 superseded).
const PRICE: Record<number, number> = { 1: 200, 2: 300, 3: 450, 5: 700, 7: 1000 };
for (const item of gear) assert.equal(item.cost, PRICE[item.unlockLevel ?? 1], `${item.id} price by level`);
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
assert.equal(sim.gold, 800);
tryBuy(sim, 'ssd');
assert.equal(sim.loadout.weapon, 'ssd');
// Economy order [TEMP 70%]: the club sells back for 140 (replaces the doc's "cannot be sold").
assert.equal(sim.gold, 800 - 450 + 140, 'club sold for 70% when overwritten');
tryBuy(sim, 'clb');
assert.equal(sim.loadout.weapon, 'ssd', 'cannot overwrite with a worse item');
assert.equal(sim.gold, 490);
