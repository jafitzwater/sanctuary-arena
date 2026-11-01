/**
 * t364u "Put the approved bosses in the game": draws the Countess, Radament, Izual and the three Council Members
 * from Joseph's approved 3D-rendered atlases (scripts/boss-atlases.py), with the Rakanishu approach
 * (rakanishu-art.ts): frames are the Sprite Director's cells cropped to their opaque pixels, placed at their crop
 * offset from the cell's foot point (cell/2, cell) and drawn at the heroes' px/m, so each keeps its sheet scale
 * as rendered. Same look as the other sheets: contrast stretch around the atlas's mean luma, per-cell top light /
 * foot shade, and the 1 px dark ring (the atlases leave a 4 px transparent gutter between frames).
 *
 * Memory (the order: lazy-load, keep the total added under about 28 MiB decoded):
 * - Nothing loads at start. An atlas starts loading only when its boss is drawn or comes near the view.
 * - After the one-time bake the image is released, so a loaded boss holds ONE canvas of w x h x 4 bytes.
 * - An atlas not used for BOSS_ART_IDLE_EVICT_S is released; and resident atlases never exceed
 *   BOSS_ART_BUDGET_BYTES (least recently used ones go first; past that a boss keeps its fallback).
 * While an atlas is loading (or failed) draw returns false and the caller draws the procedural token.
 */
import atlases from './boss-atlases.json';
import { CHARACTER_CONTRAST, CHARACTER_OUTLINE_PX, OUTLINE_ALPHA, cellLight, contrastChannel, outlineOffsets, silhouette } from '../readability';
import { BOSS_ART_IDS, type BossArtId } from './boss-frames';

/** Hero body px in the class sheets (CLASS_SHEET.body): the boss sheets share their px/m (same rig, same K). */
const HERO_BODY_PX = 56;
/** Transparent px between atlas frames (scripts/boss-atlases.py GUTTER). */
export const BOSS_ATLAS_GUTTER = 4;
/** Each frame owns half the gutter for its ring and draw margin, so a frame never picks up a neighbour's pixels. */
const MARGIN = BOSS_ATLAS_GUTTER / 2;
/** Hard cap on resident (decoded) boss atlas bytes. */
export const BOSS_ART_BUDGET_BYTES = 28 * 2 ** 20;
/** Seconds an atlas may go unused before it is released. */
export const BOSS_ART_IDLE_EVICT_S = 30;
/** Seconds before a failed load is tried again. */
export const BOSS_ART_RETRY_S = 10;

type Frame = [row: number, col: number, x: number, y: number, w: number, h: number, ox: number, oy: number];
interface AtlasMeta {
  cell: number;
  footX: number;
  footY: number;
  w: number;
  h: number;
  pivot: number;
  body: number;
  frames: Frame[];
}
type State = 'idle' | 'loading' | 'baking' | 'ready' | 'failed';
interface Entry {
  meta: AtlasMeta;
  frames: Map<number, Frame>;
  state: State;
  image: HTMLImageElement | null;
  canvas: HTMLCanvasElement | null;
  ringPx: number;
  lastUsed: number;
  failedAt: number;
}

const META = atlases as unknown as Record<BossArtId, AtlasMeta>;
const entries = new Map<BossArtId, Entry>();
for (const id of BOSS_ART_IDS) {
  const meta = META[id];
  const frames = new Map<number, Frame>();
  for (const f of meta.frames) frames.set(f[0] * 100 + f[1], f);
  entries.set(id, { meta, frames, state: 'idle', image: null, canvas: null, ringPx: 1, lastUsed: -Infinity, failedAt: -Infinity });
}

let clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);
/** Test hook: replace the seconds clock. */
export function setBossArtClock(fn: () => number): void {
  clock = fn;
}

export function bossAtlasMeta(id: BossArtId): AtlasMeta {
  return META[id];
}

export function bossFrame(id: BossArtId, row: number, col: number): Frame | undefined {
  return entries.get(id)?.frames.get(row * 100 + col);
}

/** Decoded bytes of one shipped atlas (RGBA). */
export function bossAtlasBytes(id: BossArtId): number {
  const m = META[id];
  return m.w * m.h * 4;
}

/** Sum over all six shipped atlases, as if all were resident at once. */
export const BOSS_ATLAS_TOTAL_BYTES = BOSS_ART_IDS.reduce((s, id) => s + bossAtlasBytes(id), 0);

/** Draw height (feet to the top of the idle figure) for a hero draw height h: the heroes' px/m. */
export function bossHeight(id: BossArtId, heroHeight: number): number {
  return (heroHeight * META[id].body) / HERO_BODY_PX;
}

export function bossArtState(id: BossArtId): State {
  return entries.get(id)!.state;
}

/** Bytes held now (loading, baking and ready atlases). */
export function bossArtResidentBytes(): number {
  let n = 0;
  for (const [id, e] of entries) if (e.state === 'loading' || e.state === 'baking' || e.state === 'ready') n += bossAtlasBytes(id);
  return n;
}

function idle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 400 });
  else setTimeout(fn, 0);
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function release(e: Entry): void {
  if (e.image) {
    e.image.onload = null;
    e.image.onerror = null;
    e.image.src = '';
  }
  if (e.canvas) {
    e.canvas.width = 0;
    e.canvas.height = 0;
  }
  e.image = null;
  e.canvas = null;
  e.state = 'idle';
}

/**
 * Contrast + per-cell light, then the ring painted behind each frame (destination-over, clipped to the frame's
 * half of the gutter), all on ONE canvas; the image is released afterwards.
 */
function bake(e: Entry, im: HTMLImageElement): HTMLCanvasElement | null {
  const { meta } = e;
  const out = canvasOf(meta.w, meta.h);
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(im, 0, 0);
  for (const [, , x, y, w, h, , oy] of e.frames.values()) {
    const px = g.getImageData(x, y, w, h);
    const d = px.data;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] === 0) continue;
      const light = cellLight(oy + Math.floor(p / 4 / w), meta.cell);
      d[p] = contrastChannel(d[p], meta.pivot, CHARACTER_CONTRAST, light);
      d[p + 1] = contrastChannel(d[p + 1], meta.pivot, CHARACTER_CONTRAST, light);
      d[p + 2] = contrastChannel(d[p + 2], meta.pivot, CHARACTER_CONTRAST, light);
    }
    g.putImageData(px, x, y);
  }
  const offsets = outlineOffsets(e.ringPx);
  for (const [, , x, y, w, h] of e.frames.values()) {
    const bx = x - MARGIN;
    const by = y - MARGIN;
    const bw = w + MARGIN * 2;
    const bh = h + MARGIN * 2;
    const sil = canvasOf(bw, bh);
    const s = sil.getContext('2d');
    if (!s) return null;
    const px = g.getImageData(bx, by, bw, bh);
    silhouette(px.data);
    s.putImageData(px, 0, 0);
    g.save();
    g.beginPath();
    g.rect(bx, by, bw, bh);
    g.clip();
    g.globalCompositeOperation = 'destination-over';
    g.globalAlpha = OUTLINE_ALPHA;
    g.imageSmoothingEnabled = false;
    for (const [ox, oy] of offsets) g.drawImage(sil, bx + ox, by + oy);
    g.restore();
    sil.width = 0;
    sil.height = 0;
  }
  return out;
}

/** Frees least recently used atlases (not used in the last second) until `need` more bytes fit the budget. */
function makeRoom(id: BossArtId, need: number, now: number): boolean {
  while (bossArtResidentBytes() + need > BOSS_ART_BUDGET_BYTES) {
    let victim: Entry | null = null;
    for (const [other, e] of entries) {
      if (other === id || e.state === 'idle' || e.state === 'failed' || now - e.lastUsed < 1) continue;
      if (!victim || e.lastUsed < victim.lastUsed) victim = e;
    }
    if (!victim) return false;
    release(victim);
  }
  return true;
}

/**
 * Marks an atlas as wanted now and starts its load if needed. `ringPx` is the ring width in atlas px for the
 * current draw scale (used by the bake). True once the atlas is ready to draw.
 */
export function requestBossArt(id: BossArtId, ringPx = 1): boolean {
  const e = entries.get(id);
  if (!e || typeof document === 'undefined' || typeof Image === 'undefined') return false;
  const now = clock();
  e.lastUsed = now;
  if (e.state === 'ready') return true;
  if (e.state === 'loading' || e.state === 'baking') return false;
  if (e.state === 'failed' && now - e.failedAt < BOSS_ART_RETRY_S) return false;
  if (!makeRoom(id, bossAtlasBytes(id), now)) return false;
  e.ringPx = ringPx;
  e.state = 'loading';
  const im = new Image();
  im.decoding = 'async';
  e.image = im;
  im.onload = () => {
    if (e.image !== im) return;
    e.state = 'baking';
    idle(() => {
      if (e.image !== im) return;
      let c: HTMLCanvasElement | null = null;
      try {
        c = bake(e, im);
      } catch {
        c = null;
      }
      im.onload = null;
      im.onerror = null;
      im.src = '';
      e.image = null;
      if (c) {
        e.canvas = c;
        e.state = 'ready';
      } else {
        e.state = 'failed';
        e.failedAt = clock();
      }
    });
  };
  im.onerror = () => {
    if (e.image !== im) return;
    e.image = null;
    e.state = 'failed';
    e.failedAt = clock();
  };
  im.src = `${import.meta.env?.BASE_URL ?? '/'}sprites/bosses/${id}-atlas.webp`;
  return false;
}

/** Releases atlases unused for BOSS_ART_IDLE_EVICT_S. Called once per rendered frame. */
export function bossArtTick(): void {
  const now = clock();
  for (const e of entries.values()) {
    if ((e.state === 'ready' || e.state === 'loading' || e.state === 'baking') && now - e.lastUsed > BOSS_ART_IDLE_EVICT_S) release(e);
  }
}

/** Test hook: drop everything back to the start state. */
export function resetBossArt(): void {
  for (const e of entries.values()) {
    release(e);
    e.lastUsed = -Infinity;
    e.failedAt = -Infinity;
  }
}

/** Ring width in atlas px for a draw scale (css px per atlas px); 0.5-1.5 so it stays inside a frame's gutter half. */
export function bossRingPx(scale: number): number {
  return Math.max(0.5, Math.min(1.5, Math.round((CHARACTER_OUTLINE_PX / Math.max(1e-3, scale)) * 2) / 2));
}

/**
 * One boss frame with its feet at (x, y), `height` css px from the feet to the top of the idle figure
 * (bossHeight). False while the atlas is loading, failed or over budget (caller draws the fallback token).
 */
export function drawBossFrame(
  ctx: CanvasRenderingContext2D,
  id: BossArtId,
  row: number,
  col: number,
  x: number,
  y: number,
  height: number,
): boolean {
  const e = entries.get(id);
  if (!e) return false;
  const { meta } = e;
  const scale = height / meta.body;
  if (!requestBossArt(id, bossRingPx(scale)) || !e.canvas) return false;
  const f = e.frames.get(row * 100 + col);
  if (!f) return false;
  const [, , sx, sy, w, h, ox, oy] = f;
  const dx = x + (ox - meta.footX) * scale;
  const dy = y + (oy - meta.footY) * scale;
  const m = MARGIN;
  ctx.drawImage(e.canvas, sx - m, sy - m, w + m * 2, h + m * 2, dx - m * scale, dy - m * scale, (w + m * 2) * scale, (h + m * 2) * scale);
  return true;
}
