import { HANDLERS as AMAZON } from './amazon';
import { HANDLERS } from './barbarian';
import { HANDLERS as PALADIN } from './paladin';
import type { SkillHandler } from './types';

/** Barbarian, Amazon and Paladin skills used in a match, by skill id. The 1.13c JSON stays as reference. */
export const SKILLS: Record<string, SkillHandler> = { ...HANDLERS, ...AMAZON, ...PALADIN };
