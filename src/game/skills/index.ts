import { bash, leap, warcry, whirlwind } from './barbarian';
import type { SkillHandler } from './types';

/**
 * Skill id → behavior. Class data names the skill; this map makes it real.
 * A new class registers its handlers here without changing the match loop.
 */
export const SKILLS: Record<string, SkillHandler> = {
  bash,
  leap,
  warcry,
  whirlwind,
};
