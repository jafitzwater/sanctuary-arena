import assert from 'node:assert/strict';
import { projectIso, screenVectorToWorld, unprojectIso } from '../src/game/iso';
import { distToPolyline } from '../src/game/math';
import { act1 } from '../src/game/data/acts/act1';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { getAct } from '../src/game/data/acts';
import { barbarian } from '../src/game/data/classes/barbarian';
import { getClass } from '../src/game/data/classes';
import { grantXp, MAX_LEVEL, recomputeHero, tryAssignBelt, tryBuy, trySpendAttribute, tryUpgrade, damageUnit } from '../src/game/combat';
import { SKILLS } from '../src/game/skills';
import { findBase, player } from '../src/game/query';
import { createMatch, spawnHero, spawnMinion, updateSim } from '../src/game/sim';
import { comebackMul, paceOf, xpShare } from '../src/game/pace';
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
  const heroBefore = player(sim);
  heroBefore.hp = 40;
  heroBefore.mana = 12;
  grantXp(sim, 60);
  assert.equal(sim.level, 2);
  assert.equal(heroBefore.hp, heroBefore.maxHp, 'level-up restores life');
  assert.equal(heroBefore.mana, heroBefore.maxMana, 'level-up restores mana');
  assert.ok(sim.sfx.includes('level'));
  assert.ok(sim.fx.some((fx) => fx.kind === 'text' && fx.text === 'Level 2'));
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

{
  const sim = createMatch(sanctuary, barbarian, 1);
  assert.equal(sim.map.paths?.length, 3);
  assert.equal(sim.map.roam, true);
  const towers = sim.units.filter((unit) => unit.kind === 'tower');
  assert.equal(towers.length, 22);
  const laneTowers = sanctuary.towers.filter((tower) => tower.role !== 'guardian');
  assert.equal(laneTowers.length, 18);
  for (const spec of laneTowers) {
    const path = sanctuary.paths?.find((entry) => entry.id === spec.path);
    if (!path) throw new Error(`${spec.name} has no path`);
    const gap = distToPolyline(spec, path.lane);
    assert.ok(gap < 80, `${spec.name} is ${gap.toFixed(1)}px off ${path.name}`);
  }
  const hero = player(sim);
  hero.x = 2200;
  hero.y = 1400;
  updateSim(sim, emptyInput(), 0.1);
  assert.ok(Math.hypot(hero.x - 2200, hero.y - 1400) < 40, 'the wilderness between paths stays walkable');
  step(sim, emptyInput(), sanctuary.waves.first + 0.25);
  const minions = sim.units.filter((unit) => unit.kind === 'minion' && unit.alive);
  for (const index of [0, 1, 2]) {
    assert.ok(minions.some((unit) => unit.path === index && unit.team === 'ally'), `ally path ${index}`);
    assert.ok(minions.some((unit) => unit.path === index && unit.team === 'enemy'), `enemy path ${index}`);
  }
}

{
  assert.equal(paceOf(0).name, 'Normal');
  assert.equal(paceOf(90).name, 'Nightmare');
  assert.equal(paceOf(180).name, 'Hell');
  assert.equal(xpShare(1), 1);
  assert.equal(xpShare(2), 0.65);
  assert.equal(xpShare(4), 0.45);
  assert.equal(comebackMul(1, 0), 1);
  assert.ok(comebackMul(1, 90) > 1);

  const solo = createMatch(act1, barbarian, 1);
  const hero = player(solo);
  const foe = spawnMinion(solo, 'fallen', 'enemy', hero.x + 30, hero.y);
  const full = foe.xp;
  foe.hp = 1;
  foe.armor = 0;
  damageUnit(solo, foe, 80, hero);
  assert.equal(solo.xp, full, 'a solo hero keeps the full experience award');

  const group = createMatch(act1, barbarian, 1);
  const hero2 = player(group);
  spawnHero(group, 'ally', hero2.x + 24, hero2.y, 'Ally');
  const foe2 = spawnMinion(group, 'fallen', 'enemy', hero2.x + 30, hero2.y);
  foe2.hp = 1;
  foe2.armor = 0;
  damageUnit(group, foe2, 80, hero2);
  assert.equal(group.xp, Math.round(foe2.xp * 0.65));

  const behind = createMatch(act1, barbarian, 1);
  behind.time = 90;
  const hero3 = player(behind);
  const foe3 = spawnMinion(behind, 'fallen', 'enemy', hero3.x + 30, hero3.y);
  const baseXp = foe3.xp;
  foe3.hp = 1;
  foe3.armor = 0;
  damageUnit(behind, foe3, 80, hero3);
  assert.ok(behind.xp > baseXp, 'a hero behind the clock earns a comeback bonus');

  const grown = createMatch(act1, barbarian, 1);
  grown.time = 90;
  const scaled = spawnMinion(grown, 'fallen', 'enemy', player(grown).x + 40, player(grown).y);
  assert.ok(scaled.maxHp > 76, `nightmare Fallen should be tougher, hp=${scaled.maxHp}`);
}

{
  const sim = createMatch(sanctuary, barbarian, 1);
  const dens = sim.map.dens ?? [];
  assert.equal(dens.length, 6);
  const boss = sim.units.find((unit) => unit.name === 'Rakanishu');
  assert.ok(boss && boss.team === 'wild' && boss.alive);
  const named = sim.units.find((unit) => unit.name === 'Bishibosh');
  assert.ok(named && named.team === 'wild');
  for (const den of dens) {
    for (const path of sim.map.paths ?? []) {
      const gap = distToPolyline(den, path.lane);
      assert.ok(gap > 140, `${den.unit} den is ${gap.toFixed(0)}px from ${path.name}`);
    }
    if (sim.map.river) {
      const river = distToPolyline(den, sim.map.river);
      assert.ok(river > 120, `${den.unit} den is ${river.toFixed(0)}px from the river`);
    }
    assert.ok(sim.units.some((unit) => unit.alive && unit.pack === den.id && unit.team === 'wild'));
  }
  const first = dens[0];
  for (const unit of sim.units.filter((entry) => entry.pack === first.id && entry.alive)) {
    unit.hp = 1;
    damageUnit(sim, unit, 500, null);
  }
  assert.equal(sim.units.filter((unit) => unit.pack === first.id && unit.alive).length, 0);
  step(sim, emptyInput(), first.respawn + 0.25);
  assert.ok(sim.units.some((unit) => unit.pack === first.id && unit.alive), 'a cleared den respawns');

  const night = createMatch(sanctuary, barbarian, 1);
  night.time = 90;
  night.waveIn = 0.05;
  updateSim(night, emptyInput(), 0.1);
  const foes = night.units.filter((unit) => unit.kind === 'minion' && unit.team === 'enemy' && unit.alive);
  const ids = new Set(foes.map((unit) => unit.defId));
  assert.ok(ids.has('skeleton') && ids.has('hungry-dead') && ids.has('willowisp'), [...ids].join(','));
}

{
  const sim = createMatch(sanctuary, barbarian, 1);
  const seals = sim.units.filter((unit) => unit.kind === 'seal');
  assert.equal(seals.length, 6);
  const enemySeal = seals.find((unit) => unit.team === 'enemy' && unit.path === 0);
  if (!enemySeal) throw new Error('missing enemy seal');
  damageUnit(sim, enemySeal, 99999, player(sim));
  assert.equal(enemySeal.alive, false);
  sim.waveIn = 0.05;
  updateSim(sim, emptyInput(), 0.1);
  assert.ok(
    sim.units.some((unit) => unit.alive && unit.team === 'ally' && unit.affix.length > 0),
    'a broken enemy seal sends a super monster with the next ally wave',
  );
  for (const unit of sim.units.filter((entry) => entry.team === 'ally' && entry.kind === 'minion')) {
    unit.alive = false;
    unit.corpse = 0;
  }
  enemySeal.respawn = 0.05;
  updateSim(sim, emptyInput(), 0.1);
  assert.equal(enemySeal.alive, true);
  sim.waveIn = 0.05;
  updateSim(sim, emptyInput(), 0.1);
  assert.equal(
    sim.units.some((unit) => unit.alive && unit.team === 'ally' && unit.kind === 'minion' && unit.affix.length > 0),
    false,
  );

  const pits = createMatch(sanctuary, barbarian, 1);
  pits.dragonIn = 0.05;
  updateSim(pits, emptyInput(), 0.1);
  const dragon = pits.units.find((unit) => unit.objective === 'dragon' && unit.alive);
  if (!dragon) throw new Error('dragon pit did not spawn');
  dragon.hp = 1;
  dragon.armor = 0;
  damageUnit(pits, dragon, 500, player(pits));
  const buffed = player(pits);
  assert.ok(buffed.mightT > 0 || buffed.guardT > 0 || buffed.haste > 0);

  const home = createMatch(sanctuary, barbarian, 1);
  const hero = player(home);
  hero.x = 80;
  hero.y = 80;
  hero.invuln = 10;
  const recall = emptyInput();
  recall.recall = true;
  step(home, recall, 3);
  assert.ok(
    Math.hypot(hero.x - home.map.playerBase.x, hero.y - home.map.playerBase.y) < 160,
    `recall left the hero at ${hero.x.toFixed(0)},${hero.y.toFixed(0)} recall=${hero.recall.toFixed(2)}`,
  );

  const shrines = createMatch(sanctuary, barbarian, 1);
  const shrine = shrines.map.shrines?.[0];
  if (!shrine) throw new Error('missing shrine');
  const pilgrim = player(shrines);
  pilgrim.x = shrine.x;
  pilgrim.y = shrine.y;
  updateSim(shrines, emptyInput(), 0.1);
  assert.ok(pilgrim.mightT > 0 || pilgrim.guardT > 0 || pilgrim.haste > 0 || pilgrim.mana === pilgrim.maxMana);

  for (const spot of [...(sim.map.pits ?? []), ...(sim.map.shrines ?? []), ...seals]) {
    for (const path of sim.map.paths ?? []) {
      const gap = distToPolyline(spot, path.lane);
      assert.ok(gap > 80, `objective at ${spot.x},${spot.y} is ${gap.toFixed(0)}px from ${path.name}`);
    }
  }
}

console.log('match tests passed');
