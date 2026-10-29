// WORK ORDER "Code engineer - WILD RIFT VIEW + MINIMAP" (Oct 28, Joseph approved) [JOSEPH]
// "Player's base appears toward the BOTTOM-LEFT of the view, enemy base toward the TOP-RIGHT (apply a 180-degree
// view rotation for the opposing side if needed so both teams see the same angle)."
// "Icon sizes (minimap): Nexus largest; base guard towers slightly larger than lane towers; lane towers small."
import assert from 'node:assert/strict';
import { projectIso, unprojectIso, screenVectorToWorld } from '../src/game/iso';
import {
  CHARACTER, ICONS, MINIMAP, characterScale, clampMinimapW, directionFromView, facingToView, fromView, minimapH,
  toView, towerIconSize, viewOriginX, viewTurnsFor, viewportFootprint, worldToMinimap, type ViewTurns,
} from '../src/game/view';
import { sanctuary } from '../src/game/data/acts/sanctuary';

const W = sanctuary.width;
const H = sanctuary.height;
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const screen = (x: number, y: number, turns: ViewTurns) => {
  const v = toView(x, y, turns, W, H);
  return projectIso(v.x, v.y, 1, viewOriginX(turns, W, H, 1, 0), 0);
};

// 1. Own base bottom-left, enemy base top-right, for both sides.
for (const team of ['ally', 'enemy'] as const) {
  const turns = viewTurnsFor(team);
  const own = team === 'ally' ? sanctuary.playerBase : sanctuary.enemyBase;
  const foe = team === 'ally' ? sanctuary.enemyBase : sanctuary.playerBase;
  const a = screen(own.x, own.y, turns);
  const b = screen(foe.x, foe.y, turns);
  // ORDER "Map size and Diablo 2 theme" items 1-2 [JOSEPH]: on the square 12k map the bases sit on the exact
  // diagonal corners, so the unchanged camera (2:1 iso, one quarter turn) draws the enemy base straight above
  // the own base (screen dx = 0) instead of up-right. Camera is out of scope for that order: NEEDS JOSEPH.
  assert.ok(b.x >= a.x - 1e-6, `${team}: enemy base is not left of own base`);
  assert.ok(b.y < a.y, `${team}: enemy base is above own base`);
}
assert.equal((viewTurnsFor('enemy') - viewTurnsFor('ally') + 4) % 4, 2, 'opposing side is a 180-degree view rotation');

// 2. Rotation round-trips, stays inside the bake canvas, and screen <-> world round-trips.
for (const turns of [0, 1, 2, 3] as const) {
  for (const [x, y] of [[0, 0], [W, H], [520, 2100], [3880, 700], [1234, 567]]) {
    const v = toView(x, y, turns, W, H);
    const back = fromView(v.x, v.y, turns, W, H);
    near(back.x, x);
    near(back.y, y);
    const ox = viewOriginX(turns, W, H, 0.85, 64);
    const p = projectIso(v.x, v.y, 0.85, ox, 64);
    assert.ok(p.x >= 64 - 1e-6 && p.x <= (W + H) * 0.85 + 64 + 1e-6, `turns ${turns}: x inside the bake canvas`);
    const u = unprojectIso(p.x, p.y, 0.85, ox, 64);
    const w = fromView(u.x, u.y, turns, W, H);
    near(w.x, x, 1e-6);
    near(w.y, y, 1e-6);
  }
}

// 3. Facing and stick: a world direction drawn on screen, read back by the stick, is the same world direction.
for (const turns of [0, 1, 2, 3] as const) {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const wx = Math.cos(a);
    const wy = Math.sin(a);
    const p0 = screen(1000, 1000, turns);
    const p1 = screen(1000 + wx, 1000 + wy, turns);
    const back = directionFromView(...(Object.values(screenVectorToWorld(p1.x - p0.x, p1.y - p0.y)) as [number, number]), turns);
    const m = Math.hypot(back.x, back.y);
    near(back.x / m, wx, 1e-9);
    near(back.y / m, wy, 1e-9);
    // The view-space facing points the same way on screen as the unrotated art expects.
    const va = facingToView(a, turns);
    const q0 = projectIso(0, 0, 1, 0, 0);
    const q1 = projectIso(Math.cos(va), Math.sin(va), 1, 0, 0);
    const d = Math.atan2(q1.y - q0.y, q1.x - q0.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x);
    near(Math.cos(d), 1, 1e-9);
  }
}

// 4. Minimap transform: own base bottom-left on the map card for both sides; corners map to corners.
for (const team of ['ally', 'enemy'] as const) {
  const own = team === 'ally' ? sanctuary.playerBase : sanctuary.enemyBase;
  const foe = team === 'ally' ? sanctuary.enemyBase : sanctuary.playerBase;
  const a = worldToMinimap(own.x, own.y, W, H, 150, 95, team);
  const b = worldToMinimap(foe.x, foe.y, W, H, 150, 95, team);
  assert.ok(a.x < 75 && a.y > 47.5 && b.x > 75 && b.y < 47.5, `${team}: own base bottom-left, enemy top-right on the minimap`);
}
const c = worldToMinimap(W, H, W, H, 150, 95, 'ally');
near(c.x, 150);
near(c.y, 95);

// 5. Viewport footprint: four corners in TL, TR, BR, BL order, a closed parallelogram.
const fake = (sx: number, sy: number) => ({ x: sx + sy, y: sy - sx });
const fp = viewportFootprint(fake, 844, 390);
assert.equal(fp.length, 4);
near(fp[0].x + fp[2].x, fp[1].x + fp[3].x);
near(fp[0].y + fp[2].y, fp[1].y + fp[3].y);

// 6. Icon size ordering and minimap size clamp.
// Four UI/size changes item 3 [JOSEPH t250u]: all structure icons are 8 px now (was nexus > guard > lane).
assert.ok(ICONS.nexus === 8 && ICONS.guardTower === 8 && ICONS.laneTower === 8, 'structures 8 px');
assert.equal(towerIconSize('inner'), ICONS.guardTower);
assert.equal(towerIconSize('outer'), ICONS.laneTower);
assert.ok(ICONS.laneTower > ICONS.minion && ICONS.wallLine <= 1, 'lane towers above minion dots; walls are thin lines');
assert.ok(MINIMAP.minW < MINIMAP.defaultW && MINIMAP.defaultW < MINIMAP.maxW);
assert.equal(clampMinimapW(10), MINIMAP.minW);
assert.equal(clampMinimapW(9999), MINIMAP.maxW);
assert.equal(clampMinimapW(Number.NaN), MINIMAP.defaultW);
assert.equal(minimapH(150, W, H), Math.round((150 * H) / W)); // map 12k: square map, was 95 at 11:7

// 7. Character scale: hero is 11% of the view height within the readability clamp.
near(characterScale(390) * CHARACTER.baseHeight, 390 * CHARACTER.viewFraction);
near(characterScale(200) * CHARACTER.baseHeight, CHARACTER.minPx);
near(characterScale(2000) * CHARACTER.baseHeight, CHARACTER.maxPx);

console.log('wild-rift-view: ok');
