import { ROSTER } from './data/classes/roster';
import { FORWARD_STEP, HERO_ART_LAYERS } from './heroSelectArt';

/**
 * Hero select screen (t373u-t375u): the Diablo II: Resurrected "Select Hero Class" campfire.
 * Pure data and state only (no DOM) so the selection rules and the modal are unit tested.
 */

/** The only effect left on the selected hero (t389u): the Sorceress's live canvas lightning. Everyone else holds lit. */
export type HeroFx = 'lightning';

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
   * The stand-back shade is normalised by this so every hero standing back sits at the same level.
   */
  lum: number;
}

/** Hotspot space: the 1024x420 reference image (the shipped WebP is the same frame at 1920px). */
export const HERO_ART = { url: 'ui/hero-select-bg.webp', width: 1024, height: 420 } as const;

/**
 * t389u: the approved standing-back base (1424x587, every hero shaded and still) is composited into the
 * backdrop with its top-left at (x, y) reference px; 1 base px = `scale` reference px (3200 px source / 1024).
 * The per-hero forward layers and clean plates (HERO_ART_LAYERS) are in base px.
 */
export const HERO_BASE = { x: 865 * 0.32, y: 429 * 0.32, scale: 0.32 } as const;

/** Forward pose cutout and its clean plate, shipped next to the backdrop. */
export function heroLayerUrls(id: string): { forward: string; plate: string } {
  return { forward: `ui/hero-forward/${id}.webp`, plate: `ui/hero-forward/${id}-plate.webp` };
}

/**
 * Left to right around the campfire, as in the art. x from the work order, refined by eye
 * against the backdrop (NEEDS JOSEPH: hotspot refinements).
 */
export const HERO_SPOTS: readonly HeroSpot[] = [
  { id: 'amazon', name: 'Amazon', x: 334, top: 160, feet: 288, w: 54, lum: 31.9 },
  { id: 'assassin', name: 'Assassin', x: 392, top: 166, feet: 282, w: 46, lum: 33.7 },
  { id: 'necromancer', name: 'Necromancer', x: 450, top: 158, feet: 276, w: 50, lum: 25.2 },
  { id: 'barbarian', name: 'Barbarian', x: 508, top: 146, feet: 270, w: 56, lum: 31.1 },
  { id: 'paladin', name: 'Paladin', x: 573, top: 154, feet: 272, w: 54, lum: 23.7 },
  { id: 'sorceress', name: 'Sorceress', x: 632, top: 140, feet: 286, w: 56, lum: 27.8 },
  { id: 'druid', name: 'Druid', x: 700, top: 156, feet: 282, w: 54, lum: 29.7 },
];

/** Selected-hero effects (t389u): only the Sorceress has one; the others get a simple lit hold. */
export const HERO_EFFECTS: Readonly<Record<string, HeroFx | null>> = {
  amazon: null,
  assassin: null,
  necromancer: null,
  barbarian: null,
  paladin: null,
  sorceress: 'lightning',
  druid: null,
};

/** Target mean luminance of a hero standing back (shaded). */
export const STAND_BACK_LUM = 17;
/** Unselected heroes are always at least this much darker than the art, so they read as "back". */
const MAX_STAND_BACK_GAIN = 0.8;

/**
 * What one hero looks like this frame. The overlay renders purely from this (no per-hero state is kept
 * between frames), so a hero that loses the selection is fully back the very next frame.
 */
export interface HeroLook {
  id: string;
  /** Selected: its forward layer replaces the standing figure, lit and held (no sway). */
  lit: boolean;
  /** Brightness multiplier on the backdrop over the standing hero: < 1 when standing back, 1 when lit. */
  gain: number;
  fx: HeroFx | null;
}

export function heroLook(id: string, selected: string): HeroLook {
  const spot = heroSpot(id);
  const lum = spot?.lum ?? STAND_BACK_LUM;
  if (id !== selected || !spot) {
    return { id, lit: false, gain: Math.min(MAX_STAND_BACK_GAIN, STAND_BACK_LUM / lum), fx: null };
  }
  return { id, lit: true, gain: 1, fx: HERO_EFFECTS[id] ?? null };
}

/** Every hero's look for a selection: exactly one lit (the selected one), the rest standing back. */
export function heroLooks(selected: string): HeroLook[] {
  return HERO_SPOTS.map((spot) => heroLook(spot.id, selected));
}

/** Where the forward pose sits: its standing-scale box stepped forward (scaled about the feet, then lowered). */
export function forwardRect(id: string): { x: number; y: number; w: number; h: number } | null {
  const art = HERO_ART_LAYERS[id];
  if (!art) return null;
  const [fx, fy] = art.feet;
  const [x, y, w, h] = art.forward;
  const s = FORWARD_STEP.scale;
  return {
    x: HERO_BASE.x + (fx + (x - fx) * s) * HERO_BASE.scale,
    y: HERO_BASE.y + (fy + (y - fy) * s + FORWARD_STEP.dy) * HERO_BASE.scale,
    w: w * s * HERO_BASE.scale,
    h: h * s * HERO_BASE.scale,
  };
}

/** A point given in the forward cutout's own px (standing scale), in reference px after the forward step. */
export function forwardPoint(id: string, px: number, py: number): { x: number; y: number } | null {
  const r = forwardRect(id);
  const art = HERO_ART_LAYERS[id];
  if (!r || !art) return null;
  return { x: r.x + (px / art.forward[2]) * r.w, y: r.y + (py / art.forward[3]) * r.h };
}

/** Clean plate box in reference px (drawn over the standing figure while the forward pose shows). */
export function plateRect(id: string): { x: number; y: number; w: number; h: number } | null {
  const art = HERO_ART_LAYERS[id];
  if (!art) return null;
  const [x, y, w, h] = art.plate;
  const k = HERO_BASE.scale;
  return { x: HERO_BASE.x + x * k, y: HERO_BASE.y + y * k, w: w * k, h: h * k };
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
