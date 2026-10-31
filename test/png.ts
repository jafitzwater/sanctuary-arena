// Test helper: minimal 8-bit RGBA/RGB/grey PNG decoder (no dependencies). Tests only.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export type Png = { w: number; h: number; rgba: Uint8Array };

export function readPng(path: string): Png {
  const b = readFileSync(path);
  let o = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2 && ct !== 0)) throw new Error(`${path}: need 8-bit RGBA, RGB or grey PNG (bd ${bd}, ct ${ct})`);
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 1, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, up = y ? px[dst - stride + x] : 0, ul = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      px[dst + x] = v & 255;
    }
  }
  if (bpp === 4) return { w, h, rgba: px };
  const rgba = new Uint8Array(w * h * 4);
  if (bpp === 1) { for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = px[i]; rgba[i * 4 + 3] = 255; } return { w, h, rgba }; }
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = px[i * 3]; rgba[i * 4 + 1] = px[i * 3 + 1]; rgba[i * 4 + 2] = px[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
  return { w, h, rgba };
}

/** One 64x64 cell as a string key (alpha-zero pixels normalised), optionally flipped left-right. */
export function cellKey(p: Png, col: number, row: number, cell = 64, flip = false): string {
  const out: number[] = [];
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
    const sx = col * cell + (flip ? cell - 1 - x : x), i = ((row * cell + y) * p.w + sx) * 4;
    if (p.rgba[i + 3] === 0) out.push(0, 0, 0, 0); else out.push(p.rgba[i], p.rgba[i + 1], p.rgba[i + 2], p.rgba[i + 3]);
  }
  return Buffer.from(out).toString('base64');
}

export function cellHasFigure(p: Png, col: number, row: number, cell = 64): boolean {
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) if (p.rgba[((row * cell + y) * p.w + col * cell + x) * 4 + 3] > 0) return true;
  return false;
}
