/**
 * ORDER "Make Necromancer playable": Teeth path handlers.
 * kits-final.md leaves every Necromancer effect and cooldown unset ([U]). These use only existing
 * mechanics: the existing projectile (as ranged basic attacks and the Amazon/Sorceress bolts) and the
 * existing armor buff (as Shout and Holy Shield). Every multiplier, count, reach and duration is [TEMP].
 * The Minions path is not built (no summon system; NEEDS JOSEPH).
 */
import { banner, damageUnit, ring, sfx } from '../combat';
import type { Unit } from '../types';
import type { CastContext, SkillHandler } from './types';

/** [TEMP] Reach beyond the basic attack range: Teeth (as the Amazon/Sorceress), Bone Spear, Bone Spirit. */
export const TEETH_REACH_BONUS = 40;
export const SPEAR_REACH_BONUS = 80;
export const SPIRIT_REACH_BONUS = 120;
/** [TEMP] Teeth: 2 + rank bolts (3 at rank 1), one per foe. */
export const TEETH = { base: 2, mult: 0.6, perRank: 0.08 };
export const SPEAR = { mult: 1.4, perRank: 0.12 };
export const SPIRIT = { mult: 1.8, perRank: 0.15 };
/** [TEMP] Bone Armor: armor buff on the Necromancer only (as Holy Shield). */
export const BONE_ARMOR = { armor: 12, perRank: 4, t: 8 };

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
function bolt(ctx: CastContext, foe: Unit, damage: number, color: string, radius: number): void {
  const { sim, hero } = ctx;
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.castT = 0.3;
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
    radius,
  });
}

function single(ctx: CastContext, bonus: number, mult: number, color: string, radius: number): boolean {
  const foe = foesInReach(ctx, ctx.hero.attackRange + bonus)[0];
  if (!foe) {
    banner(ctx.sim, 'Nobody in reach.');
    return false;
  }
  bolt(ctx, foe, ctx.hero.ad * mult, color, radius);
  sfx(ctx.sim, 'swing');
  return true;
}

export const teeth: SkillHandler = (ctx) => {
  const foes = foesInReach(ctx, ctx.hero.attackRange + TEETH_REACH_BONUS).slice(0, TEETH.base + ctx.rank);
  if (!foes.length) {
    banner(ctx.sim, 'Nobody in reach.');
    return false;
  }
  const mult = TEETH.mult + (ctx.rank - 1) * TEETH.perRank;
  for (const foe of foes) bolt(ctx, foe, ctx.hero.ad * mult, '#efe8d0', 4);
  sfx(ctx.sim, 'swing');
  return true;
};

export const boneSpear: SkillHandler = (ctx) =>
  single(ctx, SPEAR_REACH_BONUS, SPEAR.mult + (ctx.rank - 1) * SPEAR.perRank, '#e8e0c8', 6);

export const boneSpirit: SkillHandler = (ctx) =>
  single(ctx, SPIRIT_REACH_BONUS, SPIRIT.mult + (ctx.rank - 1) * SPIRIT.perRank, '#c8f0e0', 8);

export const boneArmor: SkillHandler = (ctx) => {
  const { hero } = ctx;
  hero.castT = 0.4;
  const armor = BONE_ARMOR.armor + (ctx.rank - 1) * BONE_ARMOR.perRank;
  hero.buffT = Math.max(hero.buffT, BONE_ARMOR.t);
  hero.buffArmor = Math.max(hero.buffArmor, armor);
  ring(ctx.sim, hero.x, hero.y, 60, '#e8e0c8');
  sfx(ctx.sim, 'cry');
  banner(ctx.sim, `Bone Armor raises defense by ${armor}.`);
  return true;
};

/** [TEMP] Blood Splash (skill rework, top skill [JOSEPH]): magic blast around one foe in reach. */
export const SPLASH_REACH_BONUS = 80;
export const BLOOD_SPLASH = { radius: 110, mult: 1.7, perRank: 0.2 }; // [TEMP] skill follow-ups balance band

export const bloodSplash: SkillHandler = (ctx) => {
  const { sim, hero } = ctx;
  const foe = foesInReach(ctx, hero.attackRange + SPLASH_REACH_BONUS)[0];
  if (!foe) {
    banner(sim, 'Nobody in reach.');
    return false;
  }
  hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
  hero.castT = 0.4;
  const damage = hero.ad * (BLOOD_SPLASH.mult + (ctx.rank - 1) * BLOOD_SPLASH.perRank);
  const cx = foe.x;
  const cy = foe.y;
  for (const u of sim.units) {
    if (!u.alive || u.team === hero.team || u.kind === 'base') continue;
    if (Math.hypot(u.x - cx, u.y - cy) - u.radius > BLOOD_SPLASH.radius) continue;
    damageUnit(sim, u, damage, hero, 'magic');
  }
  ring(sim, cx, cy, BLOOD_SPLASH.radius, '#a01818');
  sfx(sim, 'whirl');
  return true;
};

export const HANDLERS: Record<string, SkillHandler> = {
  teeth,
  'bone-spear': boneSpear,
  'bone-armor': boneArmor,
  'bone-spirit': boneSpirit,
  'blood-splash': bloodSplash,
};
