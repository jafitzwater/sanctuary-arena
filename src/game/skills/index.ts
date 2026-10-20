import { HANDLERS } from './barbarian';
import type { SkillHandler } from './types';

/** The six Barbarian skills used in a match. The 1.13c JSON stays as reference. */
export const SKILLS: Record<string, SkillHandler> = { ...HANDLERS };
