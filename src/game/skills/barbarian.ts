import { banner, damageUnit, recomputeHero, ring, sfx } from '../combat';
import { POTION_CAP } from '../data/items';
import { clampToPlayable } from '../lane';
import { clamp } from '../math';
import type { Unit } from '../types';
import type { CastContext, SkillHandler } from './types';

function rankOf(ctx: CastContext): number {
  return ctx.rank + (ctx.hero.commandT > 0 ? 1 : 0);
}

function nearestInReach(ctx: CastContext, reach: number): Unit | null {
  const { sim, hero } = ctx;
  let best: Unit | null = null;
  let bestD = reach;
  for (const unit of sim.units) {
    if (!unit.alive || unit.team === hero.team) continue;
    const gap = Math.hypot(unit.x - hero.x, unit.y - hero.y) - unit.radius;
    if (gap <= bestD) {
      bestD = gap;
      best = unit;
    }
  }
  return best;
}

function foesIn(ctx: CastContext, radius: number): Unit[] {
  const { sim, hero } = ctx;
  return sim.units.filter(
    (unit) => unit.alive && unit.team !== hero.team && Math.hypot(unit.x - hero.x, unit.y - hero.y) <= radius + unit.radius,
  );
}

function smack(ctx: CastContext, foe: Unit, damage: number, stun = 0): void {
  const { hero } = ctx;
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.swing = 1;
  damageUnit(ctx.sim, foe, damage, hero);
  if (stun > 0) foe.stun = Math.max(foe.stun, stun);
}

function toss(ctx: CastContext, foe: Unit, damage: number): void {
  const { sim, hero } = ctx;
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.castT = 0.35;
  sim.projectiles.push({
    id: sim.nextId++,
    team: hero.team,
    x: hero.x + Math.cos(hero.facing) * hero.radius,
    y: hero.y + Math.sin(hero.facing) * hero.radius,
    speed: 520,
    damage,
    targetId: foe.id,
    attackerId: hero.id,
    life: 1.4,
    color: '#e6d3a1',
    radius: 5,
  });
}

function jump(ctx: CastContext, kind: 'leap' | 'leap-attack'): void {
  const { sim, hero, aimX, aimY } = ctx;
  const rank = rankOf(ctx);
  const maxR = 210 + rank * 26;
  let dx = aimX - hero.x;
  let dy = aimY - hero.y;
  let d = Math.hypot(dx, dy);
  if (d < 28) {
    dx = Math.cos(hero.facing) * maxR;
    dy = Math.sin(hero.facing) * maxR;
    d = maxR;
  }
  const scale = d > maxR ? maxR / d : 1;
  const landed = clampToPlayable(sim.map, hero.x + dx * scale, hero.y + dy * scale);
  const x1 = clamp(landed.x, 36, sim.map.width - 36);
  const y1 = clamp(landed.y, 36, sim.map.height - 36);
  hero.facing = Math.atan2(y1 - hero.y, x1 - hero.x);
  hero.leap = { t: 0, dur: 0.42, x0: hero.x, y0: hero.y, x1, y1, rank, kind };
  hero.targetId = null;
  sfx(sim, 'leap');
}

export const bash: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  const foe = nearestInReach(ctx, ctx.hero.attackRange + 18);
  if (foe) {
    const pct = (50 + 5 * (rank - 1)) / 100;
    smack(ctx, foe, ctx.hero.ad * (1 + pct) + 8 * rank, 0.32 + rank * 0.08);
    ring(ctx.sim, foe.x, foe.y, 40, '#f2e2b6');
  } else {
    ctx.hero.bashT = 4;
    banner(ctx.sim, 'Bash readied.');
  }
  sfx(ctx.sim, 'bash');
  return true;
};

export const doubleSwing: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  const reach = ctx.hero.attackRange + 22;
  const pool = foesIn(ctx, reach);
  const first = pool[0];
  if (!first) {
    ctx.hero.swing = 1;
    banner(ctx.sim, 'Double Swing whiffs.');
    return true;
  }
  const second = pool[1] ?? first;
  const hit = ctx.hero.ad * (0.72 + rank * 0.06);
  smack(ctx, first, hit, 0);
  smack(ctx, second, hit * 0.9, 0);
  sfx(ctx.sim, 'bash');
  return true;
};

export const stun: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  const foe = nearestInReach(ctx, ctx.hero.attackRange + 16);
  if (!foe) {
    banner(ctx.sim, 'Nobody in reach to stun.');
    return false;
  }
  smack(ctx, foe, ctx.hero.ad * (0.7 + rank * 0.05), 0.7 + rank * 0.08);
  sfx(ctx.sim, 'bash');
  return true;
};

export const concentrate: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.concentrateT = 5;
  const foe = nearestInReach(ctx, ctx.hero.attackRange + 16);
  if (foe) smack(ctx, foe, ctx.hero.ad * (1.15 + rank * 0.06), 0);
  else ctx.hero.swing = 1;
  banner(ctx.sim, 'Concentrate.');
  sfx(ctx.sim, 'bash');
  return true;
};

export const leap: SkillHandler = (ctx) => {
  jump(ctx, 'leap');
  return true;
};

export const leapAttack: SkillHandler = (ctx) => {
  jump(ctx, 'leap-attack');
  return true;
};

export const whirlwind: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.whirlT = 1.4 + rank * 0.08;
  ctx.hero.whirlTick = 0;
  ctx.hero.whirlRank = rank;
  sfx(ctx.sim, 'whirl');
  return true;
};

export const frenzy: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.frenzyT = 4 + rank * 0.2;
  const foe = nearestInReach(ctx, ctx.hero.attackRange + 18);
  if (foe) smack(ctx, foe, ctx.hero.ad * (0.9 + rank * 0.05), 0);
  else ctx.hero.swing = 1;
  sfx(ctx.sim, 'bash');
  return true;
};

export const berserk: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  const foe = nearestInReach(ctx, ctx.hero.attackRange + 16);
  ctx.hero.berserkT = 3.2;
  recomputeHero(ctx.sim);
  if (!foe) {
    banner(ctx.sim, 'Berserk finds no target.');
    return true;
  }
  smack(ctx, foe, ctx.hero.ad * (1.55 + rank * 0.08), 0);
  sfx(ctx.sim, 'bash');
  return true;
};

export const doubleThrow: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  const pool = foesIn(ctx, 280);
  if (!pool.length) {
    banner(ctx.sim, 'Nothing to throw at.');
    return false;
  }
  const damage = ctx.hero.ad * (0.55 + rank * 0.04);
  toss(ctx, pool[0], damage);
  toss(ctx, pool[1] ?? pool[0], damage * 0.85);
  sfx(ctx.sim, 'bash');
  return true;
};

export const howl: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.castT = 0.45;
  const radius = 160 + rank * 8;
  for (const foe of foesIn(ctx, radius)) {
    foe.slow = Math.max(foe.slow, 1.4);
    foe.slowPct = Math.max(foe.slowPct, 0.45);
    const ang = Math.atan2(foe.y - ctx.hero.y, foe.x - ctx.hero.x);
    const spot = clampToPlayable(ctx.sim.map, foe.x + Math.cos(ang) * 36, foe.y + Math.sin(ang) * 36);
    foe.x = spot.x;
    foe.y = spot.y;
  }
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, radius, '#c9b18a');
  sfx(ctx.sim, 'cry');
  return true;
};

export const taunt: SkillHandler = (ctx) => {
  const foe = nearestInReach(ctx, 260);
  ctx.hero.castT = 0.4;
  if (!foe) {
    banner(ctx.sim, 'Nobody hears the taunt.');
    return false;
  }
  foe.targetId = ctx.hero.id;
  foe.tauntT = 3.2;
  foe.slow = Math.max(foe.slow, 0.4);
  ring(ctx.sim, foe.x, foe.y, 28, '#e6d3a1');
  sfx(ctx.sim, 'cry');
  return true;
};

export const shout: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.castT = 0.45;
  const radius = 168 + rank * 10;
  for (const unit of ctx.sim.units) {
    if (!unit.alive || unit.team !== ctx.hero.team) continue;
    if (Math.hypot(unit.x - ctx.hero.x, unit.y - ctx.hero.y) > radius + unit.radius) continue;
    unit.buffT = 5;
    unit.buffArmor = Math.max(unit.buffArmor, 6 + rank * 3);
    unit.buffDmg = Math.max(unit.buffDmg, 0.06 + rank * 0.02);
  }
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, radius, '#e6d3a1');
  sfx(ctx.sim, 'cry');
  return true;
};

export const battleCry: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.castT = 0.45;
  const radius = 150 + rank * 6;
  for (const foe of foesIn(ctx, radius)) {
    foe.buffT = 4;
    foe.buffDmg = Math.min(foe.buffDmg, -0.15 - rank * 0.02);
    foe.buffArmor = Math.min(foe.buffArmor, -6 - rank);
  }
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, radius, '#c44536');
  sfx(ctx.sim, 'cry');
  return true;
};

export const warCry: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.castT = 0.5;
  const radius = 150 + rank * 8;
  for (const foe of foesIn(ctx, radius)) {
    damageUnit(ctx.sim, foe, 16 + rank * 10 + ctx.hero.ad * 0.25, ctx.hero);
    foe.stun = Math.max(foe.stun, 0.45 + rank * 0.05);
  }
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, radius, '#f0e2bc');
  sfx(ctx.sim, 'cry');
  return true;
};

export const battleOrders: SkillHandler = (ctx) => {
  ctx.hero.castT = 0.45;
  ctx.hero.boT = 8;
  recomputeHero(ctx.sim);
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, 120, '#8dce86');
  sfx(ctx.sim, 'cry');
  banner(ctx.sim, 'Battle Orders.');
  return true;
};

export const battleCommand: SkillHandler = (ctx) => {
  ctx.hero.castT = 0.45;
  ctx.hero.commandT = 8;
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, 100, '#e6c864');
  sfx(ctx.sim, 'cry');
  banner(ctx.sim, 'Battle Command.');
  return true;
};

export const findPotion: SkillHandler = (ctx) => {
  ctx.hero.castT = 0.35;
  if (ctx.sim.potions.health < POTION_CAP) {
    ctx.sim.potions.health += 1;
    banner(ctx.sim, 'You find a health potion.');
  } else {
    ctx.hero.hp = Math.min(ctx.hero.maxHp, ctx.hero.hp + 120);
    banner(ctx.sim, 'The potion is drunk on the spot.');
  }
  sfx(ctx.sim, 'potion');
  return true;
};

export const findItem: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.castT = 0.35;
  ctx.hero.findGold = 30 + rank * 14;
  banner(ctx.sim, 'The next Fallen may hide gold.');
  sfx(ctx.sim, 'coin');
  return true;
};

export const grimWard: SkillHandler = (ctx) => {
  const rank = rankOf(ctx);
  ctx.hero.castT = 0.45;
  const radius = 140 + rank * 8;
  for (const foe of foesIn(ctx, radius)) {
    foe.slow = Math.max(foe.slow, 2.2);
    foe.slowPct = Math.max(foe.slowPct, 0.4);
  }
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, radius, '#6e2430');
  sfx(ctx.sim, 'cry');
  return true;
};

export const HANDLERS: Record<string, SkillHandler> = {
  bash,
  'double-swing': doubleSwing,
  stun,
  concentrate,
  leap,
  'leap-attack': leapAttack,
  whirlwind,
  frenzy,
  berserk,
  'double-throw': doubleThrow,
  howl,
  taunt,
  shout,
  'battle-cry': battleCry,
  'war-cry': warCry,
  'battle-orders': battleOrders,
  'battle-command': battleCommand,
  'find-potion': findPotion,
  'find-item': findItem,
  'grim-ward': grimWard,
};
