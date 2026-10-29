// WORK ORDER "Code engineer - LoL-STYLE SINGLE MOVEMENT SPEED" [JOSEPH]
// Spec: "totalMS(base, flat, addPct, multis, slows) = (base + flat) * (1 + sum addPct) * product(multis) * (1 - max slow)";
// "Soft caps: ms > 490 -> 415 + 75*0.8 + (ms-490)*0.5; 415-490 -> excess over 415 at 80%; floor: if ms < 220 then
// ms = 110 + ms*0.5." "Result * UNIT_SCALE (144/345)." Superseded by Option B [JOSEPH t211u]: UNIT_SCALE 1.0. "Only the strongest slow applies."
import assert from 'node:assert/strict';
import { BASE_MS, rawMS, softCapMS, totalMS, UNIT_SCALE } from '../src/game/data/moveSpeed';
import { barbarian } from '../src/game/data/classes/barbarian';
import { championMS, createMatch, updateSim } from '../src/game/sim';
import { player } from '../src/game/query';
import { emptyInput } from '../src/game/types';
import { sanctuary } from '../src/game/data/acts/sanctuary';

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} != ${b}`);

// Base MS table and unit scale.
assert.deepEqual({ ...BASE_MS }, { barbarian: 345, amazon: 340, paladin: 335, necromancer: 330, sorceress: 325 });
near(UNIT_SCALE, 1.0); // Option B: 1 LoL unit = 1 world px
near(totalMS(345), 345, 'Barbarian 345 -> 345 px/s');
near(totalMS(335), 335, 'nominal 335 -> 335 px/s');
assert.equal(barbarian.stats.moveSpeed, 345);
near(totalMS(325), 325);

// Soft caps.
assert.equal(softCapMS(415), 415);
near(softCapMS(450), 415 + 35 * 0.8);
near(softCapMS(490), 415 + 75 * 0.8);
near(softCapMS(600), 415 + 75 * 0.8 + 110 * 0.5);
// Floor.
assert.equal(softCapMS(220), 220);
near(softCapMS(200), 110 + 100);
near(softCapMS(0), 110);

// Flat adds before percentages.
near(rawMS(345, 25), 370);
// Additive % sum; multiplicative % multiply.
near(rawMS(300, 0, [0.1, 0.2]), 300 * 1.3);
near(rawMS(300, 0, [], [1.1, 1.2]), 300 * 1.1 * 1.2);
assert.ok(rawMS(300, 0, [], [1.1, 1.2]) > rawMS(300, 0, [0.1, 0.2]), 'multiplicative stacks harder than additive');
near(rawMS(300, 10, [0.1], [1.05]), (310) * 1.1 * 1.05);

// Only the strongest slow applies.
near(rawMS(345, 0, [], [], [0.25, 0.35]), 345 * 0.65);
near(rawMS(345, 0, [], [], [0.35, 0.25]), rawMS(345, 0, [], [], [0.35]));
// Slow into the floor: 345 * 0.4 = 138 -> 110 + 69.
near(rawMS(345, 0, [], [], [0.6]), 110 + 138 * 0.5);
// Caps apply after modifiers, then scale.
near(totalMS(345, 0, [0.5]), (415 + 75 * 0.8 + (517.5 - 490) * 0.5) * UNIT_SCALE);

// In game: the live hero uses championMS with existing sources only.
{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  assert.equal(hero.msBase, 345);
  near(championMS(hero), totalMS(345));
  hero.haste = 5; // existing haste shrine: +18% additive
  near(championMS(hero), totalMS(345, 0, [0.18]));
  hero.haste = 0;
  hero.slows = [{ pct: 0.25, t: 1 }, { pct: 0.35, t: 1 }]; // Cursed + Leap Attack: strongest only
  near(championMS(hero), totalMS(345, 0, [], [], [0.35]));
  hero.slows = [];
  hero.whirlT = 1; // existing Whirlwind move pace x1.06, unchanged value
  near(championMS(hero), totalMS(345, 0, [], [1.06]));
  // Click-to-move in town and full stick both run at the single MS.
  sim.time = (sim.map.openingWait ?? 0) + 1;
  hero.whirlT = 0;
  const input = emptyInput();
  input.destX = hero.x + 200;
  input.destY = hero.y;
  const x0 = hero.x;
  updateSim(sim, input, 0.05);
  assert.ok(Math.abs((hero.x - x0) / 0.05 - totalMS(345)) < 1, `click-move ${(hero.x - x0) / 0.05}`);
  // AI champions use their class base MS.
  for (const bot of sim.units.filter((u) => u.kind === 'champion' && u.bot)) {
    assert.equal(bot.msBase, BASE_MS[bot.look ?? 'barbarian'] ?? 345, `${bot.name} ${bot.look}`);
  }
}
console.log('move-speed tests passed');
