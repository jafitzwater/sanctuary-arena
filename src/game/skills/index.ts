import { HANDLERS as AMAZON } from './amazon';
import { HANDLERS } from './barbarian';
import { HANDLERS as PALADIN } from './paladin';
import { HANDLERS as SORCERESS } from './sorceress';
import type { SkillHandler } from './types';

/** Barbarian, Amazon, Paladin and Sorceress skills used in a match, by skill id. The 1.13c JSON stays as reference. */
export const SKILLS: Record<string, SkillHandler> = { ...HANDLERS, ...AMAZON, ...PALADIN, ...SORCERESS };
