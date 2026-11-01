import { ROSTER } from './data/classes/roster';

/**
 * Hero select screen (t373u-t375u): the Diablo II: Resurrected "Select Hero Class" campfire.
 * Pure data and state only (no DOM) so the selection rules and the modal are unit tested.
 */

/** Class-flavoured effect played on the selected hero (canvas overlay, no new art). */
export type HeroFx = 'sparks' | 'cold' | 'souls' | 'rage' | 'holy' | 'lightning';

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
  /**
   * Mean luminance (0-255) of the hero's box in the shipped backdrop (`python tools/hero-select-bg.py --measure`).
   * The D2R art was captured with the Sorceress selected, so she is baked in at about twice the brightness of
   * the others: the stand-back and lit gains below are normalised by this so every hero looks the same at rest.
   */
  lum: number;
  /** Extra baked light outside the body box that also has to stand back (the Sorceress's staff, hand and bolt haze). */
  bakedGlow?: ReadonlyArray<{ x: number; y: number; rx: number; ry: number }>;
}

/** Per-class look of the selected hero: glow colour, an accent colour for its effect, and how strong it plays. */
export interface HeroEffect {
  fx: HeroFx;
  glow: [number, number, number];
  accent: [number, number, number];
  /** 0..1: Assassin and Druid (Coming soon) play a subtle version. */
  strength: number;
}

/** Hotspot space: the 1024x420 reference image (the shipped WebP is the same frame at 1920px). */
export const HERO_ART = { url: 'ui/hero-select-bg.webp', width: 1024, height: 420 } as const;

/**
 * Left to right around the campfire, as in the art. x from the work order, refined by eye
 * against the backdrop (NEEDS JOSEPH: hotspot refinements).
 */
export const HERO_SPOTS: readonly HeroSpot[] = [
  { id: 'amazon', name: 'Amazon', x: 334, top: 160, feet: 288, w: 54, lum: 23.2 },
  { id: 'assassin', name: 'Assassin', x: 392, top: 166, feet: 282, w: 46, lum: 22.1 },
  { id: 'necromancer', name: 'Necromancer', x: 450, top: 158, feet: 276, w: 50, lum: 24.3 },
  { id: 'barbarian', name: 'Barbarian', x: 508, top: 146, feet: 270, w: 56, lum: 32.6 },
  { id: 'paladin', name: 'Paladin', x: 573, top: 154, feet: 272, w: 54, lum: 28.2 },
  { id: 'sorceress', name: 'Sorceress', x: 632, top: 140, feet: 286, w: 56, lum: 56.0, bakedGlow: [{ x: 648, y: 150, rx: 24, ry: 20 }, { x: 632, y: 134, rx: 40, ry: 15 }] },
  { id: 'druid', name: 'Druid', x: 700, top: 156, feet: 282, w: 54, lum: 34.8 },
];

/** One effect config per hero (t378u). */
export const HERO_EFFECTS: Readonly<Record<string, HeroEffect>> = {
  amazon: { fx: 'sparks', glow: [214, 226, 120], accent: [140, 235, 120], strength: 1 },
  assassin: { fx: 'cold', glow: [160, 200, 255], accent: [210, 232, 255], strength: 0.55 },
  necromancer: { fx: 'souls', glow: [110, 240, 160], accent: [176, 110, 255], strength: 1 },
  barbarian: { fx: 'rage', glow: [255, 92, 40], accent: [255, 160, 60], strength: 1 },
  paladin: { fx: 'holy', glow: [255, 214, 120], accent: [255, 240, 190], strength: 1 },
  sorceress: { fx: 'lightning', glow: [130, 170, 255], accent: [235, 242, 255], strength: 1 },
  druid: { fx: 'cold', glow: [160, 200, 255], accent: [210, 232, 255], strength: 0.55 },
};

/** Target mean luminance of a hero standing back (shadowed) and of the selected hero (lit). */
export const STAND_BACK_LUM = 17;
export const LIT_LUM = 52;
/** Unselected heroes are always at least this much darker than the art, so they read as "back". */
const MAX_STAND_BACK_GAIN = 0.8;

/**
 * What one hero looks like this frame. The overlay renders purely from this (no per-hero state is kept
 * between frames), so a hero that loses the selection is fully back the very next frame.
 */
export interface HeroLook {
  id: string;
  lit: boolean;
  /** Brightness multiplier on the backdrop over the hero: < 1 when standing back, 1 when lit. */
  gain: number;
  /** Brightness multiplier of the lifted copy (lit only; 0 when standing back). */
  lift: number;
  /** Glow halo, cast circle and effect strength (0 when standing back). */
  glow: number;
  sway: boolean;
  fx: HeroFx | null;
}

export function heroLook(id: string, selected: string): HeroLook {
  const spot = heroSpot(id);
  const effect = HERO_EFFECTS[id];
  const lum = spot?.lum ?? STAND_BACK_LUM;
  if (id !== selected || !spot || !effect) {
    return { id, lit: false, gain: Math.min(MAX_STAND_BACK_GAIN, STAND_BACK_LUM / lum), lift: 0, glow: 0, sway: false, fx: null };
  }
  const lift = Math.min(2.4, Math.max(1.15, LIT_LUM / lum)) * (0.85 + 0.15 * effect.strength);
  return { id, lit: true, gain: 1, lift, glow: effect.strength, sway: true, fx: effect.fx };
}

/** Every hero's look for a selection: exactly one lit (the selected one), the rest standing back. */
export function heroLooks(selected: string): HeroLook[] {
  return HERO_SPOTS.map((spot) => heroLook(spot.id, selected));
}

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
