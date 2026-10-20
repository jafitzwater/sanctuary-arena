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
import { ROSTER } from '../src/game/data/classes/roster';
import { dealTeams } from '../src/game/teams';
import { FUTURE_ITEMS, isShopItem, ITEMS } from '../src/game/data/items';
import { UNIT_DEFS } from '../src/game/data/units';
import { emptyInput, type FrameInput, type Sim } from '../src/game/types';
import { sceneryFor } from '../src/game/landscape';
import { groundAt, walkable } from '../src/game/terrain';
import { locomotionColumn } from '../src/game/gait';

function step(sim: Sim, input: FrameInput, seconds: number, dt = 1 / 30): void {
  const frames = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < frames; i++) updateSim(sim, input, dt);
}

function steer(sim: Sim, x: number, y: number, seconds = 7): void {
  const hero = player(sim);
  const input = emptyInput();
  const frames = Math.round(seconds / (1 / 30));
  for (let i = 0; i < frames; i++) {
    input.moveX = x - hero.x;
    input.moveY = y - hero.y;
    updateSim(sim, input, 1 / 30);
    if (Math.hypot(hero.x - x, hero.y - y) < 28) return;
  }
}

function roadside(lane: { x: number; y: number }[], side: number): number[] {
  const props = sceneryFor(sanctuary).filter((prop) => prop.kind === 'tree' || prop.kind === 'stump' || prop.kind === 'rock');
  let total = 0;
  const marks: { at: number; x: number; y: number }[] = [];
  for (let i = 1; i < lane.length; i++) {
    const len = Math.hypot(lane[i].x - lane[i - 1].x, lane[i].y - lane[i - 1].y);
    marks.push({ at: total, x: lane[i - 1].x, y: lane[i - 1].y });
    total += len;
  }
  marks.push({ at: total, x: lane[lane.length - 1].x, y: lane[lane.length - 1].y });
  const hit: number[] = [];
  for (const prop of props) {
    let best = Infinity;
    let at = 0;
    let cross = 0;
    for (let i = 1; i < marks.length; i++) {
      const ax = marks[i - 1].x;
      const ay = marks[i - 1].y;
      const bx = marks[i].x;
      const by = marks[i].y;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((prop.x - ax) * dx + (prop.y - ay) * dy) / len2));
      const qx = ax + dx * t;
      const qy = ay + dy * t;
      const dist = Math.hypot(prop.x - qx, prop.y - qy);
      if (dist < best) {
        best = dist;
        at = marks[i - 1].at + Math.hypot(qx - ax, qy - ay);
        cross = dx * (prop.y - ay) - dy * (prop.x - ax);
      }
    }
    if (Math.sign(cross) !== Math.sign(side)) continue;
    const offset = sanctuary.laneWidth / 2 + 88;
    if (best < Infinity && Math.abs(best - offset) < 50 && at > 400 && at < total - 400) hit.push(at);
  }
  hit.sort((a, b) => a - b);
  return hit;
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
  assert.equal(barbarian.stats.walkSpeed, 144);
  const raven = sim.units.find((unit) => unit.defId === 'blood-raven');
  assert.equal(raven?.moveSpeed, 93);
  assert.ok(raven && hero.moveSpeed > raven.moveSpeed, 'the hero should still catch Blood Raven');
  for (const def of Object.values(UNIT_DEFS)) {
    assert.ok(def.moveSpeed < hero.moveSpeed, `${def.id} should stay slower than the hero`);
  }
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
  hero.x = 2360;
  hero.y = 1240;
  updateSim(sim, emptyInput(), 0.1);
  assert.ok(Math.hypot(hero.x - 2360, hero.y - 1240) < 40, 'the blood moor road stays open');
  hero.x = 1500;
  hero.y = 1100;
  updateSim(sim, emptyInput(), 0.1);
  assert.ok(Math.hypot(hero.x - 1500, hero.y - 1100) > 40, 'ground between the paths blocks movement');
  assert.ok(walkable(sanctuary, 1680, 160), 'a den clearing stays open');
  assert.equal(walkable(sanctuary, 1500, 860), false, 'the river stays shut off the roads');
  assert.ok(walkable(sanctuary, sanctuary.playerBase.x + 150, sanctuary.playerBase.y), 'camp spawn stays open');
  assert.equal(groundAt(sanctuary, 2360, 1240), 'path', 'the blood moor cobbles stay a path');
  for (const path of sanctuary.paths ?? []) {
    const mid = path.lane[Math.floor(path.lane.length / 2)];
    assert.equal(groundAt(sanctuary, mid.x, mid.y), 'path', `${path.name} is a continuous cobble lane`);
  }
  assert.equal(groundAt(sanctuary, sanctuary.playerBase.x, sanctuary.playerBase.y), 'town', 'the encampment yard is wood');
  assert.equal(groundAt(sanctuary, sanctuary.enemyBase.x, sanctuary.enemyBase.y), 'pale', 'the harrogath yard is paved stone');
  assert.equal(groundAt(sanctuary, 1500, 1100), 'grass', 'open ground between the paths is grass');
  assert.equal(groundAt(sanctuary, 20, 20), 'grass', 'the map edge is grass, not a void');
  for (let y = 0; y < sanctuary.height; y += 80) {
    for (let x = 0; x < sanctuary.width; x += 80) {
      const kind = groundAt(sanctuary, x, y);
      assert.notEqual(kind, 'edge', `no path border at ${x},${y}`);
      assert.notEqual(kind, 'dark', `no void tile at ${x},${y}`);
    }
  }
  const tree = sceneryFor(sanctuary).find((prop) => prop.kind === 'tree' && prop.block > 0);
  assert.ok(tree, 'a large tree has a solid trunk');
  if (tree) assert.equal(walkable(sanctuary, tree.x, tree.y), false, 'a large tree blocks passage');
  const tent = sceneryFor(sanctuary).find((prop) => prop.kind === 'tent' && prop.block > 0);
  assert.ok(tent && !walkable(sanctuary, tent.x, tent.y), 'a tent blocks passage');
  assert.equal(groundAt(sanctuary, 2418, 1367), 'blend', 'the lane shoulder uses a grass-to-dirt transition');
  {
    const home = sanctuary.playerBase;
    const mouth = sanctuary.paths?.[2].lane[0];
    if (!mouth) throw new Error('south lane missing');
    const mx = (home.x + mouth.x) / 2;
    const my = (home.y + mouth.y) / 2;
    const dx = mouth.x - home.x;
    const dy = mouth.y - home.y;
    const mag = Math.hypot(dx, dy) || 1;
    const wide = (80 / 0.85) * 1.6;
    assert.equal(walkable(sanctuary, mx + (-dy / mag) * wide, my + (dx / mag) * wide), true, 'the south entrance is at least three tiles wide');
  }
  for (const path of sanctuary.paths ?? []) {
    for (const [home, mouth] of [
      [sanctuary.playerBase, path.lane[0]],
      [sanctuary.enemyBase, path.lane[path.lane.length - 1]],
    ] as const) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = home.x + (mouth.x - home.x) * t;
        const y = home.y + (mouth.y - home.y) * t;
        assert.equal(walkable(sanctuary, x, y), true, `${path.name} entrance stays open at ${t.toFixed(2)}`);
      }
    }
    for (const side of [1, -1]) {
      const band = roadside(path.lane, side);
      assert.ok(band.length >= 8, `${path.name} side ${side} is a continuous border`);
      let worst = 0;
      for (let i = 1; i < band.length; i++) worst = Math.max(worst, band[i] - band[i - 1]);
      assert.ok(worst < 240, `${path.name} side ${side} gap is ${worst.toFixed(0)}`);
    }
  }
  const runHome = createMatch(sanctuary, barbarian, 3);
  const runner = player(runHome);
  runner.hp = 100000;
  runner.invuln = 60;
  for (const path of sanctuary.paths ?? []) {
    for (const [home, mouth] of [
      [sanctuary.playerBase, path.lane[0]],
      [sanctuary.enemyBase, path.lane[path.lane.length - 1]],
    ] as const) {
      const dx = mouth.x - home.x;
      const dy = mouth.y - home.y;
      const len = Math.hypot(dx, dy) || 1;
      runner.x = home.x + (dx / len) * 120;
      runner.y = home.y + (dy / len) * 120;
      const startX = runner.x;
      const startY = runner.y;
      steer(runHome, mouth.x, mouth.y);
      assert.ok(distToPolyline(runner, path.lane) < sanctuary.laneWidth / 2, `${path.name} lets the hero out of the base`);
      steer(runHome, startX, startY);
      assert.ok(Math.hypot(runner.x - startX, runner.y - startY) < 48, `${path.name} lets the hero back into the base`);
    }
  }
  const held = 80;
  const runCol = locomotionColumn(held, 12);
  const walkCol = locomotionColumn(held, 4);
  assert.notEqual(runCol, 0, 'a mid-cycle run is not frame 0');
  assert.ok(Math.abs(walkCol / 4 - runCol / 12) < 0.2, 'walk keeps the run cycle fraction');
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

{
  assert.equal(ROSTER.length, 7);
  assert.deepEqual(
    ROSTER.filter((entry) => entry.playable).map((entry) => entry.id),
    ['barbarian'],
  );
  const dealt = dealTeams(3, 'barbarian');
  assert.equal(dealt.allies.length, 4);
  assert.equal(dealt.enemies.length, 5);
  assert.equal(new Set(dealt.allies.map((seat) => seat.name)).size, 4);
  assert.equal(new Set(dealt.enemies.map((seat) => seat.name)).size, 5);
  assert.ok(dealt.allies.every((seat) => seat.classId === 'barbarian'));
  assert.ok(dealt.enemies.every((seat) => seat.classId === 'barbarian'));

  const sim = createMatch(sanctuary, barbarian, 3);
  const allies = sim.units.filter((unit) => unit.bot && unit.team === 'ally');
  const enemies = sim.units.filter((unit) => unit.bot && unit.team === 'enemy' && unit.defId === 'barbarian');
  assert.equal(allies.length, 4);
  assert.equal(enemies.length, 5);
  const lanes = new Set(allies.map((unit) => unit.path));
  assert.ok(lanes.size >= 2, 'allied heroes do not all take the same path');

  const bot = allies[0];
  bot.x = 2200;
  bot.y = 1200;
  bot.hp = 20;
  bot.invuln = 5;
  const home = sim.map.playerBase;
  const before = Math.hypot(bot.x - home.x, bot.y - home.y);
  step(sim, emptyInput(), 1);
  const after = Math.hypot(bot.x - home.x, bot.y - home.y);
  assert.ok(after < before - 80, `wounded hero should retreat, ${before.toFixed(0)} -> ${after.toFixed(0)}`);

  const hunter = enemies[0];
  hunter.x = 1800;
  hunter.y = 1400;
  hunter.hp = hunter.maxHp;
  hunter.invuln = 2;
  const low = spawnMinion(sim, 'fallen', 'ally', hunter.x + 36, hunter.y);
  low.hp = 4;
  low.armor = 0;
  spawnMinion(sim, 'fallen', 'ally', hunter.x + 240, hunter.y);
  updateSim(sim, emptyInput(), 0.1);
  assert.equal(hunter.targetId, low.id, 'a hero last-hits the wounded minion');
}

{
  assert.ok(FUTURE_ITEMS.some((item) => item.tier === 'unique'));
  assert.ok(FUTURE_ITEMS.some((item) => item.rune));
  assert.ok(FUTURE_ITEMS.some((item) => item.charm));
  assert.ok(ITEMS.every(isShopItem));
  assert.equal(FUTURE_ITEMS.some(isShopItem), false);
  assert.ok(ITEMS.some((item) => item.id === 'hire-rogue'));

  const sim = createMatch(act1, barbarian, 1);
  const hero = player(sim);
  hero.x = sim.map.playerBase.x;
  hero.y = sim.map.playerBase.y;
  sim.gold = 200;
  const hire = emptyInput();
  hire.buy = 'hire-rogue';
  updateSim(sim, hire, 0.05);
  const merc = sim.units.find((unit) => unit.merc && unit.alive);
  assert.ok(merc, 'Akara should hire a rogue in camp');
  assert.ok(sim.gold < 130 && sim.gold > 100, `gold after hire ${sim.gold}`);
  updateSim(sim, hire, 0.05);
  assert.equal(sim.units.filter((unit) => unit.merc && unit.alive).length, 1);
  if (!merc) throw new Error('missing merc');
  merc.mercT = 0.05;
  step(sim, emptyInput(), 0.2);
  assert.equal(sim.units.some((unit) => unit.merc && unit.alive), false);

  const away = createMatch(act1, barbarian, 1);
  const far = player(away);
  far.x = 2000;
  far.y = 800;
  away.gold = 200;
  updateSim(away, hire, 0.05);
  assert.equal(away.units.some((unit) => unit.merc), false);
}

console.log('match tests passed');
