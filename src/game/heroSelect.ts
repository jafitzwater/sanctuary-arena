import { ROSTER } from './data/classes/roster';

/**
 * Hero select screen (t373u-t375u): the Diablo II: Resurrected "Select Hero Class" campfire.
 * Pure data and state only (no DOM) so the selection rules and the modal are unit tested.
 */

/** Effect played on the selected hero (canvas overlay, no new art). */
export type HeroFx = 'arrow' | 'shadow' | 'bone' | 'fury' | 'holy' | 'lightning' | 'nature';

export interface HeroSpot {
  id: string;
  name: string;
  /** Centre x of the hero in the 1024-wide reference art. */
  x: number;
  /** Head top and feet y in the 1024x420 reference art. */
  top: number;
  feet: number;
  /** Hotspot width in reference px. */
  w: number;
  /** RGB used for the glow. */
  glow: [number, number, number];
  fx: HeroFx;
}

/** Hotspot space: the 1024x420 reference image (the shipped WebP is the same frame at 1920px). */
export const HERO_ART = { url: 'ui/hero-select-bg.webp', width: 1024, height: 420 } as const;

/**
 * Left to right around the campfire, as in the art. x from the work order, refined by eye
 * against the backdrop (NEEDS JOSEPH: hotspot refinements).
 */
export const HERO_SPOTS: readonly HeroSpot[] = [
  { id: 'amazon', name: 'Amazon', x: 334, top: 160, feet: 288, w: 54, glow: [255, 196, 96], fx: 'arrow' },
  { id: 'assassin', name: 'Assassin', x: 392, top: 166, feet: 282, w: 46, glow: [178, 120, 255], fx: 'shadow' },
  { id: 'necromancer', name: 'Necromancer', x: 450, top: 158, feet: 276, w: 50, glow: [120, 255, 170], fx: 'bone' },
  { id: 'barbarian', name: 'Barbarian', x: 508, top: 146, feet: 270, w: 56, glow: [255, 104, 56], fx: 'fury' },
  { id: 'paladin', name: 'Paladin', x: 573, top: 154, feet: 272, w: 54, glow: [255, 226, 140], fx: 'holy' },
  { id: 'sorceress', name: 'Sorceress', x: 632, top: 140, feet: 286, w: 56, glow: [130, 170, 255], fx: 'lightning' },
  { id: 'druid', name: 'Druid', x: 700, top: 156, feet: 282, w: 54, glow: [150, 220, 110], fx: 'nature' },
];

/**
 * One table for the D2-voice blurbs. Each is drawn from the original design doc's class
 * description (paths and skills); the Sorceress uses the D2 line Joseph pointed at.
 * Assassin and Druid are not in the game: their screen shows COMING_SOON instead.
 */
export const HERO_BLURBS: Readonly<Record<string, string>> = {
  amazon: 'Sworn to bow and lance, she looses arrows of magic, ice, and fire — or strikes close with poison and lightning.',
  assassin: 'A shadow of the Viz-Jaq\'taar, she hunts the corrupted with blade and cunning.',
  necromancer: 'A priest of Rathma who walks between life and death — he hurls teeth and bone, and raises the dead to serve.',
  barbarian: 'A warrior of the northern steppes who knows only fury — he bashes, leaps, and whirls through the horde.',
  paladin: 'A crusader of the Light, he smites the wicked with zeal and holy shield, and calls down the blessed hammer.',
  sorceress: 'She has mastered the elemental magicks — fire, lightning, and ice.',
  druid: 'A shapeshifter of the northern forests who calls upon the elements and the beasts of the wild.',
};

export const COMING_SOON = 'Coming soon';

export function heroSpot(id: string): HeroSpot | undefined {
  return HERO_SPOTS.find((spot) => spot.id === id);
}

/** Playable = in the game roster with playable: true. Assassin and Druid are not in the roster. */
export function isPlayableHero(id: string): boolean {
  return ROSTER.some((entry) => entry.id === id && entry.playable);
}

export interface HeroSelectView {
  id: string;
  name: string;
  blurb: string;
  comingSoon: boolean;
  /** "Enter Sanctuary" is in the DOM only while this is true. */
  showEnter: boolean;
}

/** What the header and the Enter button show for a selected hero. */
export function heroSelectView(id: string): HeroSelectView {
  const spot = heroSpot(id);
  const playable = isPlayableHero(id);
  return {
    id,
    name: spot?.name ?? id,
    blurb: playable ? (HERO_BLURBS[id] ?? '') : COMING_SOON,
    comingSoon: !playable,
    showEnter: playable,
  };
}

/** Arrow keys walk the line of heroes (wrapping). */
export function stepHero(id: string, dir: -1 | 1): string {
  const index = HERO_SPOTS.findIndex((spot) => spot.id === id);
  const n = HERO_SPOTS.length;
  const next = index < 0 ? 0 : (index + dir + n) % n;
  return HERO_SPOTS[next].id;
}

/** Hotspot box as percentages of the art frame (the stage keeps the art's aspect and covers the screen). */
export function spotBox(spot: HeroSpot): { left: number; top: number; width: number; height: number } {
  const pad = 6;
  const top = spot.top - pad;
  const bottom = spot.feet + pad;
  return {
    left: ((spot.x - spot.w / 2) / HERO_ART.width) * 100,
    top: (top / HERO_ART.height) * 100,
    width: (spot.w / HERO_ART.width) * 100,
    height: ((bottom - top) / HERO_ART.height) * 100,
  };
}

/**
 * Cover fit of the art in a viewport (same rule as the CSS: width = max(vw, vh * aspect), centred).
 * Used by tests to check every hero stays on screen at the target sizes.
 */
export function coverFit(vw: number, vh: number): { scale: number; left: number; top: number } {
  const scale = Math.max(vw / HERO_ART.width, vh / HERO_ART.height);
  return { scale, left: (vw - HERO_ART.width * scale) / 2, top: (vh - HERO_ART.height * scale) / 2 };
}

/** How-to-play modal: "?" toggles; X, Esc, and a click outside the card close it. */
export type HowToEvent =
  | { type: 'toggle' }
  | { type: 'close' }
  | { type: 'key'; key: string }
  | { type: 'pointer'; insideCard: boolean };

export function howToNext(open: boolean, event: HowToEvent): boolean {
  switch (event.type) {
    case 'toggle':
      return !open;
    case 'close':
      return false;
    case 'key':
      return event.key === 'Escape' ? false : open;
    case 'pointer':
      return open && event.insideCard;
  }
}
