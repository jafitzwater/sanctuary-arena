/**
 * t330u 3D floors: per-chunk pixel compositor for the ground bake. Pure (typed arrays only), so the
 * blend maths and the fallback path run in the node tests.
 *
 * Port of the Sprite Director's reference (audit/b3d/scripts/floor_comp.py):
 *  - zone borders: domain-warped zone lookup (noise ~130 px + ~33 px), one-hot weights box-blurred
 *    over ~16 px, then a height blend (weight * exp(0.6 * normalised tile height), cubed) so the
 *    taller stones/tufts of one ground poke through the other instead of a square diamond cut;
 *    jungle/plains/sand next to fire ground get a scorched band;
 *  - lava river: charred bank, lava ribbon with a noisy edge, orange glow across the bank and a
 *    bright cooling lip at the lava edge;
 *  - cobble lane: worn darker shoulder, then cobble whose edge follows the cobble height map
 *    (stones poke out, mortar falls away), kept on every ground;
 *  - base yards: the existing stone diamonds (pre-painted by the caller) blended in on a noisy edge.
 * Values on a grid every GRID px are interpolated per pixel; cells far from lanes/river/yards and
 * inside one zone take a single-tile fast path.
 */
import { FLOOR_GROUNDS, FLOOR_TILE_H, FLOOR_TILE_W, GROUND_VARIANTS, type FloorGround, type FloorTile, type FloorTileName } from './art/floorTiles';

export const FLOOR_GRID = 8;
const MARGIN = 2; // grid nodes outside the chunk for the border blur
const BLUR = 2; // box blur radius in nodes (~16 px)
const BLOCK_STEP = 4; // blocked mask sampled every 4 nodes (32 px)

export interface FloorField {
  /** Ground under a world point (river ignored). */
  ground(wx: number, wy: number): FloorGround;
  /** World distance to the nearest lane centre line. */
  road(wx: number, wy: number): number;
  /** World distance to the lava river centre line (Infinity without one). */
  river(wx: number, wy: number): number;
  /** World distance inside the nearest base yard edge (positive inside, negative outside). */
  yard(wx: number, wy: number): number;
  /** Not walkable (woods ground under trees; darkened slightly as before). */
  blocked(wx: number, wy: number): boolean;
}

export interface FloorBakeOpts {
  x0: number;
  y0: number;
  size: number;
  hw: number;
  unproject(sx: number, sy: number): { x: number; y: number };
  tile(name: FloorTileName): FloorTile;
  /** Lane cobble half width, lava half width, charred bank half width (world units). */
  roadHalf: number;
  lavaHalf: number;
  bankHalf: number;
  /** Pre-painted yard stone (chunk-sized RGBA), or null when the chunk has no yard. */
  yard?: Uint8ClampedArray | null;
  /** Fraction the ground under trees is darkened (readability TREE_GROUND_DARKEN). */
  treeDarken?: number;
  seed?: number;
}

export interface FloorBakeStats {
  cells: number;
  fastCells: number;
  /** Cells written as straight tile copies (fast single variant, cobble core, lava core). */
  copyCells: number;
}

function hash(i: number, j: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed);
  const b = hash(i + 1, j, seed);
  const c = hash(i, j + 1, seed);
  const d = hash(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fbm in bake px, centred on 0 (about -0.5..0.5), 3 octaves. */
export function floorNoise(x: number, y: number, scale: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let tot = 0;
  let f = 1 / scale;
  for (let o = 0; o < 3; o++) {
    sum += vnoise(x * f, y * f, seed + o * 31) * amp;
    tot += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / tot - 0.5;
}

function sstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const HEIGHT_Q = 24; // heights stored as Int8 in 1/24 std steps (+-5.3 std)
const heightCache = new WeakMap<FloorTile, Int8Array>();
/** Per-pixel luminance height of a tile in 1/HEIGHT_Q std units (cached per tile, 128 KiB). */
function tileHeight(t: FloorTile): Int8Array {
  let h = heightCache.get(t);
  if (!h) {
    const d = t.data;
    h = new Int8Array(t.w * t.h);
    for (let i = 0, p = 0; i < h.length; i++, p += 4) {
      const v = ((d[p] * LUM_R + d[p + 1] * LUM_G + d[p + 2] * LUM_B - t.mean) / t.std) * HEIGHT_Q;
      h[i] = Math.max(-127, Math.min(127, Math.round(v)));
    }
    heightCache.set(t, h);
  }
  return h;
}

const hMaxCache = new WeakMap<FloorTile, number>();
function tileHeightMax(t: FloorTile): number {
  let m = hMaxCache.get(t);
  if (m === undefined) {
    m = 0;
    const h = tileHeight(t);
    for (let i = 0; i < h.length; i++) if (Math.abs(h[i]) > m) m = Math.abs(h[i]);
    m /= HEIGHT_Q;
    hMaxCache.set(t, m);
  }
  return m;
}

/** Bilinear sample of a grid array at cell corner i00 (row stride r). */
function bil(a: Float32Array, i: number, r: number, w00: number, w10: number, w01: number, w11: number): number {
  return a[i] * w00 + a[i + 1] * w10 + a[i + r] * w01 + a[i + r + 1] * w11;
}

/**
 * Ground colour from a two-variant pair at tile byte offset ti into kCol[j..j+2]; returns the
 * normalised height. Variant 1 takes over where nv (+ a little height) crosses 0.
 */
function groundPx(d0: Uint8ClampedArray, d1: Uint8ClampedArray, h0a: Int8Array, h1a: Int8Array, ti: number, nv: number, kCol: Float32Array, j: number): number {
  const pi = ti >> 2;
  const h1 = h1a[pi] * (1 / HEIGHT_Q);
  const a = sstep(-0.06, 0.06, nv + h1 * 0.025);
  if (a <= 0) {
    kCol[j] = d0[ti];
    kCol[j + 1] = d0[ti + 1];
    kCol[j + 2] = d0[ti + 2];
    return h0a[pi] * (1 / HEIGHT_Q);
  }
  if (a >= 1) {
    kCol[j] = d1[ti];
    kCol[j + 1] = d1[ti + 1];
    kCol[j + 2] = d1[ti + 2];
    return h1;
  }
  kCol[j] = d0[ti] + (d1[ti] - d0[ti]) * a;
  kCol[j + 1] = d0[ti + 1] + (d1[ti + 1] - d0[ti + 1]) * a;
  kCol[j + 2] = d0[ti + 2] + (d1[ti + 2] - d0[ti + 2]) * a;
  const h0 = h0a[pi] * (1 / HEIGHT_Q);
  return h0 + (h1 - h0) * a;
}

/** 32-bit view of a tile's RGBA pixels (tiles are opaque, see tileFromPixels), no copy. */
function tileU32(t: FloorTile): Uint32Array {
  return new Uint32Array(t.data.buffer, t.data.byteOffset, t.w * t.h);
}

const LUM_R = 0.299 / 255;
const LUM_G = 0.587 / 255;
const LUM_B = 0.114 / 255;

/**
 * Composite one bake chunk into `out` (size*size RGBA, alpha 255). Returns cell stats.
 */
export function composeFloor(out: Uint8ClampedArray, field: FloorField, o: FloorBakeOpts): FloorBakeStats {
  const G = FLOOR_GRID;
  const size = o.size;
  const N = Math.ceil(size / G);
  const span = N + 1 + MARGIN * 2;
  const seed = o.seed ?? 11;
  const hw = o.hw;
  const nodes = span * span;
  const oneHot = FLOOR_GROUNDS.map(() => new Float32Array(nodes));
  const blockedRaw = new Float32Array(nodes);
  const inner = (N + 1) * (N + 1);
  const W = FLOOR_GROUNDS.map(() => new Float32Array(inner));
  const road = new Float32Array(inner);
  const river = new Float32Array(inner);
  const yard = new Float32Array(inner);
  const blocked = new Float32Array(inner);
  const nLane = new Float32Array(inner);
  const n50 = new Float32Array(inner);
  const n90 = new Float32Array(inner);
  const nVar = new Float32Array(inner);
  const index = new Map<FloorGround, number>(FLOOR_GROUNDS.map((g, i) => [g, i]));

  for (let gy = 0; gy < span; gy++) {
    for (let gx = 0; gx < span; gx++) {
      const sx = o.x0 + (gx - MARGIN) * G;
      const sy = o.y0 + (gy - MARGIN) * G;
      // Domain warp in bake px: big lobes (~130 px, +-110) plus ragged detail (~33 px, +-28).
      const dx = floorNoise(sx, sy, 130, seed) * 220 + floorNoise(sx, sy, 33, seed + 5) * 56;
      const dy = floorNoise(sx, sy, 130, seed + 2) * 220 + floorNoise(sx, sy, 33, seed + 9) * 56;
      const wp = o.unproject(sx + dx, sy + dy);
      const k = index.get(field.ground(wp.x, wp.y)) ?? 0;
      const n = gy * span + gx;
      oneHot[k][n] = 1;
      const ix = gx - MARGIN;
      const iy = gy - MARGIN;
      const p = o.unproject(sx, sy);
      if (ix < 0 || iy < 0 || ix > N || iy > N) continue;
      const m = iy * (N + 1) + ix;
      road[m] = field.road(p.x, p.y);
      river[m] = field.river(p.x, p.y);
      yard[m] = field.yard(p.x, p.y);
      nLane[m] = floorNoise(sx, sy, 60, seed + 13);
      n50[m] = floorNoise(sx, sy, 50, seed + 17);
      n90[m] = floorNoise(sx, sy, 90, seed + 19);
      nVar[m] = floorNoise(sx, sy, 420, seed + 23);
    }
  }
  // Blocked (tree ground) mask: walkability is the costly query, so sample it every BLOCK_STEP nodes and
  // interpolate; it only drives a soft 10 % darkening.
  const bs = Math.ceil((span - 1) / BLOCK_STEP) + 1;
  const coarse = new Float32Array(bs * bs);
  for (let by = 0; by < bs; by++) {
    for (let bx = 0; bx < bs; bx++) {
      const p = o.unproject(o.x0 + (bx * BLOCK_STEP - MARGIN) * G, o.y0 + (by * BLOCK_STEP - MARGIN) * G);
      coarse[by * bs + bx] = field.blocked(p.x, p.y) ? 1 : 0;
    }
  }
  for (let gy = 0; gy < span; gy++) {
    const cyf = gy / BLOCK_STEP;
    const by = Math.min(bs - 2, Math.floor(cyf));
    const ty = cyf - by;
    for (let gx = 0; gx < span; gx++) {
      const cxf = gx / BLOCK_STEP;
      const bx = Math.min(bs - 2, Math.floor(cxf));
      const tx = cxf - bx;
      const c = by * bs + bx;
      blockedRaw[gy * span + gx] =
        coarse[c] * (1 - tx) * (1 - ty) + coarse[c + 1] * tx * (1 - ty) + coarse[c + bs] * (1 - tx) * ty + coarse[c + bs + 1] * tx * ty;
    }
  }
  // Box blur of the one-hot zone weights and the blocked mask.
  const box = (src: Float32Array, dst: Float32Array, r: number) => {
    const area = (2 * r + 1) * (2 * r + 1);
    for (let iy = 0; iy <= N; iy++) {
      for (let ix = 0; ix <= N; ix++) {
        let s = 0;
        for (let by = -r; by <= r; by++) {
          const row = (iy + MARGIN + by) * span;
          for (let bx = -r; bx <= r; bx++) s += src[row + ix + MARGIN + bx];
        }
        dst[iy * (N + 1) + ix] = s / area;
      }
    }
  };
  for (let k = 0; k < FLOOR_GROUNDS.length; k++) box(oneHot[k], W[k], BLUR);
  box(blockedRaw, blocked, 1);

  const tiles = FLOOR_GROUNDS.map((g) => GROUND_VARIANTS[g].map((name) => o.tile(name)));
  const heights = tiles.map((v) => v.map(tileHeight));
  const out32 = new Uint32Array(out.buffer, out.byteOffset, size * size);
  const lava = o.tile('lava_0');
  const cob = o.tile('cobble_0');
  const cobH = o.tile('cobble_0_h');
  const fireK = index.get('fire') ?? 3;
  const treeDarken = o.treeDarken ?? 0.1;
  const rLava = o.lavaHalf * hw;
  const rBank = o.bankHalf * hw;
  const rRoad = o.roadHalf * hw;
  const yardPx = o.yard ?? null;
  const stats: FloorBakeStats = { cells: 0, fastCells: 0, copyCells: 0 };
  const cobU32 = tileU32(cob);
  const lavaU32 = tileU32(lava);
  const groundU32 = tiles.map((v) => v.map(tileU32));
  let hMax = 0;
  for (const v of tiles) for (const t of v) hMax = Math.max(hMax, tileHeightMax(t));
  const VARIANT_SLACK = hMax * 0.025 + 1e-3;
  const kCol = new Float32Array(12);
  const kH = new Float32Array(4);
  const kW = new Float32Array(4);

  const R = N + 1;
  const tData = tiles.map((v) => v.map((t) => t.data));
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      stats.cells += 1;
      const i00 = cy * R + cx;
      const i10 = i00 + 1;
      const i01 = i00 + R;
      const i11 = i01 + 1;
      let activeMask = 0;
      let actives = 0;
      for (let k = 0; k < 4; k++) {
        if (W[k][i00] + W[k][i10] + W[k][i01] + W[k][i11] > 1e-4) {
          activeMask |= 1 << k;
          actives += 1;
        }
      }
      const minRoad = Math.min(road[i00], road[i10], road[i01], road[i11]);
      const minRiver = Math.min(river[i00], river[i10], river[i01], river[i11]);
      const maxYard = Math.max(yard[i00], yard[i10], yard[i01], yard[i11]);
      const laneOn = (minRoad - o.roadHalf) * hw < 60;
      const riverOn = Number.isFinite(minRiver) && (minRiver * hw - rLava) < 190;
      const yardOn = yardPx !== null && maxYard * hw > -60;
      const anyBlocked = blocked[i00] + blocked[i10] + blocked[i01] + blocked[i11] > 0.02;
      const fast = actives === 1 && !laneOn && !riverOn && !yardOn && !anyBlocked;
      if (fast) stats.fastCells += 1;
      const single = actives === 1 ? 31 - Math.clz32(activeMask) : -1;
      const fireMix = (activeMask & (1 << fireK)) !== 0 && actives > 1;

      // Whole-cell copies (exact: the per-pixel maths would give the same source pixel everywhere).
      // Variant blend a = sstep(+-0.06, nv + h*0.025) is constant when nv clears +-0.06 by > 0.025*|h|max.
      let copy: Uint32Array | null = null;
      const maxRoad = Math.max(road[i00], road[i10], road[i01], road[i11]);
      const maxRiver = Math.max(river[i00], river[i10], river[i01], river[i11]);
      if (laneOn && (rRoad - maxRoad * hw) / 14 - 1.1 - 1.5 > 0.4) {
        copy = cobU32; // fully inside the cobble (noise term >= -1.1, height term >= -1.5)
      } else if (riverOn && !laneOn && !yardOn && (rLava - maxRiver * hw) / 8 - 1.2 > 0.9) {
        copy = lavaU32; // lava core: la = 1, no glow, no lip
      } else if (fast) {
        const nvMin = Math.min(nVar[i00], nVar[i10], nVar[i01], nVar[i11]);
        const nvMax = Math.max(nVar[i00], nVar[i10], nVar[i01], nVar[i11]);
        if (nvMax < -0.06 - VARIANT_SLACK) copy = groundU32[single][0];
        else if (nvMin > 0.06 + VARIANT_SLACK) copy = groundU32[single][1];
      }
      if (copy) {
        stats.copyCells += 1;
        for (let py = 0; py < G; py++) {
          const ly = cy * G + py;
          if (ly >= size) break;
          const by = o.y0 + ly;
          const ty = ((by % FLOOR_TILE_H) + FLOOR_TILE_H) % FLOOR_TILE_H;
          const row = ty * FLOOR_TILE_W;
          let oi = ly * size + cx * G;
          let tx = (((o.x0 + cx * G) % FLOOR_TILE_W) + FLOOR_TILE_W) % FLOOR_TILE_W;
          const lim = Math.min(G, size - cx * G);
          for (let px = 0; px < lim; px++) {
            out32[oi++] = copy[row + tx];
            if (++tx === FLOOR_TILE_W) tx = 0;
          }
        }
        continue;
      }

      for (let py = 0; py < G; py++) {
        const ly = cy * G + py;
        if (ly >= size) break;
        const fy = py / G;
        const by = o.y0 + ly;
        const ty = ((by % FLOOR_TILE_H) + FLOOR_TILE_H) % FLOOR_TILE_H;
        for (let px = 0; px < G; px++) {
          const lx = cx * G + px;
          if (lx >= size) break;
          const fx = px / G;
          const bx = o.x0 + lx;
          const tx = ((bx % FLOOR_TILE_W) + FLOOR_TILE_W) % FLOOR_TILE_W;
          const ti = (ty * FLOOR_TILE_W + tx) * 4;
          const w00 = (1 - fx) * (1 - fy);
          const w10 = fx * (1 - fy);
          const w01 = (1 - fx) * fy;
          const w11 = fx * fy;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          const nv = bil(nVar, i00, R, w00, w10, w01, w11);
          // --- ground
          if (single >= 0) {
            groundPx(tData[single][0], tData[single][1], heights[single][0], heights[single][1], ti, nv, kCol, single * 3);
            const j = single * 3;
            cr = kCol[j];
            cg = kCol[j + 1];
            cb = kCol[j + 2];
          } else {
            let tot = 0;
            for (let k = 0; k < 4; k++) {
              kW[k] = 0;
              if (!(activeMask & (1 << k))) continue;
              const wk = bil(W[k], i00, R, w00, w10, w01, w11);
              if (wk <= 0) continue;
              kH[k] = groundPx(tData[k][0], tData[k][1], heights[k][0], heights[k][1], ti, nv, kCol, k * 3);
              const w = wk * Math.exp(0.6 * kH[k]);
              kW[k] = w * w * w;
              tot += kW[k];
            }
            cr = 0;
            cg = 0;
            cb = 0;
            for (let k = 0; k < 4; k++) {
              if (kW[k] <= 0) continue;
              const a = kW[k] / tot;
              cr += kCol[k * 3] * a;
              cg += kCol[k * 3 + 1] * a;
              cb += kCol[k * 3 + 2] * a;
            }
            if (fireMix) {
              // Scorched band on the non-fire side of a fire border.
              const wf = bil(W[fireK], i00, R, w00, w10, w01, w11);
              const sc = Math.min(1, 4 * wf * (1 - wf)) * (1 - kW[fireK] / tot);
              const s = 1 - 0.35 * sc;
              cr *= s;
              cg *= s;
              cb *= s;
            }
          }
          if (fast) {
            const oi = (ly * size + lx) * 4;
            out[oi] = cr;
            out[oi + 1] = cg;
            out[oi + 2] = cb;
            out[oi + 3] = 255;
            continue;
          }
          if (anyBlocked) {
            const s = 1 - treeDarken * bil(blocked, i00, R, w00, w10, w01, w11);
            cr *= s;
            cg *= s;
            cb *= s;
          }
          const nl = bil(nLane, i00, R, w00, w10, w01, w11);
          // --- base yard stone (pre-painted diamonds), noisy edge
          if (yardOn && yardPx) {
            const oi = (ly * size + lx) * 4;
            const ya0 = yardPx[oi + 3] / 255;
            if (ya0 > 0) {
              const yh = yardPx[oi] * LUM_R + yardPx[oi + 1] * LUM_G + yardPx[oi + 2] * LUM_B;
              const ya = sstep(-0.4, 0.4, (bil(yard, i00, R, w00, w10, w01, w11) * hw - 34) / 14 + nl * 2.2 + (yh - 0.25) * 3) * ya0;
              if (ya > 0) {
                cr += (yardPx[oi] - cr) * ya;
                cg += (yardPx[oi + 1] - cg) * ya;
                cb += (yardPx[oi + 2] - cb) * ya;
              }
            }
          }
          // --- lava river: charred bank, lava, glow, cooling lip
          if (riverOn) {
            const d = bil(river, i00, R, w00, w10, w01, w11) * hw;
            const n1 = bil(n50, i00, R, w00, w10, w01, w11);
            const n2 = bil(n90, i00, R, w00, w10, w01, w11);
            const bankA = sstep(-0.6, 0.6, (rBank - d) / 20 + n2 * 3);
            if (bankA > 0) {
              cr *= 1 - 0.45 * bankA;
              cg *= 1 - 0.55 * bankA;
              cb *= 1 - 0.58 * bankA;
            }
            const lavf = (rLava - d) / 8 + n1 * 2.4;
            const la = sstep(-0.35, 0.35, lavf);
            if (la > 0) {
              const ld = lava.data;
              cr += (ld[ti] - cr) * la;
              cg += (ld[ti + 1] - cg) * la;
              cb += (ld[ti + 2] - cb) * la;
            }
            const glow = Math.exp(-Math.max(d - rLava, 0) / 38) * (0.55 + n2) * (1 - la);
            const lip = sstep(-0.9, 0, lavf) * (1 - sstep(0, 0.9, lavf));
            cr += (glow * 0.42 + lip * 0.5) * 255;
            cg += (glow * 0.11 + lip * 0.2) * 255;
            cb += (glow * 0.02 + lip * 0.03) * 255;
          }
          // --- cobble lane over every ground: worn shoulder, then height-aware cobble edge
          if (laneOn) {
            const d = bil(road, i00, R, w00, w10, w01, w11) * hw;
            const sh = sstep(-3.5, 0, (rRoad + 10 - d) / 14 + nl * 2);
            if (sh > 0) {
              const s = 1 - 0.28 * sh;
              cr *= s;
              cg *= s;
              cb *= s;
            }
            const h = cobH.data[ti] / 255;
            const a = sstep(-0.4, 0.4, (rRoad - d) / 14 + nl * 2.2 + (h - 0.5) * 3);
            if (a > 0) {
              const cd = cob.data;
              cr += (cd[ti] - cr) * a;
              cg += (cd[ti + 1] - cg) * a;
              cb += (cd[ti + 2] - cb) * a;
            }
          }
          const oi = (ly * size + lx) * 4;
          out[oi] = cr;
          out[oi + 1] = cg;
          out[oi + 2] = cb;
          out[oi + 3] = 255;
        }
      }
    }
  }
  return stats;
}
