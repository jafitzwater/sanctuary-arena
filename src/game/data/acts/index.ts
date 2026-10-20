import { act1 } from './act1';
import type { ActDef } from './types';

/**
 * Act maps. To add Acts II–V later:
 * 1. Create an ActDef module (lane, bases, towers, waves, theme).
 * 2. Register it here.
 * 3. If the act needs new scenery, add a theme.decor id and a paint branch
 *    in src/game/render.ts. New monsters go in src/game/data/units.ts.
 * The simulator treats every act the same: one lane, two bases, towers, waves.
 */
export const ACTS: Record<string, ActDef> = {
  act1,
};

export function getAct(id: string): ActDef {
  const found = ACTS[id];
  if (!found) throw new Error(`Unknown act "${id}"`);
  return found;
}

export const DEFAULT_ACT_ID = 'act1';
