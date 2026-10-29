/**
 * ORDER "Make Sorceress playable" handlers, reworked by the "Skill rework (no paths)" order: Frost Bolt
 * (ice-bolt), Lightning [TEMP], Teleport, Fire Blast [TEMP], Blizzard. Frozen Nova and Frozen Orb were deleted.
 * kits-final.md leaves every Sorceress effect and cooldown unset ([U]). These use only existing
 * mechanics: the existing projectile (as ranged basic attacks and the Amazon arrows), the existing
 * slow stack (as Ice Shot), magic area damage (as Battle Hammers) and an instant reposition (as the
 * recall's arrival). Every multiplier, slow, radius, range and duration is [TEMP].
 */
import { banner, damageUnit, ring, sfx } from '../combat';
import { clampToPlayable } from '../lane';
import { clamp } from '../math';
import type { Sim, Unit } from '../types';
import type { CastContext, SkillHandler } from './types';

/** [TEMP] Single-target reach beyond the basic attack range (same as the Amazon). */
export const SORC_SKILL_REACH_BONUS = 40;
/** [TEMP] Slows (pct, seconds), pushed on the existing slow stack. */
export const ICE_BOLT_SLOW = { pct: 0.25, t: 1.5 };
export const BLIZZARD = { range: 320, radius: 110, pct: 0.35, t: 2 };
/** [TEMP] Skill rework placeholders: Lightning (instant single hit), Fire Blast (burst around the target). */
export const LIGHTNING = { mult: 1.3, perRank: 0.12 };
export const FIRE_BLAST = { radius: 100, mult: 1.4, perRank: 0.15 };
/** [TEMP] Teleport range: base plus per rank. */
export const TELEPORT = { range: 260, perRank: 20 };

function gapTo(x: number, y: number, unit: Unit): number {
  return Math.hypot(unit.x - x, unit.y - y) - unit.radius;
}

function foesNear(sim: Sim, hero: Unit, x: number, y: number, r: number): Unit[] {
  return sim.units.filter((u) => u.alive && u.team !== hero.team && u.kind !== 'base' && gapTo(x, y, u) <= r);
}

function target(ctx: CastContext): Unit | null {
  const { sim, hero } = ctx;
  const reach = hero.attackRange + SORC_SKILL_REACH_BONUS;
  const list = foesNear(sim, hero, hero.x, hero.y, reach).sort((a, b) => gapTo(hero.x, hero.y, a) - gapTo(hero.x, hero.y, b));
  const focus = ctx.focusId != null ? list.find((u) => u.id === ctx.focusId) : undefined;
  return focus ?? list[0] ?? null;
}

function chill(foe: Unit, slow: { pct: number; t: number }): void {
  if (!foe.alive) return;
  foe.slows.push({ pct: slow.pct, t: slow.t });
  foe.slow = Math.max(foe.slow, slow.t);
  foe.slowPct = Math.max(foe.slowPct, slow.pct);
}

function area(ctx: CastContext, x: number, y: number, r: number, damage: number, slow: { pct: number; t: number } | null, color: string): number {
  const { sim, hero } = ctx;
  const hit = foesNear(sim, hero, x, y, r);
  for (const u of hit) {
    damageUnit(sim, u, damage, hero, 'magic');
    if (slow) chill(u, slow);
  }
  ring(sim, x, y, r, color);
  return hit.length;
}

/** Same shape as the sim's basic-attack projectile (sim.ts shoot), as the Amazon arrows. */
export const iceBolt: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  const foe = target(ctx);
  if (!foe) {
    banner(sim, 'Nobody in reach.');
    return false;
  }
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.castT = 0.3;
  sim.projectiles.push({
    id: sim.nextId++,
    team: hero.team,
    x: hero.x + Math.cos(hero.facing) * hero.radius,
    y: hero.y + Math.sin(hero.facing) * hero.radius,
    speed: hero.projectileSpeed,
    damage: hero.ad * (1.1 + (ctx.rank - 1) * 0.1),
    targetId: foe.id,
    attackerId: hero.id,
    life: 1.8,
    color: '#9fdcff',
    radius: 6,
  });
  chill(foe, ICE_BOLT_SLOW);
  sfx(sim, 'swing');
  return true;
};

/** [TEMP] Lightning: an instant magic hit on one foe (no projectile), as Smite's direct hit. */
export const lightning: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  const foe = target(ctx);
  if (!foe) {
    banner(sim, 'Nobody in reach.');
    return false;
  }
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.castT = 0.3;
  damageUnit(sim, foe, hero.ad * (LIGHTNING.mult + (ctx.rank - 1) * LIGHTNING.perRank), hero, 'magic');
  ring(sim, foe.x, foe.y, 26, '#fff4a0');
  sfx(sim, 'swing');
  return true;
};

export const blizzard: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  let dx = ctx.aimX - hero.x;
  let dy = ctx.aimY - hero.y;
  let d = Math.hypot(dx, dy);
  if (d < 28) {
    dx = Math.cos(hero.facing) * BLIZZARD.range * 0.6;
    dy = Math.sin(hero.facing) * BLIZZARD.range * 0.6;
    d = Math.hypot(dx, dy);
  }
  const s = d > BLIZZARD.range ? BLIZZARD.range / d : 1;
  const x = hero.x + dx * s;
  const y = hero.y + dy * s;
  hero.facing = Math.atan2(dy, dx);
  hero.castT = 0.4;
  const hits = area(ctx, x, y, BLIZZARD.radius, hero.ad * (1.2 + (ctx.rank - 1) * 0.15), BLIZZARD, '#d8f0ff');
  sfx(sim, 'whirl');
  if (!hits) banner(sim, 'The blizzard hits nothing.');
  return true;
};

/** [TEMP] Fire Blast: a burst on one foe that hits every foe around it (the old Frozen Orb shape, no slow). */
export const fireBlast: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  const foe = target(ctx);
  if (!foe) {
    banner(sim, 'Nobody in reach.');
    return false;
  }
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.castT = 0.4;
  area(ctx, foe.x, foe.y, FIRE_BLAST.radius, hero.ad * (FIRE_BLAST.mult + (ctx.rank - 1) * FIRE_BLAST.perRank), null, '#ff8a3c');
  sfx(sim, 'whirl');
  return true;
};

/** Instant reposition toward the aim point, clamped to the playable map (as Leap Attack's landing). */
export const teleport: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  const maxR = TELEPORT.range + (ctx.rank - 1) * TELEPORT.perRank;
  let dx = ctx.aimX - hero.x;
  let dy = ctx.aimY - hero.y;
  let d = Math.hypot(dx, dy);
  if (d < 28) {
    dx = Math.cos(hero.facing) * maxR;
    dy = Math.sin(hero.facing) * maxR;
    d = maxR;
  }
  const s = d > maxR ? maxR / d : 1;
  const landed = clampToPlayable(sim.map, hero.x + dx * s, hero.y + dy * s);
  ring(sim, hero.x, hero.y, 34, '#c8a8ff');
  hero.facing = Math.atan2(dy, dx);
  hero.x = clamp(landed.x, 36, sim.map.width - 36);
  hero.y = clamp(landed.y, 36, sim.map.height - 36);
  hero.targetId = null;
  ring(sim, hero.x, hero.y, 34, '#c8a8ff');
  sfx(sim, 'leap');
  return true;
};

export const HANDLERS: Record<string, SkillHandler> = {
  'ice-bolt': iceBolt,
  lightning,
  teleport,
  'fire-blast': fireBlast,
  blizzard,
};
