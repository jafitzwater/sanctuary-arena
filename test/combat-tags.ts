import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { barbarian } from '../src/game/data/classes/barbarian';
import {
  damageColor,
  damageUnit,
  grantXp,
  noteDebuff,
  syncChampionLevels,
} from '../src/game/combat';
import { createMatch, spawnHero, updateSim } from '../src/game/sim';
import { player } from '../src/game/query';
import { emptyInput, type Sim, type Unit } from '../src/game/types';

/** Skip the 15 s opening wait (item 3) so older tests can move heroes out of base. */
function pastOpening<T extends { time: number; map: { openingWait?: number } }>(sim: T): T {
  sim.time = Math.max(sim.time, sim.map.openingWait ?? 0);
  return sim;
}

function match(): Sim {
  return pastOpening(createMatch(sanctuary, barbarian, 3));
}

function enemyOf(sim: Sim): Unit {
  const enemy = sim.units.find((unit) => unit.id === sim.enemyChampionId);
  assert.ok(enemy);
  return enemy;
}

function lastNumber(sim: Sim) {
  const fx = [...sim.fx].reverse().find((entry) => entry.kind === 'text' && entry.school);
  assert.ok(fx);
  return fx;
}

const colors = match();
const hero = player(colors);
const foe = enemyOf(colors);
foe.x = hero.x + 40;
foe.y = hero.y;
foe.armor = 0;
foe.hp = 400;
foe.maxHp = 400;
damageUnit(colors, foe, 12, hero);
const physical = lastNumber(colors);
assert.equal(physical.school, 'physical');
assert.equal(physical.taken, false);
assert.equal(damageColor('physical', false), '#e07a32');

damageUnit(colors, hero, 1, foe, 'magic');
const taken = lastNumber(colors);
assert.equal(taken.school, 'magic');
assert.equal(taken.taken, true);
assert.equal(damageColor('magic', true), '#e23b3b');
assert.equal(damageColor('magic', false), '#e454c8');

const assisted = match();
const you = player(assisted);
const victim = enemyOf(assisted);
victim.x = you.x + 24;
victim.y = you.y;
victim.armor = 0;
victim.hp = 5000;
victim.maxHp = 5000;
damageUnit(assisted, victim, 20, you);
assert.equal(assisted.kills, 0);
const ally = spawnHero(assisted, 'ally', victim.x, victim.y, 'Ally');
damageUnit(assisted, victim, 100000, ally);
assert.equal(assisted.kills, 0);
assert.equal(assisted.assists, 1);
assert.equal(assisted.allyKills, 1);
assert.equal(assisted.enemyKills, 0);

const stale = match();
const late = player(stale);
const marked = enemyOf(stale);
marked.x = late.x + 24;
marked.y = late.y;
marked.armor = 0;
marked.hp = 5000;
marked.maxHp = 5000;
damageUnit(stale, marked, 20, late);
stale.time += 11;
const finisher = spawnHero(stale, 'ally', marked.x, marked.y, 'Finisher');
damageUnit(stale, marked, 100000, finisher);
assert.equal(stale.assists, 0);
assert.equal(stale.allyKills, 1);

const debuffed = match();
const caster = player(debuffed);
const cursed = enemyOf(debuffed);
cursed.x = caster.x + 20;
cursed.y = caster.y;
cursed.armor = 0;
noteDebuff(debuffed, cursed, caster);
assert.equal(debuffed.fx.some((entry) => entry.school), false);
const partner = spawnHero(debuffed, 'ally', cursed.x, cursed.y, 'Partner');
damageUnit(debuffed, cursed, 100000, partner);
assert.equal(debuffed.assists, 1);
assert.equal(debuffed.kills, 0);
assert.equal(debuffed.allyKills, 1);

const traded = match();
const self = player(traded);
const rival = enemyOf(traded);
rival.x = self.x + 16;
rival.y = self.y;
damageUnit(traded, self, self.maxHp * 20 + 5000, rival);
assert.equal(traded.deaths, 1);
assert.equal(traded.enemyKills, 1);
assert.equal(traded.allyKills, 0);
assert.equal(self.alive, false);

const ranks = match();
const before = player(ranks).maxHp;
grantXp(ranks, 60);
assert.equal(ranks.level, 2);
assert.equal(ranks.skillPoints, 1);
assert.equal(player(ranks).level, 2);
assert.ok(player(ranks).maxHp >= before);

const clock = match();
const clockEnemy = enemyOf(clock);
const hp = clockEnemy.maxHp;
const ad = clockEnemy.ad;
const speed = clockEnemy.moveSpeed;
const radius = clockEnemy.radius;
assert.equal(clockEnemy.level, 1);
updateSim(clock, emptyInput(), 0.05);
assert.equal(enemyOf(clock).level, 1);
clock.time = 90;
syncChampionLevels(clock);
assert.equal(enemyOf(clock).level, 3);
assert.equal(enemyOf(clock).maxHp, hp);
assert.equal(enemyOf(clock).ad, ad);
assert.equal(enemyOf(clock).moveSpeed, speed);
assert.equal(enemyOf(clock).radius, radius);
assert.equal(player(clock).level, clock.level);

console.log('combat-tags ok');
