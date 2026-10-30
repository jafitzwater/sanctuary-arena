/**
 * t330u "Put 3D floors in the game": tile assets, zone -> tile mapping, the per-pixel compositor and the
 * code-drawn fallback path. No DOM (the chunk cache test stubs document like map-12k.ts).
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { ZONE_IDS, groundZoneAt, zoneAt } from '../src/game/data/mapZones';
import {
  FLOOR_GROUNDS,
  FLOOR_TILES,
  FLOOR_TILE_H,
  FLOOR_TILE_W,
  GROUND_VARIANTS,
  ZONE_FLOOR,
  fallbackFloorTile,
  floorTileUrl,
  type FloorTile,
  type FloorTileName,
} from '../src/game/art/floorTiles';
import { composeFloor, type FloorField } from '../src/game/floorBake';
import { ChunkedBake } from '../src/game/bakeChunks';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

/** Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf: Buffer): { w: number; h: number; kind: string } {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    assert.equal(buf.readUIntBE(23, 3), 0x9d012a, 'VP8 start code');
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, kind };
  }
  if (kind === 'VP8L') {
    assert.equal(buf[20], 0x2f, 'VP8L signature');
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1, kind };
  }
  if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1, kind };
  throw new Error(`unknown WebP chunk ${kind}`);
}

test('every floor tile ships as a 512x256 WebP in public/tiles, about 1 MB or less in total', () => {
  let total = 0;
  for (const name of FLOOR_TILES) {
    const url = floorTileUrl('/sanctuary-arena/', name);
    assert.equal(url, `/sanctuary-arena/tiles/${name}.webp`);
    const file = `public/tiles/${name}.webp`;
    const buf = readFileSync(file);
    const { w, h } = webpSize(buf);
    assert.equal(w, FLOOR_TILE_W, `${name} width`);
    assert.equal(h, FLOOR_TILE_H, `${name} height`);
    total += statSync(file).size;
  }
  assert.ok(total < 1_100_000, `tiles total ${total} B`);
  // Decoded memory: 11 tiles x 512 KiB RGBA (approach note: 3.5 MiB for one variant per area; 2 ground variants here).
  assert.equal(FLOOR_TILES.length * FLOOR_TILE_W * FLOOR_TILE_H * 4, 5_767_168);
});

test('every zone maps to a ground tile pair, and every ground has two shipped variants', () => {
  for (const zone of ZONE_IDS) assert.ok(FLOOR_GROUNDS.includes(ZONE_FLOOR[zone]), `${zone} -> ${ZONE_FLOOR[zone]}`);
  assert.equal(ZONE_FLOOR['blood-moor'], 'plains');
  assert.equal(ZONE_FLOOR['dry-hills'], 'sand');
  assert.equal(ZONE_FLOOR['spider-forest'], 'jungle');
  assert.equal(ZONE_FLOOR['river-of-flame'], 'fire');
  assert.equal(ZONE_FLOOR['jungle-plains'], 'plains');
  assert.equal(ZONE_FLOOR['jungle-desert'], 'sand');
  assert.equal(ZONE_FLOOR['jungle-dense'], 'jungle');
  assert.equal(ZONE_FLOOR['jungle-lava'], 'fire');
  for (const g of FLOOR_GROUNDS) for (const v of GROUND_VARIANTS[g]) assert.ok((FLOOR_TILES as readonly string[]).includes(v));
});

test('groundZoneAt is zoneAt everywhere off the lava river (paint only, zones unchanged)', () => {
  const map = sanctuary;
  let same = 0;
  let river = 0;
  for (let y = 50; y < map.height; y += 97) {
    for (let x = 50; x < map.width; x += 97) {
      const z = zoneAt(map, x, y);
      const g = groundZoneAt(map, x, y);
      if (z === 'lava-river') {
        river += 1;
        assert.notEqual(g, 'lava-river');
      } else {
        assert.equal(g, z, `(${x}, ${y})`);
        same += 1;
      }
    }
  }
  assert.ok(same > 1000 && river > 0);
});

/** Mean abs RGB difference between two pixel columns (x0 vs x1), or rows when `rows`. */
function edgeDiff(t: FloorTile, a: number, b: number, rows: boolean): number {
  let s = 0;
  const n = rows ? t.w : t.h;
  for (let i = 0; i < n; i++) {
    const p = rows ? (a * t.w + i) * 4 : (i * t.w + a) * 4;
    const q = rows ? (b * t.w + i) * 4 : (i * t.w + b) * 4;
    for (let c = 0; c < 3; c++) s += Math.abs(t.data[p + c] - t.data[q + c]);
  }
  return s / (n * 3);
}

test('code-drawn fallback tiles are 512x256, opaque and seamless (wrap seam no worse than the interior)', () => {
  for (const name of FLOOR_TILES) {
    const t = fallbackFloorTile(name);
    assert.equal(t.w, FLOOR_TILE_W);
    assert.equal(t.h, FLOOR_TILE_H);
    assert.equal(t.data.length, FLOOR_TILE_W * FLOOR_TILE_H * 4);
    assert.ok(t.fallback);
    for (let i = 3; i < t.data.length; i += 4 * 1031) assert.equal(t.data[i], 255);
    const seamX = edgeDiff(t, t.w - 1, 0, false);
    const seamY = edgeDiff(t, t.h - 1, 0, true);
    const inX = edgeDiff(t, t.w / 2 - 1, t.w / 2, false);
    const inY = edgeDiff(t, t.h / 2 - 1, t.h / 2, true);
    assert.ok(seamX <= inX * 1.6 + 2, `${name} x seam ${seamX.toFixed(1)} vs ${inX.toFixed(1)}`);
    assert.ok(seamY <= inY * 1.6 + 2, `${name} y seam ${seamY.toFixed(1)} vs ${inY.toFixed(1)}`);
  }
});

// Compositor on the fallback tiles, bake space = world space (identity unproject).
const tiles = new Map<FloorTileName, FloorTile>();
const tile = (n: FloorTileName) => {
  let t = tiles.get(n);
  if (!t) tiles.set(n, (t = fallbackFloorTile(n)));
  return t;
};
const SIZE = 256;
const X0 = 1024;
const Y0 = 512;
const opts = { x0: X0, y0: Y0, size: SIZE, hw: 1, unproject: (x: number, y: number) => ({ x, y }), tile, roadHalf: 40, lavaHalf: 20, bankHalf: 45 };
const px = (out: Uint8ClampedArray, lx: number, ly: number) => [...out.slice((ly * SIZE + lx) * 4, (ly * SIZE + lx) * 4 + 4)];
const tpx = (n: FloorTileName, bx: number, by: number) => {
  const t = tile(n);
  const i = ((by % FLOOR_TILE_H) * FLOOR_TILE_W + (bx % FLOOR_TILE_W)) * 4;
  return [...t.data.slice(i, i + 3), 255];
};
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const none: FloorField = { ground: () => 'sand', road: () => 1e9, river: () => Infinity, yard: () => -1e9, blocked: () => false };

test('single ground: every pixel is one of its two variants (fast path) and output is opaque', () => {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const st = composeFloor(out, none, opts);
  assert.equal(st.fastCells, st.cells);
  for (let k = 0; k < 400; k++) {
    const lx = (k * 37) % SIZE;
    const ly = (k * 91) % SIZE;
    const p = px(out, lx, ly);
    const v0 = tpx('sand_0', X0 + lx, Y0 + ly);
    const v1 = tpx('sand_1', X0 + lx, Y0 + ly);
    const lo = v0.map((v, i) => Math.min(v, v1[i]) - 1);
    const hi = v0.map((v, i) => Math.max(v, v1[i]) + 1);
    assert.ok(p.every((v, i) => v >= lo[i] && v <= hi[i]), `pixel ${lx},${ly} between sand variants`);
    assert.equal(p[3], 255);
  }
});

test('cobble lane wins on its centre line and lava wins in the river core; the bank is darker', () => {
  const field: FloorField = { ...none, ground: () => 'plains', road: (x) => Math.abs(x - (X0 + 64)), river: (_x, y) => Math.abs(y - (Y0 + 192)) };
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const st = composeFloor(out, field, { ...opts, lavaHalf: 50, bankHalf: 110 });
  assert.ok(st.copyCells > 0, 'lane / lava cores copied whole');
  for (const ly of [10, 40, 100]) {
    assert.ok(near(px(out, 64, ly), tpx('cobble_0', X0 + 64, Y0 + ly), 2), `cobble at lane centre y ${ly}`);
  }
  for (const lx of [180, 210, 240]) {
    assert.ok(near(px(out, lx, 192), tpx('lava_0', X0 + lx, Y0 + 192), 2), `lava at river centre x ${lx}`);
  }
  // Charred bank (between lava and bank edge, away from the lane) is darker than open plains.
  const lum = (p: number[]) => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
  let bank = 0;
  let open = 0;
  for (let lx = 180; lx < 250; lx += 3) {
    bank += lum(px(out, lx, 192 - 100));
    open += lum(px(out, lx, 20));
  }
  assert.ok(bank < open, `bank ${bank.toFixed(0)} < open ${open.toFixed(0)}`);
});

test('zone borders blend irregularly (not a straight cut)', () => {
  const field: FloorField = { ...none, ground: (x) => (x < X0 + 128 ? 'jungle' : 'sand') };
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const st = composeFloor(out, field, opts);
  assert.ok(st.fastCells < st.cells, 'border cells use the blend path');
  // Where each row turns from mostly-jungle to mostly-sand varies (domain warp), so the border is not a column.
  const turns: number[] = [];
  const j = tile('jungle_0');
  const s = tile('sand_0');
  for (let ly = 0; ly < SIZE; ly += 16) {
    let turn = SIZE;
    for (let lx = 0; lx < SIZE; lx++) {
      const p = px(out, lx, ly);
      const dj = Math.abs(p[0] - j.mean * 255) + Math.abs(p[2] - j.mean * 255);
      const ds = Math.abs(p[0] - s.mean * 255) + Math.abs(p[2] - s.mean * 255);
      if (ds < dj) {
        turn = lx;
        break;
      }
    }
    turns.push(turn);
  }
  assert.ok(Math.max(...turns) - Math.min(...turns) >= 8, `border wanders: ${turns.join(',')}`);
});

test('chunk cache: provisional paints over budget, invalidate() marks chunks stale, draws repaint them progressively', () => {
  const ctxStub = { save() {}, restore() {}, translate() {}, drawImage() {}, clearRect() {}, imageSmoothingEnabled: true };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
  };
  let fullPaints = 0;
  let quick = 0;
  let ready = false;
  const bake = new ChunkedBake(4096, 2048, (_c, _x, _y, _w, _h, full) => {
    if (!ready) return true; // tiles not loaded yet: code-drawn floor counts as done
    if (!full) {
      quick += 1;
      return false;
    }
    fullPaints += 1;
    const t = performance.now();
    while (performance.now() - t < 12); // a slow tile bake: blows the 8 ms budget
    return true;
  });
  const target = ctxStub as unknown as CanvasRenderingContext2D;
  bake.draw(target, 0, 0, 1536, 1024, 844, 390, 0);
  assert.equal(bake.stale, 0);
  ready = true;
  bake.invalidate();
  assert.equal(bake.stale, 6, 'all 6 in-view chunks stale after the tiles arrive');
  bake.draw(target, 0, 0, 1536, 1024, 844, 390, 0);
  assert.equal(fullPaints, 1, 'one stale chunk repainted per draw');
  assert.equal(bake.stale, 5);
  for (let f = 0; f < 10; f++) bake.draw(target, 0, 0, 1536, 1024, 844, 390, 0);
  assert.equal(bake.stale, 0, 'all repainted after a few draws');
  // A new view: the first chunk bakes in full, the rest get a provisional paint, then upgrade.
  bake.draw(target, 2048, 1024, 1536, 1024, 844, 390, 0);
  assert.ok(quick >= 4, `provisional paints ${quick}`);
  assert.ok(bake.stale > 0);
  for (let f = 0; f < 10; f++) bake.draw(target, 2048, 1024, 1536, 1024, 844, 390, 0);
  assert.equal(bake.stale, 0, 'provisional chunks upgraded');
  delete (globalThis as { document?: unknown }).document;
});

console.log(`floor-tiles: ${passed} passed`);
