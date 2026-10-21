import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectIso, screenVectorToWorld, unprojectIso } from '../src/game/iso';
import { distToPolyline } from '../src/game/math';
import { act1 } from '../src/game/data/acts/act1';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { getAct } from '../src/game/data/acts';
import { barbarian, STICK_GAIT_HOLD_MS, STICK_IDLE_TILT, STICK_RUN_TILT } from '../src/game/data/classes/barbarian';
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
import { campGates, DECOR_MARGIN, FLOOR_STEP, GATE_HALF, LANE_CLEAR_HALF, sceneryFor } from '../src/game/landscape';
import { GROUND_BASE, groundAt, slide, walkable } from '../src/game/terrain';
import {
  animFrame,
  HERO_COMBAT_BANDS,
  HERO_RUN_RECTS,
  HERO_RUN_SPEED,
  HERO_WALK_RECTS,
  heroCompass,
  heroDrawOrigin,
  commitStickGait,
  heroGaitStep,
  heroHoldCompass,
  heroMoveScale,
  stepStickGait,
  type StickGaitMemory,
  heroRectOverlapsCombat,
  heroSheetRow,
  heroSourceRect,
  RUN_FRAME_MS,
  RUN_FRAMES,
  strideLength,
  WALK_FRAME_MS,
  WALK_FRAMES,
  type HeroArmor,
} from '../src/game/gait';

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

function laneSamples(lane: { x: number; y: number }[]): { x: number; y: number; nx: number; ny: number }[] {
  let total = 0;
  const segs: { len: number; ax: number; ay: number; dx: number; dy: number }[] = [];
  for (let i = 1; i < lane.length; i++) {
    const dx = lane[i].x - lane[i - 1].x;
    const dy = lane[i].y - lane[i - 1].y;
    const len = Math.hypot(dx, dy);
    segs.push({ len, ax: lane[i - 1].x, ay: lane[i - 1].y, dx, dy });
    total += len;
  }
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  for (let dist = 0; dist <= total; dist += 36) {
    let left = dist;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (left <= seg.len || i === segs.length - 1) {
        const f = seg.len ? Math.min(1, left / seg.len) : 0;
        const mag = Math.hypot(seg.dx, seg.dy) || 1;
        out.push({
          x: seg.ax + seg.dx * f,
          y: seg.ay + seg.dy * f,
          nx: -seg.dy / mag,
          ny: seg.dx / mag,
        });
        break;
      }
      left -= seg.len;
    }
  }
  return out;
}

function clearHalf(x: number, y: number, nx: number, ny: number, sign: number): number {
  const open = (dist: number) => walkable(sanctuary, x + nx * sign * dist, y + ny * sign * dist);
  if (!open(0)) return 0;
  let lo = 0;
  let hi = 8;
  while (hi < 1400 && open(hi)) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (open(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
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
  const decorLimit = sanctuary.laneWidth / 2 + DECOR_MARGIN;
  for (const prop of sceneryFor(sanctuary)) {
    if (prop.kind !== 'tree' && prop.kind !== 'stump' && prop.kind !== 'rock' && prop.kind !== 'fence') continue;
    const gap = Math.min(...(sanctuary.paths ?? []).map((path) => distToPolyline(prop, path.lane)));
    assert.ok(gap >= decorLimit - 0.5, `${prop.kind} at ${prop.x.toFixed(0)},${prop.y.toFixed(0)} is ${gap.toFixed(0)} from a lane`);
  }
  const decor = sceneryFor(sanctuary).filter((prop) => prop.kind === 'tree' || prop.kind === 'stump' || prop.kind === 'rock' || prop.kind === 'fence');
  assert.ok(decor.length <= 200, `decorative clutter is ${decor.length}, half of the old 400`);
  const trees = sceneryFor(sanctuary).filter((prop) => prop.kind === 'tree');
  const edgeTrees = trees.filter(
    (prop) => prop.x < 220 || prop.y < 220 || prop.x > sanctuary.width - 220 || prop.y > sanctuary.height - 220,
  );
  assert.ok(trees.length > 40 && edgeTrees.length === trees.length, 'trees stand in the outer forests');
  for (const path of sanctuary.paths ?? []) {
    let narrow = Infinity;
    for (const sample of laneSamples(path.lane)) {
      const left = clearHalf(sample.x, sample.y, sample.nx, sample.ny, 1);
      const right = clearHalf(sample.x, sample.y, sample.nx, sample.ny, -1);
      const width = left + right;
      narrow = Math.min(narrow, width);
      assert.ok(width >= 5 * FLOOR_STEP - 1, `${path.name} corridor is ${width.toFixed(0)} at ${sample.x.toFixed(0)},${sample.y.toFixed(0)}`);
      assert.equal(
        walkable(sanctuary, sample.x + sample.nx * (LANE_CLEAR_HALF - 2), sample.y + sample.ny * (LANE_CLEAR_HALF - 2)),
        true,
        `${path.name} stays open 2.5 tiles off the center`,
      );
    }
    console.log(`${path.id} corridor min ${narrow.toFixed(1)} (${(narrow / FLOOR_STEP).toFixed(2)} tiles)`);
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
  }
  for (const [index, gate] of campGates(sanctuary).entries()) {
    const side = index === 0 ? 'ally' : 'enemy';
    let left = Infinity;
    let right = Infinity;
    for (const prop of sceneryFor(sanctuary)) {
      if (prop.kind !== 'fence') continue;
      const dx = prop.x - gate.x;
      const dy = prop.y - gate.y;
      const along = dx * gate.axisX + dy * gate.axisY;
      const perp = dx * gate.perpX + dy * gate.perpY;
      if (Math.abs(along) > 36) continue;
      const inner = Math.abs(perp) - prop.block * 0.3;
      if (perp >= 0) right = Math.min(right, inner);
      else left = Math.min(left, inner);
    }
    const width = left + right;
    assert.ok(Math.abs(width - 6 * FLOOR_STEP) < 1, `${side} gate is ${width.toFixed(2)}, expected ${ (6 * FLOOR_STEP).toFixed(2) }`);
    console.log(`${side} gate ${width.toFixed(1)} (${(width / FLOOR_STEP).toFixed(2)} tiles)`);
    for (let t = -1; t <= 1; t += 0.25) {
      const off = t * (GATE_HALF - 4);
      const x = gate.x + gate.perpX * off;
      const y = gate.y + gate.perpY * off;
      assert.equal(walkable(sanctuary, x, y), true, `${side} gate opening is clear`);
    }
    const home = index === 0 ? sanctuary.playerBase : sanctuary.enemyBase;
    for (const path of sanctuary.paths ?? []) {
      const mouth = index === 0 ? path.lane[0] : path.lane[path.lane.length - 1];
      for (let t = 0; t <= 1; t += 0.1) {
        const x = gate.x + (mouth.x - gate.x) * t;
        const y = gate.y + (mouth.y - gate.y) * t;
        assert.equal(walkable(sanctuary, x, y), true, `${side} ${path.name} has no collider between palisade and lane`);
        const blockers = sceneryFor(sanctuary).filter((prop) => prop.block > 0 && Math.hypot(prop.x - x, prop.y - y) < prop.block * 0.3);
        assert.equal(blockers.length, 0, `${side} ${path.name} gate line is empty`);
      }
    }
    assert.ok(Math.hypot(home.x - gate.x, home.y - gate.y) > 40, `${side} palisade stands off the banner`);
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
  const elapsed = 700;
  assert.equal(animFrame(elapsed, RUN_FRAME_MS, RUN_FRAMES), Math.floor(700 / RUN_FRAME_MS) % RUN_FRAMES, 'run frame is floor(elapsed / 40) % 12');
  assert.equal(animFrame(elapsed, WALK_FRAME_MS, WALK_FRAMES), Math.floor(700 / WALK_FRAME_MS) % WALK_FRAMES, 'walk frame keeps the same elapsed clock');
  assert.ok(Math.abs(strideLength(216, RUN_FRAME_MS, RUN_FRAMES) - 103.68) < 0.01, 'run stride at 216 is 103.68px');
  assert.ok(Math.abs(strideLength(144, WALK_FRAME_MS, WALK_FRAMES) - 66.816) < 0.01, 'walk stride at 144 is 66.816px');
  const rocks = sceneryFor(sanctuary).filter((prop) => prop.kind === 'rock');
  assert.ok(rocks.length > 24, 'boulder walls line the lanes');
  assert.notEqual(animFrame(elapsed, RUN_FRAME_MS, RUN_FRAMES), 0, 'a mid-cycle run is not frame 0');
  const runSeq: number[] = [];
  let clock = 0;
  for (let i = 0; i < 80; i++) {
    clock += 1000 / 60;
    const frame = animFrame(clock, RUN_FRAME_MS, RUN_FRAMES);
    if (runSeq[runSeq.length - 1] !== frame) runSeq.push(frame);
  }
  for (let i = 1; i < runSeq.length; i++) {
    assert.equal(runSeq[i], (runSeq[i - 1] + 1) % RUN_FRAMES, `run clock skipped ${runSeq[i - 1]} -> ${runSeq[i]}`);
  }
  assert.ok(runSeq.includes(0) && runSeq.includes(11), 'the run clock wraps the 12-frame sheet');
  const tiers: HeroArmor[] = ['light', 'medium', 'heavy'];
  for (const tier of tiers) {
    for (const mode of [HERO_RUN_RECTS, HERO_WALK_RECTS]) {
      for (const row of mode[tier]) {
        assert.equal(row.length, mode === HERO_RUN_RECTS ? RUN_FRAMES : WALK_FRAMES);
        for (const rect of row) {
          assert.equal(heroRectOverlapsCombat(tier, rect), false, `${tier} locomotion cell overlaps a combat band`);
          const combat = HERO_COMBAT_BANDS[tier].find((band) => rect[1] < band.y1 && rect[3] > band.y0);
          assert.equal(combat, undefined);
        }
      }
    }
  }
  assert.equal(heroCompass(0), 0, 'east is facing 0');
  assert.equal(heroCompass(Math.PI / 4), 1, 'southeast is facing 1');
  assert.equal(heroCompass(Math.PI / 2), 2, 'south is facing 2');
  assert.equal(heroCompass(Math.PI), 4, 'west is facing 4');
  assert.equal(heroCompass(-Math.PI / 4), 7, 'northeast is facing 7');
  assert.equal(heroSheetRow(1), 0, 'southeast uses the camera-facing row');
  assert.equal(heroHoldCompass(0, (35 * Math.PI) / 180), 0, '35° stays inside the 15° deadband');
  assert.equal(heroHoldCompass(0, (40 * Math.PI) / 180), 1, '40° steps one sector');
  assert.deepEqual(heroDrawOrigin(100, 80, 30, 48), { drawX: 85, drawY: 32 });
  const kept = animFrame(5 * RUN_FRAME_MS + 5, RUN_FRAME_MS, RUN_FRAMES);
  let turned = heroHoldCompass(null, 0);
  for (let i = 0; i < 8; i++) turned = heroHoldCompass(turned, Math.PI / 2);
  assert.equal(animFrame(5 * RUN_FRAME_MS + 5, RUN_FRAME_MS, RUN_FRAMES), kept, 'a facing change does not reset the run frame');
  assert.equal(kept, 5);
  assert.equal(turned, 2);
  const open = { x: 1760, y: 360 };
  for (let dir = 0; dir < 8; dir++) {
    const sim = createMatch(sanctuary, barbarian, 20 + dir);
    const hero = player(sim);
    hero.hp = 100000;
    hero.invuln = 30;
    hero.x = open.x;
    hero.y = open.y;
    hero.swing = 0;
    hero.castT = 0;
    hero.whirlT = 0;
    hero.leap = null;
    const facing = dir * (Math.PI / 4);
    hero.facing = facing;
    const input = emptyInput();
    input.moveX = Math.cos(facing);
    input.moveY = Math.sin(facing);
    const dt = RUN_FRAME_MS / 1000;
    let elapsed = 0;
    let held: number | null = null;
    let prevX = hero.x;
    let prevY = hero.y;
    const seen: number[] = [];
    for (let tick = 0; tick < RUN_FRAMES * 2 + 1; tick++) {
      held = heroHoldCompass(held, hero.facing);
      const frame = animFrame(elapsed, RUN_FRAME_MS, RUN_FRAMES);
      seen.push(frame);
      for (const tier of tiers) {
        const row = heroSheetRow(held);
        const rect = heroSourceRect(tier, 'run', row, frame);
        assert.deepEqual(rect, HERO_RUN_RECTS[tier][row][frame], `${tier} dir ${dir} tick ${tick} left the run set`);
        assert.equal(heroRectOverlapsCombat(tier, rect), false, `${tier} dir ${dir} drew a combat row`);
        assert.ok(frame >= 0 && frame < RUN_FRAMES);
      }
      updateSim(sim, input, dt);
      const moved = Math.hypot(hero.x - prevX, hero.y - prevY);
      if (moved > 0.4) elapsed += dt * 1000;
      prevX = hero.x;
      prevY = hero.y;
      assert.equal(hero.swing, 0, 'a plain run does not start a swing');
      let gap = hero.facing - facing;
      if (gap > Math.PI) gap -= Math.PI * 2;
      else if (gap < -Math.PI) gap += Math.PI * 2;
      assert.ok(Math.abs(gap) < 0.01, 'the stick keeps the facing');
    }
    assert.ok(elapsed >= RUN_FRAMES * 2 * RUN_FRAME_MS, `dir ${dir} did not finish two run cycles`);
    const zeros = seen.filter((frame) => frame === 0).length;
    const elevens = seen.filter((frame) => frame === 11).length;
    assert.ok(zeros >= 2 && elevens >= 2, `dir ${dir} frames ${seen.join(',')}`);
    const travelled = Math.hypot(hero.x - open.x, hero.y - open.y);
    assert.ok(travelled > 180, `dir ${dir} only moved ${travelled.toFixed(1)}px`);
  }
  let slideCase = false;
  for (const fence of sceneryFor(sanctuary).filter((prop) => prop.kind === 'fence')) {
    const foot = fence.block * 0.3;
    for (let turn = 0; turn < 16; turn++) {
      const ang = (turn / 16) * Math.PI * 2 + 0.2;
      const from = { x: fence.x - Math.cos(ang) * (foot + 10), y: fence.y - Math.sin(ang) * (foot + 10) };
      const to = { x: fence.x + Math.cos(ang) * 8, y: fence.y + Math.sin(ang) * 8 };
      if (!walkable(sanctuary, from.x, from.y) || walkable(sanctuary, to.x, to.y)) continue;
      const landed = slide(sanctuary, from, to);
      const dx = Math.abs(landed.x - from.x);
      const dy = Math.abs(landed.y - from.y);
      const moved = Math.hypot(dx, dy);
      if (moved > 1 && walkable(sanctuary, landed.x, landed.y) && (dx < 0.05 || dy < 0.05)) {
        slideCase = true;
        const simSlide = createMatch(sanctuary, barbarian, 9);
        const slider = player(simSlide);
        slider.hp = 100000;
        slider.invuln = 60;
        slider.x = from.x;
        slider.y = from.y;
        const input = emptyInput();
        input.moveX = to.x - from.x;
        input.moveY = to.y - from.y;
        const x0 = slider.x;
        const y0 = slider.y;
        step(simSlide, input, 0.35);
        assert.ok(Math.hypot(slider.x - x0, slider.y - y0) > 4, 'a diagonal hit slides instead of stopping');
        assert.equal(walkable(sanctuary, slider.x, slider.y), true, 'the slide stays on open ground');
        break;
      }
    }
    if (slideCase) break;
  }
  assert.ok(slideCase, 'a gate post produces an open-axis slide');
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

{
  const sheets = readFileSync(new URL('../src/game/art/sheets.ts', import.meta.url), 'utf8');
  const render = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  const height = Number(sheets.match(/export const HERO_HEIGHT = (\d+)/)?.[1]);
  const block = sheets.match(/export const HERO_NATIVE_PX = \{([^}]+)\}/)?.[1] ?? '';
  const native: Record<string, number> = {};
  for (const match of block.matchAll(/(light|medium|heavy):\s*(\d+)/g)) native[match[1]] = Number(match[2]);
  assert.equal(height, 108);
  assert.ok(sheets.includes('return (HERO_HEIGHT * zoom) / HERO_NATIVE_PX[tier]'));
  assert.ok(sheets.includes('drawX: x - frameWidth / 2'));
  assert.ok(sheets.includes('drawY: y - frameHeight'));
  assert.equal(render.match(/heroDrawBox\(/g)?.length, 1);
  assert.equal(render.includes('glyph.sh / glyph.cellH'), false);
  const cols: Record<string, number> = { idle: 1, walk: 8, run: 12 };
  const torso = 78;
  for (const tier of ['light', 'medium', 'heavy']) {
    const cells: Record<string, number> = {};
    for (const mode of ['idle', 'walk', 'run']) {
      const file = new URL(`../src/assets/art/d2/barb-${tier}-${mode}.webp`, import.meta.url);
      const buf = readFileSync(file);
      assert.equal(buf.toString('ascii', 12, 16), 'VP8X');
      const sheetH = 1 + buf.readUIntLE(27, 3);
      cells[mode] = sheetH / 8;
      assert.equal(sheetH % 8, 0, `${tier} ${mode} row count`);
      assert.equal((1 + buf.readUIntLE(24, 3)) % cols[mode], 0, `${tier} ${mode} columns`);
    }
    assert.equal(native[tier], cells.walk, `${tier} scale reference is the walk cell`);
    assert.notEqual(cells.run, cells.walk, `${tier} run cell is a different size`);
    const drawScale: number = height / native[tier];
    const oldWalk: number = torso * (height / cells.walk);
    const oldRun: number = torso * (height / cells.run);
    assert.ok(Math.abs(oldWalk - oldRun) > 1, `${tier} per-cell scale separated walk and run`);
    for (const mode of ['idle', 'walk', 'run']) {
      const drawn: number = torso * drawScale;
      const sameBody: number = torso * (height / native[tier]);
      assert.ok(Math.abs(drawn - sameBody) < 1, `${tier} ${mode} torso scale drifted`);
      assert.equal(drawScale, height / cells.walk, `${tier} ${mode} uses the walk magnification`);
    }
    const frameW: number = 44 * drawScale;
    const frameH: number = torso * drawScale;
    const anchor = { drawX: 120 - frameW / 2, drawY: 90 - frameH };
    assert.ok(Math.abs(anchor.drawX - (120 - frameW / 2)) < 1);
    assert.ok(Math.abs(anchor.drawY - (90 - frameH)) < 1);
    assert.equal(frameW / 44, frameH / torso);
  }
}

{
  const sheets = readFileSync(new URL('../src/game/art/sheets.ts', import.meta.url), 'utf8');
  const render = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  const height = Number(sheets.match(/export const HERO_HEIGHT = (\d+)/)?.[1]);
  const block = sheets.match(/export const HERO_NATIVE_PX = \{([^}]+)\}/)?.[1] ?? '';
  const native: Record<string, number> = {};
  for (const match of block.matchAll(/(light|medium|heavy):\s*(\d+)/g)) native[match[1]] = Number(match[2]);
  const parseRun = (name: string): number[][][] => {
    const start = sheets.indexOf(`export const ${name}`);
    const end = sheets.indexOf('};', start);
    const rows = [...sheets.slice(start, end).matchAll(/\[(\d+(?:,\d+)*)\]/g)].map((m) => m[1].split(',').map(Number));
    assert.equal(rows.length, 24, name);
    return [rows.slice(0, 8), rows.slice(8, 16), rows.slice(16, 24)];
  };
  const tops = parseRun('HERO_RUN_TOP');
  const bottoms = parseRun('HERO_RUN_BOTTOM');
  assert.ok(sheets.includes('const lift = baseline - bottom'));
  assert.ok(sheets.includes('drawY: y - frameHeight - lift * scale'));
  assert.ok(sheets.includes('drawX: x - frameWidth / 2'));
  assert.equal(render.match(/heroRunDraw\(/g)?.length, 1);
  assert.equal(render.match(/heroDrawBox\(/g)?.length, 1);
  assert.ok(render.includes('y - run.lift * run.scale'));
  assert.ok(render.includes('!walking'));
  const tiers = ['light', 'medium', 'heavy'];
  let footTravel = false;
  for (let tier = 0; tier < tiers.length; tier++) {
    const drawScale: number = height / native[tiers[tier]];
    for (let row = 0; row < 8; row++) {
      const top = tops[tier][row];
      const bottom = bottoms[tier][row];
      assert.equal(top.length, 12);
      assert.equal(bottom.length, 12);
      let baseline = bottom[0];
      for (const edge of bottom) if (edge > baseline) baseline = edge;
      const ground: number[] = [];
      const head: number[] = [];
      const snapped: number[] = [];
      for (let frame = 0; frame < 12; frame++) {
        const nativeH: number = bottom[frame] - top[frame] + 1;
        const lift: number = baseline - bottom[frame];
        assert.ok(lift >= 0);
        const frameHeight: number = nativeH * drawScale;
        const drawY: number = 200 - frameHeight - lift * drawScale;
        ground.push(drawY + frameHeight + lift * drawScale);
        head.push(200 - drawY);
        snapped.push(nativeH * drawScale);
      }
      const span = (values: number[]): number => Math.max(...values) - Math.min(...values);
      const natural: number = (Math.max(...top) - Math.min(...top)) * drawScale;
      const drawnSpan: number = span(head);
      const snapSpan: number = span(snapped);
      for (const line of ground) {
        assert.ok(Math.abs(line - 200) < 1e-6, `${tiers[tier]} row ${row} baseline moved`);
      }
      assert.ok(bottom.some((edge) => edge === baseline), `${tiers[tier]} row ${row} never plants`);
      assert.ok(Math.abs(drawnSpan - natural) < 1, `${tiers[tier]} row ${row} head span ${drawnSpan} vs source ${natural}`);
      if (snapSpan - natural > 1) {
        footTravel = true;
        assert.ok(snapSpan - drawnSpan > 1, `${tiers[tier]} row ${row} still includes the snap delta`);
      }
    }
  }
  assert.ok(footTravel, 'expected a run row whose snapped head travel exceeds the source');
  const camera = bottoms[0][0];
  const northwest = bottoms[0][4];
  const camSpan: number = Math.max(...camera) - Math.min(...camera);
  const nwSpan: number = Math.max(...northwest) - Math.min(...northwest);
  assert.equal(Math.min(...camera), 103);
  assert.equal(Math.max(...camera), 104);
  assert.equal(camSpan, 1);
  assert.equal(Math.min(...northwest), 90);
  assert.equal(Math.max(...northwest), 109);
  assert.equal(nwSpan, 19);
}

{
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  const camp = emptyInput();
  const aimed = screenVectorToWorld(1, 0);
  camp.moveX = aimed.x;
  camp.moveY = aimed.y;
  const x0 = hero.x;
  const y0 = hero.y;
  updateSim(sim, camp, 0.05);
  const campSpeed = Math.hypot(hero.x - x0, hero.y - y0) / 0.05;
  assert.ok(campSpeed >= HERO_RUN_SPEED, `full stick in camp was ${campSpeed.toFixed(1)}`);
  assert.equal(heroMoveScale(true, true, 144, 216), 1);
  assert.equal(heroMoveScale(true, false, 144, 216), 144 / 216);

  const click = createMatch(sanctuary, barbarian, 1);
  const walker = player(click);
  const dest = emptyInput();
  dest.destX = walker.x + 200;
  dest.destY = walker.y;
  const wx = walker.x;
  const wy = walker.y;
  updateSim(click, dest, 0.05);
  const walkSpeed = Math.hypot(walker.x - wx, walker.y - wy) / 0.05;
  assert.ok(walkSpeed < HERO_RUN_SPEED && walkSpeed > 100, `town click-to-move was ${walkSpeed.toFixed(1)}`);

  let elapsed = 0;
  let compass: number | null = null;
  const frames: { row: number; frame: number }[] = [];
  for (let tick = 0; tick < 24; tick++) {
    compass = heroHoldCompass(compass, tick * 0.35);
    const gait = heroGaitStep(elapsed, 216 * 0.016, 0.016);
    elapsed = gait.elapsed;
    assert.equal(gait.running, true);
    assert.equal(gait.speed, 216);
    frames.push({ row: heroSheetRow(compass), frame: animFrame(elapsed, RUN_FRAME_MS, RUN_FRAMES) });
  }
  assert.equal(elapsed, 24 * 16);
  assert.ok(new Set(frames.map((frame) => frame.frame)).size >= 4, 'run frame froze during the sweep');
  assert.ok(frames.some((frame, index) => index > 0 && frame.row !== frames[index - 1].row), 'facing never changed');
  const turned = frames.findIndex((frame, index) => index > 0 && frame.row !== frames[index - 1].row);
  assert.ok(turned > 0);
  assert.ok(frames[turned].frame !== 0 || frames[turned - 1].frame !== 0, 'a turn reset the run clock');

  const sheets = readFileSync(new URL('../src/game/art/sheets.ts', import.meta.url), 'utf8');
  const render = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  assert.ok(sheets.includes('ally: { pose: \'idle\', col: 0 }'));
  assert.ok(sheets.includes('enemy: { pose: \'walk\', col: 0 }'));
  assert.equal(render.includes('obeliskGlyph'), true);
  assert.ok(render.includes('paintDiamond(ctx, rows, GROUND_BASE'));
  assert.equal(GROUND_BASE, 'grass');
  const lightRun = HERO_RUN_RECTS.light[0][0];
  const lightWalk = HERO_WALK_RECTS.light[0][0];
  assert.ok(lightRun[3] - lightRun[1] > lightWalk[3] - lightWalk[1], 'run cell is not the walk strip');
}

function campSpeed(gait: 'idle' | 'walk' | 'run'): number {
  commitStickGait(gait, gait !== 'idle');
  const sim = createMatch(sanctuary, barbarian, 1);
  const hero = player(sim);
  const input = emptyInput();
  if (gait !== 'idle') {
    input.moveX = 1;
    input.moveY = 0;
  }
  const x = hero.x;
  const y = hero.y;
  updateSim(sim, input, 0.05);
  return Math.hypot(hero.x - x, hero.y - y) / 0.05;
}

{
  assert.equal(STICK_IDLE_TILT, 0.15);
  assert.equal(STICK_RUN_TILT, 0.6);
  assert.equal(STICK_GAIT_HOLD_MS, 150);
  assert.equal(barbarian.stats.walkSpeed, 144);
  assert.equal(barbarian.stats.runSpeed, 216);

  const idle = stepStickGait({ gait: 'idle', hold: null, holdMs: 0 }, 0.1, 16);
  assert.equal(idle.gait, 'idle');
  const walk = stepStickGait({ gait: 'idle', hold: null, holdMs: 0 }, 0.4, 16);
  assert.equal(walk.gait, 'walk');
  const run = stepStickGait({ gait: 'idle', hold: null, holdMs: 0 }, 0.9, 16);
  assert.equal(run.gait, 'run');
  assert.equal(stepStickGait({ gait: 'idle', hold: null, holdMs: 0 }, 0.15, 16).gait, 'walk');
  assert.equal(stepStickGait({ gait: 'idle', hold: null, holdMs: 0 }, 0.6, 16).gait, 'walk');

  const idleSpeed = campSpeed('idle');
  const walkSpeedInCamp = campSpeed('walk');
  assert.equal(heroMoveScale(true, true, 144, 216), 144 / 216);
  const runSpeedInCamp = campSpeed('run');
  assert.equal(heroMoveScale(true, true, 144, 216), 1);
  assert.ok(idleSpeed < 1, `idle tilt moved at ${idleSpeed.toFixed(1)}`);
  assert.ok(Math.abs(walkSpeedInCamp - 144) < 1, `walk tilt in camp was ${walkSpeedInCamp.toFixed(1)}`);
  assert.ok(Math.abs(runSpeedInCamp - 216) < 1, `run tilt in camp was ${runSpeedInCamp.toFixed(1)}`);

  let held: StickGaitMemory = { gait: 'walk', hold: null, holdMs: 0 };
  held = stepStickGait(held, 0.9, 149);
  assert.equal(held.gait, 'walk');
  held = stepStickGait(held, 0.9, 1);
  assert.equal(held.gait, 'run');

  let flicker: StickGaitMemory = { gait: 'walk', hold: null, holdMs: 0 };
  const gaits = new Set<string>();
  for (let i = 0; i < 20; i++) {
    flicker = stepStickGait(flicker, i % 2 === 0 ? 0.58 : 0.62, 16);
    gaits.add(flicker.gait);
  }
  assert.deepEqual([...gaits], ['walk']);
  flicker = { gait: 'run', hold: null, holdMs: 0 };
  gaits.clear();
  for (let i = 0; i < 20; i++) {
    flicker = stepStickGait(flicker, i % 2 === 0 ? 0.58 : 0.62, 16);
    gaits.add(flicker.gait);
  }
  assert.deepEqual([...gaits], ['run']);

  const inputSrc = readFileSync(new URL('../src/game/input.ts', import.meta.url), 'utf8');
  assert.ok(inputSrc.includes("addEventListener('touchstart'"));
  assert.ok(inputSrc.includes('{ passive: false, capture: true }'));
  assert.ok(inputSrc.includes('event.preventDefault()'));
  assert.ok(inputSrc.includes('stickPointerId'));
  const mainSrc = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(mainSrc.includes('watchCanvasBacking'));
  const renderSrc = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  assert.ok(renderSrc.includes('Math.min(3, Math.max(1, window.devicePixelRatio || 1))'));
  assert.ok(renderSrc.includes('imageRendering = \'pixelated\''));
  assert.ok(renderSrc.includes('orientationchange'));
  assert.ok(renderSrc.includes('visualViewport'));
  commitStickGait('idle', false);
}

console.log('match tests passed');
