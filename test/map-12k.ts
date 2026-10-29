/**
 * ORDER "Map size and Diablo 2 theme from reference" (WORK-ORDERS.md): pure-logic checks for the 12,000 x 12,000
 * map, the reference layout, the theme zones and the minimap grid. No DOM.
 */
import assert from 'node:assert/strict';
import { sanctuary, MAP_W, MAP_H } from '../src/game/data/acts/sanctuary';
import { TOWER_TIERS } from '../src/game/data/acts/types';
import { walkable } from '../src/game/terrain';
import { ZONE_IDS, zoneAt, zoneBounds, zoneGrid } from '../src/game/data/mapZones';
import { BAKE_CHUNK, BAKE_CHUNK_CAP, ChunkedBake, chunkRange } from '../src/game/bakeChunks';

const map = sanctuary;
const W = map.width;
const H = map.height;
let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
const len = (pts: { x: number; y: number }[]) =>
  pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
const path = (id: string) => {
  const p = (map.paths ?? []).find((q) => q.id === id);
  assert.ok(p, `path ${id}`);
  return p!.lane;
};

test('map is 12,000 x 12,000 [JOSEPH]', () => {
  assert.equal(MAP_W, 12000);
  assert.equal(MAP_H, 12000);
  assert.equal(W, 12000);
  assert.equal(H, 12000);
});

test('Nexus to Nexus along the diagonal (mid) lane is 15k-16k', () => {
  // Worldstone -> lane mouth -> mid lane -> lane mouth -> Worldstone.
  const l = len([map.playerBase, ...path('center'), map.enemyBase]);
  assert.ok(l >= 15000 && l <= 16000, `mid lane ${l.toFixed(0)}`);
});

test('Blue base bottom-left, Red base top-right, mirrored', () => {
  const b = map.playerBase;
  const r = map.enemyBase;
  assert.ok(b.x < W * 0.15 && b.y > H * 0.85, 'blue bottom-left');
  assert.ok(r.x > W * 0.85 && r.y < H * 0.15, 'red top-right');
  assert.equal(b.x, W - r.x);
  assert.equal(b.y, H - r.y);
});

test('top lane runs up the left then along the top; bottom lane along the bottom then up the right', () => {
  const north = path('north');
  const south = path('south');
  const corner = (lane: { x: number; y: number }[]) =>
    lane.reduce((best, p) => (Math.hypot(p.x, p.y) < Math.hypot(best.x, best.y) ? p : best));
  const nc = corner(north);
  assert.ok(nc.x < W * 0.15 && nc.y < H * 0.15, 'north lane bends near the top-left corner');
  const sc = south.reduce((best, p) => (Math.hypot(W - p.x, H - p.y) < Math.hypot(W - best.x, H - best.y) ? p : best));
  assert.ok(sc.x > W * 0.85 && sc.y > H * 0.85, 'south lane bends near the bottom-right corner');
  for (const p of path('center')) assert.ok(Math.abs(p.x + p.y - W) < W * 0.06, 'mid lane on the diagonal');
});

test('lava river crosses mid from top-left to bottom-right', () => {
  const river = map.river ?? [];
  assert.ok(river.length >= 2);
  assert.ok(river[0].x < W / 2 && river[0].y < H / 2);
  assert.ok(river[river.length - 1].x > W / 2 && river[river.length - 1].y > H / 2);
});

test('tower, seal, base and camp counts unchanged', () => {
  assert.equal(map.towers.length, 12);
  assert.equal(map.towers.filter((t) => t.team === 'ally').length, 6);
  assert.equal((map.seals ?? []).filter((s) => s.team === 'ally').length, 3);
  assert.equal((map.seals ?? []).filter((s) => s.team === 'enemy').length, 3);
  assert.equal((map.dens ?? []).length, 4);
  assert.equal((map.shrines ?? []).length, 4);
  assert.equal((map.pits ?? []).length, 2);
  assert.equal((map.paths ?? []).length, 3);
});

test('caves stay outside every tower range plus a margin', () => {
  for (const den of map.dens ?? []) {
    for (const t of map.towers) {
      const d = Math.hypot(den.x - t.x, den.y - t.y);
      assert.ok(d > TOWER_TIERS[t.tier].range + 60, `den ${den.id} vs ${t.name}: ${d.toFixed(0)}`);
    }
  }
});

test('jungle is walkable (dens, shrines, pits and jungle samples)', () => {
  for (const p of [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])]) assert.ok(walkable(map, p.x, p.y), `${p.x},${p.y}`);
  for (const [u, v] of [[0.3, 0.5], [0.5, 0.3], [0.7, 0.5], [0.5, 0.7]]) {
    assert.ok(walkable(map, W * u, H * v), `jungle sample ${u},${v}`);
  }
});

test('zones cover the whole map and every zone exists', () => {
  const bounds = zoneBounds(map, 200);
  const share = bounds.reduce((s, b) => s + b.share, 0);
  assert.ok(Math.abs(share - 1) < 1e-6, `share ${share}`);
  for (const id of ZONE_IDS) assert.ok(bounds.some((b) => b.zone === id && b.share > 0), `zone ${id}`);
  for (let y = 0; y <= H; y += 600) for (let x = 0; x <= W; x += 600) assert.ok(ZONE_IDS.includes(zoneAt(map, x, y)));
});

test('theme zone assignments follow the order', () => {
  assert.equal(zoneAt(map, map.playerBase.x, map.playerBase.y), 'rogue-encampment');
  assert.equal(zoneAt(map, map.enemyBase.x, map.enemyBase.y), 'pandemonium-fortress');
  assert.equal(zoneAt(map, 900, 7000), 'blood-moor', 'first third of top lane');
  assert.equal(zoneAt(map, 6000, 880), 'dry-hills', 'top lane past the first third');
  assert.equal(zoneAt(map, 3500, 8500), 'blood-moor', 'first third of mid');
  assert.equal(zoneAt(map, 7600, 4400), 'spider-forest', 'mid past the first third');
  assert.equal(zoneAt(map, 9000, 11100), 'river-of-flame', 'bottom lane past the first third');
  assert.equal(zoneAt(map, 6000, 6000), 'lava-river');
  assert.equal(zoneAt(map, 4800, 2600), 'jungle-dense', 'top jungle');
  assert.equal(zoneAt(map, 2600, 6000), 'jungle-plains', 'left-middle jungle');
  assert.equal(zoneAt(map, 9400, 6000), 'jungle-desert', 'right jungle near Red');
  assert.equal(zoneAt(map, 6000, 9300), 'jungle-lava', 'bottom-center jungle');
});

test('minimap zone grid is derived from the same map data', () => {
  const cols = 48;
  const grid = zoneGrid(map, cols, cols);
  assert.equal(grid.length, cols * cols);
  for (const [c, r] of [[2, 45], [45, 2], [24, 24], [10, 30]]) {
    const x = ((c + 0.5) * W) / cols;
    const y = ((r + 0.5) * H) / cols;
    assert.equal(grid[r * cols + c], zoneAt(map, x, y));
  }
});

test('ground bake chunks respect the ~4096 texture limit', () => {
  assert.ok(BAKE_CHUNK <= 4096);
  assert.ok(BAKE_CHUNK_CAP * BAKE_CHUNK * BAKE_CHUNK * 4 < 64 * 1024 * 1024, 'chunk cache under 64 MB');
  const r = chunkRange(0, 0, 1200, 560, { w: 20464, h: 10264 });
  assert.ok((r.c1 - r.c0 + 1) * (r.r1 - r.r0 + 1) <= 12, 'phone view needs at most 12 chunks');
});

test('chunk cache keeps the in-view chunks (no rebake on a still camera)', () => {
  const ctxStub = { save() {}, restore() {}, translate() {}, drawImage() {}, imageSmoothingEnabled: true };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
  };
  let paints = 0;
  const bake = new ChunkedBake(20528, 10328, () => { paints += 1; });
  const target = ctxStub as unknown as CanvasRenderingContext2D;
  for (let f = 0; f < 40; f++) bake.draw(target, 9693, 4844, 1190, 550, 844, 390, 1);
  const first = paints;
  for (let f = 0; f < 20; f++) bake.draw(target, 9693, 4844, 1190, 550, 844, 390, 1);
  assert.equal(paints, first, 'a still view never rebakes');
  assert.ok(bake.count <= BAKE_CHUNK_CAP);
  delete (globalThis as { document?: unknown }).document;
});

console.log(`map-12k: ${passed} passed`);
