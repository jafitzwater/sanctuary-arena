/**
 * Procedural-art check on WebKit, iPhone 14 Pro Max, landscape, dpr 3.
 * Run: node test/webkit-procedural.mjs
 * Playwright stays outside package.json (PLAYWRIGHT_ROOT, default /tmp/pw).
 * Headless rAF timing is the emulator, not a phone.
 */
import { createRequire } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(`${process.env.PLAYWRIGHT_ROOT ?? '/tmp/pw'}/package.json`);
const { webkit, devices } = require('playwright');

const base = process.env.STICK_URL ?? 'http://127.0.0.1:5181/sanctuary-arena/?sticklog=1';
const phone = devices['iPhone 14 Pro Max'];
const BEFORE_JS = 181506;
const BEFORE_DIST = '16M';

function distReport() {
  const assets = join(process.cwd(), 'dist', 'assets');
  const names = readdirSync(assets);
  const js = names.find((name) => name.startsWith('index-') && name.endsWith('.js'));
  const css = names.find((name) => name.startsWith('index-') && name.endsWith('.css'));
  const jsBytes = statSync(join(assets, js)).size;
  let distBytes = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else distBytes += info.size;
    }
  };
  walk(join(process.cwd(), 'dist'));
  return { js, jsBytes, css, distBytes };
}

const bundle = distReport();
console.log(
  'BUNDLE',
  JSON.stringify({
    beforeJsBytes: BEFORE_JS,
    afterJs: bundle.js,
    afterJsBytes: bundle.jsBytes,
    beforeDist: BEFORE_DIST,
    afterDistBytes: bundle.distBytes,
    css: bundle.css,
  }),
);

const images = [];
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  ...phone,
  viewport: { width: 932, height: 430 },
  screen: { width: 932, height: 430 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('request', (request) => {
  const url = request.url().split('?')[0];
  if (/\.(png|webp|gif)$/i.test(url)) images.push(url);
});
await page.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(...args) {
    const ctx = orig.apply(this, args);
    if (this.id === 'view' && ctx && !ctx.__firstFrameHook) {
      ctx.__firstFrameHook = true;
      const fill = ctx.fillRect.bind(ctx);
      ctx.fillRect = function fillRect(...fillArgs) {
        if (globalThis.__firstFrameMs == null) globalThis.__firstFrameMs = performance.now();
        return fill(...fillArgs);
      };
    }
    return ctx;
  };
});
const boot = Date.now();
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => globalThis.__firstFrameMs != null, { timeout: 15000 });
const first = await page.evaluate(() => globalThis.__firstFrameMs);
console.log('FIRST_FRAME_MS', Number(first.toFixed(1)), 'wall', Date.now() - boot);
console.log('IMAGES_AT_FIRST_FRAME', JSON.stringify(images));

await page.waitForSelector('#play-btn');
await page.locator('#play-btn').click();
await page.waitForFunction(() => {
  const stick = document.querySelector('#stick');
  if (!stick) return false;
  const box = stick.getBoundingClientRect();
  return box.width > 40 && getComputedStyle(stick).display !== 'none';
});
await page.waitForTimeout(400);
console.log('IMAGES_AFTER_PLAY', JSON.stringify(images));

const hudLocked = (url) => /portrait\.webp$/i.test(url) || /\/icons\//i.test(url) || /assets\/art\/icons\//i.test(url);
const world = images.filter((url) => !hudLocked(url));
if (world.length) {
  console.log('WORLD_IMAGES', JSON.stringify(world));
  throw new Error('world sprite request leaked into the bundle');
}

async function raf(times = 1) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  }
}

async function stickBox() {
  return page.evaluate(() => {
    const stick = document.querySelector('#stick');
    const rect = stick.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
}

function point(box, tilt) {
  const max = box.width * 0.34;
  return { x: box.left + box.width / 2 + max * tilt, y: box.top + box.height / 2 };
}

async function touch(type, at, id = 1) {
  await page.evaluate(
    ({ type, at, id }) => {
      const stick = document.querySelector('#stick');
      const end = type === 'touchend' || type === 'touchcancel';
      const item = { identifier: id, clientX: at.x, clientY: at.y, pageX: at.x, pageY: at.y, target: stick };
      const event = new Event(type, { bubbles: true, cancelable: true });
      event.touches = end ? [] : [item];
      event.targetTouches = event.touches;
      event.changedTouches = [item];
      stick.dispatchEvent(event);
      const pointerType = type === 'touchstart' ? 'pointerdown' : type === 'touchmove' ? 'pointermove' : 'pointerup';
      stick.dispatchEvent(
        new PointerEvent(pointerType, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: 'touch',
          clientX: at.x,
          clientY: at.y,
          button: 0,
          buttons: end ? 0 : 1,
        }),
      );
    },
    { type, at, id },
  );
}

function summarize(rows) {
  if (!rows.length) return { samples: 0 };
  let dist = 0;
  let time = 0;
  for (let i = 1; i < rows.length; i++) {
    dist += Math.hypot(rows[i].x - rows[i - 1].x, rows[i].y - rows[i - 1].y);
    time += rows[i].dt;
  }
  const heights = [...new Set(rows.map((row) => row.heroHeight))];
  const hz = [...new Set(rows.map((row) => row.hz))];
  return {
    samples: rows.length,
    states: [...new Set(rows.map((row) => row.state))],
    speed: time > 0 ? Number((dist / time).toFixed(1)) : 0,
    frames: rows.map((row) => row.frame),
    heroHeight: heights,
    hz,
  };
}

async function mark() {
  return page.evaluate(() => (globalThis.__locoLog ?? []).length);
}

async function since(from) {
  return page.evaluate((start) => (globalThis.__locoLog ?? []).slice(start), from);
}

async function sample(label, tilt, frames) {
  const from = await mark();
  const at = point(await stickBox(), tilt);
  await touch('touchstart', at);
  await raf(frames);
  const rows = await since(from);
  const input = await page.evaluate(() => globalThis.__inputTrace);
  const summary = { ...summarize(rows), input };
  console.log(label, JSON.stringify(summary));
  await touch('touchend', at);
  await raf(3);
  return summary;
}

const idle = await sample('TILT 0.1', 0.1, 6);
const walk = await sample('TILT 0.4', 0.4, 8);
const run = await sample('TILT 0.9', 0.9, 8);

const from = await mark();
const runAt = point(await stickBox(), 0.9);
await touch('touchstart', runAt);
const frameTimes = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const samples = [];
      let last = performance.now();
      const start = last;
      const tick = (now) => {
        samples.push(now - last);
        last = now;
        if (now - start < 5000) requestAnimationFrame(tick);
        else resolve(samples);
      };
      requestAnimationFrame(tick);
    }),
);
await touch('touchend', runAt);
const runRows = await since(from);
const avg = frameTimes.reduce((sum, dt) => sum + dt, 0) / frameTimes.length;
console.log(
  'RUN_5S',
  JSON.stringify({
    frames: frameTimes.length,
    avgFrameMs: Number(avg.toFixed(2)),
    fps: Number((1000 / avg).toFixed(1)),
    note: 'emulated rAF, not a device',
    gait: summarize(runRows),
  }),
);

const geometry = await page.evaluate(() => globalThis.__geometry);
const heights = [...idle.heroHeight, ...walk.heroHeight, ...run.heroHeight];
console.log('HERO_HEIGHT', JSON.stringify([...new Set(heights)]));
console.log('GEOMETRY', JSON.stringify(geometry));

const backing = await page.evaluate(() => {
  const canvas = document.querySelector('#view');
  const rect = canvas.getBoundingClientRect();
  const ctx = canvas.getContext('2d');
  return {
    cssW: rect.width,
    cssH: rect.height,
    backingW: canvas.width,
    backingH: canvas.height,
    dpr: window.devicePixelRatio,
    ratioW: canvas.width / rect.width,
    imageRendering: canvas.style.imageRendering,
    smoothing: ctx.imageSmoothingEnabled,
  };
});
console.log('CANVAS', JSON.stringify(backing));

function expect(ok, message) {
  if (!ok) throw new Error(message);
}
expect(idle.states?.length === 1 && idle.states[0] === 'IDLE' && idle.speed === 0, `idle gait ${JSON.stringify(idle)}`);
expect(walk.states?.includes('WALK') && Math.abs(walk.speed - 144) < 8, `walk gait ${JSON.stringify(walk)}`);
expect(run.states?.includes('RUN') && Math.abs(run.speed - 216) < 8, `run gait ${JSON.stringify(run)}`);
expect(heights.every((height) => height === 108), `hero height ${heights}`);
expect(geometry?.corridorTiles === 5 && geometry?.gateTiles === 6, `geometry ${JSON.stringify(geometry)}`);
expect(backing.dpr === 3 && backing.ratioW === 3 && backing.imageRendering === 'pixelated', `canvas ${JSON.stringify(backing)}`);

await browser.close();
console.log('webkit procedural check passed');
