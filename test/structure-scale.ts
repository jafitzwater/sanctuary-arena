// Structure scale + nameplate position [JOSEPH t275u]: towers >= 2.5x a champion, base = 3x tower, anchoring,
// HP bars follow the new tops, champion nameplate just above the head, hit radius unchanged, outline not scaled.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASE_DRAW_H,
  BASE_TOWER_RATIO,
  CHAMPION_REF_H,
  STRUCTURE_BITMAPS,
  TOWER_CHAMPION_RATIO,
  TOWER_DRAW_H,
  bitmapRect,
  structureBitmapScale,
  structureUnitHeight,
} from '../src/game/art/structure-bitmaps';
import { BASE_OUTLINE_PX, TOWER_OUTLINE_PX, structureVisualScale } from '../src/game/readability';
import { CHAMPION_SPRITE_SCALE, characterScale } from '../src/game/view';
import { HERO_DRAW_HEIGHT } from '../src/game/art/figures';
import { FRAME, NAMEPLATE_HEAD_GAP, nameplateBarTop, nameplateDrop } from '../src/game/unitFrame';
import { createMatch } from '../src/game/sim';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { barbarian } from '../src/game/data/classes/barbarian';

const close = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// [TEMP] constants.
assert.equal(CHAMPION_REF_H, 128);
assert.equal(TOWER_CHAMPION_RATIO, 2.5);
assert.equal(BASE_TOWER_RATIO, 3);
close(TOWER_DRAW_H, 368, 'tower draw h');
close(BASE_DRAW_H, 1104, 'base draw h');
assert.equal(NAMEPLATE_HEAD_GAP, 4);

const tower = STRUCTURE_BITMAPS['tower:ally:alive'];
for (const cssH of [320, 390, 480, 720, 900, 1080, 1440]) {
  const u = characterScale(cssH);
  const champion = 128 * u * CHAMPION_SPRITE_SCALE;
  for (const key of ['tower:ally:alive', 'tower:enemy:alive']) {
    const r = bitmapRect(STRUCTURE_BITMAPS[key], 0, 0, structureBitmapScale('tower', u));
    assert.ok(r.dh >= 2.5 * champion - 1e-9, `${key} @${cssH}: ${r.dh} >= 2.5 x ${champion}`);
  }
  const towerH = bitmapRect(tower, 0, 0, structureBitmapScale('tower', u)).dh;
  for (const key of ['base:ally:alive', 'base:enemy:alive']) {
    const r = bitmapRect(STRUCTURE_BITMAPS[key], 0, 0, structureBitmapScale('base', u));
    close(r.dh, 3 * towerH, `${key} @${cssH} = 3x tower`);
  }
  // Ruins use the same scale as alive (bottom-centre anchored), so they grow with them.
  close(structureBitmapScale('tower', u) * 120, towerH, 'tower ruin scale = alive scale');

  // HP bar (drawBar: footY - height - 18) follows the new top: render height = unitHeight · u · structureVisualScale.
  close(structureUnitHeight('tower', true) * u * structureVisualScale('tower'), towerH, `tower bar height @${cssH}`);
  close(structureUnitHeight('base', true) * u * structureVisualScale('base-ally'), 3 * towerH, `base bar height @${cssH}`);

  // Nameplate: frame bottom (bars or level circle) at least NAMEPLATE_HEAD_GAP above the scaled head top.
  const spriteH = HERO_DRAW_HEIGHT * u * CHAMPION_SPRITE_SCALE;
  const footY = 500;
  const top = nameplateBarTop(footY, spriteH);
  const frameBottom = Math.max(top + FRAME.hp + FRAME.gap + FRAME.mana, top + (FRAME.hp + FRAME.gap + FRAME.mana) / 2 + FRAME.circle);
  close(footY - spriteH - frameBottom, NAMEPLATE_HEAD_GAP, `nameplate gap @${cssH}`);
  assert.ok(top < footY - spriteH - 18, 'nameplate higher than before');
}
close(nameplateDrop(), 28.5, 'frame reaches 28.5 px below the bar top');
// Frame sizes unchanged.
assert.deepEqual({ ...FRAME }, { w: 68, hp: 12, mana: 8, gap: 1, circle: 18, ring: 2, name: 11 });

// Anchoring kept: bottom-centre of the anchor pixel on the foot at the new scale.
for (const key of Object.keys(STRUCTURE_BITMAPS)) {
  const def = STRUCTURE_BITMAPS[key];
  const s = structureBitmapScale(key.startsWith('tower') ? 'tower' : 'base', characterScale(720));
  const r = bitmapRect(def, 640, 400, s);
  close(r.dx + (def.ax + 0.5) * s, 640, `${key} foot x`);
  close(r.dy + r.dh, 400, `${key} foot y`);
}

// Outline stays 1 / 1.5 css px: px is passed to the stamp unscaled.
assert.equal(TOWER_OUTLINE_PX, 1);
assert.equal(BASE_OUTLINE_PX, 1.5);
const render = readFileSync('src/game/render.ts', 'utf8');
assert.match(render, /tower \? TOWER_OUTLINE_PX : BASE_OUTLINE_PX/, 'outline px picked per kind, not multiplied by scale');
assert.match(render, /nameplateBarTop\(footY, height\)/, 'champion frame uses the head-relative position');

// Hit / collision radius unchanged (visual only).
const sim = createMatch(sanctuary, barbarian);
const towers = sim.units.filter((u) => u.kind === 'tower');
const bases = sim.units.filter((u) => u.kind === 'base');
assert.ok(towers.length > 0 && bases.length === 2);
assert.deepEqual([...new Set(towers.map((u) => u.radius))].sort(), [36, 40]);
assert.deepEqual([...new Set(bases.map((u) => u.radius))], [74]);
console.log('structure-scale ok');
