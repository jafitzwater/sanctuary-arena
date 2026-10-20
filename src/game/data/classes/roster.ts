export interface ClassSlot {
  id: string;
  name: string;
  playable: boolean;
  blurb: string;
}

/** Seven Diablo II classes. Only entries with a ClassDef and playable: true can be chosen. */
export const ROSTER: ClassSlot[] = [
  { id: 'amazon', name: 'Amazon', playable: false, blurb: 'Coming soon.' },
  { id: 'assassin', name: 'Assassin', playable: false, blurb: 'Coming soon.' },
  { id: 'barbarian', name: 'Barbarian', playable: true, blurb: 'The only class in the match today.' },
  { id: 'druid', name: 'Druid', playable: false, blurb: 'Coming soon.' },
  { id: 'necromancer', name: 'Necromancer', playable: false, blurb: 'Coming soon.' },
  { id: 'paladin', name: 'Paladin', playable: false, blurb: 'Coming soon.' },
  { id: 'sorceress', name: 'Sorceress', playable: false, blurb: 'Coming soon.' },
];

export function playableIds(): string[] {
  return ROSTER.filter((entry) => entry.playable).map((entry) => entry.id);
}
