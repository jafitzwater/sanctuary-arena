/**
 * iPhone 14 Pro Max, WebKit, landscape, deviceScaleFactor 3.
 * Run: node test/webkit-stick.mjs
 * Playwright is resolved from PLAYWRIGHT_ROOT (default /tmp/pw) so it stays off package.json.
 */
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PLAYWRIGHT_ROOT ?? '/tmp/pw'}/package.json`);
const { webkit, devices } = require('playwright');

const base = process.env.STICK_URL ?? 'http://127.0.0.1:5181/sanctuary-arena/?sticklog=1';
const phone = devices['iPhone 14 Pro Max'];

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
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#play-btn');
await page.locator('#play-btn').click();
await page.waitForFunction(() => {
  const stick = document.querySelector('#stick');
  if (!stick) return false;
  const box = stick.getBoundingClientRect();
  return box.width > 40 && getComputedStyle(stick).display !== 'none';
});

await page.evaluate(() => {
  const synth = { click: 0, mousePointer: 0, mousedown: 0, touchStartPrevented: false };
  globalThis.__synth = synth;
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') synth.mousePointer += 1;
    },
    true,
  );
  document.addEventListener('mousedown', () => {
    synth.mousedown += 1;
  }, true);
  document.addEventListener('click', () => {
    synth.click += 1;
  }, true);
  document.addEventListener(
    'touchstart',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('#stick')) synth.touchStartPrevented = event.defaultPrevented;
    },
    false,
  );
});

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
      globalThis.__lastTouchPrevented = event.defaultPrevented;
    },
    { type, at, id },
  );
}

async function hold(tilt, frames) {
  const box = await stickBox();
  const at = point(box, tilt);
  await touch('touchstart', at);
  await raf(frames);
  return at;
}

function summarize(rows) {
  if (!rows.length) return 'no samples';
  let dist = 0;
  let time = 0;
  for (let i = 1; i < rows.length; i++) {
    dist += Math.hypot(rows[i].x - rows[i - 1].x, rows[i].y - rows[i - 1].y);
    time += rows[i].dt;
  }
  const speed = time > 0 ? dist / time : 0;
  const states = [...new Set(rows.map((row) => row.state))];
  const frames = rows.map((row) => row.frame);
  return { samples: rows.length, states, speed: Number(speed.toFixed(1)), frames, last: rows[rows.length - 1] };
}

async function takeLog() {
  return page.evaluate(() => {
    const log = globalThis.__locoLog ?? [];
    const mark = log.length;
    return { mark, input: globalThis.__inputTrace ?? null, synth: globalThis.__synth };
  });
}

async function since(mark) {
  return page.evaluate((from) => (globalThis.__locoLog ?? []).slice(from), mark);
}

const box = await stickBox();
console.log('stick', JSON.stringify(box));
console.log('device', 'WebKit', 'iPhone 14 Pro Max', 'landscape', 'dpr', phone.deviceScaleFactor);

const before = await takeLog();
const full = point(box, 0.9);
await touch('touchstart', full);
await raf(8);
const fullRows = await since(before.mark);
const during = await page.evaluate(() => ({
  input: globalThis.__inputTrace,
  synth: { ...globalThis.__synth },
  touchStartPrevented: globalThis.__lastTouchPrevented,
}));
console.log('FULL TILT 0.9 in camp', JSON.stringify(summarize(fullRows)));
console.log('during stick', JSON.stringify(during));

const canvasAt = await page.evaluate(() => {
  const canvas = document.querySelector('#view');
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + rect.width * 0.55, y: rect.top + rect.height * 0.55 };
});
await page.evaluate((at) => {
  const canvas = document.querySelector('#view');
  canvas.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: at.x,
      clientY: at.y,
      button: 0,
    }),
  );
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
}, canvasAt);
await raf(2);
const afterInject = await page.evaluate(() => globalThis.__inputTrace);
console.log('injected mouse pointerdown/click while stick held', JSON.stringify(afterInject));

await touch('touchend', full);
await raf(2);

async function sample(label, tilt, frames) {
  const mark = (await takeLog()).mark;
  const at = point(await stickBox(), tilt);
  await touch('touchstart', at);
  await raf(frames);
  const rows = await since(mark);
  const input = await page.evaluate(() => globalThis.__inputTrace);
  console.log(label, JSON.stringify({ ...summarize(rows), input }));
  await touch('touchend', at);
  await raf(3);
}

await sample('TILT 0.1', 0.1, 6);
await sample('TILT 0.4', 0.4, 8);
await sample('TILT 0.9', 0.9, 8);

async function oscillate(label, settle, frames) {
  const boxNow = await stickBox();
  await touch('touchstart', point(boxNow, settle));
  await raf(3);
  const mark = (await takeLog()).mark;
  for (let i = 0; i < frames; i++) {
    const tilt = i % 2 === 0 ? 0.58 : 0.62;
    await touch('touchmove', point(boxNow, tilt));
    await raf(1);
  }
  const rows = await since(mark);
  console.log(label, JSON.stringify(summarize(rows)));
  await touch('touchend', point(boxNow, 0.6));
  await raf(3);
}

await oscillate('OSCILLATE from walk 0.58-0.62', 0.4, 12);
await oscillate('OSCILLATE from run 0.58-0.62', 0.9, 12);

const backing = await page.evaluate(() => {
  const canvas = document.querySelector('#view');
  const rect = canvas.getBoundingClientRect();
  const ctx = canvas.getContext('2d');
  const attrs = ctx.getContextAttributes ? ctx.getContextAttributes() : null;
  return {
    cssW: rect.width,
    cssH: rect.height,
    backingW: canvas.width,
    backingH: canvas.height,
    dpr: window.devicePixelRatio,
    ratioW: canvas.width / rect.width,
    imageRendering: canvas.style.imageRendering,
    smoothing: ctx.imageSmoothingEnabled,
    alpha: attrs ? attrs.alpha : null,
  };
});
console.log('CANVAS', JSON.stringify(backing));

await browser.close();
