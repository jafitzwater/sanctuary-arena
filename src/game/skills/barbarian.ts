import { banner, damageUnit, ring, sfx } from '../combat';
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

export const bash: SkillHandler = (ctx) => {
  const { sim, hero, rank } = ctx;
  const foe = nearestInReach(ctx, hero.attackRange + 18);
  if (foe) {
    hero.facing = Math.atan2(foe.y - hero.y, foe.x - hero.x);
    hero.swing = 1;
    const damage = hero.ad * (1.05 + rank * 0.2) + 10 * rank;
    damageUnit(sim, foe, damage, hero);
    foe.stun = Math.max(foe.stun, 0.32 + rank * 0.12);
    ring(sim, foe.x, foe.y, 40, '#f2e2b6');
  } else {
    hero.bashT = 4;
    banner(sim, 'Bash readied.');
  }
  sfx(sim, 'bash');
  return true;
};

export const leap: SkillHandler = (ctx) => {
  const { sim, hero, rank, aimX, aimY } = ctx;
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
  hero.leap = { t: 0, dur: 0.42, x0: hero.x, y0: hero.y, x1, y1, rank };
  hero.targetId = null;
  sfx(sim, 'leap');
  return true;
};

export const warcry: SkillHandler = (ctx) => {
  const { sim, hero, rank } = ctx;
  const radius = 168 + rank * 14;
  const buffDmg = 0.1 + rank * 0.04;
  const buffArmor = 6 + rank * 4;
  for (const unit of sim.units) {
    if (!unit.alive) continue;
    const gap = Math.hypot(unit.x - hero.x, unit.y - hero.y);
    if (gap > radius + unit.radius) continue;
    if (unit.team === hero.team) {
      unit.buffT = 4;
      unit.buffDmg = Math.max(unit.buffDmg, buffDmg);
      unit.buffArmor = Math.max(unit.buffArmor, buffArmor);
    } else {
      damageUnit(sim, unit, 18 + rank * 12, hero);
      unit.slow = Math.max(unit.slow, 1.35);
      unit.slowPct = Math.max(unit.slowPct, 0.32);
    }
  }
  ring(sim, hero.x, hero.y, radius, '#e6d3a1');
  sfx(sim, 'cry');
  return true;
};

export const whirlwind: SkillHandler = (ctx) => {
  const { sim, hero, rank } = ctx;
  hero.whirlT = 1.4 + rank * 0.18;
  hero.whirlTick = 0;
  hero.whirlRank = rank;
  sfx(sim, 'whirl');
  return true;
};
