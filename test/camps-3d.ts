/**
 * t337u "Put the 3D camps in the game": camp assets (size, anchor, foot map), den -> zone -> camp mapping, the
 * mirror, the y-sort mask and the load-failure fallback. No DOM.
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { zoneAt } from '../src/game/data/mapZones';
import { walkable } from '../src/game/terrain';
import {
  CAMP_ART,
  CAMP_THEMES,
  CampArtStore,
  FOOT_STEP,
  GROUND_FOOT_PX,
  ZONE_CAMP,
  campArt,
  campArtUrl,
  campFootUrl,
  campFrontMask,
  campThemeForDen,
  footYAt,
  type CampTheme,
} from '../src/game/art/campArt';
import { readPng } from './png';

const map = sanctuary;
let passed = 0;
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`ok - ${name}`);
  });
}

/** Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X), and whether it has alpha. */
function webpInfo(buf: Buffer): { w: number; h: number; alpha: boolean } {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1, alpha: (buf[20] & 0x10) !== 0 };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1, alpha: ((b >>> 28) & 1) === 1 };
  }
  throw new Error(`camp WebP must carry alpha (got ${kind})`);
}

const MIRROR: Record<CampTheme, CampTheme> = { jungle: 'forge', forge: 'jungle', plains: 'desert', desert: 'plains' };

async function main(): Promise<void> {
  await test('each camp ships as an alpha WebP + foot map of its fixed size in public/camps (under ~1 MB total)', () => {
    let total = 0;
    for (const theme of CAMP_THEMES) {
      assert.equal(campArtUrl('/sanctuary-arena/', theme), `/sanctuary-arena/camps/camp-3d-${theme}.webp`);
      assert.equal(campFootUrl('/sanctuary-arena/', theme), `/sanctuary-arena/camps/camp-3d-${theme}-foot.png`);
      const art = CAMP_ART[theme];
      const file = `public/camps/camp-3d-${theme}.webp`;
      const info = webpInfo(readFileSync(file));
      assert.deepEqual([info.w, info.h], [art.w, art.h], `${theme} size`);
      assert.ok(info.alpha, `${theme} keeps alpha`);
      const foot = readPng(`public/camps/camp-3d-${theme}-foot.png`);
      assert.deepEqual([foot.w, foot.h], [art.w, art.h], `${theme} foot map size`);
      assert.ok(art.ax > 0 && art.ax < art.w && art.ay > 0 && art.ay < art.h, `${theme} anchor inside`);
      total += statSync(file).size + statSync(`public/camps/camp-3d-${theme}-foot.png`).size;
    }
    assert.ok(total < 1_000_000, `camp assets ${total} B`);
  });

  await test('scripts/import-camps.sh uses the same sizes and anchors as CAMP_ART (v2 drops in by file name)', () => {
    const sh = readFileSync('scripts/import-camps.sh', 'utf8');
    for (const theme of CAMP_THEMES) {
      const m = sh.match(new RegExp(`'${theme}':\\s*\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`));
      assert.ok(m, `${theme} in import script`);
      const art = CAMP_ART[theme];
      assert.deepEqual(m.slice(1, 5).map(Number), [art.w, art.h, art.ax, art.ay], theme);
    }
  });

  await test('foot maps: objects stand on the ground (their foot point lies inside the image, ground pixels are 0)', () => {
    for (const theme of CAMP_THEMES) {
      const art = CAMP_ART[theme];
      const png = readPng(`public/camps/camp-3d-${theme}-foot.png`);
      const foot = new Uint8Array(art.w * art.h);
      for (let i = 0; i < foot.length; i++) foot[i] = png.rgba[i * 4];
      let objects = 0;
      for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) {
        const fy = footYAt(foot, art.w, x, y);
        if (fy < 0) continue;
        objects += 1;
        assert.ok(fy < art.h + 4, `${theme} foot (${x},${y}) -> ${fy} stays in the image`);
      }
      assert.ok(objects > 1000, `${theme} has standing objects (${objects} px)`);
    }
  });

  await test('one camp per jungle zone: each of the four dens maps to a different theme, two per side', () => {
    const dens = map.dens ?? [];
    assert.equal(dens.length, 4);
    const themes = dens.map((den) => campThemeForDen(map, den));
    assert.deepEqual([...themes].sort(), [...CAMP_THEMES].sort());
    const byId = Object.fromEntries(dens.map((den, i) => [den.unit, themes[i]]));
    assert.deepEqual(byId, { countess: 'plains', radament: 'forge', 'council-member': 'jungle', izual: 'desert' });
    assert.equal(ZONE_CAMP['jungle-dense'], 'jungle');
    assert.equal(ZONE_CAMP['jungle-lava'], 'forge');
    // The same number of camps on each side (blue = nearer the blue base): plains + forge blue, jungle + desert red.
    const isBlue = (d: { x: number; y: number }) =>
      Math.hypot(d.x - map.playerBase.x, d.y - map.playerBase.y) < Math.hypot(d.x - map.enemyBase.x, d.y - map.enemyBase.y);
    const blue = dens.filter(isBlue);
    assert.deepEqual(blue.map((d) => campThemeForDen(map, d)).sort(), ['forge', 'plains']);
    assert.equal(dens.length - blue.length, 2);
    for (const den of dens) {
      assert.ok(zoneAt(map, den.x, den.y).startsWith('jungle-'), `den ${den.id} off lanes, river and bases`);
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        assert.ok(walkable(map, den.x + Math.cos(ang) * 150, den.y + Math.sin(ang) * 150), `den ${den.id} clearing walkable`);
      }
    }
  });

  await test('camp dens mirror exactly red/blue: (x, y) <-> (W - x, H - y), and the mirror camp is the mirror theme', () => {
    const dens = map.dens ?? [];
    for (const den of dens) {
      const twin = dens.find((d) => Math.abs(d.x - (map.width - den.x)) < 1e-6 && Math.abs(d.y - (map.height - den.y)) < 1e-6);
      assert.ok(twin, `den ${den.id} has a mirror`);
      assert.equal(campThemeForDen(map, twin), MIRROR[campThemeForDen(map, den)!]);
    }
  });

  await test('y-sort mask: object pixels whose foot is in front of the unit are drawn over it, ground never', () => {
    const w = 4;
    const h = 4;
    const foot = new Uint8Array(w * h);
    const code = (px: number) => px / FOOT_STEP + 1;
    foot[1 * w + 1] = code(20); // stone pixel at y 1, foot at y 21
    foot[2 * w + 2] = code(GROUND_FOOT_PX - 2); // low platform: ground
    const out = new Uint8ClampedArray(w * h * 4);
    assert.equal(campFrontMask(foot, w, h, 0, 0, w, h, 10, out), 1, 'unit at y 10 is behind the stone');
    assert.equal(out[(1 * w + 1) * 4 + 3], 255);
    assert.equal(out[(2 * w + 2) * 4 + 3], 0, 'platform stays under');
    assert.equal(campFrontMask(foot, w, h, 0, 0, w, h, 30, out), 0, 'unit at y 30 is in front');
    assert.equal(out[(1 * w + 1) * 4 + 3], 0, 'mask cleared');
    // Sub-rect and clamping: rect reaching outside the image.
    const sub = new Uint8ClampedArray(3 * 3 * 4);
    assert.equal(campFrontMask(foot, w, h, -1, -1, 2, 2, 0, sub), 1);
    assert.equal(sub[(2 * 3 + 2) * 4 + 3], 255);
  });

  await test('fallback: a camp that fails to load stays null (den keeps the code-drawn clearing), the rest load', async () => {
    const fakeImg = {} as CanvasImageSource;
    const store = new CampArtStore(async (theme) => {
      if (theme === 'plains') throw new Error('blocked');
      const art = CAMP_ART[theme];
      // desert: a broken foot map (wrong size) -> art still draws, flat under units.
      return { img: fakeImg, foot: theme === 'desert' ? new Uint8Array(3) : new Uint8Array(art.w * art.h) };
    });
    let changes = 0;
    store.onChange(() => (changes += 1));
    for (const theme of CAMP_THEMES) assert.equal(store.sprite(theme), null, 'not loaded yet');
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(changes, 4);
    assert.equal(store.status('plains'), 'failed');
    assert.equal(store.sprite('plains'), null);
    assert.deepEqual(store.failures, ['plains']);
    assert.equal(store.sprite('desert')?.foot, null);
    assert.ok(store.sprite('jungle')?.foot);
    assert.equal(store.sprite('forge')?.img, fakeImg);
    assert.equal(store.stats().states.plains, 'failed');
    // In node (no Image) the game store never loads: everything renders as before this order.
    assert.equal(campArt.sprite('jungle'), null);
    assert.equal(campArt.status('jungle'), 'idle');
  });

  console.log(`camps-3d: ${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
