/**
 * t330u "Put 3D floors in the game": the approved 3D-rendered ground tiles (Sprite Director samples
 * floor-3d-v1, Blender 4.5 Cycles renders of CC0 Poly Haven / ambientCG materials; see CREDITS.md).
 *
 * Tiles are 512x256 bake px, seamless on a rectangle lattice, and are sampled 1:1 at absolute bake
 * coordinates mod (512, 256), so neighbouring bake chunks line up. Shipped as WebP in public/tiles/.
 *
 * Pure parts (names, zone -> tile mapping, code-drawn fallback tiles) are DOM-free for the tests;
 * the loader only touches Image/canvas when startFloorTiles() runs in the browser.
 */
import type { ZoneId } from '../data/mapZones';

export const FLOOR_TILE_W = 512;
export const FLOOR_TILE_H = 256;

export type FloorGround = 'plains' | 'sand' | 'jungle' | 'fire';
export const FLOOR_GROUNDS: readonly FloorGround[] = ['plains', 'sand', 'jungle', 'fire'];

/** Two variants per ground (more variety, 2x memory), one lava, one cobble + its height map. */
export const FLOOR_TILES = [
  'plains_0', 'plains_1',
  'sand_0', 'sand_1',
  'jungle_0', 'jungle_1',
  'fire_0', 'fire_1',
  'lava_0',
  'cobble_0', 'cobble_0_h',
] as const;
export type FloorTileName = (typeof FLOOR_TILES)[number];

export const GROUND_VARIANTS: Record<FloorGround, readonly [FloorTileName, FloorTileName]> = {
  plains: ['plains_0', 'plains_1'],
  sand: ['sand_0', 'sand_1'],
  jungle: ['jungle_0', 'jungle_1'],
  fire: ['fire_0', 'fire_1'],
};

/**
 * Zone -> ground tile (approach note: plains = Blood Moor / Jungle Plains, sand = Dry Hills / Jungle
 * Desert, jungle = Spider Forest / Dense Jungle, fire = River of Flame / Jungle Lava). Base yards keep
 * their stone floor on top; the ground around them is the lane-start ground (plains) for the
 * Rogue Encampment and scorched fire ground for Pandemonium Fortress. The River of Lava is painted
 * by the lava overlay over the ground of the zone it crosses (groundZoneAt), so 'lava-river' only
 * maps here for completeness.
 */
export const ZONE_FLOOR: Record<ZoneId, FloorGround> = {
  'rogue-encampment': 'plains',
  'pandemonium-fortress': 'fire',
  'blood-moor': 'plains',
  'dry-hills': 'sand',
  'spider-forest': 'jungle',
  'river-of-flame': 'fire',
  'lava-river': 'fire',
  'jungle-dense': 'jungle',
  'jungle-plains': 'plains',
  'jungle-desert': 'sand',
  'jungle-lava': 'fire',
};

export function zoneFloor(zone: ZoneId): FloorGround {
  return ZONE_FLOOR[zone];
}

export function floorTileUrl(base: string, name: FloorTileName): string {
  return `${base}tiles/${name}.webp`;
}

/** One decoded tile: RGBA pixels plus luminance mean/std for the height blend. */
export interface FloorTile {
  name: FloorTileName;
  w: number;
  h: number;
  data: Uint8ClampedArray;
  mean: number;
  std: number;
  fallback: boolean;
}

export function tileFromPixels(name: FloorTileName, data: Uint8ClampedArray, fallback: boolean, w = FLOOR_TILE_W, h = FLOOR_TILE_H): FloorTile {
  let sum = 0;
  let sq = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    data[i * 4 + 3] = 255; // ground is opaque (lets the compositor copy whole 32-bit pixels)
    const l = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
    sum += l;
    sq += l * l;
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(1e-6, sq / n - mean * mean));
  return { name, w, h, data, mean, std: Math.max(0.02, std), fallback };
}

// ---------------------------------------------------------------- code-drawn fallback tiles

function hash(i: number, j: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise that wraps every `px` x `py` lattice cells (seamless fallback tiles). */
function periodicNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = (k: number, p: number) => ((k % p) + p) % p;
  const a = hash(w(i, px), w(j, py), seed);
  const b = hash(w(i + 1, px), w(j, py), seed);
  const c = hash(w(i, px), w(j + 1, py), seed);
  const d = hash(w(i + 1, px), w(j + 1, py), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

type Rgb = readonly [number, number, number];
/** Dark-night palettes close to the renders (and to the old code-drawn ground). */
const FALLBACK_PALETTE: Record<string, { lo: Rgb; hi: Rgb }> = {
  plains: { lo: [34, 42, 22], hi: [92, 98, 52] },
  sand: { lo: [70, 58, 42], hi: [150, 128, 96] },
  jungle: { lo: [26, 30, 16], hi: [78, 70, 40] },
  fire: { lo: [30, 22, 18], hi: [96, 70, 52] },
  lava: { lo: [150, 30, 6], hi: [255, 170, 40] },
  cobble: { lo: [44, 42, 40], hi: [128, 122, 112] },
};

/**
 * Seamless code-drawn stand-in for a tile that failed to load: two octaves of wrapped value noise in
 * the ground's palette; cobble gets a running-bond stone grid whose height map matches.
 */
export function fallbackFloorTile(name: FloorTileName): FloorTile {
  const w = FLOOR_TILE_W;
  const h = FLOOR_TILE_H;
  const data = new Uint8ClampedArray(w * h * 4);
  const family = name.replace(/_\d.*$/, '');
  const pal = FALLBACK_PALETTE[family] ?? FALLBACK_PALETTE.plains;
  const seed = FLOOR_TILES.indexOf(name) + 1;
  const cobble = family === 'cobble';
  const height = name.endsWith('_h');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = periodicNoise(x / 32, y / 32, w / 32, h / 32, seed) * 0.65 + periodicNoise(x / 8, y / 8, w / 8, h / 8, seed + 7) * 0.35;
      let t = n;
      if (cobble) {
        // 32x16 stones in running bond; height peaks mid-stone, 0 in the mortar.
        const row = Math.floor(y / 16);
        const sx = (x + (row % 2) * 16) % 32;
        const sy = y % 16;
        const ex = Math.min(sx, 31 - sx) / 6;
        const ey = Math.min(sy, 15 - sy) / 3;
        const stone = Math.min(1, ex, ey);
        t = stone * (0.55 + 0.45 * n);
      } else if (family === 'lava') {
        t = n > 0.62 ? 0.15 : n;
      }
      const i = (y * w + x) * 4;
      if (height) {
        const g = Math.round(t * 255);
        data[i] = g;
        data[i + 1] = g;
        data[i + 2] = g;
      } else {
        data[i] = pal.lo[0] + (pal.hi[0] - pal.lo[0]) * t;
        data[i + 1] = pal.lo[1] + (pal.hi[1] - pal.lo[1]) * t;
        data[i + 2] = pal.lo[2] + (pal.hi[2] - pal.lo[2]) * t;
      }
      data[i + 3] = 255;
    }
  }
  return tileFromPixels(name, data, true, w, h);
}

// ---------------------------------------------------------------- async loader (browser only)

const tiles = new Map<FloorTileName, FloorTile>();
let started = false;
let settled = false;
let loadMs = 0;
const waiters: (() => void)[] = [];
const LOAD_TIMEOUT_MS = 15000;

/** Starts the async tile fetch once; never blocks the caller (the match starts on the code-drawn ground). */
export function startFloorTiles(): void {
  if (started || typeof Image === 'undefined' || typeof document === 'undefined') return;
  started = true;
  const t0 = performance.now();
  let left = FLOOR_TILES.length;
  const done = (name: FloorTileName, tile: FloorTile) => {
    if (tiles.has(name)) return;
    tiles.set(name, tile);
    left -= 1;
    if (left > 0) return;
    settled = true;
    loadMs = performance.now() - t0;
    for (const cb of waiters.splice(0)) cb();
  };
  const scratch = document.createElement('canvas');
  scratch.width = FLOOR_TILE_W;
  scratch.height = FLOOR_TILE_H;
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  for (const name of FLOOR_TILES) {
    const img = new Image();
    img.decoding = 'async';
    const fail = () => done(name, fallbackFloorTile(name));
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    img.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    img.onload = () => {
      clearTimeout(timer);
      if (!sctx || img.naturalWidth !== FLOOR_TILE_W || img.naturalHeight !== FLOOR_TILE_H) {
        fail();
        return;
      }
      sctx.clearRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
      sctx.drawImage(img, 0, 0);
      // Keep only the pixel array (512 KiB per tile); the Image element is dropped.
      const px = sctx.getImageData(0, 0, FLOOR_TILE_W, FLOOR_TILE_H).data;
      done(name, tileFromPixels(name, px, false));
    };
    img.src = floorTileUrl(import.meta.env.BASE_URL, name);
  }
}

/** True once every tile has loaded or fallen back (starts the load on first call). */
export function floorTilesReady(): boolean {
  startFloorTiles();
  return settled;
}

/** Calls back once when the tile set settles, so the bake can repaint progressively. */
export function onFloorTiles(cb: () => void): void {
  if (settled) cb();
  else waiters.push(cb);
}

export function floorTile(name: FloorTileName): FloorTile {
  let t = tiles.get(name);
  if (!t) {
    t = fallbackFloorTile(name);
    tiles.set(name, t);
  }
  return t;
}

/** Debug/stat line: load time, fallbacks, decoded bytes. */
export function floorTileStats(): { settled: boolean; loadMs: number; fallbacks: string[]; decodedBytes: number } {
  const fallbacks: string[] = [];
  let bytes = 0;
  for (const t of tiles.values()) {
    if (t.fallback) fallbacks.push(t.name);
    bytes += t.data.byteLength;
  }
  return { settled, loadMs: Math.round(loadMs), fallbacks, decodedBytes: bytes };
}
