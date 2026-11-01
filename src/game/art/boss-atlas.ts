/**
 * t364u "Put the approved bosses in the game" + t370u "Put boss walk / hit / death / wind-up in the game": draws
 * the Countess, Radament, Izual and the three Council Members from Joseph's approved 3D-rendered atlases
 * (scripts/boss-atlases.py), one atlas per boss per animation (idle, walk, attack, hit, death), with the
 * Rakanishu approach (rakanishu-art.ts): frames are the Sprite Director's cells cropped to their opaque pixels,
 * placed at their crop offset from the cell's foot point (json footX, footY) and drawn at the heroes' px/m, so each
 * keeps its sheet scale as rendered. Same look as the other sheets: contrast stretch around the approved atlas's
 * mean luma, per-cell top light / foot shade (measured in the approved C-cell, so the idle look is unchanged), and
 * the 1 px dark ring (the atlases leave a 4 px transparent gutter between frames).
 *
 * Memory (the order: lazy-load per animation, keep resident boss art under 28 MiB decoded, LRU):
 * - Nothing loads at start. prefetchBossAnim (soft) starts idle + walk when a boss comes near the view and
 *   attack / hit / death once it fights; drawBossFrame (hard) loads whatever animation is on screen.
 * - After the one-time bake the image is released, so a loaded animation holds ONE canvas of w x h x 4 bytes.
 * - Resident atlases never exceed BOSS_ART_BUDGET_BYTES. A soft request only loads if it fits after dropping
 *   atlases nobody has wanted for a second (never evicts art in use); a hard request may also drop the least
 *   recently DRAWN atlases not drawn in the last BOSS_ART_PROTECT_S (e.g. a dead boss's walk for its death).
 * - An atlas not wanted for BOSS_ART_IDLE_EVICT_S is released.
 * While an animation is loading (or failed / over budget) drawBossFrame draws the boss's idle frame instead if
 * that is resident, else returns false and the caller draws the procedural token.
 */
import atlases from './boss-atlases.json';
import { CHARACTER_CONTRAST, CHARACTER_OUTLINE_PX, OUTLINE_ALPHA, cellLight, contrastChannel, outlineOffsets, silhouette } from '../readability';
import { BOSS_ANIMS, BOSS_ART_IDS, type BossAnim, type BossArtId } from './boss-frames';

/** Hero body px in the class sheets (CLASS_SHEET.body): the boss sheets share their px/m (same rig, same K). */
const HERO_BODY_PX = 56;
/** Transparent px between atlas frames (scripts/boss-atlases.py GUTTER). */
export const BOSS_ATLAS_GUTTER = 4;
/** Each frame owns half the gutter for its ring and draw margin, so a frame never picks up a neighbour's pixels. */
const MARGIN = BOSS_ATLAS_GUTTER / 2;
/** Hard cap on resident (decoded) boss atlas bytes. */
export const BOSS_ART_BUDGET_BYTES = 28 * 2 ** 20;
/** Seconds an atlas may go unwanted before it is released. */
export const BOSS_ART_IDLE_EVICT_S = 30;
/** Seconds before a failed load is tried again. */
export const BOSS_ART_RETRY_S = 10;
/** An atlas drawn within this many seconds is on screen and is never evicted. */
export const BOSS_ART_PROTECT_S = 0.25;
/** A soft (prefetch) request may only drop atlases not wanted for this many seconds. */
const SOFT_STALE_S = 1;

type Frame = [row: number, col: number, x: number, y: number, w: number, h: number, ox: number, oy: number];
interface AnimMeta {
  w: number;
  h: number;
  frames: Frame[];
}
interface BossMeta {
  cellW: number;
  cellH: number;
  approvedCell: number;
  footX: number;
  footY: number;
  pivot: number;
  body: number;
  stride: number;
  anims: Record<BossAnim, AnimMeta>;
}
type State = 'idle' | 'loading' | 'baking' | 'ready' | 'failed';
interface Entry {
  id: BossArtId;
  anim: BossAnim;
  boss: BossMeta;
  meta: AnimMeta;
  frames: Map<number, Frame>;
  state: State;
  image: HTMLImageElement | null;
  canvas: HTMLCanvasElement | null;
  ringPx: number;
  /** Last time asked for (prefetch or draw). */
  lastWanted: number;
  /** Last time drawn (LRU order + protection). */
  lastDrawn: number;
  failedAt: number;
}

const META = atlases as unknown as Record<BossArtId, BossMeta>;
const entries = new Map<string, Entry>();
const keyOf = (id: BossArtId, anim: BossAnim): string => `${id}:${anim}`;
for (const id of BOSS_ART_IDS) {
  for (const anim of BOSS_ANIMS) {
    const meta = META[id].anims[anim];
    const frames = new Map<number, Frame>();
    for (const f of meta.frames) frames.set(f[0] * 100 + f[1], f);
    entries.set(keyOf(id, anim), {
      id, anim, boss: META[id], meta, frames, state: 'idle', image: null, canvas: null, ringPx: 1,
      lastWanted: -Infinity, lastDrawn: -Infinity, failedAt: -Infinity,
    });
  }
}

let clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);
/** Test hook: replace the seconds clock. */
export function setBossArtClock(fn: () => number): void {
  clock = fn;
}

export function bossAtlasMeta(id: BossArtId): BossMeta {
  return META[id];
}

export function bossAnimFrame(id: BossArtId, anim: BossAnim, row: number, col: number): Frame | undefined {
  return entries.get(keyOf(id, anim))?.frames.get(row * 100 + col);
}

/** Decoded bytes of one shipped animation atlas (RGBA). */
export function bossAnimBytes(id: BossArtId, anim: BossAnim): number {
  const m = META[id].anims[anim];
  return m.w * m.h * 4;
}

/** Decoded bytes of all five animation atlases of one boss. */
export function bossAtlasBytes(id: BossArtId): number {
  return BOSS_ANIMS.reduce((s, a) => s + bossAnimBytes(id, a), 0);
}

/** Sum over all shipped atlases, as if all were resident at once. */
export const BOSS_ATLAS_TOTAL_BYTES = BOSS_ART_IDS.reduce((s, id) => s + bossAtlasBytes(id), 0);

/** Draw height (feet to the top of the idle figure) for a hero draw height h: the heroes' px/m. */
export function bossHeight(id: BossArtId, heroHeight: number): number {
  return (heroHeight * META[id].body) / HERO_BODY_PX;
}

export function bossArtState(id: BossArtId, anim: BossAnim): State {
  return entries.get(keyOf(id, anim))!.state;
}

const resident = (e: Entry): boolean => e.state === 'loading' || e.state === 'baking' || e.state === 'ready';

/** Bytes held now (loading, baking and ready atlases). */
export function bossArtResidentBytes(): number {
  let n = 0;
  for (const e of entries.values()) if (resident(e)) n += e.meta.w * e.meta.h * 4;
  return n;
}

/** Resident atlases as "id:anim" keys (tests, probes). */
export function bossArtResident(): string[] {
  return [...entries.entries()].filter(([, e]) => resident(e)).map(([k]) => k);
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
  const { meta, boss } = e;
  const out = canvasOf(meta.w, meta.h);
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(im, 0, 0);
  // Light is measured in the approved C-cell (its bottom row is the foot row), as the t364u atlases were.
  const top = boss.footY - boss.approvedCell;
  const cell = boss.approvedCell;
  for (const [, , x, y, w, h, , oy] of e.frames.values()) {
    const px = g.getImageData(x, y, w, h);
    const d = px.data;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] === 0) continue;
      const cy = Math.max(0, Math.min(cell - 1, oy + Math.floor(p / 4 / w) - top));
      const light = cellLight(cy, cell);
      d[p] = contrastChannel(d[p], boss.pivot, CHARACTER_CONTRAST, light);
      d[p + 1] = contrastChannel(d[p + 1], boss.pivot, CHARACTER_CONTRAST, light);
      d[p + 2] = contrastChannel(d[p + 2], boss.pivot, CHARACTER_CONTRAST, light);
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

/**
 * Frees atlases until `need` more bytes fit the budget. Soft: only atlases not wanted for SOFT_STALE_S. Hard:
 * also atlases not drawn for BOSS_ART_PROTECT_S, least recently drawn first. False if it cannot fit.
 */
function makeRoom(self: Entry, need: number, now: number, hard: boolean): boolean {
  while (bossArtResidentBytes() + need > BOSS_ART_BUDGET_BYTES) {
    let victim: Entry | null = null;
    for (const e of entries.values()) {
      if (e === self || !resident(e)) continue;
      // A boss's idle atlas is the stand-in while its other animations load: a hard request never drops it.
      if (hard && e.id === self.id && e.anim === 'idle' && now - e.lastWanted < SOFT_STALE_S) continue;
      const stale = now - e.lastWanted >= SOFT_STALE_S;
      if (!stale && !(hard && now - e.lastDrawn >= BOSS_ART_PROTECT_S)) continue;
      // Stale ones first, then least recently drawn.
      if (!victim) victim = e;
      else {
        const vs = now - victim.lastWanted >= SOFT_STALE_S;
        if ((stale && !vs) || (stale === vs && e.lastDrawn < victim.lastDrawn)) victim = e;
      }
    }
    if (!victim) return false;
    release(victim);
  }
  return true;
}

function request(e: Entry, ringPx: number, hard: boolean): boolean {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return false;
  const now = clock();
  e.lastWanted = now;
  if (e.state === 'ready') return true;
  if (e.state === 'loading' || e.state === 'baking') return false;
  if (e.state === 'failed' && now - e.failedAt < BOSS_ART_RETRY_S) return false;
  if (!makeRoom(e, e.meta.w * e.meta.h * 4, now, hard)) return false;
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
  im.src = `${import.meta.env?.BASE_URL ?? '/'}sprites/bosses/${e.id}-${e.anim}.webp`;
  return false;
}

/**
 * Soft request: start loading an animation ahead of need if it fits (never evicts art in use). `ringPx` is the
 * ring width in atlas px for the current draw scale (used by the bake). True once it is ready to draw.
 */
export function prefetchBossAnim(id: BossArtId, anim: BossAnim, ringPx = 1): boolean {
  const e = entries.get(keyOf(id, anim));
  return e ? request(e, ringPx, false) : false;
}

/** Releases atlases unwanted for BOSS_ART_IDLE_EVICT_S. Called once per rendered frame. */
export function bossArtTick(): void {
  const now = clock();
  for (const e of entries.values()) if (resident(e) && now - e.lastWanted > BOSS_ART_IDLE_EVICT_S) release(e);
}

/** Test hook: drop everything back to the start state. */
export function resetBossArt(): void {
  for (const e of entries.values()) {
    release(e);
    e.lastWanted = -Infinity;
    e.lastDrawn = -Infinity;
    e.failedAt = -Infinity;
  }
}

/** Ring width in atlas px for a draw scale (css px per atlas px); 0.5-1.5 so it stays inside a frame's gutter half. */
export function bossRingPx(scale: number): number {
  return Math.max(0.5, Math.min(1.5, Math.round((CHARACTER_OUTLINE_PX / Math.max(1e-3, scale)) * 2) / 2));
}

/** What drawBossFrame drew: the asked animation, the idle fallback, or nothing (caller draws the token). */
export type BossDrawn = 'anim' | 'idle' | false;

/**
 * One boss frame with its feet at (x, y), `height` css px from the feet to the top of the idle figure
 * (bossHeight). Asks for `anim` (hard request). While it is not ready, draws idle column `idleCol` if the idle
 * atlas is resident ('idle'), else false.
 */
export function drawBossFrame(
  ctx: CanvasRenderingContext2D,
  id: BossArtId,
  anim: BossAnim,
  row: number,
  col: number,
  x: number,
  y: number,
  height: number,
  idleCol = 0,
): BossDrawn {
  const e = entries.get(keyOf(id, anim));
  if (!e) return false;
  const scale = height / e.boss.body;
  const ring = bossRingPx(scale);
  const i = entries.get(keyOf(id, 'idle'))!;
  if (anim !== 'idle') i.lastWanted = clock();
  if (request(e, ring, true) && blit(ctx, e, row, col, x, y, scale)) return 'anim';
  if (anim === 'idle') return false;
  if (request(i, ring, true) && blit(ctx, i, row, idleCol, x, y, scale)) return 'idle';
  return false;
}

function blit(ctx: CanvasRenderingContext2D, e: Entry, row: number, col: number, x: number, y: number, scale: number): boolean {
  if (!e.canvas) return false;
  const f = e.frames.get(row * 100 + col);
  if (!f) return false;
  e.lastDrawn = clock();
  const [, , sx, sy, w, h, ox, oy] = f;
  const dx = x + (ox - e.boss.footX) * scale;
  const dy = y + (oy - e.boss.footY) * scale;
  const m = MARGIN;
  ctx.drawImage(e.canvas, sx - m, sy - m, w + m * 2, h + m * 2, dx - m * scale, dy - m * scale, (w + m * 2) * scale, (h + m * 2) * scale);
  return true;
}
