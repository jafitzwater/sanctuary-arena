import { amazon } from './amazon';
import { barbarian } from './barbarian';
import { paladin } from './paladin';
import { sorceress } from './sorceress';
import type { ClassDef } from './types';

/**
 * Playable classes. To add one of the other Diablo II classes later:
 * 1. Create a ClassDef module beside barbarian.ts (stats, skills, colors).
 * 2. Register it in this map.
 * 3. Add a sprite branch in src/game/render.ts (drawSprite).
 * 4. Register skill handlers in src/game/skills/index.ts.
 * The match loop only looks champions up through these registries.
 */
export const CLASSES: Record<string, ClassDef> = {
  barbarian,
  amazon,
  paladin,
  sorceress,
};

export function getClass(id: string): ClassDef {
  const found = CLASSES[id];
  if (!found) throw new Error(`Unknown class "${id}"`);
  return found;
}

export const DEFAULT_CLASS_ID = 'barbarian';
