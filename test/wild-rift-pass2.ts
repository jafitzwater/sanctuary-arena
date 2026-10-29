/**
 * WORK ORDER "Wild Rift pass 2 (Code engineer)": pure-logic tests for MAP_SCALE (item 1), the locomotion playback
 * formula and diagonal stick registration (item 3), minimap placement (item 5) and the ability arc (item 6).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_SCALE, mapLen, scaleAct } from '../src/game/data/mapScale';
import { SANCTUARY_DESIGN, sanctuary } from '../src/game/data/acts/sanctuary';
import { advanceLocoClock, locoFrame, locomotionRate, LOCO_RATE_MAX, LOCO_RATE_MIN } from '../src/game/locomotion';
import { MobileInputManager, MOBILE_ZONE } from '../src/game/mobileInput';
import { stepStickGait, heroCompass, type StickGaitMemory } from '../src/game/gait';
import { screenVectorToWorld } from '../src/game/iso';
import { directionFromView, facingToView, MINIMAP, minimapTouchBox, clampMinimapW, minimapH } from '../src/game/view';

const near = (a: number, b: number, eps = 1.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// ---- Item 1: MAP_SCALE -----------------------------------------------------------------------------------
assert.ok(MAP_SCALE > 0 && MAP_SCALE <= 1, "MAP_SCALE in (0,1]");
assert.equal(mapLen(100), 100 * MAP_SCALE);
assert.equal(mapLen(100, 1), 100);
const D = SANCTUARY_DESIGN;
const S = sanctuary;
near(S.width, D.width * MAP_SCALE);
near(S.height, D.height * MAP_SCALE);
assert.equal(S.width / S.height, D.width / D.height, 'map aspect preserved');
near(S.playerBase.x, D.playerBase.x * MAP_SCALE);
near(S.enemyBase.y, D.enemyBase.y * MAP_SCALE);
assert.equal(S.towers.length, D.towers.length);
S.towers.forEach((t, i) => {
  const d = D.towers[i];
  near(t.x, d.x * MAP_SCALE);
  near(t.y, d.y * MAP_SCALE);
  assert.equal(t.tier, d.tier);
  assert.equal(t.role, d.role);
});
assert.equal(S.playerBase.hp, D.playerBase.hp);
assert.equal(S.playerBase.attackRange, D.playerBase.attackRange);
assert.deepEqual(S.waves, D.waves, 'wave timers and sizes unchanged');
// Layout proportions: base-to-base over map width is the same at both scales.
const bb = (a: typeof S) => Math.hypot(a.enemyBase.x - a.playerBase.x, a.enemyBase.y - a.playerBase.y) / a.width;
near(bb(S), bb(D), 0.002);
// scaleAct(…, 1) is the identity on coordinates.
assert.equal(scaleAct(D, 1).width, D.width);
assert.equal(scaleAct(D, 1).towers[0].x, D.towers[0].x);

// ---- Item 3: playback rate formula ------------------------------------------------------------------------
assert.equal(locomotionRate(380, 380), 1, 'plain MS plays authored timing');
near(locomotionRate(456, 380), 1.2, 1e-9);
near(locomotionRate(304, 380), 0.8, 1e-9);
assert.equal(locomotionRate(50, 380), LOCO_RATE_MIN);
assert.equal(locomotionRate(5000, 380), LOCO_RATE_MAX);
assert.equal(locomotionRate(380, 0), 1);
assert.equal(locomotionRate(NaN, 380), 1);
assert.equal(advanceLocoClock(100, 16, 1.5, true), 124);
assert.equal(advanceLocoClock(100, 16, 1.5, false), 100, 'clock holds while standing');
assert.equal(locoFrame(0, 60, 12), 0);
assert.equal(locoFrame(61, 60, 12), 1);
assert.equal(locoFrame(60 * 12 + 1, 60, 12), 0, 'loops');
// Faster MS => the loop finishes sooner in real time.
let slow = 0;
let fast = 0;
for (let i = 0; i < 60; i++) {
  slow = advanceLocoClock(slow, 16, locomotionRate(380, 380), true);
  fast = advanceLocoClock(fast, 16, locomotionRate(456, 380), true);
}
assert.ok(fast > slow);

// ---- Item 3: all 8 stick directions (incl. diagonals) register and hold the run -----------------------------
const compasses = new Map<number, Set<number>>();
for (const turns of [0, 2] as const) {
  const seen = new Set<number>();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const m = new MobileInputManager();
    assert.ok(m.beginStick(200, 280, { touch: 1 }));
    // A short drag (60 % of the ring) on the exact diagonal.
    m.moveStick(200 + Math.cos(a) * MOBILE_ZONE.maxRadius * 0.6, 280 + Math.sin(a) * MOBILE_ZONE.maxRadius * 0.6);
    const v = m.moveVector;
    const tilt = Math.hypot(v.x, v.y);
    near(tilt, 0.6, 1e-6);
    let mem: StickGaitMemory = { gait: 'idle' } as StickGaitMemory;
    // Held for 2 s of 16 ms snapshots: the gait never drops to idle.
    for (let t = 0; t < 125; t++) {
      mem = stepStickGait(mem, tilt, 16);
      assert.notEqual(mem.gait, 'idle', `dir ${k} turns ${turns} held`);
    }
    const view = screenVectorToWorld(v.x, v.y);
    const world = directionFromView(view.x, view.y, turns);
    assert.ok(Math.hypot(world.x, world.y) > 1e-6);
    const compass = heroCompass(facingToView(Math.atan2(world.y, world.x), turns));
    seen.add(compass);
    // Full deflection past the ring clamps to magnitude 1 on the same diagonal.
    m.moveStick(200 + Math.cos(a) * 400, 280 + Math.sin(a) * 400);
    near(Math.hypot(m.moveVector.x, m.moveVector.y), 1, 1e-6);
    near(Math.atan2(m.moveVector.y, m.moveVector.x), Math.atan2(Math.sin(a), Math.cos(a)), 1e-6);
  }
  compasses.set(turns, seen);
  assert.equal(seen.size, 8, `8 distinct facing rows for turns ${turns}`);
}

// ---- Item 5: minimap placement ----------------------------------------------------------------------------
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const touchMini = css.slice(css.indexOf('body.touch #minimap-toggle {'));
const block = touchMini.slice(0, touchMini.indexOf('}'));
// Pass 3 order item 1 [JOSEPH]: minimap top-left, telemetry centered, gold directly under the minimap.
assert.ok(block.includes(`top: max(${MINIMAP.touchTop}px`), 'css top mirrors MINIMAP.touchTop');
assert.ok(block.includes(`left: max(${MINIMAP.touchLeft}px`), 'css left mirrors MINIMAP.touchLeft');
assert.ok(block.includes(`var(--mini-w, ${MINIMAP.defaultW}px)`), 'css default width mirrors MINIMAP.defaultW');
assert.ok(block.includes(`100vh - ${MINIMAP.touchTop + MINIMAP.belowCard}px`), 'css max-width mirrors belowCard');
assert.equal(MINIMAP.belowCard, MINIMAP.goldGap + MINIMAP.goldH + MINIMAP.stickGap + MINIMAP.stickTop);
const goldRule = css.slice(css.indexOf('body.touch #gold-badge {'));
const goldBlock = goldRule.slice(0, goldRule.indexOf('}'));
assert.ok(goldBlock.includes('position: absolute') && goldBlock.includes(`left: max(${MINIMAP.touchLeft}px`), 'gold aligned with the card');
assert.ok(goldBlock.includes(`100vh - ${MINIMAP.touchTop + MINIMAP.belowCard}px`) && goldBlock.includes(`+ ${MINIMAP.goldGap}px)`), 'gold top = card bottom + goldGap');
const telRule = css.slice(css.indexOf('body.touch #telemetry {\n'));
const telBlock = telRule.slice(0, telRule.indexOf('}'));
assert.ok(telBlock.includes('left: 50%') && telBlock.includes('translateX(-50%)'), 'telemetry centered in the top bar');
const W = S.width;
const H = S.height;
for (const want of [MINIMAP.minW, MINIMAP.defaultW, MINIMAP.maxW]) {
  for (const [vh, st, sb] of [[390, 0, 0], [390, 0, 21], [360, 0, 0], [320, 20, 20]] as const) {
    const box = minimapTouchBox(vh, want, W, H, st, sb);
    assert.equal(box.top, MINIMAP.touchTop + st);
    assert.equal(box.h, minimapH(box.w, W, H));
    assert.ok(box.goldBottom + MINIMAP.stickGap <= vh - sb - MINIMAP.stickTop + 1, `gold above the stick at ${vh}/${want}`);
  }
}
const phone = minimapTouchBox(390, MINIMAP.defaultW, W, H);
assert.equal(phone.w, 180);
assert.equal(phone.h, minimapH(180, W, H));
assert.equal(phone.goldTop, phone.bottom + MINIMAP.goldGap);
const big = minimapTouchBox(390, MINIMAP.maxW, W, H);
assert.equal(big.w, MINIMAP.maxW, 'max size fits at 844x390');
const short = minimapTouchBox(300, MINIMAP.maxW, W, H, 20, 20);
assert.ok(short.w < MINIMAP.maxW, 'shrinks to fit a short screen');
assert.equal(clampMinimapW(10), MINIMAP.minW);
assert.equal(clampMinimapW(999), MINIMAP.maxW);
assert.ok(MINIMAP.defaultW >= MINIMAP.minW && MINIMAP.defaultW <= MINIMAP.maxW);

// ---- Item 6: ability petals on one even arc around attack --------------------------------------------------
const petal = (n: number) => {
  const m = css.match(new RegExp(`body\\.touch \\.skill:nth-child\\(${n}\\) \\{ right: (\\d+)px; bottom: (\\d+)px; \\}`));
  assert.ok(m, `petal ${n}`);
  return { x: Number(m[1]) + 24, y: Number(m[2]) + 24 };
};
const centers = [1, 2, 3, 4].map(petal);
for (const c of centers) near(Math.hypot(c.x - 36, c.y - 36), 106, 1);
for (let i = 1; i < 4; i++) {
  const gap = Math.hypot(centers[i].x - centers[i - 1].x, centers[i].y - centers[i - 1].y) - 48;
  assert.ok(gap >= 5 && gap <= 9, `even petal gap ${gap}`);
}

console.log('wild rift pass 2 ok');
