/**
 * ORDER "Make Paladin playable": the Paladin's one path.
 * kits-final.md leaves every Paladin effect and cooldown unset ([U]). These use only existing
 * mechanics: the melee hit (as Bash), the existing stun, the existing leap (as Leap Attack),
 * the existing armor buff (as Shout) and magic area damage. Every multiplier, count, stun,
 * radius and duration is [TEMP].
 */
import { banner, damageUnit, noteDebuff, ring, sfx } from '../combat';
import { clampToPlayable } from '../lane';
import { clamp } from '../math';
import type { Unit } from '../types';
import type { CastContext, SkillHandler } from './types';

/** [TEMP] Melee skill reach beyond the basic attack range (same as Bash). */
export const PALADIN_MELEE_REACH_BONUS = 18;
/** [TEMP] Charge reach. */
export const CHARGE_REACH = 260;
/** [TEMP] Zeal hits per cast. */
export const ZEAL_HITS = 3;
/** [TEMP] Smite stun seconds. */
export const SMITE_STUN = 0.8;
/** [TEMP] Holy Shield: self armor and seconds. */
export const HOLY_SHIELD = { armor: 15, perRank: 5, t: 8 };
/** [TEMP] Blessed Hammer (id battle-hammers) radius. */
export const HAMMER_RADIUS = 150;

function gapTo(hero: Unit, unit: Unit): number {
  return Math.hypot(unit.x - hero.x, unit.y - hero.y) - unit.radius;
}

function foeFor(ctx: CastContext, reach: number): Unit | null {
  const { sim, hero } = ctx;
  if (ctx.focusId != null) {
    const focus = sim.units.find((u) => u.id === ctx.focusId);
    if (focus && focus.alive && focus.team !== hero.team && gapTo(hero, focus) <= reach) return focus;
  }
  let best: Unit | null = null;
  let bestD = reach;
  for (const u of sim.units) {
    if (!u.alive || u.team === hero.team) continue;
    const gap = gapTo(hero, u);
    if (gap <= bestD) {
      bestD = gap;
      best = u;
    }
  }
  return best;
}

function hit(ctx: CastContext, foe: Unit, damage: number): void {
  const { hero } = ctx;
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.swing = 1;
  damageUnit(ctx.sim, foe, damage, hero, 'magic');
}

export const zeal: SkillHandler = (ctx) => {
  const foe = foeFor(ctx, ctx.hero.attackRange + PALADIN_MELEE_REACH_BONUS);
  if (!foe) {
    banner(ctx.sim, 'Nobody in reach.');
    return false;
  }
  const mult = 0.5 + (ctx.rank - 1) * 0.05;
  for (let i = 0; i < ZEAL_HITS && foe.alive; i++) hit(ctx, foe, ctx.hero.ad * mult);
  ring(ctx.sim, foe.x, foe.y, 30, '#f2e2b6');
  sfx(ctx.sim, 'bash');
  return true;
};

export const smite: SkillHandler = (ctx) => {
  const foe = foeFor(ctx, ctx.hero.attackRange + PALADIN_MELEE_REACH_BONUS);
  if (!foe) {
    banner(ctx.sim, 'Nobody in reach.');
    return false;
  }
  hit(ctx, foe, ctx.hero.ad * (1.1 + (ctx.rank - 1) * 0.1));
  if (foe.alive) {
    foe.stun = Math.max(foe.stun, SMITE_STUN);
    noteDebuff(ctx.sim, foe, ctx.hero);
  }
  ring(ctx.sim, foe.x, foe.y, 34, '#e8e0ff');
  sfx(ctx.sim, 'bash');
  return true;
};

/** Charge reuses the existing leap (sim.ts advanceLeap): rush to the foe and strike on arrival. */
export const charge: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  const foe = foeFor(ctx, CHARGE_REACH);
  if (!foe) {
    banner(sim, 'Nobody in reach.');
    return false;
  }
  const ang = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  const stop = Math.max(0, Math.hypot(foe.x - hero.x, foe.y - hero.y) - foe.radius - hero.radius);
  const landed = clampToPlayable(sim.map, hero.x + Math.cos(ang) * stop, hero.y + Math.sin(ang) * stop);
  const x1 = clamp(landed.x, 36, sim.map.width - 36);
  const y1 = clamp(landed.y, 36, sim.map.height - 36);
  hero.facing = ang;
  hero.leap = { t: 0, dur: 0.32, x0: hero.x, y0: hero.y, x1, y1, rank: ctx.rank, kind: 'leap-attack' };
  hero.targetId = foe.id;
  sfx(sim, 'leap');
  return true;
};

/** Holy Shield reuses the existing armor buff (as Shout), on the Paladin only. */
export const holyShield: SkillHandler = (ctx) => {
  const { hero } = ctx;
  hero.castT = 0.4;
  const armor = HOLY_SHIELD.armor + (ctx.rank - 1) * HOLY_SHIELD.perRank;
  hero.buffT = Math.max(hero.buffT, HOLY_SHIELD.t);
  hero.buffArmor = Math.max(hero.buffArmor, armor);
  ring(ctx.sim, hero.x, hero.y, 60, '#f4e7a8');
  sfx(ctx.sim, 'cry');
  banner(ctx.sim, `Holy Shield raises defense by ${armor}.`);
  return true;
};

export const battleHammers: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  hero.castT = 0.4;
  const damage = hero.ad * (0.8 + (ctx.rank - 1) * 0.1);
  let hits = 0;
  for (const u of [...sim.units]) {
    if (!u.alive || u.team === hero.team || u.kind === 'base') continue;
    if (Math.hypot(u.x - hero.x, u.y - hero.y) > HAMMER_RADIUS + u.radius) continue;
    damageUnit(sim, u, damage, hero, 'magic');
    hits += 1;
  }
  ring(sim, hero.x, hero.y, HAMMER_RADIUS, '#d8e4ff');
  sfx(sim, 'whirl');
  if (!hits) banner(sim, 'The hammers hit nothing.');
  return true;
};

export const HANDLERS: Record<string, SkillHandler> = {
  zeal,
  smite,
  charge,
  'holy-shield': holyShield,
  'battle-hammers': battleHammers,
};
