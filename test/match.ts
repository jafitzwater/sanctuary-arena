import assert from 'node:assert/strict';
import { projectIso, screenVectorToWorld, unprojectIso } from '../src/game/iso';
import { distToPolyline } from '../src/game/math';
import { act1 } from '../src/game/data/acts/act1';
import { getAct } from '../src/game/data/acts';
import { barbarian } from '../src/game/data/classes/barbarian';
import { getClass } from '../src/game/data/classes';
import { grantXp, MAX_LEVEL, recomputeHero, tryAssignBelt, tryBuy, trySpendAttribute, tryUpgrade, damageUnit } from '../src/game/combat';
import { SKILLS } from '../src/game/skills';
import { findBase, player } from '../src/game/query';
import { createMatch, spawnMinion, updateSim } from '../src/game/sim';
import { emptyInput, type FrameInput, type Sim } from '../src/game/types';

function step(sim: Sim, input: FrameInput, seconds: number, dt = 1 / 30): void {
  const frames = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < frames; i++) updateSim(sim, input, dt);
}

{
  const projected = projectIso(100, 40, 2, 5, 7);
  const back = unprojectIso(projected.x, projected.y, 2, 5, 7);
  assert.ok(Math.abs(back.x - 100) < 1e-6);
  assert.ok(Math.abs(back.y - 40) < 1e-6);
  const up = screenVectorToWorld(0, -1);
  assert.ok(up.x < 0 && up.y < 0);
  const right = screenVectorToWorld(1, 0);
  assert.ok(right.x > 0 && right.y < 0);
}

{
  assert.equal(getAct('act1').id, 'act1');
  assert.equal(getClass('barbarian').name, 'Barbarian');
  for (const skill of barbarian.skills) {
    assert.equal(typeof SKILLS[skill.id], 'function', skill.id);
  }
}

{
  const sim = createMatch(act1, barbarian, 1);
  assert.equal(sim.level, 1);
  assert.equal(sim.skillRanks.bash, 1);
  assert.equal(sim.skillRanks.shout, 0);
  assert.deepEqual(sim.belt, ['bash', '', '', '']);
  assert.equal(sim.phase, 'playing');
  const hero = player(sim);
  assert.equal(hero.maxHp, 240);
  assert.equal(hero.ad, 15);
  assert.equal(hero.moveSpeed, 216);
  const raven = sim.units.find((unit) => unit.defId === 'blood-raven');
  assert.ok(raven && hero.moveSpeed > raven.moveSpeed, 'the hero should still catch Blood Raven');
  sim.level = 5;
  recomputeHero(sim);
  assert.equal(hero.maxHp, 256, 'level 5 with no extra vitality');
  sim.attributes.vit += 20;
  recomputeHero(sim);
  assert.equal(hero.maxHp, 336, 'level 5 with every point in vitality');
  sim.level = 10;
  sim.attributes.vit += 25;
  recomputeHero(sim);
  assert.equal(hero.maxHp, 456, 'level 10 with every point in vitality');
  for (const tower of sim.units.filter((unit) => unit.kind === 'tower')) {
    const gap = distToPolyline(tower, sim.map.lane);
    assert.ok(gap < 80, `${tower.name} is ${gap.toFixed(1)}px off the lane`);
  }
}

{
  const sim = createMatch(act1, barbarian, 1);
  const hero = player(sim);
  hero.x = 2000;
  hero.y = 40;
  updateSim(sim, emptyInput(), 0.1);
  assert.ok(hero.y > 400, `expected the moor to keep the hero on the road, y=${hero.y}`);
}

{
  const sim = createMatch(act1, barbarian, 1);
  step(sim, emptyInput(), act1.waves.first + 0.25);
  const minions = sim.units.filter((unit) => unit.kind === 'minion' && unit.alive);
  assert.ok(minions.length >= 8, `expected a full wave, saw ${minions.length}`);
}

{
  const sim = createMatch(act1, barbarian, 3);
  const hero = player(sim);
  const foe = spawnMinion(sim, 'fallen', 'enemy', hero.x + 36, hero.y);
  foe.hp = 8;
  foe.armor = 0;
  const gold = sim.gold;
  const input = emptyInput();
  input.attack = true;
  input.targetId = foe.id;
  updateSim(sim, input, 0.05);
  assert.equal(foe.alive, false, 'melee last hit should kill a wounded Fallen');
  assert.ok(sim.gold > gold);
  assert.equal(sim.cs, 1);
}

{
  const sim = createMatch(act1, barbarian, 1);
  const hero = player(sim);
  const foe = spawnMinion(sim, 'fallen', 'enemy', hero.x + 40, hero.y);
  const hp = foe.hp;
  const input = emptyInput();
  input.cast = 'bash';
  input.aimX = foe.x;
  input.aimY = foe.y;
  updateSim(sim, input, 0.05);
  assert.ok(foe.hp < hp, 'Bash should damage a Fallen in reach');
  assert.equal(foe.stun, 0, 'Bash is a heavier hit and does not stun');
}

{
  const sim = createMatch(act1, barbarian, 1);
  sim.skillRanks['leap-attack'] = 1;
  const hero = player(sim);
  const x0 = hero.x;
  const input = emptyInput();
  input.cast = 'leap-attack';
  input.aimX = hero.x + 240;
  input.aimY = hero.y;
  step(sim, input, 0.7);
  assert.ok(hero.x > x0 + 120, `Leap should move the barbarian, x=${hero.x} from ${x0}`);
}

{
  const sim = createMatch(act1, barbarian, 1);
  sim.skillRanks.whirlwind = 1;
  const hero = player(sim);
  const foe = spawnMinion(sim, 'zombie', 'enemy', hero.x + 30, hero.y);
  const hp = foe.hp;
  const input = emptyInput();
  input.cast = 'whirlwind';
  updateSim(sim, input, 0.05);
  input.cast = null;
  step(sim, input, 0.5);
  assert.ok(foe.hp < hp, 'Whirlwind should chip a nearby zombie');
}

{
  const sim = createMatch(act1, barbarian, 1);
  sim.gold = 500;
  const hero = player(sim);
  hero.hp = 180;
  const input = emptyInput();
  input.buy = 'health-potion';
  updateSim(sim, input, 0);
  assert.equal(sim.potions.health, 1);
  input.buy = 'clb';
  updateSim(sim, input, 0);
  assert.equal(sim.loadout.weapon, 'clb');
  assert.ok(hero.ad >= barbarian.stats.ad + 5);
  input.buy = null;
  input.potion = 'health';
  updateSim(sim, input, 0);
  assert.equal(sim.potions.health, 0);
  assert.ok(hero.hp > 180);
}

{
  const sim = createMatch(act1, barbarian, 1);
  const hero = player(sim);
  hero.x = 2200;
  hero.y = 820;
  sim.gold = 500;
  const input = emptyInput();
  input.buy = 'lea';
  updateSim(sim, input, 0);
  assert.equal(sim.loadout.armor, null);
  assert.equal(Math.floor(sim.gold), 500);
}

{
  const sim = createMatch(act1, barbarian, 1);
  assert.equal(tryUpgrade(sim, 'shout'), false);
  sim.skillPoints = 1;
  sim.level = 2;
  assert.equal(tryUpgrade(sim, 'shout'), true);
  assert.equal(sim.skillRanks.shout, 1);
  grantXp(sim, 100000);
  assert.equal(sim.level, MAX_LEVEL);
}

{
  const sim = createMatch(act1, barbarian, 1);
  assert.deepEqual(sim.belt, ['bash', '', '', '']);
  grantXp(sim, 60);
  assert.equal(sim.level, 2);
  assert.equal(sim.belt[1], '', 'Shout is not equipped until it is learned');
  tryAssignBelt(sim, 'shout', 1);
  assert.equal(sim.belt[1], '');
  tryUpgrade(sim, 'shout');
  assert.equal(sim.skillRanks.shout, 1);
  assert.equal(sim.belt[1], 'shout', 'Learning Shout fills the first empty slot');
  tryAssignBelt(sim, 'shout', 0);
  assert.equal(sim.belt[0], 'shout');
  assert.equal(sim.belt[1], 'bash');
  sim.statPoints = 1;
  const str = sim.attributes.str;
  trySpendAttribute(sim, 'str');
  assert.equal(sim.attributes.str, str + 1);
  assert.equal(sim.statPoints, 0);
  sim.gold = 400;
  const hero = player(sim);
  hero.x = sim.map.playerBase.x;
  hero.y = sim.map.playerBase.y;
  for (let i = 0; i < 4; i++) tryBuy(sim, 'health-potion');
  assert.equal(sim.potions.health, 3);
  tryBuy(sim, 'lbl');
  assert.equal(sim.loadout.belt, 'lbl');
  tryBuy(sim, 'health-potion');
  assert.equal(sim.potions.health, 4);
}

{
  const sim = createMatch(act1, barbarian, 1);
  const hero = player(sim);
  damageUnit(sim, hero, 50000, null);
  assert.equal(hero.alive, false);
  assert.ok(hero.respawn > 4);
  step(sim, emptyInput(), hero.respawn + 0.2);
  assert.equal(hero.alive, true, 'the barbarian should respawn');
  assert.ok(hero.hp > 200);
}

{
  const win = createMatch(act1, barbarian, 1);
  damageUnit(win, findBase(win, 'enemy'), 999999, player(win));
  assert.equal(win.phase, 'victory');
  updateSim(win, emptyInput(), 1);
  assert.equal(win.phase, 'victory');

  const loss = createMatch(act1, barbarian, 1);
  damageUnit(loss, findBase(loss, 'ally'), 999999, null);
  assert.equal(loss.phase, 'defeat');
}

{
  const sim = createMatch(act1, barbarian, 5);
  const tower = sim.units.find((unit) => unit.name === 'Crypt Gate');
  if (!tower) throw new Error('Crypt Gate missing');
  const hero = player(sim);
  hero.x = tower.x - 70;
  hero.y = tower.y;
  const hp = tower.hp;
  const input = emptyInput();
  input.attack = true;
  input.targetId = tower.id;
  step(sim, input, 2.5);
  assert.ok(tower.hp < hp, 'sieging a tower should damage it');
}

{
  const sim = createMatch(act1, barbarian, 7);
  step(sim, emptyInput(), 30);
  for (const unit of sim.units) {
    assert.ok(Number.isFinite(unit.x) && Number.isFinite(unit.y), unit.name);
  }
  assert.equal(sim.phase, 'playing', 'a hands-off half minute should still be on the moor');
}

console.log('match tests passed');
