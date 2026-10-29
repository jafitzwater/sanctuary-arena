// Item 5 (Joseph t226u / t239u) + Item 5 follow-up (Joseph t242u): Necromancer and Sorceress damage scales with level
// (Wild Rift casters), for players AND bots of those classes. Replaces PR #81's flat x1.12 AD multiplier.
// [TEMP] numbers: data/classes/damageMult.ts. Other classes (players and bots) unchanged.
import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { CLASSES, getClass } from '../src/game/data/classes';
import { BOT_BASE_AD, CASTER_AD_BONUS_L1, CASTER_AD_PER_LEVEL, CASTER_CLASSES, botAd, casterAdBonus } from '../src/game/data/classes/damageMult';
import { ITEMS } from '../src/game/data/items';
import { grantXp, heroNumbers, recomputeHero, syncChampionLevels } from '../src/game/combat';
import { botMaxHp, expectedLevel, xpToNext } from '../src/game/economy';
import { player } from '../src/game/query';
import { createMatch, spawnHero, spawnMinion } from '../src/game/sim';
import { HANDLERS as SORC, LIGHTNING } from '../src/game/skills/sorceress';
import type { Sim } from '../src/game/types';

const LEVELS = [1, 7, 15];
const ALL = Object.keys(CLASSES);

// 1. Constants: only the two casters, modest [TEMP] growth.
assert.deepEqual([...CASTER_CLASSES].sort(), ['necromancer', 'sorceress']);
assert.equal(BOT_BASE_AD, 15);
assert.ok(CASTER_AD_BONUS_L1 >= 0 && CASTER_AD_BONUS_L1 <= 2, 'small level-1 bonus');
assert.ok(CASTER_AD_PER_LEVEL > 0 && CASTER_AD_PER_LEVEL <= 0.5, 'modest per-level growth');
for (const id of ALL) {
  for (let lvl = 1; lvl <= 15; lvl++) {
    const want = CASTER_CLASSES.includes(id) ? CASTER_AD_BONUS_L1 + CASTER_AD_PER_LEVEL * (lvl - 1) : 0;
    assert.equal(casterAdBonus(id, lvl), want, `${id} L${lvl} bonus`);
  }
}

function at(classId: string, level: number): Sim {
  const sim = createMatch(sanctuary, getClass(classId), 1);
  while (sim.level < level) grantXp(sim, xpToNext(sim.level) - sim.xp);
  assert.equal(sim.level, level);
  return sim;
}

// 2. Player AD per class and level (no items). Before = origin/main 8c33021 (PR #81 flat x1.12) and the original
// pre-#81 values; other classes grow only through auto-populated str/dex and are unchanged.
const PRE_81: Record<string, number[]> = { barbarian: [15, 17, 19], amazon: [15, 17, 19], paladin: [15, 17, 19], necromancer: [15, 15, 15], sorceress: [15, 15, 15] };
const AFTER: Record<string, number[]> = { barbarian: [15, 17, 19], amazon: [15, 17, 19], paladin: [15, 17, 19], necromancer: [16, 18, 21], sorceress: [16, 18, 21] };
for (const id of ALL) {
  LEVELS.forEach((lvl, i) => {
    const sim = at(id, lvl);
    const ad = heroNumbers(sim, { bo: false, berserk: false }).ad;
    assert.equal(ad, AFTER[id][i], `${id} L${lvl} AD`);
    assert.equal(ad, Math.round(PRE_81[id][i] + casterAdBonus(id, lvl)), `${id} L${lvl} = class AD + caster bonus`);
    assert.equal(player(sim).ad, ad, `${id} L${lvl} hero AD synced`);
  });
}
// Casters' AD rises with level; at 15 it is level with or above the other classes' AD (Joseph t242u "fix it").
for (const id of CASTER_CLASSES) {
  assert.ok(AFTER[id][0] < AFTER[id][1] && AFTER[id][1] < AFTER[id][2], `${id} grows with level`);
  assert.ok(AFTER[id][2] >= AFTER.barbarian[2] && AFTER[id][2] <= AFTER.barbarian[2] + 3, `${id} L15 on par / modestly above`);
}

// 3. Item AD adds on top, unmultiplied, for every class (a weapon's +AD is the same +AD for a caster).
const weapon = ITEMS.find((it) => it.slot === 'weapon' && (it.ad ?? it.adOne ?? 0) > 0 && !it.twoHanded)!;
for (const id of ALL) {
  const sim = at(id, 7);
  const bare = heroNumbers(sim, { bo: false, berserk: false }).ad;
  sim.loadout.weapon = weapon.id;
  recomputeHero(sim);
  assert.equal(player(sim).ad - bare, weapon.ad ?? weapon.adOne ?? 0, `${id} ${weapon.id} +AD unchanged`);
}

// 4. Skill damage follows AD: a level-3 Sorceress Lightning hit on a 0-armor dummy = AD(3) x skill multiplier.
{
  const sim = at('sorceress', 3);
  const hero = player(sim);
  assert.equal(hero.ad, Math.round(15 + casterAdBonus('sorceress', 3)));
  const dummy = spawnMinion(sim, 'fallen', 'enemy', hero.x + 100, hero.y, 0, 1);
  Object.assign(dummy, { hp: 1e6, maxHp: 1e6, armor: 0 });
  assert.ok(SORC.lightning({ sim, hero, rank: 1, aimX: dummy.x, aimY: dummy.y, focusId: dummy.id }));
  assert.ok(Math.abs(1e6 - dummy.hp - hero.ad * LIGHTNING.mult) < 1e-6, 'lightning = AD x mult');
}

// 5. Bots: caster bots get the same level-based bonus (at spawn and on every bot level change); other bots stay at
// flat 15. The bot HP rule (economy.botMaxHp) is untouched.
for (const id of ALL) {
  for (const lvl of LEVELS) assert.equal(botAd(id, lvl), CASTER_CLASSES.includes(id) ? Math.round(15 + casterAdBonus(id, lvl)) : 15, `bot ${id} L${lvl}`);
}
assert.deepEqual(LEVELS.map((l) => botAd('necromancer', l)), [16, 18, 21]);
assert.deepEqual(LEVELS.map((l) => botAd('sorceress', l)), [16, 18, 21]);
{
  const timeFor = (lvl: number) => {
    for (let t = 0; t < 3600; t += 1) if (expectedLevel(t) === lvl) return t;
    throw new Error(`no clock time for level ${lvl}`);
  };
  const sim = createMatch(sanctuary, getClass('barbarian'), 1);
  const bots = ALL.map((id) => {
    const u = spawnHero(sim, 'enemy', 6000, 6000, `bot-${id}`, id);
    u.look = id;
    return u;
  });
  bots.forEach((u, i) => assert.equal(u.ad, botAd(ALL[i], 1), `bot ${ALL[i]} spawn AD`));
  for (const lvl of [7, 15]) {
    sim.time = timeFor(lvl);
    syncChampionLevels(sim);
    bots.forEach((u, i) => {
      assert.equal(u.level, lvl);
      assert.equal(u.ad, botAd(ALL[i], lvl), `bot ${ALL[i]} L${lvl} AD`);
      assert.equal(u.maxHp, botMaxHp(ALL[i], lvl), `bot ${ALL[i]} L${lvl} HP rule unchanged`);
    });
  }
}

console.log('necro-sorc-damage (caster level scaling): ok');
