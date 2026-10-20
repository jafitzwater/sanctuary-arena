import { TOWER_TIERS, type ActDef, type DenSpawn, type PathDef, type SealSpawn } from './data/acts/types';
import { paceOf } from './pace';
import type { ClassDef } from './data/classes/types';
import { unitDef } from './data/units';
import { Rng } from './math';
import { clampToPlayable } from './lane';
import {
  banner,
  damageUnit,
  heroNumbers,
  inShopRange,
  manaCost,
  recomputeHero,
  ring,
  sfx,
  tryAssignBelt,
  tryBuy,
  tryPotion,
  trySpendAttribute,
  tryUpgrade,
} from './combat';
import { byId, findBase, inRange, isStructure, nearestEnemy, player } from './query';
import { SKILLS } from './skills';
import type { FrameInput, Sim, Team, Unit } from './types';

const PASSIVE_GOLD = 1.4;

export function createMatch(map: ActDef, classDef: ClassDef, seed = 1): Sim {
  const sim: Sim = {
    map,
    classDef,
    seed,
    time: 0,
    units: [],
    projectiles: [],
    fx: [],
    nextId: 1,
    playerId: 0,
    enemyChampionId: 0,
    gold: 175,
    xp: 0,
    level: 1,
    skillPoints: 0,
    skillRanks: {},
    cooldowns: {},
    attributes: {
      str: classDef.stats.str,
      dex: classDef.stats.dex,
      vit: classDef.stats.vit,
      energy: classDef.stats.energy,
    },
    statPoints: 0,
    belt: [...classDef.startingBelt],
    potions: { health: 0, mana: 0 },
    loadout: { weapon: null, offhand: null, armor: null, helm: null, belt: null },
    phase: 'playing',
    waveIn: map.waves.first,
    announcedWave: false,
    pace: 'Normal',
    denIn: [],
    dragonIn: 18,
    dragonStep: 0,
    heraldIn: 22,
    heraldCount: 0,
    shrineIn: (map.shrines ?? []).map(() => 0),
    banner: null,
    tip: 'Last-hit Fallen for gold. Points spends skills and stats. Shop at the Encampment.',
    tipT: 9,
    cs: 0,
    kills: 0,
    deaths: 0,
    sfx: [],
    shake: 0,
  };
  for (const skill of classDef.skills) {
    sim.skillRanks[skill.id] = 0;
    sim.cooldowns[skill.id] = 0;
  }
  const starter = classDef.skills.find((skill) => skill.starter) ?? classDef.skills[0];
  if (starter) sim.skillRanks[starter.id] = 1;

  spawnBase(sim, 'ally');
  spawnBase(sim, 'enemy');
  for (const tower of map.towers) spawnTower(sim, tower);
  sim.playerId = spawnPlayer(sim).id;
  sim.enemyChampionId = spawnEnemyChampion(sim).id;
  for (const den of map.dens ?? []) {
    spawnDen(sim, den);
    sim.denIn[den.id] = den.respawn;
  }
  for (const seal of map.seals ?? []) spawnSeal(sim, seal);
  return sim;
}

function blankUnit(sim: Sim, partial: Pick<Unit, 'defId' | 'kind' | 'team' | 'name'> & Partial<Unit>): Unit {
  const unit: Unit = {
    id: sim.nextId++,
    defId: partial.defId,
    kind: partial.kind,
    team: partial.team,
    name: partial.name,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    radius: partial.radius ?? 16,
    hp: partial.hp ?? 1,
    maxHp: partial.maxHp ?? partial.hp ?? 1,
    mana: partial.mana ?? 0,
    maxMana: partial.maxMana ?? partial.mana ?? 0,
    ad: partial.ad ?? 0,
    armor: partial.armor ?? 0,
    moveSpeed: partial.moveSpeed ?? 0,
    attackRange: partial.attackRange ?? 0,
    attackInterval: partial.attackInterval ?? 1,
    attackCd: partial.attackCd ?? 0,
    aggro: partial.aggro ?? 0,
    gold: partial.gold ?? 0,
    xp: partial.xp ?? 0,
    alive: partial.alive ?? true,
    ranged: partial.ranged ?? false,
    projectileSpeed: partial.projectileSpeed ?? 420,
    waypoint: partial.waypoint ?? 0,
    path: partial.path ?? 0,
    pack: partial.pack ?? 0,
    anchorX: partial.anchorX ?? 0,
    anchorY: partial.anchorY ?? 0,
    affix: partial.affix ?? '',
    objective: partial.objective ?? '',
    mightT: 0,
    guardT: 0,
    haste: 0,
    recall: 0,
    targetId: null,
    facing: partial.facing ?? 0,
    swing: 0,
    hitFlash: 0,
    stun: 0,
    slow: 0,
    slowPct: 0,
    buffT: 0,
    buffDmg: 0,
    buffArmor: 0,
    bashT: 0,
    invuln: partial.invuln ?? 0,
    whirlT: 0,
    whirlTick: 0,
    whirlRank: 0,
    leap: null,
    wclass: partial.wclass ?? 'HTH',
    castT: 0,
    boT: 0,
    frenzyT: 0,
    berserkT: 0,
    concentrateT: 0,
    commandT: 0,
    tauntT: 0,
    findGold: 0,
    combat: 0,
    respawn: 0,
    corpse: 0,
    color: partial.color ?? '#888',
    accent: partial.accent ?? '#fff',
  };
  sim.units.push(unit);
  return unit;
}

function spawnBase(sim: Sim, team: Team): Unit {
  const spec = team === 'ally' ? sim.map.playerBase : sim.map.enemyBase;
  return blankUnit(sim, {
    defId: team === 'ally' ? 'base-ally' : 'base-enemy',
    kind: 'base',
    team,
    name: spec.name,
    x: spec.x,
    y: spec.y,
    radius: spec.radius,
    hp: spec.hp,
    maxHp: spec.hp,
    ad: spec.ad,
    armor: spec.armor,
    attackRange: spec.attackRange,
    attackInterval: spec.attackInterval,
    aggro: spec.attackRange,
    gold: spec.gold,
    xp: spec.xp,
    ranged: true,
    projectileSpeed: 520,
    color: team === 'ally' ? '#d4b46a' : '#c44536',
    accent: team === 'ally' ? '#f0e2bc' : '#ffb0a4',
  });
}

function spawnTower(sim: Sim, spec: ActDef['towers'][number]): Unit {
  const tier = TOWER_TIERS[spec.tier];
  return blankUnit(sim, {
    defId: 'tower',
    kind: 'tower',
    team: spec.team,
    name: spec.name,
    x: spec.x,
    y: spec.y,
    radius: tier.radius,
    hp: tier.hp,
    maxHp: tier.hp,
    ad: tier.ad,
    armor: tier.armor,
    attackRange: tier.range,
    attackInterval: tier.interval,
    aggro: tier.range,
    gold: tier.gold,
    xp: tier.xp,
    ranged: true,
    projectileSpeed: 560,
    path: pathIndex(sim, spec.path),
    color: spec.team === 'ally' ? '#d4b46a' : '#c44536',
    accent: spec.team === 'ally' ? '#f4e7c3' : '#ffb4a8',
  });
}

function spawnPlayer(sim: Sim): Unit {
  const stats = sim.classDef.stats;
  const built = heroNumbers(sim, { bo: false, berserk: false });
  const base = sim.map.playerBase;
  return blankUnit(sim, {
    defId: sim.classDef.id,
    kind: 'champion',
    team: 'ally',
    name: sim.classDef.name,
    x: base.x + 150,
    y: base.y,
    radius: stats.radius,
    hp: built.hp,
    maxHp: built.hp,
    mana: built.mana,
    maxMana: built.mana,
    ad: built.ad,
    armor: built.armor,
    moveSpeed: built.moveSpeed,
    attackRange: built.attackRange,
    attackInterval: built.attackInterval,
    wclass: built.wclass,
    aggro: 360,
    gold: 0,
    xp: 0,
    ranged: false,
    facing: 0,
    color: sim.classDef.colors.cloth,
    accent: sim.classDef.colors.metal,
  });
}

function spawnEnemyChampion(sim: Sim): Unit {
  const spec = sim.map.enemyChampion;
  const base = sim.map.enemyBase;
  return blankUnit(sim, {
    defId: 'blood-raven',
    kind: 'champion',
    team: 'enemy',
    name: spec.name,
    x: base.x - 170,
    y: base.y,
    radius: spec.radius,
    hp: spec.hp,
    maxHp: spec.hp,
    ad: spec.ad,
    armor: spec.armor,
    moveSpeed: spec.moveSpeed,
    attackRange: spec.attackRange,
    attackInterval: spec.attackInterval,
    aggro: 420,
    gold: spec.gold,
    xp: spec.xp,
    ranged: true,
    projectileSpeed: spec.projectileSpeed,
    waypoint: (sim.map.paths?.[1]?.lane ?? sim.map.lane).length - 2,
    path: sim.map.paths ? 1 : 0,
    facing: Math.PI,
    color: spec.color,
    accent: spec.accent,
  });
}

export function spawnMinion(sim: Sim, defId: string, team: Team, x: number, y: number, path = 0): Unit {
  const def = unitDef(defId);
  const spot = clampToPlayable(sim.map, x, y);
  const lane = laneAt(sim, path);
  const scaled = paceOf(sim.time);
  const hp = Math.max(1, Math.round(def.hp * scaled.hp));
  const ad = Math.max(1, Math.round(def.ad * scaled.ad));
  return blankUnit(sim, {
    defId,
    kind: 'minion',
    team,
    name: def.name,
    x: spot.x,
    y: spot.y,
    radius: def.radius,
    hp,
    maxHp: hp,
    ad,
    armor: def.armor,
    moveSpeed: def.moveSpeed,
    attackRange: def.attackRange,
    attackInterval: def.attackInterval,
    attackCd: new Rng((sim.nextId * 17 + sim.seed) | 0).next() * def.attackInterval,
    aggro: def.aggro,
    gold: def.gold,
    xp: def.xp,
    ranged: def.ranged,
    projectileSpeed: def.projectileSpeed || 440,
    waypoint: team === 'ally' ? 1 : lane.length - 2,
    path,
    facing: team === 'ally' ? 0 : Math.PI,
    color: def.color,
    accent: def.accent,
  });
}

export function updateSim(sim: Sim, input: FrameInput, dt: number): void {
  if (sim.phase !== 'playing') return;
  const step = Math.max(0, Math.min(dt, 0.05));
  sim.time += step;

  for (const id of Object.keys(sim.cooldowns)) {
    sim.cooldowns[id] = Math.max(0, sim.cooldowns[id] - step);
  }
  if (sim.banner) {
    sim.banner.t -= step;
    if (sim.banner.t <= 0) sim.banner = null;
  }
  sim.tipT = Math.max(0, sim.tipT - step);
  if (sim.tipT <= 0) sim.tip = '';
  sim.shake = Math.max(0, sim.shake - step * 14);

  for (const unit of sim.units) tickStatus(sim, unit, step);
  for (const unit of sim.units) {
    if (unit.leap) advanceLeap(sim, unit, step);
  }

  const pace = paceOf(sim.time);
  if (pace.name !== sim.pace) {
    sim.pace = pace.name;
    banner(sim, pace.name === 'Nightmare' ? 'The wilds turn to Nightmare.' : 'Hell walks the roads.');
  }

  const hero = player(sim);
  if (hero.alive) updatePlayer(sim, hero, input, step);
  const raven = byId(sim, sim.enemyChampionId);
  if (raven) updateEnemyChampion(sim, raven, step);
  for (const unit of sim.units) {
    if (unit.kind !== 'minion') continue;
    if (unit.team === 'wild') updateCamp(sim, unit, step);
    else updateMinion(sim, unit, step);
  }

  resolveBodies(sim);
  strikes(sim, input);
  updateProjectiles(sim, step);
  regen(sim, step);
  sim.gold += PASSIVE_GOLD * step;

  if (input.cast) tryCast(sim, input);
  if (input.upgrade) tryUpgrade(sim, input.upgrade);
  if (input.buy) tryBuy(sim, input.buy);
  if (input.potion) tryPotion(sim, input.potion);
  if (input.attribute) trySpendAttribute(sim, input.attribute);
  if (input.assignSkill) tryAssignBelt(sim, input.assignSkill, input.assignSlot);

  waves(sim, step);
  updateDens(sim, step);
  updateSeals(sim, step);
  updatePits(sim, step);
  updateShrines(sim, step);

  for (const fx of sim.fx) {
    fx.t += step;
    fx.y += (fx.vy ?? 0) * step;
  }
  sim.fx = sim.fx.filter((fx) => fx.t < fx.life);
  sim.units = sim.units.filter((unit) => unit.kind !== 'minion' || unit.alive || unit.corpse > 0);
  sim.projectiles = sim.projectiles.filter((shot) => shot.life > 0);
}

function tickStatus(sim: Sim, unit: Unit, dt: number): void {
  unit.attackCd = Math.max(0, unit.attackCd - dt);
  unit.stun = Math.max(0, unit.stun - dt);
  unit.slow = Math.max(0, unit.slow - dt);
  unit.buffT = Math.max(0, unit.buffT - dt);
  if (unit.buffT <= 0) {
    unit.buffDmg = 0;
    unit.buffArmor = 0;
  }
  unit.bashT = Math.max(0, unit.bashT - dt);
  unit.castT = Math.max(0, unit.castT - dt);
  unit.frenzyT = Math.max(0, unit.frenzyT - dt);
  unit.concentrateT = Math.max(0, unit.concentrateT - dt);
  unit.commandT = Math.max(0, unit.commandT - dt);
  unit.tauntT = Math.max(0, unit.tauntT - dt);
  if (unit.id === sim.playerId) {
    const bo = unit.boT;
    const berserk = unit.berserkT;
    unit.boT = Math.max(0, unit.boT - dt);
    unit.berserkT = Math.max(0, unit.berserkT - dt);
    if ((bo > 0 && unit.boT === 0) || (berserk > 0 && unit.berserkT === 0)) recomputeHero(sim);
  } else {
    unit.boT = Math.max(0, unit.boT - dt);
    unit.berserkT = Math.max(0, unit.berserkT - dt);
  }
  unit.invuln = Math.max(0, unit.invuln - dt);
  unit.mightT = Math.max(0, unit.mightT - dt);
  unit.guardT = Math.max(0, unit.guardT - dt);
  unit.haste = Math.max(0, unit.haste - dt);
  unit.hitFlash = Math.max(0, unit.hitFlash - dt);
  unit.swing = Math.max(0, unit.swing - dt * 3.4);
  unit.combat = Math.max(0, unit.combat - dt);
  if (!unit.alive && unit.kind === 'minion') unit.corpse -= dt;
  if (unit.whirlT > 0) {
    unit.whirlT -= dt;
    unit.whirlTick -= dt;
    if (unit.whirlTick <= 0 && unit.alive && unit.stun <= 0) {
      unit.whirlTick = 0.18;
      const radius = 66 + unit.whirlRank * 6;
      const damage = unit.ad * (unit.buffT > 0 ? 1 + unit.buffDmg : 1) * (0.28 + unit.whirlRank * 0.04);
      for (const other of sim.units) {
        if (!other.alive || other.team === unit.team) continue;
        if (Math.hypot(other.x - unit.x, other.y - unit.y) <= radius + other.radius) {
          damageUnit(sim, other, damage, unit);
        }
      }
      ring(sim, unit.x, unit.y, radius * 0.7, 'rgba(230, 211, 161, 0.9)');
    }
    if (unit.whirlT < 0) unit.whirlT = 0;
  }
}

function advanceLeap(sim: Sim, unit: Unit, dt: number): void {
  const leap = unit.leap;
  if (!leap) return;
  leap.t += dt;
  const p = Math.min(1, leap.t / leap.dur);
  const e = p * p * (3 - 2 * p);
  unit.x = leap.x0 + (leap.x1 - leap.x0) * e;
  unit.y = leap.y0 + (leap.y1 - leap.y0) * e;
  if (p < 1) return;
  const radius = 72;
  const damage = unit.ad * (1.35 + Math.max(0, leap.rank - 1) * 0.15);
  for (const other of [...sim.units]) {
    if (!other.alive || other.team === unit.team) continue;
    if (Math.hypot(other.x - unit.x, other.y - unit.y) <= radius + other.radius) {
      damageUnit(sim, other, damage, unit);
      other.slow = Math.max(other.slow, 1.15);
      other.slowPct = Math.max(other.slowPct, 0.35);
    }
  }
  ring(sim, unit.x, unit.y, radius, '#e6d3a1');
  unit.leap = null;
  sim.shake = Math.max(sim.shake, 5);
  const spot = clampToPlayable(sim.map, unit.x, unit.y);
  unit.x = spot.x;
  unit.y = spot.y;
}

function moveSpeed(unit: Unit): number {
  const slow = unit.slow > 0 ? 1 - unit.slowPct : 1;
  const haste = unit.haste > 0 ? 1.18 : 1;
  return unit.moveSpeed * slow * haste;
}

function moveToward(unit: Unit, x: number, y: number, dt: number, scale = 1): void {
  const dx = x - unit.x;
  const dy = y - unit.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  const step = Math.min(d, moveSpeed(unit) * scale * dt);
  unit.x += (dx / d) * step;
  unit.y += (dy / d) * step;
  unit.facing = Math.atan2(dy, dx);
}

function playerPace(sim: Sim, hero: Unit): number {
  let scale = hero.whirlT > 0 ? 1.06 : 1;
  if (hero.frenzyT > 0) scale *= 1.18;
  if (inShopRange(sim, hero)) scale *= sim.classDef.stats.walkSpeed / sim.classDef.stats.runSpeed;
  return scale;
}

function updatePlayer(sim: Sim, hero: Unit, input: FrameInput, dt: number): void {
  if (input.recall && hero.recall <= 0 && hero.stun <= 0 && !hero.leap && hero.whirlT <= 0) {
    hero.recall = 2.6;
    banner(sim, 'Returning to the fountain…');
    return;
  }
  if (hero.recall > 0) {
    const moving = Math.hypot(input.moveX, input.moveY) > 0.15 || input.destX != null;
    if (moving || hero.stun > 0 || hero.hitFlash > 0) {
      hero.recall = 0;
      banner(sim, 'Recall interrupted.');
    } else {
      hero.recall -= dt;
      if (hero.recall <= 0) {
        const home = sim.map.playerBase;
        hero.x = home.x + 48;
        hero.y = home.y;
        hero.recall = 0;
        hero.targetId = null;
        banner(sim, 'The fountain restores you.');
      }
    }
    return;
  }
  if (hero.stun > 0 || hero.leap) return;
  const direct = Math.hypot(input.moveX, input.moveY) > 0.15;
  const lock = byId(sim, input.targetId);
  const target = lock && lock.alive && lock.team !== hero.team ? lock : null;
  const pace = playerPace(sim, hero);
  if (direct) {
    const mag = Math.hypot(input.moveX, input.moveY);
    const speed = moveSpeed(hero) * pace;
    hero.x += (input.moveX / mag) * speed * dt;
    hero.y += (input.moveY / mag) * speed * dt;
    if (!target) hero.facing = Math.atan2(input.moveY, input.moveX);
    return;
  }
  if (target && !inRange(hero, target)) {
    moveToward(hero, target.x, target.y, dt, pace);
    return;
  }
  if (!target && input.attack) {
    const near = nearestEnemy(sim, hero, 380, (unit) => unit.kind !== 'base' || distTo(hero, unit) < 280);
    if (near && !inRange(hero, near)) moveToward(hero, near.x, near.y, dt, pace);
    return;
  }
  if (input.destX != null && input.destY != null) {
    moveToward(hero, input.destX, input.destY, dt, pace);
  }
}

function updateCamp(sim: Sim, unit: Unit, dt: number): void {
  if (!unit.alive || unit.stun > 0) return;
  const home = Math.hypot(unit.x - unit.anchorX, unit.y - unit.anchorY);
  if (home > 380) {
    unit.targetId = null;
    moveToward(unit, unit.anchorX, unit.anchorY, dt);
    return;
  }
  acquireCreepTarget(sim, unit);
  const target = byId(sim, unit.targetId);
  if (target?.alive) {
    if (Math.hypot(target.x - unit.anchorX, target.y - unit.anchorY) > 420) {
      unit.targetId = null;
      moveToward(unit, unit.anchorX, unit.anchorY, dt);
      return;
    }
    if (!inRange(unit, target)) moveToward(unit, target.x, target.y, dt);
    return;
  }
  if (home > 36) moveToward(unit, unit.anchorX, unit.anchorY, dt);
}

function updateMinion(sim: Sim, unit: Unit, dt: number): void {
  if (!unit.alive || unit.stun > 0) return;
  acquireCreepTarget(sim, unit);
  const target = byId(sim, unit.targetId);
  if (target && target.alive) {
    if (!inRange(unit, target)) moveToward(unit, target.x, target.y, dt);
    return;
  }
  unit.targetId = null;
  const lane = laneAt(sim, unit.path);
  const forward = unit.team === 'ally';
  const finalIndex = forward ? lane.length - 1 : 0;
  if (unit.waypoint === finalIndex) {
    const base = findBase(sim, forward ? 'enemy' : 'ally');
    if (base.alive) unit.targetId = base.id;
    if (base.alive && !inRange(unit, base)) moveToward(unit, base.x, base.y, dt);
    return;
  }
  const wp = lane[unit.waypoint];
  if (!wp) return;
  moveToward(unit, wp.x, wp.y, dt);
  if (Math.hypot(unit.x - wp.x, unit.y - wp.y) < 28) {
    const next = unit.waypoint + (forward ? 1 : -1);
    if (next >= 0 && next < lane.length) unit.waypoint = next;
  }
}

function acquireCreepTarget(sim: Sim, unit: Unit): void {
  if (unit.tauntT > 0) {
    const taunted = byId(sim, unit.targetId);
    if (taunted?.alive && taunted.team !== unit.team) return;
  }
  const current = byId(sim, unit.targetId);
  if (current?.alive && current.team !== unit.team) {
    const gap = Math.hypot(current.x - unit.x, current.y - unit.y);
    const leash = current.kind === 'base' ? 540 : unit.aggro + current.radius + 36;
    if (gap < leash) return;
  }
  const foe = nearestEnemy(sim, unit, unit.aggro, (other) => other.kind !== 'base');
  unit.targetId = foe ? foe.id : null;
}

function updateEnemyChampion(sim: Sim, unit: Unit, dt: number): void {
  if (!unit.alive || unit.stun > 0) return;
  const home = sim.map.enemyBase;
  if (unit.hp / unit.maxHp < 0.28) {
    moveToward(unit, home.x - 120, home.y, dt);
    const threat = nearestEnemy(sim, unit, unit.attackRange);
    unit.targetId = threat ? threat.id : null;
    return;
  }
  if (inAllyTower(sim, unit) && !enemyMinionInTower(sim, unit)) {
    moveToward(unit, home.x - 80, home.y, dt);
    unit.targetId = null;
    return;
  }
  const prey = nearestEnemy(sim, unit, 400, (other) => other.kind !== 'base');
  if (!prey) {
    updateMinion(sim, unit, dt);
    return;
  }
  const gap = Math.hypot(prey.x - unit.x, prey.y - unit.y);
  const reach = unit.attackRange + prey.radius;
  if (gap > reach) moveToward(unit, prey.x, prey.y, dt);
  else if (gap < reach * 0.58) {
    const angle = Math.atan2(unit.y - prey.y, unit.x - prey.x);
    moveToward(unit, unit.x + Math.cos(angle) * 90, unit.y + Math.sin(angle) * 90, dt);
  }
  unit.targetId = prey.id;
}

function inAllyTower(sim: Sim, unit: Unit): boolean {
  return sim.units.some(
    (tower) =>
      tower.alive &&
      tower.team === 'ally' &&
      tower.kind === 'tower' &&
      Math.hypot(tower.x - unit.x, tower.y - unit.y) < tower.attackRange + unit.radius - 10,
  );
}

function enemyMinionInTower(sim: Sim, raven: Unit): boolean {
  return sim.units.some((tower) => {
    if (!tower.alive || tower.team !== 'ally' || tower.kind !== 'tower') return false;
    if (Math.hypot(tower.x - raven.x, tower.y - raven.y) > tower.attackRange + 40) return false;
    return sim.units.some(
      (minion) =>
        minion.alive &&
        minion.team === 'enemy' &&
        minion.kind === 'minion' &&
        Math.hypot(minion.x - tower.x, minion.y - tower.y) < tower.attackRange + minion.radius,
    );
  });
}

function resolveBodies(sim: Sim): void {
  const movers = sim.units.filter((unit) => unit.alive && !unit.leap && !isStructure(unit.kind));
  for (const unit of movers) {
    const spot = clampToPlayable(sim.map, unit.x, unit.y);
    unit.x = spot.x;
    unit.y = spot.y;
  }
  const solids = sim.units.filter((unit) => unit.alive && isStructure(unit.kind));
  for (const unit of movers) {
    for (const solid of solids) {
      const dx = unit.x - solid.x;
      const dy = unit.y - solid.y;
      const min = unit.radius + solid.radius;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d < min) {
        unit.x += (dx / d) * (min - d);
        unit.y += (dy / d) * (min - d);
      }
    }
    const spot = clampToPlayable(sim.map, unit.x, unit.y);
    unit.x = spot.x;
    unit.y = spot.y;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i];
        const b = movers[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius - 6;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
  }
}

function strikes(sim: Sim, input: FrameInput): void {
  const hero = player(sim);
  if (hero.alive && hero.stun <= 0 && hero.whirlT <= 0 && !hero.leap) {
    const lock = byId(sim, input.targetId);
    let focus: Unit | null = null;
    if (lock && lock.alive && lock.team !== hero.team && inRange(hero, lock)) focus = lock;
    else if (input.attack) focus = nearestEnemy(sim, hero, hero.attackRange);
    if (focus) {
      hero.targetId = focus.id;
      tryStrike(sim, hero);
    }
  }
  for (const unit of sim.units) {
    if (unit.id === hero.id || !unit.alive || unit.stun > 0) continue;
    if (unit.kind === 'tower' || unit.kind === 'base') {
      const pool = enemiesIn(sim, unit, unit.attackRange).filter((other) => other.kind !== 'base');
      const minions = pool.filter((other) => other.kind === 'minion');
      const choice = closest(unit, minions.length ? minions : pool);
      unit.targetId = choice ? choice.id : null;
    }
    tryStrike(sim, unit);
  }
}

function enemiesIn(sim: Sim, unit: Unit, reach: number): Unit[] {
  return sim.units.filter(
    (other) => other.alive && other.team !== unit.team && Math.hypot(other.x - unit.x, other.y - unit.y) <= reach + other.radius,
  );
}

function closest(from: Unit, units: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const unit of units) {
    const d = Math.hypot(unit.x - from.x, unit.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = unit;
    }
  }
  return best;
}

function tryStrike(sim: Sim, unit: Unit): void {
  const target = byId(sim, unit.targetId);
  if (!target || !target.alive) {
    unit.targetId = null;
    return;
  }
  unit.facing = Math.atan2(target.y - unit.y, target.x - unit.x);
  if (!inRange(unit, target) || unit.attackCd > 0) return;
  const buff = (unit.buffT > 0 ? 1 + unit.buffDmg : 1) * (unit.mightT > 0 ? 1.15 : 1);
  let raw = unit.ad * buff;
  if (unit.affix === 'Spectral Hit') raw *= 1.3;
  if (unit.ranged) {
    shoot(sim, unit, target, raw);
  } else {
    if (unit.bashT > 0) {
      raw = raw * 1.55 + 8;
      target.stun = Math.max(target.stun, 0.5);
      unit.bashT = 0;
      sfx(sim, 'bash');
    }
    if (unit.concentrateT > 0) {
      raw *= 1.35;
      unit.concentrateT = 0;
    }
    damageUnit(sim, target, raw, unit);
    if (unit.affix === 'Cursed') {
      target.slow = Math.max(target.slow, 1.2);
      target.slowPct = Math.max(target.slowPct, 0.25);
    }
    if (unit.affix === 'Mana Burn') target.mana = Math.max(0, target.mana - 12);
    unit.swing = 1;
    ring(sim, target.x, target.y, 18, unit.accent);
  }
  const haste = unit.frenzyT > 0 ? 0.75 : 1;
  unit.attackCd = unit.attackInterval * haste;
}

function shoot(sim: Sim, attacker: Unit, target: Unit, damage: number): void {
  sim.projectiles.push({
    id: sim.nextId++,
    team: attacker.team,
    x: attacker.x + Math.cos(attacker.facing) * attacker.radius,
    y: attacker.y + Math.sin(attacker.facing) * attacker.radius,
    speed: attacker.projectileSpeed,
    damage,
    targetId: target.id,
    attackerId: attacker.id,
    life: 1.8,
    color: attacker.accent,
    radius: 4,
  });
  if (sim.projectiles.length > 80) sim.projectiles.splice(0, sim.projectiles.length - 80);
}

function updateProjectiles(sim: Sim, dt: number): void {
  for (const shot of sim.projectiles) {
    const target = byId(sim, shot.targetId);
    if (!target || !target.alive) {
      shot.life = 0;
      continue;
    }
    const dx = target.x - shot.x;
    const dy = target.y - shot.y;
    const d = Math.hypot(dx, dy);
    if (d <= target.radius + shot.radius + 4) {
      damageUnit(sim, target, shot.damage, byId(sim, shot.attackerId) ?? null);
      shot.life = 0;
      continue;
    }
    shot.x += (dx / d) * shot.speed * dt;
    shot.y += (dy / d) * shot.speed * dt;
    shot.life -= dt;
  }
}

function regen(sim: Sim, dt: number): void {
  for (const unit of sim.units) {
    if (!unit.alive || unit.kind !== 'champion') continue;
    const home = unit.team === 'ally' ? sim.map.playerBase : sim.map.enemyBase;
    const inTown = Math.hypot(unit.x - home.x, unit.y - home.y) <= sim.map.fountainRadius;
    if (inTown) {
      unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * 0.14 * dt);
      unit.mana = Math.min(unit.maxMana, unit.mana + Math.max(20, unit.maxMana) * 0.16 * dt);
    } else if (unit.combat <= 0) {
      const stamina = unit.id === sim.playerId ? (sim.skillRanks['increased-stamina'] ?? 0) : 0;
      const regen = unit.id === sim.playerId ? sim.classDef.stats.regenHp + stamina * 0.4 : 1.4;
      unit.hp = Math.min(unit.maxHp, unit.hp + regen * dt);
    }
    if (!inTown && unit.id === sim.playerId) {
      unit.mana = Math.min(unit.maxMana, unit.mana + sim.classDef.stats.regenMana * dt);
    }
  }
}

function waves(sim: Sim, dt: number): void {
  for (const unit of sim.units) {
    if (!unit.alive && unit.kind === 'champion') {
      unit.respawn -= dt;
      if (unit.respawn <= 0) reviveChampion(sim, unit);
    }
  }
  sim.waveIn -= dt;
  if (sim.waveIn > 0) return;
  spawnWave(sim, 'ally');
  spawnWave(sim, 'enemy');
  sim.waveIn = sim.map.waves.interval;
  if (!sim.announcedWave) {
    sim.announcedWave = true;
    banner(sim, sim.map.march ?? 'The Fallen march across the Blood Moor.');
  }
}

function reviveChampion(sim: Sim, unit: Unit): void {
  const home = unit.team === 'ally' ? sim.map.playerBase : sim.map.enemyBase;
  const spot = clampToPlayable(sim.map, unit.team === 'ally' ? home.x + 150 : home.x - 170, home.y);
  unit.alive = true;
  unit.hp = unit.maxHp;
  unit.mana = unit.maxMana;
  unit.x = spot.x;
  unit.y = spot.y;
  unit.stun = 0;
  unit.slow = 0;
  unit.leap = null;
  unit.whirlT = 0;
  unit.targetId = null;
  unit.respawn = 0;
  unit.invuln = unit.id === sim.playerId ? 1.5 : 0.4;
  unit.waypoint = unit.team === 'ally' ? 1 : laneAt(sim, unit.path).length - 2;
  if (unit.id === sim.playerId) banner(sim, 'You return to the Encampment.');
}

function pathIndex(sim: Sim, id?: string): number {
  if (!id || !sim.map.paths) return 0;
  const index = sim.map.paths.findIndex((path) => path.id === id);
  return index < 0 ? 0 : index;
}

function laneAt(sim: Sim, path: number): { x: number; y: number }[] {
  const lanes = sim.map.paths?.map((entry) => entry.lane);
  if (!lanes?.length) return sim.map.lane;
  return lanes[Math.min(lanes.length - 1, Math.max(0, path))] ?? sim.map.lane;
}

function spawnWave(sim: Sim, team: Team): void {
  const alive = sim.units.filter((unit) => unit.alive && unit.kind === 'minion' && unit.team === team).length;
  if (alive >= 18) return;
  const extra = team === 'enemy' ? paceOf(sim.time).extra : 0;
  if (sim.map.paths?.length) {
    sim.map.paths.forEach((path, index) => {
      const groups = waveGroups(sim, path, team);
      spawnOnLane(sim, team, path.lane, index, withExtra(groups, extra));
    });
    return;
  }
  const groups = team === 'ally' ? sim.map.waves.ally : sim.map.waves.enemy;
  spawnOnLane(sim, team, sim.map.lane, 0, withExtra(groups, extra));
}

function waveGroups(sim: Sim, path: PathDef, team: Team) {
  if (team === 'ally') return path.ally;
  const pace = paceOf(sim.time).name;
  if (pace === 'Hell' && path.later?.hell) return path.later.hell;
  if (pace === 'Nightmare' && path.later?.nightmare) return path.later.nightmare;
  return path.enemy;
}

function withExtra(groups: { unit: string; count: number }[], extra: number): { unit: string; count: number }[] {
  if (extra <= 0 || !groups.length) return groups;
  return groups.map((group, index) => (index === 0 ? { ...group, count: group.count + extra } : group));
}

function spawnDen(sim: Sim, den: DenSpawn): void {
  const count = den.boss ? 1 : den.count;
  for (let n = 0; n < count; n++) {
    const angle = (n / Math.max(1, count)) * Math.PI * 2;
    const unit = spawnMinion(sim, den.unit, 'wild', den.x + Math.cos(angle) * 28, den.y + Math.sin(angle) * 22);
    unit.pack = den.id;
    unit.anchorX = den.x;
    unit.anchorY = den.y;
    const lead = n === 0 && Boolean(den.unique || den.boss);
    const mul = den.boss ? 2.4 : lead ? 1.8 : 1;
    unit.maxHp = Math.round(unit.maxHp * mul);
    unit.hp = unit.maxHp;
    unit.ad = Math.max(1, Math.round(unit.ad * (den.boss ? 1.35 : 1)));
    unit.gold = Math.round(unit.gold * (den.boss ? 4 : lead ? 2 : 1));
    unit.xp = Math.round(unit.xp * (den.boss ? 3 : lead ? 1.6 : 1));
    if (den.boss) unit.name = den.boss;
    else if (lead && den.unique) unit.name = den.unique;
  }
}

function updateDens(sim: Sim, dt: number): void {
  for (const den of sim.map.dens ?? []) {
    const alive = sim.units.some((unit) => unit.alive && unit.pack === den.id);
    if (alive) {
      sim.denIn[den.id] = den.respawn;
      continue;
    }
    sim.denIn[den.id] = (sim.denIn[den.id] ?? den.respawn) - dt;
    if (sim.denIn[den.id] > 0) continue;
    spawnDen(sim, den);
    sim.denIn[den.id] = den.respawn;
  }
}

export function spawnHero(sim: Sim, team: Team, x: number, y: number, name: string): Unit {
  return blankUnit(sim, {
    defId: 'barbarian',
    kind: 'champion',
    team,
    name,
    x,
    y,
    radius: 18,
    hp: 240,
    maxHp: 240,
    mana: 80,
    maxMana: 80,
    ad: 15,
    armor: 8,
    moveSpeed: 216,
    attackRange: 48,
    attackInterval: 1,
    color: team === 'ally' ? '#c4a574' : '#8a3030',
    accent: '#e6d3a1',
  });
}

function spawnOnLane(
  sim: Sim,
  team: Team,
  lane: { x: number; y: number }[],
  path: number,
  groups: { unit: string; count: number }[],
): void {
  const origin = team === 'ally' ? lane[0] : lane[lane.length - 1];
  const next = team === 'ally' ? lane[1] : lane[lane.length - 2];
  const dx = next.x - origin.x;
  const dy = next.y - origin.y;
  const mag = Math.hypot(dx, dy) || 1;
  const fx = dx / mag;
  const fy = dy / mag;
  const px = -fy;
  const py = fx;
  let index = 0;
  for (const group of groups) {
    for (let n = 0; n < group.count; n++) {
      const col = (index % 3) - 1;
      const row = Math.floor(index / 3);
      spawnMinion(
        sim,
        group.unit,
        team,
        origin.x + fx * (78 + row * 36) + px * col * 30,
        origin.y + fy * (78 + row * 36) + py * col * 30,
        path,
      );
      index += 1;
    }
  }
  if (pathSupers(sim, path, team)) {
    const unitId = groups[0]?.unit ?? (team === 'ally' ? 'rogue' : 'fallen');
    const superUnit = spawnMinion(sim, unitId, team, origin.x + fx * 40, origin.y + fy * 40, path);
    bless(superUnit, AFFIXES[(sim.seed + path + Math.floor(sim.time)) % AFFIXES.length]);
  }
}

const AFFIXES = ['Extra Strong', 'Cursed', 'Mana Burn', 'Spectral Hit'] as const;

function pathSupers(sim: Sim, path: number, team: Team): boolean {
  return sim.units.some(
    (unit) => unit.kind === 'seal' && !unit.alive && unit.path === path && unit.team !== team && unit.team !== 'wild',
  );
}

function bless(unit: Unit, affix: (typeof AFFIXES)[number]): void {
  unit.affix = affix;
  unit.name = `${affix} ${unit.name}`;
  unit.xp = Math.round(unit.xp * 1.8);
  unit.gold = Math.round(unit.gold * 1.5);
  if (affix === 'Extra Strong') {
    unit.maxHp = Math.round(unit.maxHp * 1.35);
    unit.hp = unit.maxHp;
    unit.ad = Math.max(1, Math.round(unit.ad * 1.4));
  }
}

function spawnSeal(sim: Sim, spec: SealSpawn): void {
  const path = sim.map.paths?.findIndex((entry) => entry.id === spec.path) ?? 0;
  blankUnit(sim, {
    defId: 'seal',
    kind: 'seal',
    team: spec.team,
    name: spec.name,
    x: spec.x,
    y: spec.y,
    radius: 26,
    hp: 460,
    maxHp: 460,
    armor: 8,
    attackRange: 0,
    gold: 90,
    xp: 140,
    path: path < 0 ? 0 : path,
    color: spec.team === 'ally' ? '#d4b46a' : '#c44536',
    accent: '#e6d3a1',
  });
}

function updateSeals(sim: Sim, dt: number): void {
  for (const unit of sim.units) {
    if (unit.kind !== 'seal' || unit.alive) continue;
    unit.respawn -= dt;
    if (unit.respawn > 0) continue;
    unit.alive = true;
    unit.hp = unit.maxHp;
    unit.respawn = 0;
    banner(sim, `${unit.name} is restored.`);
  }
}

function updatePits(sim: Sim, dt: number): void {
  const pits = sim.map.pits ?? [];
  const dragonPit = pits.find((pit) => pit.id === 'dragon');
  const heraldPit = pits.find((pit) => pit.id === 'herald');
  if (dragonPit) {
    const up = sim.units.some((unit) => unit.alive && unit.objective === 'dragon');
    if (up) sim.dragonIn = 36;
    else {
      sim.dragonIn -= dt;
      if (sim.dragonIn <= 0) {
        spawnDragon(sim, dragonPit.x, dragonPit.y);
        sim.dragonIn = 36;
      }
    }
  }
  if (heraldPit) {
    const up = sim.units.some((unit) => unit.alive && (unit.objective === 'herald' || unit.objective === 'baron'));
    if (up) sim.heraldIn = 32;
    else {
      sim.heraldIn -= dt;
      if (sim.heraldIn <= 0) {
        sim.heraldCount += 1;
        spawnHerald(sim, heraldPit.x, heraldPit.y, sim.heraldCount % 3 === 0);
        sim.heraldIn = 32;
      }
    }
  }
}

function spawnDragon(sim: Sim, x: number, y: number): void {
  const elements = ['Fire', 'Cold', 'Lightning'] as const;
  const element = elements[sim.dragonStep % elements.length];
  sim.dragonStep += 1;
  const unit = spawnMinion(sim, 'demon', 'wild', x, y);
  unit.objective = 'dragon';
  unit.affix = element;
  unit.name = `${element} Horror`;
  unit.anchorX = x;
  unit.anchorY = y;
  unit.maxHp = 420;
  unit.hp = 420;
  unit.ad = 16;
  unit.gold = 80;
  unit.xp = 110;
  unit.radius = 22;
  unit.color = element === 'Cold' ? '#8fd0e8' : element === 'Lightning' ? '#e6d56a' : '#e05a32';
  unit.accent = '#fff4e0';
}

function spawnHerald(sim: Sim, x: number, y: number, baron: boolean): void {
  const unit = spawnMinion(sim, baron ? 'mummy' : 'goatman', 'wild', x, y);
  unit.objective = baron ? 'baron' : 'herald';
  unit.name = baron ? 'Blood Baron' : 'Herald';
  unit.anchorX = x;
  unit.anchorY = y;
  unit.maxHp = baron ? 760 : 520;
  unit.hp = unit.maxHp;
  unit.ad = baron ? 22 : 16;
  unit.gold = baron ? 150 : 70;
  unit.xp = baron ? 180 : 80;
  unit.radius = baron ? 26 : 22;
  unit.moveSpeed = baron ? 78 : 64;
  unit.color = baron ? '#6a2040' : '#8a7040';
  unit.accent = '#e6c864';
}

function updateShrines(sim: Sim, dt: number): void {
  const shrines = sim.map.shrines ?? [];
  const hero = player(sim);
  for (let i = 0; i < shrines.length; i++) {
    sim.shrineIn[i] = Math.max(0, (sim.shrineIn[i] ?? 0) - dt);
    if (!hero.alive || sim.shrineIn[i] > 0) continue;
    const shrine = shrines[i];
    if (Math.hypot(hero.x - shrine.x, hero.y - shrine.y) > 42) continue;
    sim.shrineIn[i] = 28;
    if (shrine.kind === 'might') hero.mightT = Math.max(hero.mightT, 12);
    if (shrine.kind === 'guard') hero.guardT = Math.max(hero.guardT, 12);
    if (shrine.kind === 'haste') hero.haste = Math.max(hero.haste, 12);
    if (shrine.kind === 'mana') hero.mana = hero.maxMana;
    banner(sim, `A ${shrine.kind} shrine answers.`);
  }
}

function tryCast(sim: Sim, input: FrameInput): void {
  const id = input.cast;
  if (!id) return;
  const def = sim.classDef.skills.find((skill) => skill.id === id);
  if (!def) return;
  if (def.passive) {
    banner(sim, `${def.name} is passive.`);
    return;
  }
  const rank = sim.skillRanks[id] ?? 0;
  if (rank <= 0) {
    tryUpgrade(sim, id);
    return;
  }
  const hero = player(sim);
  if (!hero.alive || hero.stun > 0 || hero.leap || hero.whirlT > 0) return;
  if ((sim.cooldowns[id] ?? 0) > 0) return;
  const cost = manaCost(def, rank);
  if (hero.mana < cost) {
    banner(sim, 'Not enough mana.');
    return;
  }
  const handler = SKILLS[id];
  if (!handler) return;
  const ok = handler({ sim, hero, rank, aimX: input.aimX, aimY: input.aimY });
  if (!ok) return;
  hero.mana -= cost;
  sim.cooldowns[id] = def.cooldown;
}

function distTo(a: Unit, b: Unit): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export { damageUnit, inShopRange };
