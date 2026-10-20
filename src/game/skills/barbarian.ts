import { banner, damageUnit, recomputeHero, ring, sfx } from '../combat';
import { clampToPlayable } from '../lane';
import { clamp } from '../math';
import type { Unit } from '../types';
import type { CastContext, SkillHandler } from './types';

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

function smack(ctx: CastContext, foe: Unit, damage: number, stun = 0): void {
  const { hero } = ctx;
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.swing = 1;
  damageUnit(ctx.sim, foe, damage, hero);
  if (stun > 0) foe.stun = Math.max(foe.stun, stun);
}

export const bash: SkillHandler = (ctx) => {
  const foe = nearestInReach(ctx, ctx.hero.attackRange + 18);
  if (!foe) {
    banner(ctx.sim, 'Nobody in reach.');
    return false;
  }
  const mult = 1.5 + (ctx.rank - 1) * 0.15;
  smack(ctx, foe, ctx.hero.ad * mult, 0);
  ring(ctx.sim, foe.x, foe.y, 36, '#f2e2b6');
  sfx(ctx.sim, 'bash');
  return true;
};

export const shout: SkillHandler = (ctx) => {
  ctx.hero.castT = 0.4;
  const radius = 200;
  const armor = 10 + (ctx.rank - 1) * 6;
  for (const unit of ctx.sim.units) {
    if (!unit.alive || unit.team !== ctx.hero.team) continue;
    if (Math.hypot(unit.x - ctx.hero.x, unit.y - ctx.hero.y) > radius + unit.radius) continue;
    unit.buffT = 6;
    unit.buffArmor = Math.max(unit.buffArmor, armor);
  }
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, radius, '#e6d3a1');
  sfx(ctx.sim, 'cry');
  banner(ctx.sim, `Shout raises defense by ${armor}.`);
  return true;
};

export const stun: SkillHandler = (ctx) => {
  const foe = nearestInReach(ctx, ctx.hero.attackRange + 16);
  if (!foe) {
    banner(ctx.sim, 'Nobody in reach to stun.');
    return false;
  }
  const mult = 1.15 + (ctx.rank - 1) * 0.05;
  const seconds = 0.6 + (ctx.rank - 1) * 0.25;
  smack(ctx, foe, ctx.hero.ad * mult, seconds);
  sfx(ctx.sim, 'bash');
  return true;
};

export const leapAttack: SkillHandler = (ctx) => {
  const { sim, hero, aimX, aimY } = ctx;
  const maxR = 220 + ctx.rank * 16;
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
  hero.leap = { t: 0, dur: 0.42, x0: hero.x, y0: hero.y, x1, y1, rank: ctx.rank, kind: 'leap-attack' };
  hero.targetId = null;
  sfx(sim, 'leap');
  return true;
};

export const battleOrders: SkillHandler = (ctx) => {
  ctx.hero.castT = 0.4;
  ctx.hero.boT = 8;
  recomputeHero(ctx.sim);
  ring(ctx.sim, ctx.hero.x, ctx.hero.y, 120, '#8dce86');
  sfx(ctx.sim, 'cry');
  banner(ctx.sim, `Battle Orders raises life by ${6 * ctx.rank}%.`);
  return true;
};

export const whirlwind: SkillHandler = (ctx) => {
  ctx.hero.whirlT = 1.45;
  ctx.hero.whirlTick = 0;
  ctx.hero.whirlRank = ctx.rank;
  sfx(ctx.sim, 'whirl');
  return true;
};

export const HANDLERS: Record<string, SkillHandler> = {
  bash,
  shout,
  stun,
  'leap-attack': leapAttack,
  'battle-orders': battleOrders,
  whirlwind,
};
