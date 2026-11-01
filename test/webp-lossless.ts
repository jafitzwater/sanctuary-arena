// Test helper: minimal lossless WebP (VP8L) decoder (no dependencies), after the WebP Lossless Bitstream
// spec (RFC 9649). Tests only; the game never imports it. Returns 8-bit RGBA like ./png.
import { readFileSync } from 'node:fs';

export type Img = { w: number; h: number; rgba: Uint8Array };

class Bits {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const p = this.pos++;
      if (p >> 3 >= this.b.length) throw new Error('VP8L: out of data');
      v |= ((this.b[p >> 3] >> (p & 7)) & 1) << i;
    }
    return v >>> 0;
  }
}

/** Canonical prefix code, decoded MSB-of-code first, bit by bit (as in deflate). */
class Code {
  private counts = new Int32Array(16);
  private syms: Int32Array;
  private single = -1;
  constructor(lengths: ArrayLike<number>) {
    let nonzero = 0;
    let last = 0;
    for (let s = 0; s < lengths.length; s++) if (lengths[s]) { this.counts[lengths[s]]++; nonzero++; last = s; }
    this.syms = new Int32Array(nonzero);
    if (nonzero === 1) this.single = last;
    // offs[l]: index of the first symbol of length l in canonical order
    const offs = new Int32Array(16);
    let acc = 0;
    for (let l = 1; l < 16; l++) { offs[l] = acc; acc += this.counts[l]; }
    for (let s = 0; s < lengths.length; s++) if (lengths[s]) this.syms[offs[lengths[s]]++] = s;
  }
  static one(sym: number): Code {
    const c = new Code([]);
    c.single = sym;
    return c;
  }
  read(br: Bits): number {
    if (this.single >= 0) return this.single;
    let code = 0, first = 0, index = 0;
    for (let l = 1; l < 16; l++) {
      code |= br.read(1);
      const count = this.counts[l];
      if (code - first < count) return this.syms[index + code - first];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('VP8L: bad prefix code');
  }
}

const CL_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function readCode(br: Bits, alphabet: number): Code {
  if (br.read(1)) {
    const n = br.read(1) + 1;
    const s0 = br.read(br.read(1) ? 8 : 1);
    if (n === 1) return Code.one(s0);
    const s1 = br.read(8);
    const lengths = new Uint8Array(Math.max(alphabet, s0 + 1, s1 + 1));
    lengths[s0] = 1;
    lengths[s1] = 1;
    return new Code(lengths);
  }
  const clLens = new Uint8Array(19);
  const num = 4 + br.read(4);
  for (let i = 0; i < num; i++) clLens[CL_ORDER[i]] = br.read(3);
  const cl = new Code(clLens);
  let maxSymbol = alphabet;
  if (br.read(1)) {
    const nbits = 2 + 2 * br.read(3);
    maxSymbol = 2 + br.read(nbits);
  }
  const lengths = new Uint8Array(alphabet);
  let prev = 8;
  let s = 0;
  while (s < alphabet) {
    if (maxSymbol-- === 0) break;
    const c = cl.read(br);
    if (c < 16) {
      lengths[s++] = c;
      if (c) prev = c;
    } else {
      const [extra, base, val] = c === 16 ? [2, 3, prev] : c === 17 ? [3, 3, 0] : [7, 11, 0];
      const rep = base + br.read(extra);
      if (s + rep > alphabet) throw new Error('VP8L: code lengths overflow');
      for (let k = 0; k < rep; k++) lengths[s++] = val;
    }
  }
  return new Code(lengths);
}

// (dx, dy) for distance codes 1..120.
const DIST = [
  0, 1, 1, 0, 1, 1, -1, 1, 0, 2, 2, 0, 1, 2, -1, 2, 2, 1, -2, 1, 2, 2, -2, 2, 0, 3, 3, 0, 1, 3, -1, 3, 3, 1, -3, 1,
  2, 3, -2, 3, 3, 2, -3, 2, 0, 4, 4, 0, 1, 4, -1, 4, 4, 1, -4, 1, 3, 3, -3, 3, 2, 4, -2, 4, 4, 2, -4, 2, 0, 5, 3, 4,
  -3, 4, 4, 3, -4, 3, 5, 0, 1, 5, -1, 5, 5, 1, -5, 1, 2, 5, -2, 5, 5, 2, -5, 2, 4, 4, -4, 4, 3, 5, -3, 5, 5, 3,
  -5, 3, 0, 6, 6, 0, 1, 6, -1, 6, 6, 1, -6, 1, 2, 6, -2, 6, 6, 2, -6, 2, 4, 5, -4, 5, 5, 4, -5, 4, 3, 6, -3, 6,
  6, 3, -6, 3, 0, 7, 7, 0, 1, 7, -1, 7, 5, 5, -5, 5, 7, 1, -7, 1, 4, 6, -4, 6, 6, 4, -6, 4, 2, 7, -2, 7, 7, 2,
  -7, 2, 3, 7, -3, 7, 7, 3, -7, 3, 5, 6, -5, 6, 6, 5, -6, 5, 8, 0, 4, 7, -4, 7, 7, 4, -7, 4, 8, 1, 8, 2, 6, 6,
  -6, 6, 8, 3, 5, 7, -5, 7, 7, 5, -7, 5, 8, 4, 6, 7, -6, 7, 7, 6, -7, 6, 8, 5, 7, 7, -7, 7, 8, 6, 8, 7,
];
if (DIST.length !== 240) throw new Error(`VP8L: distance table has ${DIST.length / 2} entries`);

function prefixValue(br: Bits, prefix: number): number {
  if (prefix < 4) return prefix + 1;
  const extra = (prefix - 2) >> 1;
  const offset = (2 + (prefix & 1)) << extra;
  return offset + br.read(extra) + 1;
}

const div = (n: number, bits: number) => (n + (1 << bits) - 1) >> bits;

/** One entropy-coded image of w x h ARGB pixels; `top` enables meta prefix codes. */
function decodeImage(br: Bits, w: number, h: number, top: boolean): Uint32Array {
  let cacheBits = 0;
  if (br.read(1)) {
    cacheBits = br.read(4);
    if (cacheBits < 1 || cacheBits > 11) throw new Error('VP8L: bad color cache');
  }
  let metaBits = 0;
  let meta: Uint32Array | null = null;
  let metaW = 0;
  let groups = 1;
  if (top && br.read(1)) {
    metaBits = br.read(3) + 2;
    metaW = div(w, metaBits);
    meta = decodeImage(br, metaW, div(h, metaBits), false);
    for (let i = 0; i < meta.length; i++) {
      meta[i] = (meta[i] >> 8) & 0xffff;
      groups = Math.max(groups, meta[i] + 1);
    }
  }
  const cacheSize = cacheBits ? 1 << cacheBits : 0;
  const sets: Code[][] = [];
  for (let g = 0; g < groups; g++) {
    sets.push([readCode(br, 256 + 24 + cacheSize), readCode(br, 256), readCode(br, 256), readCode(br, 256), readCode(br, 40)]);
  }
  const cache = cacheSize ? new Uint32Array(cacheSize) : null;
  const out = new Uint32Array(w * h);
  const n = w * h;
  let pos = 0;
  let cached = 0; // pixels already inserted into the cache
  const flushCache = () => {
    if (!cache) return;
    for (; cached < pos; cached++) cache[Math.imul(out[cached], 0x1e35a7bd) >>> (32 - cacheBits)] = out[cached];
  };
  while (pos < n) {
    const x = pos % w;
    const y = (pos / w) | 0;
    const set = meta ? sets[meta[(y >> metaBits) * metaW + (x >> metaBits)]] : sets[0];
    const s = set[0].read(br);
    if (s < 256) {
      const r = set[1].read(br);
      const b = set[2].read(br);
      const a = set[3].read(br);
      out[pos++] = ((a << 24) | (r << 16) | (s << 8) | b) >>> 0;
    } else if (s < 280) {
      const len = prefixValue(br, s - 256);
      const dcode = prefixValue(br, set[4].read(br));
      let dist: number;
      if (dcode > 120) dist = dcode - 120;
      else {
        dist = DIST[(dcode - 1) * 2] + DIST[(dcode - 1) * 2 + 1] * w;
        if (dist < 1) dist = 1;
      }
      if (dist > pos || pos + len > n) throw new Error('VP8L: bad backward reference');
      for (let k = 0; k < len; k++, pos++) out[pos] = out[pos - dist];
    } else {
      if (!cache) throw new Error('VP8L: cache code without cache');
      flushCache();
      out[pos++] = cache[s - 280];
    }
    flushCache();
  }
  return out;
}

const add = (a: number, b: number) =>
  ((((a >>> 24) + (b >>> 24)) & 0xff) << 24 |
    ((((a >> 16) & 0xff) + ((b >> 16) & 0xff)) & 0xff) << 16 |
    ((((a >> 8) & 0xff) + ((b >> 8) & 0xff)) & 0xff) << 8 |
    (((a & 0xff) + (b & 0xff)) & 0xff)) >>> 0;
const ch = (p: number, s: number) => (p >>> s) & 0xff;
const avg = (a: number, b: number) =>
  ((((ch(a, 24) + ch(b, 24)) >> 1) << 24) | (((ch(a, 16) + ch(b, 16)) >> 1) << 16) | (((ch(a, 8) + ch(b, 8)) >> 1) << 8) | ((ch(a, 0) + ch(b, 0)) >> 1)) >>> 0;
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const SH = [24, 16, 8, 0];
function select(L: number, T: number, TL: number): number {
  let pL = 0, pT = 0;
  for (const s of SH) {
    pL += Math.abs(ch(T, s) - ch(TL, s));
    pT += Math.abs(ch(L, s) - ch(TL, s));
  }
  return pL < pT ? L : T;
}
function full(a: number, b: number, c: number): number {
  let v = 0;
  for (const s of SH) v |= clamp(ch(a, s) + ch(b, s) - ch(c, s)) << s;
  return v >>> 0;
}
function half(a: number, b: number): number {
  let v = 0;
  for (const s of SH) v |= clamp(ch(a, s) + Math.trunc((ch(a, s) - ch(b, s)) / 2)) << s;
  return v >>> 0;
}
function predict(mode: number, d: Uint32Array, pos: number, w: number): number {
  const L = d[pos - 1], T = d[pos - w], TR = d[pos - w + 1], TL = d[pos - w - 1];
  switch (mode) {
    case 0: return 0xff000000;
    case 1: return L;
    case 2: return T;
    case 3: return TR;
    case 4: return TL;
    case 5: return avg(avg(L, TR), T);
    case 6: return avg(L, TL);
    case 7: return avg(L, T);
    case 8: return avg(TL, T);
    case 9: return avg(T, TR);
    case 10: return avg(avg(L, TL), avg(T, TR));
    case 11: return select(L, T, TL);
    case 12: return full(L, T, TL);
    case 13: return half(avg(L, T), TL);
    default: throw new Error(`VP8L: predictor ${mode}`);
  }
}
const s8 = (v: number) => (v & 0x80 ? v - 256 : v);
const delta = (t: number, c: number) => (s8(t) * s8(c)) >> 5;

type Transform =
  | { type: 0 | 1; bits: number; data: Uint32Array; w: number }
  | { type: 2; w: number }
  | { type: 3; table: Uint32Array; bits: number; w: number };

export function decodeWebpLossless(buf: Uint8Array): Img {
  const td = new TextDecoder('ascii');
  if (td.decode(buf.subarray(0, 4)) !== 'RIFF' || td.decode(buf.subarray(8, 12)) !== 'WEBP') throw new Error('not a WebP');
  let o = 12;
  let chunk: Uint8Array | null = null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (o + 8 <= buf.length) {
    const tag = td.decode(buf.subarray(o, o + 4));
    const size = dv.getUint32(o + 4, true);
    if (tag === 'VP8L') { chunk = buf.subarray(o + 8, o + 8 + size); break; }
    o += 8 + size + (size & 1);
  }
  if (!chunk || chunk[0] !== 0x2f) throw new Error('no VP8L chunk (lossy WebP is not supported)');
  const br = new Bits(chunk);
  br.read(8);
  const w = br.read(14) + 1;
  const h = br.read(14) + 1;
  br.read(1);
  if (br.read(3) !== 0) throw new Error('VP8L: version');
  const transforms: Transform[] = [];
  let xs = w;
  while (br.read(1)) {
    const type = br.read(2) as 0 | 1 | 2 | 3;
    if (type === 0 || type === 1) {
      const bits = br.read(3) + 2;
      transforms.push({ type, bits, w: xs, data: decodeImage(br, div(xs, bits), div(h, bits), false) });
    } else if (type === 2) transforms.push({ type, w: xs });
    else {
      const size = br.read(8) + 1;
      const table = decodeImage(br, size, 1, false);
      for (let i = 1; i < size; i++) table[i] = add(table[i], table[i - 1]);
      const bits = size <= 2 ? 3 : size <= 4 ? 2 : size <= 16 ? 1 : 0;
      transforms.push({ type, table, bits, w: xs });
      xs = div(xs, bits);
    }
  }
  let d = decodeImage(br, xs, h, true);
  for (let t = transforms.length - 1; t >= 0; t--) {
    const tr = transforms[t];
    const tw = tr.w;
    if (tr.type === 2) {
      for (let i = 0; i < d.length; i++) {
        const p = d[i], g = ch(p, 8);
        d[i] = ((p & 0xff00ff00) | (((ch(p, 16) + g) & 0xff) << 16) | ((ch(p, 0) + g) & 0xff)) >>> 0;
      }
    } else if (tr.type === 0) {
      const bw = div(tw, tr.bits);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < tw; x++) {
          const pos = y * tw + x;
          let pred: number;
          if (x === 0 && y === 0) pred = 0xff000000;
          else if (y === 0) pred = d[pos - 1];
          else if (x === 0) pred = d[pos - tw];
          else pred = predict((tr.data[(y >> tr.bits) * bw + (x >> tr.bits)] >> 8) & 0xf, d, pos, tw);
          d[pos] = add(d[pos], pred);
        }
      }
    } else if (tr.type === 1) {
      const bw = div(tw, tr.bits);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < tw; x++) {
          const pos = y * tw + x;
          const e = tr.data[(y >> tr.bits) * bw + (x >> tr.bits)];
          const g2r = ch(e, 0), g2b = ch(e, 8), r2b = ch(e, 16);
          const p = d[pos];
          const g = ch(p, 8);
          const r = (ch(p, 16) + delta(g2r, g)) & 0xff;
          const b = (ch(p, 0) + delta(g2b, g) + delta(r2b, r)) & 0xff;
          d[pos] = ((p & 0xff00ff00) | (r << 16) | b) >>> 0;
        }
      }
    } else if (tr.type === 3) {
      const outW = tw;
      const packedW = div(tw, tr.bits);
      const per = 1 << tr.bits;
      const bpp = 8 >> tr.bits;
      const mask = (1 << bpp) - 1;
      const out = new Uint32Array(outW * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < outW; x++) {
          const g = ch(d[y * packedW + (x >> tr.bits)], 8);
          const idx = (g >> (bpp * (x & (per - 1)))) & mask;
          out[y * outW + x] = idx < tr.table.length ? tr.table[idx] : 0;
        }
      }
      d = out;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < d.length; i++) {
    const p = d[i];
    rgba[i * 4] = ch(p, 16);
    rgba[i * 4 + 1] = ch(p, 8);
    rgba[i * 4 + 2] = ch(p, 0);
    rgba[i * 4 + 3] = ch(p, 24);
  }
  return { w, h, rgba };
}

export function readWebpLossless(path: string): Img {
  return decodeWebpLossless(readFileSync(path));
}
