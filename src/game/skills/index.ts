import { HANDLERS as AMAZON } from './amazon';
import { HANDLERS } from './barbarian';
import type { SkillHandler } from './types';

/** Barbarian and Amazon skills used in a match, by skill id. The 1.13c JSON stays as reference. */
export const SKILLS: Record<string, SkillHandler> = { ...HANDLERS, ...AMAZON };
