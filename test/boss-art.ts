/**
 * t364u "Put the approved bosses in the game" (+ the t365u placement CORRECTION) and t370u "Put boss walk / hit /
 * death / wind-up in the game": which atlas each boss draws, the frame pickers (distance-driven walk, hit, death,
 * v2 wind-up), sheet scale, per-animation lazy load with fallback (fake Image/canvas, no browser), the 28 MiB
 * budget with LRU, idle eviction, and that nothing but visuals changed (stats, team, pack, strike timing).
 * Rows per atlas: test/boss-atlas-rows.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { sanctuary as map } from '../src/game/data/acts/sanctuary';
import { barbarian } from '../src/game/data/classes/barbarian';
import { UNIT_DEFS } from '../src/game/data/units';
import { zoneAt } from '../src/game/data/mapZones';
import { createMatch } from '../src/game/sim';
import atlases from '../src/game/art/boss-atlases.json';
import {
  BOSS_ANIMS,
  BOSS_ART_IDS,
  BOSS_DEATH_S,
  BOSS_FRAMES,
  BOSS_HIT_S,
  BOSS_IMPACT_COL,
  BOSS_STRIDE_U,
  BOSS_WINDUP,
  COUNCIL_VARIANTS,
  bossArtFor,
  bossDeathCol,
  bossFrame,
  bossHitCol,
  bossWalkCol,
  type BossAnim,
  type BossArtId,
  type BossFrameState,
} from '../src/game/art/boss-frames';
import {
  BOSS_ART_BUDGET_BYTES,
  BOSS_ART_IDLE_EVICT_S,
  BOSS_ART_PROTECT_S,
  BOSS_ART_RETRY_S,
  BOSS_ATLAS_TOTAL_BYTES,
  bossAnimBytes,
  bossArtResident,
  bossArtResidentBytes,
  bossArtState,
  bossArtTick,
  bossAtlasBytes,
  bossHeight,
  bossRingPx,
  drawBossFrame,
  prefetchBossAnim,
  resetBossArt,
  setBossArtClock,
} from '../src/game/art/boss-atlas';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
const MiB = 2 ** 20;
const mib = (n: number) => (n / MiB).toFixed(2);
type AnimMeta = { w: number; h: number; frames: number[][] };
type BossMeta = { body: number; cellW: number; cellH: number; approvedCell: number; footX: number; footY: number; stride: number; anims: Record<BossAnim, AnimMeta> };
const META = atlases as unknown as Record<BossArtId, BossMeta>;

test('which atlas: Countess, Radament, Izual by unit; the 3 Council Members get A, B, C by spawn order; everything else none', () => {
  assert.equal(bossArtFor('countess', 7), 'countess');
  assert.equal(bossArtFor('radament', 7), 'radament');
  assert.equal(bossArtFor('izual', 7), 'izual');
  for (const base of [0, 1, 2, 41, 100]) {
    const v = [0, 1, 2].map((k) => bossArtFor('council-member', base + k));
    assert.deepEqual([...v].sort(), [...COUNCIL_VARIANTS].sort(), `ids ${base}..${base + 2}`);
  }
  for (const id of ['rakanishu', 'fallen', 'mummy', 'barbarian', 'creep']) assert.equal(bossArtFor(id, 3), null);
  const sim = createMatch(map, barbarian, 1);
  const council = sim.units.filter((u) => u.defId === 'council-member');
  assert.equal(council.length, 3);
  assert.deepEqual(council.map((u) => bossArtFor(u.defId, u.id)).sort(), ['council-a', 'council-b', 'council-c'], 'each Council Member distinct in a match');
});

test('visuals only: boss stats, team and pack unchanged; still one of each (three Council Members)', () => {
  const stats = (id: string) => {
    const d = UNIT_DEFS[id];
    return [d.hp, d.ad, d.armor, d.gold, d.xp, d.attackRange, d.attackInterval];
  };
  assert.deepEqual(stats('countess'), [800, 33, 6, 136, 126, 56, 1]);
  assert.deepEqual(stats('radament'), [1200, 33, 6, 136, 126, 56, 1]);
  assert.deepEqual(stats('izual'), [2000, 33, 6, 136, 126, 56, 1]);
  assert.deepEqual(stats('council-member'), [1000, 33, 6, 136, 126, 56, 1]);
  const sim = createMatch(map, barbarian, 1);
  for (const [id, n] of [['countess', 1], ['radament', 1], ['izual', 1], ['council-member', 3]] as const) {
    const us = sim.units.filter((u) => u.defId === id);
    assert.equal(us.length, n, id);
    for (const u of us) {
      assert.equal(u.team, 'wild', id);
      assert.equal(u.maxHp, UNIT_DEFS[id].hp, id);
      const den = (map.dens ?? []).find((d) => d.unit === id)!;
      assert.equal(u.pack, den.id, id);
    }
  }
});

test('t365u CORRECTION placement: Countess in the act 1 plains, Radament in the act 2 desert, Council in the act 3 jungle, Izual in the act 4 lava field', () => {
  const zone = (unit: string) => {
    const d = (map.dens ?? []).find((x) => x.unit === unit)!;
    return zoneAt(map, d.x, d.y);
  };
  assert.equal(zone('countess'), 'jungle-plains');
  assert.equal(zone('radament'), 'jungle-desert');
  assert.equal(zone('council-member'), 'jungle-dense');
  assert.equal(zone('izual'), 'jungle-lava');
  const byId = new Map((map.dens ?? []).map((d) => [d.id, d.unit]));
  assert.equal(byId.get(2), 'radament', 'den ids kept: Radament is still den 2');
  assert.equal(byId.get(4), 'izual', 'den ids kept: Izual is still den 4');
});

test('frame tables: 6 bosses x (idle8, walk8, attack12, hit4, death10) x 8 rows, inside the image, lossless WebP, small', () => {
  assert.deepEqual(Object.keys(META).sort(), [...BOSS_ART_IDS].sort());
  for (const id of BOSS_ART_IDS) {
    const m = META[id];
    assert.equal(m.footX, m.cellW / 2, `${id}: feet at the cell's centre column`);
    assert.ok(m.footY === m.approvedCell && m.footY < m.cellH, `${id}: foot row = the approved cell's bottom, inside the tall cell`);
    assert.ok(Math.abs(m.stride - BOSS_STRIDE_U[id]) < 1e-9, `${id}: stride in the json = the picker's`);
    for (const anim of BOSS_ANIMS) {
      const a = m.anims[anim];
      const n = BOSS_FRAMES[anim];
      assert.equal(a.frames.length, 8 * n, `${id} ${anim}`);
      const seen = new Set<number>();
      for (const [row, col, x, y, w, h, ox, oy] of a.frames) {
        assert.ok(row >= 0 && row < 8 && col >= 0 && col < n, `${id} ${anim}`);
        seen.add(row * 100 + col);
        assert.ok(x >= 2 && y >= 2 && x + w + 2 <= a.w && y + h + 2 <= a.h, `${id} ${anim} ${row}/${col} inside with its half gutter`);
        assert.ok(ox >= 0 && oy >= 0 && ox + w <= m.cellW && oy + h <= m.cellH, `${id} ${anim} ${row}/${col} inside its cell`);
      }
      assert.equal(seen.size, 8 * n, `${id} ${anim}`);
      const path = `public/sprites/bosses/${id}-${anim}.webp`;
      assert.ok(statSync(path).size < 400_000, path);
      assert.equal(readFileSync(path).toString('ascii', 8, 16), 'WEBPVP8L', `${path}: lossless WebP`);
    }
  }
});

test('stride table (Sprite Director log t366u): Countess 114.4, Radament 200.9, Izual 190.0, Council 145.9 u per 8-frame loop', () => {
  assert.deepEqual(
    BOSS_ART_IDS.map((id) => BOSS_STRIDE_U[id]),
    [114.4, 200.9, 190.0, 145.9, 145.9, 145.9],
  );
});

const base: BossFrameState = { alive: true, deadFor: 0, swing: 0, attackCd: 1, engaged: false, moving: false, travel: 0, hitAge: Infinity, clock: 0 };

test('walk picker: one frame per stride/8 of distance travelled, wraps every stride; same distance = same frame at any speed (no foot sliding)', () => {
  for (const id of BOSS_ART_IDS) {
    const stride = BOSS_STRIDE_U[id];
    const step = stride / 8;
    for (let k = 0; k < 24; k++) assert.equal(bossWalkCol(step * k + step * 0.5, stride), k % 8, `${id} k=${k}`);
    assert.equal(bossWalkCol(step - 1e-6, stride), 0);
    assert.equal(bossWalkCol(step + 1e-6, stride), 1);
    // Frames advance with distance only: walking the same 3 strides fast or slow shows the same frames.
    const slow: number[] = [], fast: number[] = [];
    for (let t = 0; t <= 3 * stride; t += 7) slow.push(bossWalkCol(t, stride));
    for (let t = 0; t <= 3 * stride; t += 7) fast.push(bossWalkCol(t, stride));
    assert.deepEqual(slow, fast);
    const f = bossFrame(id, { ...base, moving: true, travel: step * 3.2 });
    assert.deepEqual(f, { anim: 'walk', col: 3 });
    assert.deepEqual(bossFrame(id, { ...base, moving: true, travel: step * 3.2, clock: 5.55 }), f, 'clock does not move the feet');
  }
  assert.equal(bossWalkCol(-5, 100), 0);
});

test('hit picker: 4 frames over BOSS_HIT_S after a hit lands, then over; never over a wind-up, strike or walk (non-blocking)', () => {
  assert.deepEqual([0, 0.081, 0.161, 0.241].map(bossHitCol), [0, 1, 2, 3]);
  assert.equal(bossHitCol(BOSS_HIT_S), -1);
  assert.equal(bossHitCol(Infinity), -1);
  assert.equal(bossHitCol(-1), -1);
  assert.deepEqual(bossFrame('izual', { ...base, hitAge: 0.1 }), { anim: 'hit', col: 1 });
  assert.equal(bossFrame('izual', { ...base, hitAge: 0.1, moving: true, travel: 50 }).anim, 'walk', 'walking feet never slide under a hit pose');
  assert.equal(bossFrame('izual', { ...base, hitAge: 0.1, engaged: true, attackCd: 0.2 }).anim, 'attack', 'wind-up wins');
  assert.equal(bossFrame('izual', { ...base, hitAge: 0.1, swing: 0.5 }).anim, 'attack', 'strike wins');
  assert.deepEqual(bossFrame('izual', { ...base, hitAge: 0.5 }).anim, 'idle', 'over after BOSS_HIT_S');
});

test('death picker: 10 frames once over BOSS_DEATH_S, then holds the last frame; dead beats everything', () => {
  const cols = Array.from({ length: 10 }, (_, i) => bossDeathCol(((i + 0.5) / 10) * BOSS_DEATH_S));
  assert.deepEqual(cols, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const t of [BOSS_DEATH_S, 2, 4.5, 100]) assert.equal(bossDeathCol(t), 9, `holds at ${t}`);
  assert.equal(bossDeathCol(0), 0);
  assert.deepEqual(bossFrame('countess', { ...base, alive: false, deadFor: 3, swing: 1, hitAge: 0, moving: true }), { anim: 'death', col: 9 });
});

test('attack picker (v2 wind-up): cols 0-5 over the last BOSS_WINDUP s before the strike, impact col 6 when the strike lands, recovery 7-11 as swing decays', () => {
  assert.equal(BOSS_WINDUP, 0.42);
  assert.equal(BOSS_IMPACT_COL, 6);
  const w = (cd: number) => bossFrame('radament', { ...base, engaged: true, attackCd: cd });
  assert.equal(w(0.5).anim, 'idle', 'no wind-up before the window');
  assert.deepEqual(w(BOSS_WINDUP - 1e-3), { anim: 'attack', col: 0 });
  assert.deepEqual(w(0), { anim: 'attack', col: 5 });
  let last = -1;
  for (let cd = BOSS_WINDUP - 1e-3; cd >= 0; cd -= 0.01) {
    const c = w(cd).col;
    assert.ok(c >= last && c <= 5);
    last = c;
  }
  assert.equal(bossFrame('radament', { ...base, attackCd: 0.1 }).anim, 'idle', 'no wind-up without a target');
  assert.deepEqual(bossFrame('radament', { ...base, swing: 1 }), { anim: 'attack', col: BOSS_IMPACT_COL }, 'impact the frame damage lands (swing = 1)');
  assert.deepEqual(bossFrame('radament', { ...base, swing: 0.01 }), { anim: 'attack', col: 11 });
  last = 5;
  for (let sw = 1; sw > 0; sw -= 0.05) {
    const c = bossFrame('radament', { ...base, swing: sw }).col;
    assert.ok(c >= last && c >= 6 && c <= 11);
    last = c;
  }
  // Closing in with the cooldown already up (or the target stepping away mid-recovery): walk, never a sliding pose.
  assert.equal(bossFrame('radament', { ...base, engaged: true, attackCd: 0, moving: true, travel: 30 }).anim, 'walk');
  assert.equal(bossFrame('radament', { ...base, swing: 0.5, moving: true, travel: 30 }).anim, 'walk');
  // Idle cycle (unchanged from t364u).
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => bossFrame('izual', { ...base, clock: i * 0.125 + 0.01 }).col), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('timing unchanged: boss strikes keep their 1 s interval and instant hit (the wind-up only reads attackCd / swing)', () => {
  for (const id of ['countess', 'radament', 'izual', 'council-member']) assert.equal(UNIT_DEFS[id].attackInterval, 1, id);
  assert.ok(BOSS_WINDUP < 1);
  const sim = readFileSync('src/game/sim.ts', 'utf8');
  assert.ok(!/boss-frames|BOSS_WINDUP/.test(sim), 'sim does not read the visual timing');
});

test('sheet scale as rendered: every boss uses the heroes px/m (height = hero height x body px / 56); bodies as approved', () => {
  for (const id of BOSS_ART_IDS) {
    const h = bossHeight(id, 124.2);
    assert.ok(Math.abs(h / META[id].body - 124.2 / 56) < 1e-9, id);
  }
  assert.deepEqual(BOSS_ART_IDS.map((id) => META[id].body), [77, 114, 163, 94, 90, 92], 'same bodies as the t364u atlases');
  assert.equal(bossRingPx(100), 0.5);
  assert.equal(bossRingPx(0.01), 1.5);
});

// ---- load / fallback with a fake browser -------------------------------------------------------------------------
let now = 0;
setBossArtClock(() => now);
test('no DOM (node / SSR): nothing loads and draw returns false so the procedural token is drawn', () => {
  const ctx = { drawImage() { throw new Error('should not draw'); } } as unknown as CanvasRenderingContext2D;
  assert.equal(drawBossFrame(ctx, 'izual', 'walk', 0, 0, 0, 0, 300), false);
  assert.equal(prefetchBossAnim('countess', 'idle'), false);
  assert.equal(bossArtState('countess', 'idle'), 'idle');
  assert.equal(bossArtResidentBytes(), 0);
});

class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  src = '';
  constructor() {
    FakeImage.made.push(this);
  }
}
const idleQueue: (() => void)[] = [];
let canvases = 0;
function fakeCtx() {
  return {
    drawImage() {},
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: new Uint8ClampedArray(w * h * 4).fill(200) };
    },
    putImageData() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
  };
}
const g = globalThis as Record<string, unknown>;
g.Image = FakeImage;
g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => (canvases++, fakeCtx()) }) };
g.requestIdleCallback = (cb: () => void) => idleQueue.push(cb);
const flush = () => { while (idleQueue.length) idleQueue.shift()!(); };
const imgFor = (id: BossArtId, anim: BossAnim) => {
  const re = new RegExp(`sprites/bosses/${id}-${anim}\\.webp$`);
  const all = FakeImage.made.filter((i) => re.test(i.src));
  return all[all.length - 1];
};
const finish = (id: BossArtId, anim: BossAnim) => {
  const im = imgFor(id, anim);
  assert.ok(im, `${id} ${anim} requested`);
  im.onload!();
  flush();
};
const drawn: unknown[][] = [];
const screen = { drawImage: (...a: unknown[]) => drawn.push(a) } as unknown as CanvasRenderingContext2D;

test('lazy: nothing is fetched until wanted; a drawn animation and its idle stand-in load; token (false) while neither is ready', () => {
  resetBossArt();
  assert.equal(FakeImage.made.length, 0, 'no atlas requested at start');
  assert.equal(drawBossFrame(screen, 'countess', 'walk', 4, 0, 100, 100, 90), false);
  assert.deepEqual(FakeImage.made.map((i) => i.src.replace(/.*\//, '')), ['countess-walk.webp', 'countess-idle.webp']);
  assert.equal(bossArtState('countess', 'walk'), 'loading');
  assert.equal(drawBossFrame(screen, 'countess', 'walk', 4, 0, 100, 100, 90), false);
  assert.equal(FakeImage.made.length, 2, 'one request per atlas');
  assert.equal(drawn.length, 0);
  assert.equal(bossArtState('countess', 'attack'), 'idle', 'attack / hit / death not fetched');
  assert.equal(bossArtState('countess', 'death'), 'idle');
});

test('fallback while loading: once idle is ready, a still-loading animation draws the idle frame instead', () => {
  finish('countess', 'idle');
  assert.equal(drawBossFrame(screen, 'countess', 'walk', 4, 3, 100, 100, 90, 5), 'idle');
  assert.equal(drawn.length, 1);
});

test('load error: animation marked failed, idle stand-in keeps drawing, retried after BOSS_ART_RETRY_S', () => {
  imgFor('countess', 'walk').onerror!();
  assert.equal(bossArtState('countess', 'walk'), 'failed');
  const n = FakeImage.made.length;
  now += BOSS_ART_RETRY_S - 1;
  assert.equal(drawBossFrame(screen, 'countess', 'walk', 4, 0, 100, 100, 90), 'idle');
  assert.equal(FakeImage.made.length, n, 'no retry storm');
  now += 2;
  assert.equal(drawBossFrame(screen, 'countess', 'walk', 4, 0, 100, 100, 90), 'idle');
  assert.equal(FakeImage.made.length, n + 1, 'retried');
});

test('load success: baked once in idle time, image released, drawn from ONE canvas with feet at the anchor', () => {
  const im = imgFor('countess', 'walk');
  im.onload!();
  assert.equal(bossArtState('countess', 'walk'), 'baking');
  assert.equal(drawBossFrame(screen, 'countess', 'walk', 4, 0, 100, 100, 90), 'idle', 'stand-in while baking');
  flush();
  assert.equal(bossArtState('countess', 'walk'), 'ready');
  assert.equal(im.src, '', 'decoded image released after the bake');
  assert.equal(bossArtResidentBytes(), bossAnimBytes('countess', 'walk') + bossAnimBytes('countess', 'idle'));
  drawn.length = 0;
  assert.equal(drawBossFrame(screen, 'countess', 'walk', 4, 2, 100, 100, 90), 'anim');
  assert.equal(drawn.length, 1);
  const [, , , sw, sh, dx, dy, dw, dh] = drawn[0] as number[];
  const m = META.countess;
  const f = m.anims.walk.frames.find((fr) => fr[0] === 4 && fr[1] === 2)!;
  const scale = 90 / m.body;
  assert.ok(Math.abs(dw - sw * scale) < 1e-9 && Math.abs(dh - sh * scale) < 1e-9, 'sheet scale');
  assert.ok(Math.abs(dy + dh - 2 * scale - (100 + (f[7] + f[5] - m.footY) * scale)) < 1e-9, 'frame bottom sits at its foot offset');
  assert.ok(dx < 100 && dx + dw > 100, 'centred on the feet');
});

test('the idle frame lands exactly where the t364u approved idle did (same foot offset from the new anchor)', () => {
  for (const id of BOSS_ART_IDS) {
    const m = META[id];
    for (const [, , , , , h, , oy] of m.anims.idle.frames) {
      const bottom = oy + h - m.footY;
      assert.ok(bottom <= 0 && bottom >= -3, `${id}: idle feet on the ground (bottom ${bottom})`);
    }
  }
});

test(`idle eviction: an atlas unwanted for ${BOSS_ART_IDLE_EVICT_S} s is released (and reloads lazily)`, () => {
  now += BOSS_ART_IDLE_EVICT_S - 1;
  bossArtTick();
  assert.equal(bossArtState('countess', 'walk'), 'ready');
  now += 2;
  bossArtTick();
  assert.equal(bossArtState('countess', 'walk'), 'idle');
  assert.equal(bossArtResidentBytes(), 0);
  const before = FakeImage.made.length;
  prefetchBossAnim('countess', 'walk');
  assert.equal(FakeImage.made.length, before + 1);
});

const loadAll = (list: [BossArtId, BossAnim][], peak: { v: number }, soft = true) => {
  for (const [id, anim] of list) {
    if (soft) prefetchBossAnim(id, anim);
    else drawBossFrame(screen, id, anim, 0, 0, 0, 0, 90);
    peak.v = Math.max(peak.v, bossArtResidentBytes());
    if (bossArtState(id, anim) === 'loading') finish(id, anim);
    peak.v = Math.max(peak.v, bossArtResidentBytes());
  }
};

test(`budget: resident boss art never exceeds ${mib(BOSS_ART_BUDGET_BYTES)} MiB walking past all six (idle + walk prefetched, oldest dropped)`, () => {
  resetBossArt();
  const peak = { v: 0 };
  for (const id of BOSS_ART_IDS) {
    now += 3;
    loadAll([[id, 'idle'], [id, 'walk']], peak);
    assert.equal(bossArtState(id, 'idle'), 'ready', id);
    assert.equal(bossArtState(id, 'walk'), 'ready', id);
  }
  assert.ok(BOSS_ATLAS_TOTAL_BYTES > BOSS_ART_BUDGET_BYTES, 'all at once would exceed the budget');
  assert.ok(peak.v <= BOSS_ART_BUDGET_BYTES, `peak ${mib(peak.v)} MiB`);
});

test('budget: a soft prefetch never drops art on screen; it just waits (fallback stays)', () => {
  resetBossArt();
  now += 100;
  const peak = { v: 0 };
  // Izual fighting: idle, walk, attack, hit all drawn this frame.
  loadAll([['izual', 'idle'], ['izual', 'walk'], ['izual', 'attack'], ['izual', 'hit']], peak, false);
  for (const a of ['idle', 'walk', 'attack', 'hit'] as const) assert.equal(bossArtState('izual', a), 'ready', a);
  const before = bossArtResident().sort();
  now += 0.05;
  for (const a of ['idle', 'walk', 'attack', 'hit'] as const) drawBossFrame(screen, 'izual', a, 0, 0, 0, 0, 90);
  assert.equal(prefetchBossAnim('izual', 'death'), false);
  assert.equal(bossArtState('izual', 'death'), 'idle', 'Izual\'s death does not fit next to four animations in use');
  assert.deepEqual(bossArtResident().sort(), before, 'nothing in use was dropped');
  assert.ok(peak.v <= BOSS_ART_BUDGET_BYTES, `peak ${mib(peak.v)} MiB`);
});

test(`budget LRU: drawing the death drops the least recently drawn animation not on screen for ${BOSS_ART_PROTECT_S} s, never the one being drawn`, () => {
  // Izual dies: only death (with the idle stand-in) is drawn from now on.
  now += 1;
  drawBossFrame(screen, 'izual', 'hit', 0, 0, 0, 0, 90);
  now += 0.01;
  drawBossFrame(screen, 'izual', 'attack', 0, 0, 0, 0, 90);
  now += BOSS_ART_PROTECT_S + 0.01;
  drawn.length = 0;
  assert.equal(drawBossFrame(screen, 'izual', 'death', 0, 0, 0, 0, 90), 'idle', 'idle stand-in while death loads');
  assert.equal(bossArtState('izual', 'death'), 'loading');
  assert.equal(bossArtState('izual', 'idle'), 'ready', 'idle (the stand-in) kept');
  assert.equal(bossArtState('izual', 'attack'), 'ready', 'attack drawn more recently than walk/hit: kept');
  assert.equal(bossArtState('izual', 'walk'), 'idle', 'walk (least recently drawn) dropped');
  finish('izual', 'death');
  assert.equal(drawBossFrame(screen, 'izual', 'death', 0, 9, 0, 0, 90), 'anim');
  assert.ok(bossArtResidentBytes() <= BOSS_ART_BUDGET_BYTES, mib(bossArtResidentBytes()));
});

test('budget: when nothing can be dropped (everything on screen) a hard request waits too and stays in budget', () => {
  resetBossArt();
  now += 100;
  const peak = { v: 0 };
  const all: [BossArtId, BossAnim][] = [];
  for (const id of BOSS_ART_IDS) for (const a of BOSS_ANIMS) all.push([id, a]);
  loadAll(all, peak, false);
  assert.ok(peak.v <= BOSS_ART_BUDGET_BYTES, `peak ${mib(peak.v)} MiB`);
  assert.ok(all.some(([id, a]) => bossArtState(id, a) === 'idle'), 'some wait on a fallback');
  resetBossArt();
});

test('memory log: per-animation decoded size; the worst single fight (Izual idle + walk + attack + hit) fits the cap', () => {
  for (const id of BOSS_ART_IDS) {
    console.log(`  ${id}: ` + BOSS_ANIMS.map((a) => `${a} ${mib(bossAnimBytes(id, a))}`).join(', ') + ` = ${mib(bossAtlasBytes(id))} MiB`);
  }
  console.log(`  all shipped ${mib(BOSS_ATLAS_TOTAL_BYTES)} MiB decoded; resident cap ${mib(BOSS_ART_BUDGET_BYTES)} MiB`);
  const fight = (['idle', 'walk', 'attack', 'hit'] as const).reduce((s, a) => s + bossAnimBytes('izual', a), 0);
  assert.ok(fight < BOSS_ART_BUDGET_BYTES, `Izual fight ${mib(fight)} MiB`);
  const council = COUNCIL_VARIANTS.reduce((s, id) => s + (['idle', 'walk', 'attack', 'hit'] as const).reduce((t, a) => t + bossAnimBytes(id, a), 0), 0);
  assert.ok(council < BOSS_ART_BUDGET_BYTES, `Council den fight ${mib(council)} MiB`);
});

test('credits: CREDITS.md names the CC0 sources of the boss art', () => {
  const credits = readFileSync('CREDITS.md', 'utf8');
  const sec = credits.slice(credits.indexOf('## Approved boss sheets'));
  assert.ok(sec.length > 100);
  for (const s of ['Countess', 'Radament', 'Izual', 'Council', 'Universal Base Characters', 'Universal Animation Library', 'CC0']) assert.ok(sec.includes(s), s);
});

console.log(`boss-art: ${passed} passed`);
