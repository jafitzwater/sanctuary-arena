// Item 5 order (2026-10-29) [Joseph t226u / t239u "Yes"]: Necromancer and Sorceress damage a bit higher for balance.
// One [TEMP] class damage multiplier on the hero's AD (data/classes/damageMult.ts, applied in combat.heroNumbers),
// so basic attacks and every skill hit (all `hero.ad x skill mult`) rise together. Other classes unchanged.
import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { CLASSES, getClass } from '../src/game/data/classes';
import { CASTER_DAMAGE_MULT, CLASS_DAMAGE_MULT, classDamageMult } from '../src/game/data/classes/damageMult';
import { ITEMS } from '../src/game/data/items';
import { grantXp, heroNumbers, recomputeHero } from '../src/game/combat';
import { xpToNext } from '../src/game/economy';
import { player } from '../src/game/query';
import { createMatch, spawnMinion } from '../src/game/sim';
import { HANDLERS as SORC, LIGHTNING } from '../src/game/skills/sorceress';
import type { Sim } from '../src/game/types';

// 1. The constant: one named multiplier, modest (+10..15%), only the two caster classes.
assert.ok(CASTER_DAMAGE_MULT >= 1.1 && CASTER_DAMAGE_MULT <= 1.15, 'modest +10-15%');
assert.deepEqual(Object.keys(CLASS_DAMAGE_MULT).sort(), ['necromancer', 'sorceress']);
for (const id of Object.keys(CLASSES)) {
  const want = id === 'necromancer' || id === 'sorceress' ? CASTER_DAMAGE_MULT : 1;
  assert.equal(classDamageMult(id), want, `${id} multiplier`);
}

function at(classId: string, level: number): Sim {
  const sim = createMatch(sanctuary, getClass(classId), 1);
  while (sim.level < level) grantXp(sim, xpToNext(sim.level) - sim.xp);
  assert.equal(sim.level, level);
  return sim;
}

// 2. AD per class and level, no items. Before values measured on origin/main 75d1d44 (AD grows only through
// auto-populated str/dex; the Necromancer and Sorceress have adPerStr = adPerDex = 0, so 15 at every level).
const BEFORE: Record<string, Record<number, number>> = {
  barbarian: { 1: 15, 7: 17, 15: 19 },
  amazon: { 1: 15, 7: 17, 15: 19 },
  paladin: { 1: 15, 7: 17, 15: 19 },
  necromancer: { 1: 15, 7: 15, 15: 15 },
  sorceress: { 1: 15, 7: 15, 15: 15 },
};
for (const [id, byLevel] of Object.entries(BEFORE)) {
  for (const [lvl, before] of Object.entries(byLevel)) {
    const sim = at(id, Number(lvl));
    const ad = heroNumbers(sim, { bo: false, berserk: false }).ad;
    assert.equal(ad, Math.max(1, Math.round(before * classDamageMult(id))), `${id} L${lvl} AD`);
    assert.equal(player(sim).ad, ad, `${id} L${lvl} hero AD synced`);
    if (classDamageMult(id) === 1) assert.equal(ad, before, `${id} L${lvl} unchanged`);
    else assert.ok(Math.abs(ad / before - CASTER_DAMAGE_MULT) <= 0.5 / before + 1e-9, `${id} L${lvl} raised by the factor (rounded)`);
  }
}

// 3. Item AD is multiplied too (the factor is on total AD); the Barbarian's weapon AD is not.
for (const id of ['necromancer', 'sorceress']) {
  const sim = at(id, 1);
  const weapon = ITEMS.find((it) => it.slot === 'weapon' && (it.ad ?? it.adOne ?? 0) > 0 && !it.twoHanded)!;
  sim.loadout.weapon = weapon.id;
  recomputeHero(sim);
  const raw = 15 + (weapon.ad ?? weapon.adOne ?? 0);
  assert.equal(player(sim).ad, Math.round(raw * CASTER_DAMAGE_MULT), `${id} with ${weapon.id}`);
}
{
  const sim = at('barbarian', 1);
  const weapon = ITEMS.find((it) => it.slot === 'weapon' && (it.ad ?? it.adOne ?? 0) > 0 && !it.twoHanded)!;
  sim.loadout.weapon = weapon.id;
  const raw = heroNumbers(sim, { bo: false, berserk: false }).ad;
  assert.equal(raw, 15 + (weapon.ad ?? weapon.adOne ?? 0), 'barbarian weapon AD not multiplied');
}

// 4. Skill damage follows: a Sorceress Lightning hit on a 0-armor dummy = raised AD x skill multiplier.
{
  const sim = at('sorceress', 3);
  const hero = player(sim);
  const dummy = spawnMinion(sim, 'fallen', 'enemy', hero.x + 100, hero.y, 0, 1);
  Object.assign(dummy, { hp: 1e6, maxHp: 1e6, armor: 0 });
  assert.ok(SORC.lightning({ sim, hero, rank: 1, aimX: dummy.x, aimY: dummy.y, focusId: dummy.id }));
  const dealt = 1e6 - dummy.hp;
  assert.ok(Math.abs(dealt - 17 * LIGHTNING.mult) < 1e-6, `lightning ${dealt} = 17 x ${LIGHTNING.mult}`);
  assert.ok(Math.abs(dealt / (15 * LIGHTNING.mult) - 17 / 15) < 1e-9, 'skill raised by the same factor as AD');
}

console.log('necro-sorc-damage: ok');
