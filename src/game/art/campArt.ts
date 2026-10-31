/**
 * t337u "Put the 3D camps in the game": one themed 3D-rendered camp per jungle zone (Sprite Director samples
 * camp-3d-v1, Blender 4.5 Cycles, CC0 sources; see CREDITS.md), drawn on the zone floor at each monster den.
 *
 * Art only: den positions, camp contents, collision and pathing are untouched by this module.
 *  - public/camps/camp-3d-<theme>.webp: the camp at bake scale (1 image px = 1 bake px), transparent, with a soft
 *    noise-edged clearing so it blends into the floor. Baked into the floor chunks under everything (render.ts).
 *  - public/camps/camp-3d-<theme>-foot.png: y-sort "foot map" (scripts/camp-footmap.py). For each pixel of a
 *    standing object it stores how far below that pixel its ground point lies. A unit whose feet are behind an
 *    object's feet gets that object's pixels drawn over it again (campFrontMask), so heroes walk behind and in
 *    front of stones, trees, pillars and statues.
 * The file names are stable: scripts/import-camps.sh converts a later camp-3d-v<N>-<theme>.png with the same
 * size and anchor into the same files. If the image fails to load the den keeps the code-drawn clearing (the art
 * before this order); if only the foot map fails the camp still draws, flat under units.
 *
 * Pure parts (names, sizes, zone -> theme, the mask) are DOM-free for test/camps-3d.ts.
 */
import type { ActDef, DenSpawn } from '../data/acts/types';
import { zoneAt, type ZoneId } from '../data/mapZones';

export type CampTheme = 'jungle' | 'plains' | 'desert' | 'forge';
export const CAMP_THEMES: readonly CampTheme[] = ['jungle', 'plains', 'desert', 'forge'];

/** Image size and anchor (den centre, image px) of each camp; v2 art must keep them (scripts/import-camps.sh). */
export const CAMP_ART: Record<CampTheme, { w: number; h: number; ax: number; ay: number }> = {
  jungle: { w: 977, h: 510, ax: 484, ay: 317 },
  plains: { w: 593, h: 316, ax: 328, ay: 165 },
  desert: { w: 577, h: 328, ax: 269, ay: 214 },
  forge: { w: 725, h: 407, ax: 359, ay: 229 },
};

/**
 * One camp per jungle zone (Gamebot for Joseph): dense jungle = jungle cave, open plains = Cairn Stones,
 * desert = ruin gate, lava field (the River of Flame side of the jungle) = Hell Forge.
 */
export const ZONE_CAMP: Partial<Record<ZoneId, CampTheme>> = {
  'jungle-dense': 'jungle',
  'jungle-plains': 'plains',
  'jungle-desert': 'desert',
  'jungle-lava': 'forge',
};

export function campThemeAt(map: ActDef, x: number, y: number): CampTheme | null {
  return ZONE_CAMP[zoneAt(map, x, y)] ?? null;
}

export function campThemeForDen(map: ActDef, den: DenSpawn): CampTheme | null {
  return campThemeAt(map, den.x, den.y);
}

export function campArtUrl(base: string, theme: CampTheme): string {
  return `${base}camps/camp-3d-${theme}.webp`;
}

export function campFootUrl(base: string, theme: CampTheme): string {
  return `${base}camps/camp-3d-${theme}-foot.png`;
}

/** Foot map code: 0 = ground, v >= 1 = foot (v - 1) * FOOT_STEP px below the pixel. */
export const FOOT_STEP = 2;
/** Object parts lower than this (bake px, ~0.45 m: platform, steps, flagstones, lava moat) count as ground. */
export const GROUND_FOOT_PX = 16;

/** Foot y (image px) of the object pixel at (x, y), or -1 for ground. */
export function footYAt(foot: Uint8Array, w: number, x: number, y: number): number {
  const v = foot[y * w + x];
  if (!v) return -1;
  const off = (v - 1) * FOOT_STEP;
  return off < GROUND_FOOT_PX ? -1 : y + off;
}

/**
 * Alpha mask (RGBA, alpha only) of the object pixels inside image rect [x0, x1) x [y0, y1) whose foot lies in
 * front of (below) footLimit, i.e. the pixels to draw over a unit standing at footLimit. Returns the count.
 */
export function campFrontMask(
  foot: Uint8Array, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number, footLimit: number, out: Uint8ClampedArray,
): number {
  const rw = x1 - x0;
  let n = 0;
  out.fill(0, 0, rw * (y1 - y0) * 4);
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    const row = y * w;
    const orow = (y - y0) * rw;
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const v = foot[row + x];
      if (!v) continue;
      const off = (v - 1) * FOOT_STEP;
      if (off < GROUND_FOOT_PX || y + off <= footLimit) continue;
      out[(orow + x - x0) * 4 + 3] = 255;
      n++;
    }
  }
  return n;
}

export interface CampSprite {
  theme: CampTheme;
  img: CanvasImageSource;
  w: number;
  h: number;
  ax: number;
  ay: number;
  /** null when the foot map failed: the camp still draws, flat under units. */
  foot: Uint8Array | null;
}

export type CampState = 'idle' | 'loading' | 'ready' | 'failed';

/** Loads one camp: the image (rejects on error or a wrong size) and its foot map (null on failure). */
export type CampLoader = (theme: CampTheme) => Promise<{ img: CanvasImageSource; foot: Uint8Array | null }>;

/** Per-theme async load state; the renderer asks campSprite() every frame and never waits. */
export class CampArtStore {
  private state = new Map<CampTheme, CampState>();
  private sprites = new Map<CampTheme, CampSprite>();
  private waiters: (() => void)[] = [];
  readonly failures: CampTheme[] = [];
  loadMs = 0;
  private t0 = 0;

  constructor(private readonly loader: CampLoader | null) {}

  status(theme: CampTheme): CampState {
    return this.state.get(theme) ?? 'idle';
  }

  /** The camp art if loaded; starts the load on first call. null = not yet, or failed (draw the old den). */
  sprite(theme: CampTheme): CampSprite | null {
    if (this.status(theme) === 'idle') this.start(theme);
    return this.sprites.get(theme) ?? null;
  }

  /** Called whenever a camp finishes loading (the bake then repaints the chunks under it). */
  onChange(cb: () => void): void {
    this.waiters.push(cb);
  }

  start(theme: CampTheme): Promise<void> {
    if (this.status(theme) !== 'idle' || !this.loader) return Promise.resolve();
    this.state.set(theme, 'loading');
    if (!this.t0) this.t0 = now();
    return this.loader(theme).then(
      ({ img, foot }) => {
        const size = CAMP_ART[theme];
        this.sprites.set(theme, { theme, img, ...size, foot: foot && foot.length === size.w * size.h ? foot : null });
        this.state.set(theme, 'ready');
        this.settle();
      },
      () => {
        this.state.set(theme, 'failed');
        this.failures.push(theme);
        this.settle();
      },
    );
  }

  private settle(): void {
    this.loadMs = now() - this.t0;
    for (const cb of this.waiters) cb();
  }

  /** Debug/stat line: states, failures, decoded bytes (RGBA image + foot map). */
  stats(): { states: Record<string, CampState>; failures: CampTheme[]; decodedBytes: number; loadMs: number } {
    const states: Record<string, CampState> = {};
    let bytes = 0;
    for (const theme of CAMP_THEMES) {
      states[theme] = this.status(theme);
      const s = this.sprites.get(theme);
      if (s) bytes += s.w * s.h * 4 + (s.foot?.byteLength ?? 0);
    }
    return { states, failures: [...this.failures], decodedBytes: bytes, loadMs: Math.round(this.loadMs) };
  }
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

const LOAD_TIMEOUT_MS = 15000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    const timer = setTimeout(() => reject(new Error(`timeout ${url}`)), LOAD_TIMEOUT_MS);
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`load ${url}`));
    };
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.src = url;
  });
}

/** Browser loader: WebP art + foot map (red channel of the grey PNG, read once, then the canvas is dropped). */
export const browserCampLoader: CampLoader = async (theme) => {
  const base = import.meta.env.BASE_URL;
  const size = CAMP_ART[theme];
  const footP = loadImage(campFootUrl(base, theme)).then(
    (img) => {
      if (img.naturalWidth !== size.w || img.naturalHeight !== size.h) return null;
      const c = document.createElement('canvas');
      c.width = size.w;
      c.height = size.h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) return null;
      cx.drawImage(img, 0, 0);
      const px = cx.getImageData(0, 0, size.w, size.h).data;
      const foot = new Uint8Array(size.w * size.h);
      for (let i = 0; i < foot.length; i++) foot[i] = px[i * 4];
      return foot;
    },
    () => null,
  );
  const img = await loadImage(campArtUrl(base, theme));
  if (img.naturalWidth !== size.w || img.naturalHeight !== size.h) throw new Error(`size ${theme}`);
  return { img, foot: await footP };
};

/** The game's store (browser only; in node it stays idle and every camp reads as "not loaded"). */
export const campArt = new CampArtStore(typeof Image === 'undefined' || typeof document === 'undefined' ? null : browserCampLoader);
