// Unit-frame restyle order [JOSEPH t228u]: pure frame data (XP ring, name, level text, colors, max level).
import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { CLASSES } from '../src/game/data/classes';
import { barbarian } from '../src/game/data/classes/barbarian';
import { MAX_LEVEL, xpToNext } from '../src/game/economy';
import { player } from '../src/game/query';
import { createMatch } from '../src/game/sim';
import {
  CLASS_NAMES, FRAME, FRAME_COLORS, XP_RING_STEPS, levelText, unitFrameData, xpRingFraction,
} from '../src/game/unitFrame';

// XP ring fraction: 0 at the start of a level, quantized to 1/48, clamped, full at max level.
assert.equal(xpRingFraction(1, 0), 0);
assert.equal(xpRingFraction(1, xpToNext(1) / 2), 0.5);
assert.equal(xpRingFraction(3, xpToNext(3) * 0.999), 47 / 48, 'rounds down to a 1/48 step');
assert.equal(xpRingFraction(4, xpToNext(4) * 5), 1, 'clamped');
assert.equal(xpRingFraction(2, -10), 0, 'clamped low');
for (let xp = 0; xp < xpToNext(5); xp += 7) {
  const f = xpRingFraction(5, xp);
  assert.equal(Math.round(f * XP_RING_STEPS), f * XP_RING_STEPS, 'always a whole step');
}
assert.equal(xpRingFraction(MAX_LEVEL, 0), 1, 'max level shows a full ring');
assert.equal(xpRingFraction(MAX_LEVEL, undefined), 1, 'max-level bots too');
assert.equal(xpRingFraction(6, undefined), 0, 'bots have no xp track: empty ring [TEMP]');

// Level text.
assert.equal(levelText(1), '1');
assert.equal(levelText(10), '10');
assert.equal(levelText(MAX_LEVEL), '15');
assert.equal(levelText(99), '15');
assert.equal(levelText(0), '1');

// Sizes: slightly larger than the PR #74 frame (w 58, hp 6, mana 3, circle 8, name 9), mana thinner than HP.
assert.ok(FRAME.w > 58 && FRAME.hp > 6 && FRAME.mana > 3 && FRAME.circle > 8 && FRAME.name > 9);
assert.ok(FRAME.mana < FRAME.hp);
assert.ok(FRAME.ring < FRAME.circle / 2);

// Frame data from a live match: class name, level, ring, team colors.
for (const cls of Object.values(CLASSES)) {
  const sim = createMatch(sanctuary, cls, 1);
  const hero = player(sim);
  const f = unitFrameData(hero, sim.playerId, 1, 0);
  assert.equal(f.className, CLASS_NAMES[cls.id], `${cls.id} shows its class name`);
}
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  const f = unitFrameData(hero, sim.playerId, 3, xpToNext(3) / 4);
  assert.equal(f.levelText, '3');
  assert.equal(f.xpRing, 0.25);
  assert.equal(f.hpColor, FRAME_COLORS.hp[hero.team]);
  const max = unitFrameData(hero, sim.playerId, MAX_LEVEL, 0);
  assert.equal(max.xpRing, 1);
  assert.equal(max.levelText, '15');
  // Cache key: same within a 1/48 step and on HP change; changes on a ring step or a level.
  const a = unitFrameData(hero, sim.playerId, 3, 0);
  hero.hp -= 10;
  assert.equal(unitFrameData(hero, sim.playerId, 3, 0.5).key, a.key);
  assert.notEqual(unitFrameData(hero, sim.playerId, 3, xpToNext(3) / 2).key, a.key);
  assert.notEqual(unitFrameData(hero, sim.playerId, 4, 0).key, a.key);
  // Enemy vs ally colors: enemy red bar and rim [JOSEPH earlier], ally green.
  const champs = sim.units.filter((u) => u.kind === 'champion');
  const enemy = champs.find((u) => u.team === 'enemy')!;
  const ally = champs.find((u) => u.team === 'ally')!;
  const fe = unitFrameData(enemy, sim.playerId, undefined, 999);
  const fa = unitFrameData(ally, sim.playerId);
  assert.equal(fe.hpColor, '#d8432e');
  assert.equal(fa.hpColor, '#4fbf3a');
  assert.notEqual(fe.rimColor, fa.rimColor);
  assert.equal(fe.mine, false);
  assert.equal(fe.xpRing, enemy.level >= MAX_LEVEL ? 1 : 0, 'player xp is never shown on other frames');
}

console.log('unit-frame ok');
