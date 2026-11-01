/**
 * t364u "Put the approved bosses in the game" (+ the t365u placement CORRECTION): which atlas each boss draws,
 * the frame picker, sheet scale, lazy load with fallback (fake Image/canvas, no browser), the memory budget and
 * idle eviction, and that nothing but visuals changed (stats, team, pack). Rows per atlas: test/boss-atlas-rows.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { sanctuary as map } from '../src/game/data/acts/sanctuary';
import { barbarian } from '../src/game/data/classes/barbarian';
import { UNIT_DEFS } from '../src/game/data/units';
import { zoneAt } from '../src/game/data/mapZones';
import { createMatch } from '../src/game/sim';
import atlases from '../src/game/art/boss-atlases.json';
import { BOSS_ART_IDS, BOSS_COL, BOSS_WINDUP, COUNCIL_VARIANTS, bossArtFor, bossCol, type BossArtId } from '../src/game/art/boss-frames';
import {
  BOSS_ART_BUDGET_BYTES,
  BOSS_ART_IDLE_EVICT_S,
  BOSS_ART_RETRY_S,
  BOSS_ATLAS_TOTAL_BYTES,
  bossArtResidentBytes,
  bossArtState,
  bossArtTick,
  bossAtlasBytes,
  bossHeight,
  bossRingPx,
  drawBossFrame,
  requestBossArt,
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

test('frame tables: 6 atlases x 160 frames (8 rows x idle8 + attack12), inside the image, shipped WebP size small', () => {
  const meta = atlases as unknown as Record<BossArtId, { w: number; h: number; body: number; cell: number; footX: number; footY: number; frames: number[][] }>;
  assert.deepEqual(Object.keys(meta).sort(), [...BOSS_ART_IDS].sort());
  for (const id of BOSS_ART_IDS) {
    const m = meta[id];
    assert.equal(m.frames.length, 160, id);
    assert.deepEqual([m.footX, m.footY], [m.cell / 2, m.cell], `${id}: foot point is the cell's bottom centre`);
    const seen = new Set<number>();
    for (const [row, col, x, y, w, h] of m.frames) {
      assert.ok(row >= 0 && row < 8 && col >= 0 && col < 20, id);
      seen.add(row * 100 + col);
      assert.ok(x >= 2 && y >= 2 && x + w + 2 <= m.w && y + h + 2 <= m.h, `${id} frame ${row}/${col} inside with its half gutter`);
    }
    assert.equal(seen.size, 160, id);
    const file = statSync(`public/sprites/bosses/${id}-atlas.webp`).size;
    assert.ok(file < 600_000, `${id}: ${file} B`);
    const buf = readFileSync(`public/sprites/bosses/${id}-atlas.webp`);
    assert.equal(buf.toString('ascii', 8, 16), 'WEBPVP8L', `${id}: lossless WebP`);
  }
});

test('frame picker: idle cycle; wind-up 0-5 before the strike; strike/recovery 6-11 while swing decays; dead holds idle 0', () => {
  const s = { alive: true, swing: 0, attackCd: 1, engaged: false, clock: 0 };
  const idle = Array.from({ length: 8 }, (_, i) => bossCol({ ...s, clock: i * 0.125 + 0.01 }));
  assert.deepEqual(idle, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(bossCol({ ...s, clock: 1.01 }), 0, 'loops each second');
  assert.equal(bossCol({ ...s, engaged: false, attackCd: 0.1, clock: 0.3 }), 2, 'no wind-up without a target');
  assert.equal(bossCol({ ...s, engaged: true, attackCd: BOSS_WINDUP - 0.001 }), BOSS_COL.attack);
  assert.equal(bossCol({ ...s, engaged: true, attackCd: 0 }), BOSS_COL.attack + 5);
  assert.equal(bossCol({ ...s, swing: 1 }), BOSS_COL.attack + 6, 'impact frame at the hit');
  assert.equal(bossCol({ ...s, swing: 0.01 }), BOSS_COL.attack + 11);
  let last = -1;
  for (let sw = 1; sw > 0; sw -= 0.05) {
    const c = bossCol({ ...s, swing: sw });
    assert.ok(c >= last && c <= 19);
    last = c;
  }
  assert.equal(bossCol({ ...s, alive: false, swing: 1, clock: 0.6 }), 0);
});

test('sheet scale as rendered: every boss uses the heroes px/m (height = hero height x body px / 56)', () => {
  const meta = atlases as unknown as Record<BossArtId, { body: number }>;
  for (const id of BOSS_ART_IDS) {
    const h = bossHeight(id, 124.2);
    assert.ok(Math.abs(h / meta[id].body - 124.2 / 56) < 1e-9, id);
  }
  assert.ok(bossHeight('izual', 100) > bossHeight('radament', 100) && bossHeight('radament', 100) > bossHeight('countess', 100));
  assert.equal(bossRingPx(100), 0.5);
  assert.equal(bossRingPx(0.01), 1.5);
});

// ---- load / fallback with a fake browser -------------------------------------------------------------------------
let now = 0;
setBossArtClock(() => now);
test('no DOM (node / SSR): nothing loads and draw returns false so the procedural token is drawn', () => {
  const ctx = { drawImage() { throw new Error('should not draw'); } } as unknown as CanvasRenderingContext2D;
  assert.equal(drawBossFrame(ctx, 'izual', 0, 0, 0, 0, 300), false);
  assert.equal(requestBossArt('countess'), false);
  assert.equal(bossArtState('countess'), 'idle');
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
const lastImg = () => FakeImage.made[FakeImage.made.length - 1];
const drawn: unknown[][] = [];
const screen = { drawImage: (...a: unknown[]) => drawn.push(a) } as unknown as CanvasRenderingContext2D;

test('lazy: nothing is fetched until a boss is drawn; while loading the fallback is drawn (false)', () => {
  resetBossArt();
  assert.equal(FakeImage.made.length, 0, 'no atlas requested at start');
  assert.equal(drawBossFrame(screen, 'countess', 4, 0, 100, 100, 90), false);
  assert.equal(FakeImage.made.length, 1);
  assert.match(lastImg().src, /sprites\/bosses\/countess-atlas\.webp$/);
  assert.equal(bossArtState('countess'), 'loading');
  assert.equal(drawBossFrame(screen, 'countess', 4, 0, 100, 100, 90), false);
  assert.equal(FakeImage.made.length, 1, 'one request per atlas');
  assert.equal(drawn.length, 0);
});

test('load error: atlas marked failed, fallback keeps drawing, retried after BOSS_ART_RETRY_S', () => {
  lastImg().onerror!();
  assert.equal(bossArtState('countess'), 'failed');
  assert.equal(bossArtResidentBytes(), 0);
  now += BOSS_ART_RETRY_S - 1;
  assert.equal(drawBossFrame(screen, 'countess', 4, 0, 100, 100, 90), false);
  assert.equal(FakeImage.made.length, 1, 'no retry storm');
  now += 2;
  assert.equal(drawBossFrame(screen, 'countess', 4, 0, 100, 100, 90), false);
  assert.equal(FakeImage.made.length, 2, 'retried');
});

test('load success: baked once in idle time, image released, then drawn from ONE canvas with feet at the anchor', () => {
  const im = lastImg();
  im.onload!();
  assert.equal(bossArtState('countess'), 'baking');
  assert.equal(drawBossFrame(screen, 'countess', 4, 0, 100, 100, 90), false, 'fallback while baking');
  flush();
  assert.equal(bossArtState('countess'), 'ready');
  assert.equal(im.src, '', 'decoded image released after the bake');
  assert.equal(bossArtResidentBytes(), bossAtlasBytes('countess'));
  assert.equal(drawBossFrame(screen, 'countess', 4, 0, 100, 100, 90), true);
  assert.equal(drawn.length, 1);
  const [, , , sw, sh, dx, dy, dw, dh] = drawn[0] as number[];
  const m = (atlases as unknown as Record<string, { body: number; cell: number; frames: number[][] }>).countess;
  const f = m.frames.find((fr) => fr[0] === 4 && fr[1] === 0)!;
  const scale = 90 / m.body;
  assert.ok(Math.abs(dw - sw * scale) < 1e-9 && Math.abs(dh - sh * scale) < 1e-9, 'sheet scale');
  assert.ok(Math.abs(dy + dh - 2 * scale - (100 + (f[7] + f[5] - m.cell) * scale)) < 1e-9, 'frame bottom sits at its foot offset');
  assert.ok(dx < 100 && dx + dw > 100, 'centred on the feet');
});

test(`idle eviction: an atlas unused for ${BOSS_ART_IDLE_EVICT_S} s is released (and reloads lazily)`, () => {
  now += BOSS_ART_IDLE_EVICT_S - 1;
  bossArtTick();
  assert.equal(bossArtState('countess'), 'ready');
  now += 2;
  bossArtTick();
  assert.equal(bossArtState('countess'), 'idle');
  assert.equal(bossArtResidentBytes(), 0);
  const before = FakeImage.made.length;
  assert.equal(drawBossFrame(screen, 'countess', 4, 0, 100, 100, 90), false);
  assert.equal(FakeImage.made.length, before + 1);
});

test(`budget: resident boss atlases never exceed ${mib(BOSS_ART_BUDGET_BYTES)} MiB; least recently used go first, else fallback`, () => {
  resetBossArt();
  let peak = 0;
  const load = (id: BossArtId) => {
    requestBossArt(id);
    peak = Math.max(peak, bossArtResidentBytes());
    if (bossArtState(id) === 'loading') {
      lastImg().onload!();
      flush();
    }
    peak = Math.max(peak, bossArtResidentBytes());
  };
  // Walk the map past all six, a few seconds apart: every one loads, the oldest are dropped to stay in budget.
  for (const id of BOSS_ART_IDS) {
    now += 3;
    load(id);
    assert.equal(bossArtState(id), 'ready', id);
  }
  assert.ok(BOSS_ATLAS_TOTAL_BYTES > BOSS_ART_BUDGET_BYTES, 'all six at once would exceed the budget');
  assert.ok(peak <= BOSS_ART_BUDGET_BYTES, `peak ${mib(peak)} MiB`);
  // All six on screen in the same second: the ones that do not fit keep the fallback; still within budget.
  resetBossArt();
  now += 100;
  for (const id of BOSS_ART_IDS) load(id);
  assert.ok(bossArtResidentBytes() <= BOSS_ART_BUDGET_BYTES);
  assert.ok(BOSS_ART_IDS.some((id) => bossArtState(id) === 'idle'), 'at least one waits on the fallback');
  resetBossArt();
});

test('memory log: per-atlas decoded size; worst single den (Izual) and the Council den fit with room to spare', () => {
  const each = BOSS_ART_IDS.map((id) => `${id} ${mib(bossAtlasBytes(id))}`).join(', ');
  const council = bossAtlasBytes('council-a') + bossAtlasBytes('council-b') + bossAtlasBytes('council-c');
  console.log(`  decoded MiB: ${each}; all six ${mib(BOSS_ATLAS_TOTAL_BYTES)}; Council den ${mib(council)}; cap ${mib(BOSS_ART_BUDGET_BYTES)}`);
  assert.ok(bossAtlasBytes('izual') < 14 * MiB);
  assert.ok(council < 10 * MiB);
  assert.ok(BOSS_ATLAS_TOTAL_BYTES < 30 * MiB);
});

test('credits: CREDITS.md names the CC0 sources of the boss art', () => {
  const credits = readFileSync('CREDITS.md', 'utf8');
  const sec = credits.slice(credits.indexOf('## Approved boss sheets'));
  assert.ok(sec.length > 100);
  for (const s of ['Countess', 'Radament', 'Izual', 'Council', 'Universal Base Characters', 'Universal Animation Library', 'CC0']) assert.ok(sec.includes(s), s);
});

console.log(`boss-art: ${passed} passed`);
