// Visual readability items 5-9 (Joseph t253u): code-side outlines, contrast, ground value, trees. Draw only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { createMatch } from '../src/game/sim';
import { sorceress } from '../src/game/data/classes/sorceress';
import { CHAMPION_SPRITE_SCALE } from '../src/game/view';
import {
  BASE_VISUAL_SCALE,
  CHARACTER_OUTLINE_PX,
  LANE_EDGE_DARKEN,
  TOWER_OUTLINE_PX,
  TREE_GROUND_DARKEN,
  TREE_OUTLINE_PX,
  TREE_THRESHOLD,
  boostContrast,
  outlineOffsets,
  shadeHex,
  silhouette,
  structureVisualScale,
  tileTone,
  tileVariation,
  treeEdgeSize,
  treeSeed,
} from '../src/game/readability';

// [JOSEPH] values.
assert.equal(CHARACTER_OUTLINE_PX, 2);
assert.equal(TOWER_OUTLINE_PX, 2);
assert.equal(TREE_OUTLINE_PX, 2);
assert.equal(BASE_VISUAL_SCALE, 1.1);
assert.equal(LANE_EDGE_DARKEN, 0.15);
assert.equal(TREE_GROUND_DARKEN, 0.1);
assert.equal(CHAMPION_SPRITE_SCALE, 1.15, 'item 5: champion 15% scale unchanged');

// Item 8: bases x1.1 visual only; everything else 1; collision radius untouched.
assert.equal(structureVisualScale('base-ally'), 1.1);
assert.equal(structureVisualScale('base-enemy'), 1.1);
for (const id of ['tower', 'barbarian', 'fallen', 'seal']) assert.equal(structureVisualScale(id), 1, id);
const sim = createMatch(sanctuary, sorceress, 1);
for (const base of sim.units.filter((u) => u.kind === 'base')) {
  const spec = base.team === 'ally' ? sanctuary.playerBase : sanctuary.enemyBase;
  assert.equal(base.radius, spec.radius, 'base radius (hitbox) unchanged');
}

// Outline offsets: 8 taps at exactly px.
const offs = outlineOffsets(2);
assert.equal(offs.length, 8);
for (const [x, y] of offs) assert.ok(Math.abs(Math.hypot(x, y) - 2) < 1e-9);

// Contrast keeps alpha, spreads values; silhouette is a hard dark mask.
const px = new Uint8ClampedArray([100, 100, 100, 255, 160, 160, 160, 255, 50, 50, 50, 0]);
boostContrast(px, 3, 1.2);
assert.ok(px[0] < 100 && px[4] > 160, 'contrast stretches around the mean');
assert.equal(px[3], 255);
assert.equal(px[11], 0);
silhouette(px);
assert.deepEqual([...px.slice(0, 4)], [8, 6, 4, 255]);
assert.equal(px[11], 0);

// Item 7: darken factors and deterministic, subtle variation.
assert.equal(shadeHex('#808080', 0.85), '#6d6d6d');
assert.equal(shadeHex('#808080', 1), '#808080');
for (let i = 0; i < 40; i++) {
  for (let j = 0; j < 40; j++) {
    const v = tileVariation(i, j);
    assert.ok(v >= 0.95 - 1e-9 && v <= 1.05 + 1e-9);
    assert.equal(v, tileVariation(i, j));
  }
}
const g = tileTone({ kind: 'grass', treeGround: false, i: 3, j: 4 });
const t = tileTone({ kind: 'grass', treeGround: true, i: 3, j: 4 });
assert.ok(Math.abs(t / tileVariation(3, 4) - (1 - TREE_GROUND_DARKEN)) < 1e-9, 'tree ground 10% darker');
assert.ok(t < g);
assert.ok(tileTone({ kind: 'path', treeGround: false, i: 0, j: 0 }) > 1, 'lanes lifted from jungle');
assert.equal(tileTone({ kind: 'town', treeGround: false, i: 0, j: 0 }), 1);

// Item 9: tree variation is deterministic; non-edge placement is the old rule.
for (let i = 0; i < 30; i++) {
  const s = treeEdgeSize(i, i * 3);
  assert.equal(s, treeEdgeSize(i, i * 3));
  assert.ok(s >= 0.85 && s <= 1.25);
}
assert.equal(TREE_THRESHOLD, 0.45);
assert.equal(treeSeed(0.4, false), null);
assert.equal(treeSeed(0.725, false), (0.725 - 0.45) / 0.55);
assert.ok(treeSeed(0.4, true) !== null, 'edges are denser');

// Draw-only: walkable / collision code does not read the readability constants.
for (const file of ['src/game/terrain.ts', 'src/game/sim.ts', 'src/game/landscape.ts']) {
  assert.ok(!readFileSync(file, 'utf8').includes('readability'), `${file} untouched by readability`);
}
console.log('visual-readability ok');
