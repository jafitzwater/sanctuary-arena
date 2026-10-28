// Pass 3 order item 3 [TEMP]: every gear gate (level, strength, dexterity) is reachable in a
// normal match, and its price is affordable by the time it opens.
// Pace model from the sim's own values, solo laner, minions only (no kills, camps or towers,
// so it is a slow floor): passive income PASSIVE_GOLD/s; one wave of WAVE_SIZE minions dies in
// the hero's lane every WAVE_INTERVAL from 60 s (first spawn 30 s + walk); every death within
// range gives its xp (solo share 1, times the sim's comeback multiplier); the hero last-hits 40%.
import assert from 'node:assert/strict';
import { barbarian } from '../../src/game/data/classes/barbarian';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { ITEMS } from '../../src/game/data/items';
import { unitDef } from '../../src/game/data/units';
import { waveMob, WAVE_INTERVAL, WAVE_SIZE } from '../../src/game/data/waves';
import { grantXp, xpToNext } from '../../src/game/combat';
import { comebackMul } from '../../src/game/pace';
import { createMatch, PASSIVE_GOLD } from '../../src/game/sim';

const LAST_HIT = 0.4; // [TEMP] assumption
const GATE_BY = 8 * 60; // every gate open by 8 min [TEMP]
const BEST_BY = 11 * 60; // best item in every slot affordable by 11 min [TEMP]
const ALL_BY = 22 * 60; // every shop item bought once by 22 min [TEMP]

// Seconds -> { level, gold } on the model (gold is earned in total, from the match's start gold).
const START_GOLD = createMatch(sanctuary, barbarian, 1).gold;
const pace: { level: number; gold: number }[] = [];
{
  let level = 1, xp = 0, gold = START_GOLD, wave = 0;
  for (let t = 0; t <= ALL_BY; t++) {
    if (t > 0) gold += PASSIVE_GOLD;
    if (t >= 60 && (t - 60) % WAVE_INTERVAL === 0) {
      wave += 1;
      const mob = unitDef(waveMob(wave));
      xp += Math.round(mob.xp * comebackMul(level, t)) * WAVE_SIZE;
      gold += WAVE_SIZE * LAST_HIT * mob.gold;
      while (level < 15 && xp >= xpToNext(level)) { xp -= xpToNext(level); level += 1; }
    }
    pace.push({ level, gold });
  }
}
const timeAtLevel = (lv: number) => pace.findIndex((p) => p.level >= lv);

// Real attributes per level from the sim (auto stat growth).
const sim = createMatch(sanctuary, barbarian, 1);
const attrs: { str: number; dex: number }[] = [];
attrs[1] = { str: sim.attributes.str, dex: sim.attributes.dex };
for (let lv = 2; lv <= 15; lv++) {
  grantXp(sim, xpToNext(sim.level));
  attrs[lv] = { str: sim.attributes.str, dex: sim.attributes.dex };
}

const gear = ITEMS.filter((i) => !i.consumable);
const report: string[] = [];
for (const item of gear) {
  let lv = item.unlockLevel ?? 1;
  while (lv <= 15 && (attrs[lv].str < (item.reqStr ?? 0) || attrs[lv].dex < (item.reqDex ?? 0))) lv++;
  assert.ok(lv <= 15, `${item.id} stat gate reachable by level 15`);
  assert.equal(lv, item.unlockLevel ?? 1, `${item.id} stats are met at its own level (level is the only gate)`);
  const t = timeAtLevel(lv);
  assert.ok(t >= 0 && t <= GATE_BY, `${item.id} opens by ${GATE_BY}s (at ${t}s)`);
  assert.ok(pace[t].gold >= item.cost, `${item.id} ${item.cost}g affordable when it opens (${Math.round(pace[t].gold)}g)`);
  report.push(`${item.id} L${lv} ${Math.round(t / 6) / 10}min ${item.cost}g`);
}
const slots = [...new Set(gear.map((i) => i.slot))];
const best = slots.map((s) => gear.filter((i) => i.slot === s).sort((a, b) => (b.unlockLevel ?? 1) - (a.unlockLevel ?? 1))[0]);
const bestCost = best.reduce((n, i) => n + i.cost, 0);
const tBest = pace.findIndex((p) => p.gold >= bestCost);
assert.ok(tBest >= 0 && tBest <= BEST_BY, `best-in-slot ${bestCost}g by ${BEST_BY}s (at ${tBest}s)`);
const allCost = gear.reduce((n, i) => n + i.cost, 0);
const tAll = pace.findIndex((p) => p.gold >= allCost);
assert.ok(tAll >= 0 && tAll <= ALL_BY, `whole shop ${allCost}g by ${ALL_BY}s (at ${tAll}s)`);
if (process.env.PACE_LOG) console.log(report.join('\n'), `\nbest ${bestCost}g @${tBest}s, all ${allCost}g @${tAll}s`);
