// Economy order "Gold, XP/leveling, health, mana (Wild Rift style) + status-bar visuals".
// Pure-logic checks for each system. [JOSEPH] = value in the order; [TEMP] = placeholder.
import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { CLASSES } from '../src/game/data/classes';
import { barbarian } from '../src/game/data/classes/barbarian';
import { itemById } from '../src/game/data/items';
import { unitDef } from '../src/game/data/units';
import { canRankUp, grantXp, kill, netGearPrice, syncChampionLevels, tryBuy, tryUpgrade, xpToNext } from '../src/game/combat';
import {
  LOW_GOLD_BONUS, MAX_LEVEL, MINION_GOLD, PASSIVE_GOLD, SELL_PCT, START_GOLD, assistGold, championBounty,
  championKillXp, expectedLevel, lowestGoldIds, minionRole, paceModel, passiveGoldRate, respawnSeconds, sellValue, shareGold,
  totalXpToLevel, BOT_HP_MUL, botMaxHp, playerBaseHp, playerHpGrowthPerLevel,
} from '../src/game/economy';
import { player } from '../src/game/query';
import { createMatch, spawnMinion, updateSim } from '../src/game/sim';
import type { FrameInput, Unit } from '../src/game/types';
import { CLASS_NAMES, className, tickMarks, unitFrameData } from '../src/game/unitFrame';

// ---- GOLD ----
assert.equal(START_GOLD, 500);
assert.equal(createMatch(sanctuary, barbarian, 1).gold, 500, '[JOSEPH] start 500');
assert.equal(PASSIVE_GOLD, 3.5);
assert.equal(passiveGoldRate(10, false), 0, 'no passive before 0:20');
assert.equal(passiveGoldRate(20, false), 3.5, '[JOSEPH] 3.5/s from 0:20');
assert.equal(passiveGoldRate(200, true), 3.5, 'no low-gold bonus before 4:00');
assert.equal(passiveGoldRate(240, true), 3.5 + LOW_GOLD_BONUS, '[JOSEPH] +2/s lowest from 4:00');
assert.equal(passiveGoldRate(240, false), 3.5);
assert.deepEqual([...lowestGoldIds([{ id: 1, gold: 900 }, { id: 2, gold: 300 }, { id: 3, gold: 300 }])].sort(), [2, 3]);
// Gold by time (passive only, from the 500 start): 500 + 3.5 * (t - 20).
const passiveAt = (t: number) => paceModel(t)[t].gold;
assert.equal(passiveAt(20), 500);
assert.equal(passiveAt(150), 500 + 3.5 * 130);
assert.deepEqual(MINION_GOLD, { melee: 65, caster: 40, siege: 85 }, '[JOSEPH] last-hit values');
assert.equal(minionRole('rogue', false), 'melee');
assert.equal(minionRole('valkyrie', false), 'melee');
assert.equal(minionRole('act2-mercenary', false), 'melee');
assert.equal(minionRole('act3-mercenary', false), 'caster');
assert.equal(minionRole('rogue-archer', true), 'caster');
assert.equal(minionRole('fallen', false), 'melee');
assert.equal(shareGold(65), 13, '[TEMP] 20% share');
assert.equal(SELL_PCT, 0.7);
assert.equal(sellValue(450), 315, '[TEMP] sell at 70%');
assert.equal(championBounty(0), 300);
assert.equal(championBounty(4), 450, 'bounty grows with the victim streak');
assert.equal(championBounty(99), 600, 'bounty cap');
assert.equal(assistGold(), 150);

function emptyInput(): FrameInput {
  return { moveX: 0, moveY: 0, attack: false, cast: null, upgrade: null, buy: null, potion: null, recall: false } as unknown as FrameInput;
}

// Sim: lane minion last-hit pays the role value; a nearby ally champion gets the share.
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  sim.units = sim.units.filter((u) => u.id === hero.id || u.kind !== 'champion' || u.team === 'enemy');
  const mate = createMatch(sanctuary, barbarian, 1).units.find((u) => u.kind === 'champion' && u.team === 'ally' && u.bot)!;
  mate.id = 9999; mate.x = hero.x + 40; mate.y = hero.y; mate.purse = 0;
  sim.units.push(mate);
  const mob = spawnMinion(sim, 'rogue', 'enemy', hero.x + 30, hero.y);
  assert.equal(mob.gold, 65);
  assert.equal(spawnMinion(sim, 'act3-mercenary', 'enemy', hero.x + 30, hero.y).gold, 40);
  sim.gold = 0;
  kill(sim, mob, hero);
  assert.equal(sim.gold, 65, 'last-hit gold');
  assert.equal(mate.purse, 13, 'nearby ally share');
  // Camps keep their unit gold.
  assert.equal(spawnMinion(sim, 'rogue', 'wild', 0, 0).gold, unitDef('rogue').gold, 'wild keeps its def gold');
}

// Sim: the lowest-gold champion gets +2/s after 4:00 (bots carry a purse).
{
  const sim = createMatch(sanctuary, barbarian, 1);
  for (const u of sim.units) if (u.kind === 'champion' && u.bot) u.purse = 5000;
  sim.time = 300;
  sim.gold = 0;
  const before = sim.gold;
  updateSim(sim, emptyInput(), 0.05);
  assert.ok(Math.abs(sim.gold - before - (3.5 + 2) * 0.05) < 1e-6, `low-gold bonus ${sim.gold - before}`);
}

// Sell: overwriting gear refunds 70%.
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  hero.x = sim.map.playerBase.x; hero.y = sim.map.playerBase.y;
  sim.time = 100; sim.level = 3; sim.attributes.str = 60; sim.gold = 2000;
  tryBuy(sim, 'clb');
  assert.equal(netGearPrice(sim, itemById('ssd')!), 450 - 140);
  tryBuy(sim, 'ssd');
  assert.equal(sim.gold, 2000 - 200 - 310);
}

// Champion kill: bounty to the killer, assist gold and XP.
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  const foe = sim.units.find((u) => u.kind === 'champion' && u.team === 'enemy')!;
  sim.firstKillPaid = true;
  sim.gold = 0;
  foe.streak = 3;
  kill(sim, foe, hero);
  assert.equal(sim.gold, championBounty(3), 'streak bounty');
  assert.ok(sim.xp > 0 || sim.level > 1, 'champion kill pays XP');
  const foe2 = sim.units.filter((u) => u.kind === 'champion' && u.team === 'enemy')[1];
  const mate = sim.units.find((u) => u.kind === 'champion' && u.team === 'ally' && u.bot)!;
  foe2.threats = [{ id: hero.id, team: 'ally', t: sim.time }] as Unit['threats'];
  sim.gold = 0;
  kill(sim, foe2, mate);
  assert.equal(sim.gold, assistGold(), 'assist gold');
  assert.equal(sim.assists, 1);
}
assert.equal(championKillXp(1), 125);

// Structures: local + global gold.
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  const tower = sim.units.find((u) => u.kind === 'tower' && u.team === 'enemy')!;
  const mate = sim.units.find((u) => u.kind === 'champion' && u.team === 'ally' && u.bot)!;
  mate.purse = 0;
  mate.x = tower.x + 5000; mate.y = tower.y;
  hero.x = tower.x + 50; hero.y = tower.y;
  sim.gold = 0;
  kill(sim, tower, hero);
  assert.equal(sim.gold, tower.gold + 50, 'local + global');
  assert.equal(mate.purse, 50, 'global only when far');
}

// ---- XP / LEVELING ----
assert.equal(MAX_LEVEL, 15);
assert.equal(xpToNext(1), 120);
assert.equal(totalXpToLevel(15), 4410);
{
  const sim = createMatch(sanctuary, barbarian, 1);
  grantXp(sim, 1e7);
  assert.equal(sim.level, 15, 'cap 15');
  assert.equal(Object.values(sim.skillRanks).reduce((a, b) => a + b, 0) + sim.skillPoints, 15, '1 point per level + free starter');
}
const pace = paceModel(22 * 60);
const at = (lv: number) => pace.findIndex((p) => p.level >= lv);
assert.ok(at(15) >= 15 * 60 && at(15) <= 20 * 60, `level 15 in 15-20 min on the floor model (${at(15)}s)`);
assert.ok(at(5) <= 6 * 60 && at(9) <= 10 * 60 && at(13) <= 16 * 60, 'top-tier ranks reachable in time');
assert.equal(expectedLevel(0), 1);
assert.equal(expectedLevel(at(9)), 9);
// Skill rework order [JOSEPH]: no paths; every class has one flat list with one top-tier skill; all
// skills max rank 3 with no 9/13 rank gates (removed from the economy order). Skill follow-ups order
// [JOSEPH]: all five top tiers unlock at 9 (Barbarian/Paladin were 5).
const TOP_UNLOCK: Record<string, number> = { barbarian: 9, paladin: 9, sorceress: 9, amazon: 9, necromancer: 9 };
for (const def of Object.values(CLASSES)) {
  const top = def.skills.filter((s) => s.topTier);
  assert.equal(top.length, 1, `${def.id} one top tier`);
  assert.equal(def.skills.length, 5, `${def.id} five skills`);
  const ult = top[0];
  assert.equal(ult.unlockLevel, TOP_UNLOCK[def.id]);
  assert.ok(def.skills.every((s) => s.maxRank === 3), `${def.id} max rank 3`);
  assert.deepEqual(def.skills.filter((s) => !s.topTier).map((s) => s.unlockLevel), [1, 3, 5, 7]);
  const sim = createMatch(sanctuary, def, 1);
  while (sim.level < ult.unlockLevel) grantXp(sim, xpToNext(sim.level));
  assert.equal(sim.skillRanks[ult.id], 1, `${def.id} top tier auto-learned at ${ult.unlockLevel}`);
  sim.skillPoints = 5;
  assert.ok(canRankUp(sim, ult), 'rank 2 open right away (no level gate)');
  assert.ok(tryUpgrade(sim, ult.id));
  assert.ok(tryUpgrade(sim, ult.id));
  assert.equal(tryUpgrade(sim, ult.id), false, 'max rank 3');
  assert.equal(sim.skillRanks[ult.id], 3);
  const first = def.skills[0];
  assert.ok(tryUpgrade(sim, first.id) && tryUpgrade(sim, first.id));
  assert.equal(tryUpgrade(sim, first.id), false, 'every skill caps at 3');
  while (sim.level < 9) grantXp(sim, xpToNext(sim.level));
  assert.ok(!sim.belt.includes(ult.id), 'top tier is not auto-slotted over the other four skills');
}

// ---- BOT HP (skill rework item 6, skill follow-ups item 3 [JOSEPH]) ----
{
  assert.equal(BOT_HP_MUL, 0.85);
  for (const def of Object.values(CLASSES)) {
    const id = def.id;
    // The player's own numbers: a fresh level-1 player and that player at level 10 (auto vit included).
    const fresh = createMatch(sanctuary, def, 1);
    const p1 = player(fresh).maxHp;
    assert.equal(playerBaseHp(id), p1, `${id} player L1 life`);
    assert.equal(botMaxHp(id, 1), Math.round(0.85 * p1), `${id} bot L1 life = player L1 x 0.85`);
    while (fresh.level < 10) grantXp(fresh, xpToNext(fresh.level));
    const p10 = player(fresh).maxHp;
    const g = playerHpGrowthPerLevel(id);
    assert.equal(p10, p1 + 9 * g, `${id} player growth per level incl. vitality`);
    assert.equal(botMaxHp(id, 10), Math.round(0.85 * p10), `${id} bot L10 = player L10 x 0.85`);
  }
  const sim = createMatch(sanctuary, barbarian, 1);
  for (const unit of sim.units.filter((u) => u.bot && u.kind === 'champion')) {
    assert.equal(unit.maxHp, botMaxHp(unit.look ?? 'barbarian', 1), `${unit.name} spawns with its class's bot life`);
    assert.equal(unit.hp, unit.maxHp);
  }
  const bot = sim.units.find((u) => u.bot && u.kind === 'champion')!;
  sim.time = 14 * 60;
  syncChampionLevels(sim);
  assert.ok(bot.level > 1);
  assert.equal(bot.maxHp, botMaxHp(bot.look ?? 'barbarian', bot.level), 'bot HP follows its level');
}

// ---- HEALTH ----
assert.equal(respawnSeconds(1, 1), 5, 'doc first death 5 s at level 1');
assert.equal(respawnSeconds(2, 1), 10);
assert.equal(respawnSeconds(1, 8), 19, '[TEMP] +2 s per level');
assert.equal(respawnSeconds(10, 15), 60, '[TEMP] cap');
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hp1 = player(sim).maxHp;
  grantXp(sim, xpToNext(1));
  assert.ok(player(sim).maxHp > hp1, 'HP grows per level');
  assert.equal(player(sim).hp, player(sim).maxHp, 'level-up restore');
}

// ---- VISUALS (frame data) ----
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  const f = unitFrameData(hero, sim.playerId, 4);
  assert.equal(f.className, 'Barbarian');
  assert.equal(f.level, 4);
  assert.equal(f.showMana, true);
  for (const u of sim.units.filter((x) => x.kind === 'champion' && x.bot && x.look)) {
    assert.equal(className(u), CLASS_NAMES[u.look!]);
  }
  assert.deepEqual(Object.values(CLASS_NAMES), ['Barbarian', 'Amazon', 'Paladin', 'Sorceress', 'Necromancer']);
  assert.deepEqual(tickMarks(400), [0.25, 0.5, 0.75]);
  assert.equal(tickMarks(2000).length, 7, '250-hp ticks when 100s would crowd');
  const key = f.key;
  hero.hp -= 10;
  assert.equal(unitFrameData(hero, sim.playerId, 4).key, key, 'hp change does not rebuild the chrome');
  assert.notEqual(unitFrameData(hero, sim.playerId, 5).key, key, 'level change does');
}

console.log('economy ok');
