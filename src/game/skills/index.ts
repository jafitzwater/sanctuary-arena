import { banner } from '../combat';
import skills from '../data/d2/skills-barbarian.json';
import { HANDLERS } from './barbarian';
import type { SkillHandler } from './types';

/**
 * Skill id → behavior. Passive masteries are applied in heroNumbers;
 * their handlers exist so every tree row can be addressed.
 */
export const SKILLS: Record<string, SkillHandler> = {};

for (const skill of skills) {
  const active = HANDLERS[skill.id];
  SKILLS[skill.id] =
    active ??
    ((ctx) => {
      banner(ctx.sim, `${skill.name} is passive. Spend the point in the tree.`);
      return false;
    });
}
