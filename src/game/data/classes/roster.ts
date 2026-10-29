export interface ClassSlot {
  id: string;
  name: string;
  playable: boolean;
  blurb: string;
}

/**
 * Doc: "The characters to choose are barbarian, paladin, sorceress, amazon, and necromancer."
 * Only entries with a ClassDef and playable: true can be chosen.
 */
export const ROSTER: ClassSlot[] = [
  { id: 'amazon', name: 'Amazon', playable: true, blurb: 'Bow skills and Strafe, ranged.' },
  { id: 'barbarian', name: 'Barbarian', playable: true, blurb: 'The only class in the match today.' },
  { id: 'necromancer', name: 'Necromancer', playable: true, blurb: 'Bone skills and Blood Splash, caster.' },
  { id: 'paladin', name: 'Paladin', playable: true, blurb: 'Holy melee and Blessed Hammer.' },
  { id: 'sorceress', name: 'Sorceress', playable: true, blurb: 'Frost, lightning and fire, caster.' },
];

export function playableIds(): string[] {
  return ROSTER.filter((entry) => entry.playable).map((entry) => entry.id);
}
