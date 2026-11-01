/**
 * Canon review of PR #102 (Joseph's sprite-sheet rule from PR #60): the Rakanishu atlas must fail a test when its
 * direction rows are bad. Decodes the shipped WebP (pure-TS VP8L decoder, tests only) and checks, for every
 * shipped column (animation frame): all 8 direction rows are non-empty, no two rows are pixel-identical, and no
 * two rows are horizontal mirror images (Rakanishu has no manifest mirror, so all 8 facings are rendered).
 * Comparisons are on each frame's opaque crop, so a row that is the same picture shifted inside its cell, or a
 * flip of it, still counts as identical / mirrored.
 */
import assert from 'node:assert/strict';
import atlas from '../src/game/art/rakanishu-atlas.json';
import { readWebpLossless } from './webp-lossless';

const ROWS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const MIN_OPAQUE = 100; // px; the smallest real frame is the end-on corpse (death col 16/17, row n: 353 px), the median is ~1500
let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const img = readWebpLossless('public/sprites/bosses/rakanishu-atlas.webp');
type Frame = { row: number; col: number; w: number; h: number; px: Uint8Array; opaque: number };

function crop(x: number, y: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) out.set(img.rgba.subarray(((y + j) * img.w + x) * 4, ((y + j) * img.w + x + w) * 4), j * w * 4);
  // Fully transparent pixels compare equal whatever their RGB.
  for (let p = 0; p < out.length; p += 4) if (out[p + 3] === 0) out[p] = out[p + 1] = out[p + 2] = 0;
  return out;
}

const byCol = new Map<number, Frame[]>();
for (const [row, col, x, y, w, h] of atlas.frames) {
  const px = crop(x, y, w, h);
  let opaque = 0;
  for (let p = 3; p < px.length; p += 4) if (px[p]) opaque++;
  const list = byCol.get(col) ?? [];
  list[row] = { row, col, w, h, px, opaque };
  byCol.set(col, list);
}

function same(a: Frame, b: Frame): boolean {
  return a.w === b.w && a.h === b.h && Buffer.compare(Buffer.from(a.px), Buffer.from(b.px)) === 0;
}
function mirrored(a: Frame, b: Frame): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  const w = a.w;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const k = (y * w + (w - 1 - x)) * 4;
      if (a.px[i] !== b.px[k] || a.px[i + 1] !== b.px[k + 1] || a.px[i + 2] !== b.px[k + 2] || a.px[i + 3] !== b.px[k + 3]) return false;
    }
  }
  return true;
}
/** Share of opaque pixels (union, cell-aligned crops) that differ: for the log only. */
function diffShare(a: Frame, b: Frame): number {
  const w = Math.max(a.w, b.w), h = Math.max(a.h, b.h);
  let diff = 0, any = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = x < a.w && y < a.h ? (y * a.w + x) * 4 : -1;
      const ib = x < b.w && y < b.h ? (y * b.w + x) * 4 : -1;
      const aa = ia >= 0 ? a.px[ia + 3] : 0, ba = ib >= 0 ? b.px[ib + 3] : 0;
      if (!aa && !ba) continue;
      any++;
      if (aa !== ba || (aa && (a.px[ia] !== b.px[ib] || a.px[ia + 1] !== b.px[ib + 1] || a.px[ia + 2] !== b.px[ib + 2]))) diff++;
    }
  }
  return any ? diff / any : 0;
}

test('decoder: shipped atlas decodes at the frame-table size, and every frame crop is tight (opaque on all four edges, transparent gutter)', () => {
  assert.deepEqual([img.w, img.h], [atlas.w, atlas.h]);
  for (const [row, col, x, y, w, h] of atlas.frames) {
    const a = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h ? 0 : img.rgba[(yy * img.w + xx) * 4 + 3]);
    let top = false, bottom = false, left = false, right = false, halo = false;
    for (let i = 0; i < w; i++) { top ||= a(x + i, y) > 0; bottom ||= a(x + i, y + h - 1) > 0; halo ||= a(x + i, y - 1) > 0 || a(x + i, y + h) > 0; }
    for (let j = 0; j < h; j++) { left ||= a(x, y + j) > 0; right ||= a(x + w - 1, y + j) > 0; halo ||= a(x - 1, y + j) > 0 || a(x + w, y + j) > 0; }
    assert.ok(top && bottom && left && right, `row ${ROWS[row]} col ${col}: crop not tight`);
    assert.ok(!halo, `row ${ROWS[row]} col ${col}: opaque pixels outside its crop`);
  }
});

test(`every shipped column has all 8 direction rows, each non-empty (>= ${MIN_OPAQUE} opaque px)`, () => {
  assert.deepEqual([...byCol.keys()].sort((p, q) => p - q), [...atlas.cols].sort((p, q) => p - q));
  for (const col of atlas.cols) {
    const rows = byCol.get(col)!;
    for (let r = 0; r < 8; r++) {
      assert.ok(rows[r], `col ${col} row ${ROWS[r]} missing`);
      assert.ok(rows[r].opaque >= MIN_OPAQUE, `col ${col} row ${ROWS[r]} empty (${rows[r].opaque} opaque px)`);
    }
  }
});

let minShare = 1;
let minAt = '';
test('no two direction rows of any column are pixel-identical', () => {
  const bad: string[] = [];
  for (const col of atlas.cols) {
    const rows = byCol.get(col)!;
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        if (same(rows[i], rows[j])) bad.push(`col ${col}: ${ROWS[i]} == ${ROWS[j]}`);
        const s = diffShare(rows[i], rows[j]);
        if (s < minShare) { minShare = s; minAt = `col ${col} ${ROWS[i]}/${ROWS[j]}`; }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('no two direction rows of any column are horizontal mirror images', () => {
  const bad: string[] = [];
  for (const col of atlas.cols) {
    const rows = byCol.get(col)!;
    for (let i = 0; i < 8; i++) for (let j = i; j < 8; j++) if (mirrored(rows[i], rows[j]) && i !== j) bad.push(`col ${col}: ${ROWS[i]} mirrors ${ROWS[j]}`);
  }
  assert.deepEqual(bad, []);
});

test('the checks catch bad rows: a copied row and a flipped row are flagged', () => {
  const rows = byCol.get(atlas.cols[0])!;
  const copy = { ...rows[2], px: rows[2].px.slice() };
  assert.ok(same(rows[2], copy));
  const flip = { ...rows[2], px: new Uint8Array(rows[2].px.length) };
  for (let y = 0; y < flip.h; y++) for (let x = 0; x < flip.w; x++) flip.px.set(rows[2].px.subarray((y * flip.w + x) * 4, (y * flip.w + x) * 4 + 4), (y * flip.w + flip.w - 1 - x) * 4);
  assert.ok(mirrored(rows[2], flip));
  assert.ok(!same(rows[2], rows[6]) && !mirrored(rows[2], rows[6]), 'e and w are distinct renders');
});

console.log(`rakanishu-atlas-rows: ${atlas.cols.length} columns x 8 rows; smallest row-pair difference ${(minShare * 100).toFixed(1)}% of opaque px (${minAt})`);
console.log(`rakanishu-atlas-rows: ${passed} passed`);
