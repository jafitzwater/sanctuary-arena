/**
 * t364u + t370u (Joseph's sprite-sheet rule from PR #60, as for Rakanishu in test/rakanishu-atlas-rows.ts): every
 * approved boss atlas must fail a test when its direction rows are bad. Decodes each shipped per-animation WebP
 * (test-only VP8L decoder; 6 bosses x idle8, walk8, attack12, hit4, death10) and checks, for every column of every
 * animation: all 8 direction rows are non-empty, no two rows are
 * pixel-identical and no two rows are horizontal mirror images (none of these sheets has a manifest mirror).
 * Comparisons are on each frame's opaque crop, so a shifted copy or flip of a row still counts.
 */
import assert from 'node:assert/strict';
import atlases from '../src/game/art/boss-atlases.json';
import { readWebpLossless } from './webp-lossless';

const ROWS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const ANIMS = { idle: 8, walk: 8, attack: 12, hit: 4, death: 10 } as const;
const MIN_OPAQUE = 100; // px; every real boss frame is far larger (log below)
type Meta = { w: number; h: number; frames: number[][] };
type BossMeta = { anims: Record<keyof typeof ANIMS, Meta> };
type Frame = { row: number; col: number; w: number; h: number; px: Uint8Array; opaque: number };
let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
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

let firstCols: Map<number, Frame[]> | null = null;
const checked: string[] = [];
const BOSSES = atlases as unknown as Record<string, BossMeta>;
test('frame tables: 6 bosses x 5 animations (idle, walk, attack, hit, death), each with its own atlas', () => {
  assert.deepEqual(Object.keys(BOSSES).sort(), ['council-a', 'council-b', 'council-c', 'countess', 'izual', 'radament']);
  for (const b of Object.values(BOSSES)) assert.deepEqual(Object.keys(b.anims).sort(), Object.keys(ANIMS).sort());
});
for (const [boss, bm] of Object.entries(BOSSES)) for (const [anim, n] of Object.entries(ANIMS) as [keyof typeof ANIMS, number][]) {
  const meta = bm.anims[anim];
  const id = `${boss} ${anim}`;
  const COLS = Array.from({ length: n }, (_, i) => i);
  checked.push(id);
  const img = readWebpLossless(`public/sprites/bosses/${boss}-${anim}.webp`);
  const crop = (x: number, y: number, w: number, h: number): Uint8Array => {
    const out = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) out.set(img.rgba.subarray(((y + j) * img.w + x) * 4, ((y + j) * img.w + x + w) * 4), j * w * 4);
    for (let p = 0; p < out.length; p += 4) if (out[p + 3] === 0) out[p] = out[p + 1] = out[p + 2] = 0;
    return out;
  };
  const byCol = new Map<number, Frame[]>();
  for (const [row, col, x, y, w, h] of meta.frames) {
    const px = crop(x, y, w, h);
    let opaque = 0;
    for (let p = 3; p < px.length; p += 4) if (px[p]) opaque++;
    const list = byCol.get(col) ?? [];
    assert.ok(!list[row], `${id}: duplicate frame row ${row} col ${col}`);
    list[row] = { row, col, w, h, px, opaque };
    byCol.set(col, list);
  }
  firstCols ??= byCol;

  test(`${id}: decodes at the frame-table size; every crop is tight with a clear gutter (no neighbour pixels within 2 px)`, () => {
    assert.deepEqual([img.w, img.h], [meta.w, meta.h]);
    const a = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h ? 0 : img.rgba[(yy * img.w + xx) * 4 + 3]);
    for (const [row, col, x, y, w, h] of meta.frames) {
      let top = false, bottom = false, left = false, right = false, halo = false;
      for (let i = 0; i < w; i++) {
        top ||= a(x + i, y) > 0;
        bottom ||= a(x + i, y + h - 1) > 0;
        for (let d = 1; d <= 2; d++) halo ||= a(x + i, y - d) > 0 || a(x + i, y + h - 1 + d) > 0;
      }
      for (let j = -2; j < h + 2; j++) {
        if (j >= 0 && j < h) { left ||= a(x, y + j) > 0; right ||= a(x + w - 1, y + j) > 0; }
        for (let d = 1; d <= 2; d++) halo ||= a(x - d, y + j) > 0 || a(x + w - 1 + d, y + j) > 0;
      }
      assert.ok(top && bottom && left && right, `${id} row ${ROWS[row]} col ${col}: crop not tight`);
      assert.ok(!halo, `${id} row ${ROWS[row]} col ${col}: opaque pixels within 2 px of its crop`);
    }
  });

  let minOpaque = Infinity;
  test(`${id}: all ${n} columns have all 8 direction rows, each non-empty (>= ${MIN_OPAQUE} opaque px)`, () => {
    assert.equal(meta.frames.length, 8 * n);
    assert.deepEqual([...byCol.keys()].sort((p, q) => p - q), COLS);
    for (const col of COLS) {
      const rows = byCol.get(col)!;
      for (let r = 0; r < 8; r++) {
        assert.ok(rows[r], `${id} col ${col} row ${ROWS[r]} missing`);
        assert.ok(rows[r].opaque >= MIN_OPAQUE, `${id} col ${col} row ${ROWS[r]} empty (${rows[r].opaque} opaque px)`);
        minOpaque = Math.min(minOpaque, rows[r].opaque);
      }
    }
  });

  let minShare = 1;
  let minAt = '';
  test(`${id}: no two direction rows of any column are pixel-identical`, () => {
    const bad: string[] = [];
    for (const col of COLS) {
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

  test(`${id}: no two direction rows of any column are horizontal mirror images`, () => {
    const bad: string[] = [];
    for (const col of COLS) {
      const rows = byCol.get(col)!;
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (mirrored(rows[i], rows[j])) bad.push(`col ${col}: ${ROWS[i]} mirrors ${ROWS[j]}`);
    }
    assert.deepEqual(bad, []);
  });
  console.log(`  ${id}: smallest opaque frame ${minOpaque} px; smallest row-pair difference ${(minShare * 100).toFixed(1)}% of opaque px (${minAt})`);
}

test('the checks catch bad rows: a copied row and a flipped row are flagged', () => {
  const rows = firstCols!.get(0)!;
  const copy = { ...rows[2], px: rows[2].px.slice() };
  assert.ok(same(rows[2], copy));
  const flip = { ...rows[2], px: new Uint8Array(rows[2].px.length) };
  for (let y = 0; y < flip.h; y++) for (let x = 0; x < flip.w; x++) flip.px.set(rows[2].px.subarray((y * flip.w + x) * 4, (y * flip.w + x) * 4 + 4), (y * flip.w + flip.w - 1 - x) * 4);
  assert.ok(mirrored(rows[2], flip));
  assert.ok(!same(rows[2], rows[6]) && !mirrored(rows[2], rows[6]), 'e and w are distinct renders');
});

test('every shipped boss atlas was checked (30)', () => assert.equal(checked.length, 30));

console.log(`boss-atlas-rows: ${passed} passed`);
