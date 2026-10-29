// Hook in tower bitmaps [JOSEPH t263u] + base addendum [JOSEPH t266u]: keys/paths, scale math, anchoring, fallback.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  BITMAP_CONTRAST,
  STRUCTURE_BITMAPS,
  bitmapRect,
  preloadStructureBitmaps,
  structureBitmap,
  structureBitmapKey,
  structureBitmapScale,
} from '../src/game/art/structure-bitmaps';

const close = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// Every kind/team/state has an entry whose PNG exists with the manifest size.
for (const kind of ['tower', 'base'] as const) {
  for (const ally of [true, false]) {
    for (const alive of [true, false]) {
      const key = structureBitmapKey(kind, ally, alive);
      const def = STRUCTURE_BITMAPS[key];
      assert.ok(def, `missing bitmap entry ${key}`);
      const file = `public/sprites/${def.path}`;
      assert.ok(existsSync(file), `missing file ${file}`);
      const png = readFileSync(file);
      assert.equal(png.readUInt32BE(16), def.w, `${file} width`);
      assert.equal(png.readUInt32BE(20), def.h, `${file} height`);
      assert.ok(def.ax >= 0 && def.ax < def.w && def.ay === def.h - 1, `${key} anchor is the bottom row`);
    }
  }
}
assert.equal(Object.keys(STRUCTURE_BITMAPS).length, 8);

// Scale math (structure scale order t275u): tower 368·u/120, base 1104·u/216, same for destroyed.
for (const u of [0.6, 1, 1.37]) {
  close(structureBitmapScale('tower', u), (368 * u) / 120, 'tower scale');
  close(structureBitmapScale('base', u), (1104 * u) / 216, 'base scale');
}

// Anchoring: the anchor pixel's bottom-centre lands on the foot; alive art height = 368u / 1104u (t275u).
const u = 1.2;
for (const key of Object.keys(STRUCTURE_BITMAPS)) {
  const def = STRUCTURE_BITMAPS[key];
  const s = structureBitmapScale(key.startsWith('tower') ? 'tower' : 'base', u);
  const r = bitmapRect(def, 300, 500, s);
  close(r.dx + (def.ax + 0.5) * s, 300, `${key} foot x`);
  close(r.dy + r.dh, 500, `${key} foot y`);
}
close(bitmapRect(STRUCTURE_BITMAPS['tower:ally:alive'], 0, 0, structureBitmapScale('tower', u)).dh, 368 * u, 'tower drawn height');
close(bitmapRect(STRUCTURE_BITMAPS['base:enemy:alive'], 0, 0, structureBitmapScale('base', u)).dh, 1104 * u, 'base drawn height');
assert.equal(BITMAP_CONTRAST, 1);

// Fallback: with no DOM image (node, or still loading / failed) the lookup returns null so render.ts draws paintSpire / paintStronghold.
preloadStructureBitmaps();
assert.equal(structureBitmap('tower', true, true), null);
assert.equal(structureBitmap('base', false, false), null);
const render = readFileSync('src/game/render.ts', 'utf8');
assert.match(render, /preloadStructureBitmaps\(\)/, 'renderer preloads the structure bitmaps');
assert.match(render, /\(tower \? drawSpire : drawStronghold\)/, 'code-drawn fallback kept');

console.log('tower-bitmaps: ok');
