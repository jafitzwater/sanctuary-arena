/**
 * ORDER "Make Amazon playable": Magic Arrow path handlers.
 * kits-final.md leaves every Amazon effect and cooldown unset ([U]). These use only existing
 * mechanics: the existing projectile (as ranged basic attacks and towers) and the existing slow
 * stack (as Leap Attack / Cursed). Every multiplier, count, slow and duration is [TEMP].
 */
import { banner, ring, sfx } from '../combat';
import type { Unit } from '../types';
import type { CastContext, SkillHandler } from './types';

/** [TEMP] Skill reach beyond the basic bow range. */
export const AMAZON_SKILL_REACH_BONUS = 40;

export function amazonReach(attackRange: number): number {
  return attackRange + AMAZON_SKILL_REACH_BONUS;
}

function gapTo(hero: Unit, unit: Unit): number {
  return Math.hypot(unit.x - hero.x, unit.y - hero.y) - unit.radius;
}

function foesInReach(ctx: CastContext, reach: number): Unit[] {
  const { sim, hero } = ctx;
  const list = sim.units.filter((u) => u.alive && u.team !== hero.team && u.kind !== 'base' && gapTo(hero, u) <= reach);
  list.sort((a, b) => gapTo(hero, a) - gapTo(hero, b));
  if (ctx.focusId != null) {
    const i = list.findIndex((u) => u.id === ctx.focusId);
    if (i > 0) list.unshift(...list.splice(i, 1));
  }
  return list;
}

/** Same shape as the sim's basic-attack projectile (sim.ts shoot). */
function arrow(ctx: CastContext, foe: Unit, damage: number, color: string): void {
  const { sim, hero } = ctx;
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.swing = 1;
  sim.projectiles.push({
    id: sim.nextId++,
    team: hero.team,
    x: hero.x + Math.cos(hero.facing) * hero.radius,
    y: hero.y + Math.sin(hero.facing) * hero.radius,
    speed: hero.projectileSpeed,
    damage,
    targetId: foe.id,
    attackerId: hero.id,
    life: 1.8,
    color,
    radius: 5,
  });
}

function single(ctx: CastContext, mult: number, color: string): Unit | null {
  const foe = foesInReach(ctx, amazonReach(ctx.hero.attackRange))[0];
  if (!foe) {
    banner(ctx.sim, 'Nobody in reach.');
    return null;
  }
  arrow(ctx, foe, ctx.hero.ad * mult, color);
  sfx(ctx.sim, 'swing');
  return foe;
}

export const magicArrow: SkillHandler = (ctx) => !!single(ctx, 1.2 + (ctx.rank - 1) * 0.1, '#9fc4ff');

export const multiShot: SkillHandler = (ctx) => {
  const foes = foesInReach(ctx, amazonReach(ctx.hero.attackRange)).slice(0, 2 + ctx.rank);
  if (!foes.length) {
    banner(ctx.sim, 'Nobody in reach.');
    return false;
  }
  const mult = 0.6 + (ctx.rank - 1) * 0.08;
  for (const foe of foes) arrow(ctx, foe, ctx.hero.ad * mult, '#e6d3a1');
  sfx(ctx.sim, 'swing');
  return true;
};

/** [TEMP] Ice Shot slow: 30% for 1.5 s, pushed on the existing slow stack. */
export const ICE_SHOT_SLOW = { pct: 0.3, t: 1.5 };

export const iceShot: SkillHandler = (ctx) => {
  const foe = single(ctx, 1 + (ctx.rank - 1) * 0.1, '#8fd8ff');
  if (!foe) return false;
  foe.slows.push({ pct: ICE_SHOT_SLOW.pct, t: ICE_SHOT_SLOW.t });
  foe.slow = Math.max(foe.slow, ICE_SHOT_SLOW.t);
  foe.slowPct = Math.max(foe.slowPct, ICE_SHOT_SLOW.pct);
  ring(ctx.sim, foe.x, foe.y, 30, '#8fd8ff');
  return true;
};

export const fireShot: SkillHandler = (ctx) => {
  const foe = single(ctx, 1.4 + (ctx.rank - 1) * 0.15, '#ff9a3c');
  if (!foe) return false;
  ring(ctx.sim, foe.x, foe.y, 34, '#ff9a3c');
  return true;
};

/** [TEMP] Strafe (skill rework, top tier [JOSEPH]): one arrow at each of up to 5 foes in reach. */
export const STRAFE = { targets: 5, mult: 0.9, perRank: 0.1 }; // [TEMP] skill follow-ups balance band (cd 11)

export const strafe: SkillHandler = (ctx) => {
  const foes = foesInReach(ctx, amazonReach(ctx.hero.attackRange)).slice(0, STRAFE.targets);
  if (!foes.length) {
    banner(ctx.sim, 'Nobody in reach.');
    return false;
  }
  const mult = STRAFE.mult + (ctx.rank - 1) * STRAFE.perRank;
  for (const foe of foes) arrow(ctx, foe, ctx.hero.ad * mult, '#f0e0a0');
  sfx(ctx.sim, 'swing');
  return true;
};

export const HANDLERS: Record<string, SkillHandler> = {
  'magic-arrow': magicArrow,
  'multi-shot': multiShot,
  'ice-shot': iceShot,
  'fire-shot': fireShot,
  strafe,
};
