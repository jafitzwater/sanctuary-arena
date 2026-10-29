// Pass 3 order item 3 [TEMP], updated by the economy order ("Gold, XP/leveling, health, mana
// (Wild Rift style)"): every gear gate (level, strength, dexterity) is reachable in a 15-20 min
// match for all five classes, the shop is progressive (500 start gold does not buy the
// level-1 set), and the whole upgrade path fits a 15-20 min match.
// Pace model: economy.paceModel, solo laner, minions only (no kills, assists, camps, towers,
// ally share or low-gold bonus), so it is a slow floor. Bots do not shop (no AI item path).
import assert from 'node:assert/strict';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { CLASSES } from '../../src/game/data/classes';
import { ITEMS, itemGate } from '../../src/game/data/items';
import { grantXp, xpToNext } from '../../src/game/combat';
import { paceModel, sellValue, START_GOLD } from '../../src/game/economy';
import { comebackMul } from '../../src/game/pace';
import { createMatch } from '../../src/game/sim';

const GATE_BY = 8 * 60; // every gate open by 8 min [TEMP]
const BEST_BY = 12 * 60; // best item in every slot affordable by 12 min [TEMP]
const ALL_BY = 17 * 60; // the whole upgrade path (net of 70% sell-back) by 17 min [TEMP, inside 15-20]

const pace = paceModel(22 * 60, comebackMul);
const timeAtLevel = (lv: number) => pace.findIndex((p) => p.level >= lv);
assert.equal(createMatch(sanctuary, CLASSES.barbarian, 1).gold, START_GOLD);

const gear = ITEMS.filter((i) => !i.consumable);
const slots = [...new Set(gear.map((i) => i.slot))];
const ladder = (slot: string) => gear.filter((i) => i.slot === slot).sort((a, b) => (a.unlockLevel ?? 1) - (b.unlockLevel ?? 1));

// Progressive shop: the level-1 weapon + armor + helm cost more than the start gold.
const firstSet = ['weapon', 'armor', 'helm'].map((s) => ladder(s)[0].cost).reduce((a, b) => a + b, 0);
assert.ok(firstSet > START_GOLD, `level-1 set ${firstSet}g > ${START_GOLD}g start`);

const report: string[] = [];
for (const def of Object.values(CLASSES)) {
  const sim = createMatch(sanctuary, def, 1);
  const attrs: { str: number; dex: number }[] = [];
  attrs[1] = { str: sim.attributes.str, dex: sim.attributes.dex };
  for (let lv = 2; lv <= 15; lv++) {
    grantXp(sim, xpToNext(sim.level));
    attrs[lv] = { str: sim.attributes.str, dex: sim.attributes.dex };
  }
  for (const item of gear) {
    const gate = itemGate(item, def.id);
    let lv = item.unlockLevel ?? 1;
    while (lv <= 15 && (attrs[lv].str < gate.reqStr || attrs[lv].dex < gate.reqDex)) lv++;
    assert.ok(lv <= 15, `${def.id} ${item.id} stat gate reachable by level 15`);
    assert.equal(lv, item.unlockLevel ?? 1, `${def.id} ${item.id} stats are met at its own level`);
    const t = timeAtLevel(lv);
    assert.ok(t >= 0 && t <= GATE_BY, `${def.id} ${item.id} opens by ${GATE_BY}s (at ${t}s)`);
    assert.ok(pace[t].gold >= item.cost, `${def.id} ${item.id} ${item.cost}g affordable when it opens`);
    if (def.id === 'barbarian') report.push(`${item.id} L${lv} ${Math.round(t / 6) / 10}min ${item.cost}g`);
  }
}
const best = slots.map((s) => ladder(s).at(-1)!);
const bestCost = best.reduce((n, i) => n + i.cost, 0);
const tBest = pace.findIndex((p) => p.gold >= bestCost);
assert.ok(tBest >= 0 && tBest <= BEST_BY, `best-in-slot ${bestCost}g by ${BEST_BY}s (at ${tBest}s)`);
let pathCost = 0;
for (const s of slots) ladder(s).forEach((item, i, all) => { pathCost += item.cost - (i ? sellValue(all[i - 1].cost) : 0); });
const tAll = pace.findIndex((p) => p.gold >= pathCost);
assert.ok(tAll >= 0 && tAll <= ALL_BY, `whole upgrade path ${pathCost}g net by ${ALL_BY}s (at ${tAll}s)`);
assert.ok(tAll >= 10 * 60, `the full path is not bought before 10 min (at ${tAll}s): progressive`);
if (process.env.PACE_LOG) console.log(report.join('\n'), `\nbest ${bestCost}g @${tBest}s, path ${pathCost}g net @${tAll}s`);
