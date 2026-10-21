/**
 * Attack feel, recall timer, and procedural world art on WebKit.
 * iPhone 14 Pro Max, landscape, dpr 3, touch.
 * Run: node test/webkit-look.mjs
 * Headless rAF timing is the emulator, not a phone.
 */
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PLAYWRIGHT_ROOT ?? '/tmp/pw'}/package.json`);
const { webkit, devices } = require('playwright');

const base = process.env.LOOK_URL ?? 'http://127.0.0.1:5181/sanctuary-arena/?sticklog=1&looklog=1&attacklog=1';
const phone = devices['iPhone 14 Pro Max'];

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
  if (/\.(png|webp|gif|jpe?g)$/i.test(url)) images.push(url);
});
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#play-btn');
await page.locator('#play-btn').click();
await page.waitForFunction(() => {
  const stick = document.querySelector('#stick');
  if (!stick) return false;
  const box = stick.getBoundingClientRect();
  return box.width > 40 && getComputedStyle(stick).display !== 'none';
});
await page.waitForTimeout(400);

const hudLocked = (url) => /portrait\.webp$/i.test(url) || /\/icons\//i.test(url);
const world = images.filter((url) => !hudLocked(url));
console.log('IMAGES', JSON.stringify({ count: images.length, world }));
if (world.length) throw new Error(`world art request ${world.join(' ')}`);

async function raf(times = 1) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  }
}

async function look() {
  return page.evaluate(() => globalThis.__look);
}

async function press(selector) {
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const rect = el.getBoundingClientRect();
    const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', button: 0, buttons: 1, ...at }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', button: 0, buttons: 0, ...at }));
  }, selector);
}

async function attackDown() {
  await page.evaluate(() => {
    const attack = document.querySelector('#attack-btn');
    const rect = attack.getBoundingClientRect();
    attack.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 4,
        pointerType: 'touch',
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 1,
      }),
    );
  });
}

async function attackUp() {
  await page.evaluate(() => {
    const attack = document.querySelector('#attack-btn');
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      attack.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 4,
          pointerType: 'touch',
          button: 0,
          buttons: 0,
        }),
      );
    }
  });
}

async function stickBox() {
  return page.evaluate(() => {
    const stick = document.querySelector('#stick');
    const rect = stick.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
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

const before = await look();
await attackDown();
await page.waitForFunction(() => (globalThis.__attackLog ?? []).some((row) => row.event === 'AttackFired'), null, { timeout: 2500 });
await raf(3);
const fired = await look();
await attackUp();
console.log('ATTACK_FX', JSON.stringify({ before: before?.seen, after: fired?.seen, slash: fired?.slash, spark: fired?.spark, flinch: fired?.flinch }));
if (!(fired?.seen?.heroSlash > (before?.seen?.heroSlash ?? 0))) throw new Error(`hero slash missing ${JSON.stringify(fired)}`);
if (!(fired?.seen?.spark > (before?.seen?.spark ?? 0) || fired?.spark)) throw new Error(`spark missing ${JSON.stringify(fired)}`);
if (!(fired?.seen?.flinch > (before?.seen?.flinch ?? 0) || fired?.flinch)) throw new Error(`flinch missing ${JSON.stringify(fired)}`);

await press('#recall-btn');
await raf(3);
const recallStart = await look();
await page.waitForTimeout(900);
await raf(2);
const recallLater = await look();
console.log('RECALL', JSON.stringify({ start: { recall: recallStart?.recall, sec: recallStart?.recallSec, fill: recallStart?.recallFill }, later: { recall: recallLater?.recall, sec: recallLater?.recallSec, fill: recallLater?.recallFill } }));
if (!recallStart?.recall || !(recallStart.recallSec >= 1)) throw new Error(`recall timer hidden ${JSON.stringify(recallStart)}`);
if (!recallLater?.recall || !(recallLater.recallSec < recallStart.recallSec || recallLater.recallFill > recallStart.recallFill + 0.05)) {
  throw new Error(`recall did not count down ${JSON.stringify({ recallStart, recallLater })}`);
}

const box = await stickBox();
const at = { x: box.left + box.width / 2 + box.width * 0.34 * 0.9, y: box.top + box.height / 2 };
await touch('touchstart', at);
await raf(3);
const canceled = await look();
await touch('touchend', at);
await raf(2);
console.log('RECALL_CANCEL', JSON.stringify({ recall: canceled?.recall, sec: canceled?.recallSec }));
if (canceled?.recall) throw new Error(`recall survived the stick ${JSON.stringify(canceled)}`);

await press('#recall-btn');
await raf(2);
const channel = await look();
if (!channel?.recall) throw new Error('second recall did not start');
await page.waitForTimeout(4500);
await raf(3);
const done = await look();
console.log('PORTAL', JSON.stringify({ recall: done?.recall, portal: done?.portal, seen: done?.seen?.portal }));
if (!(done?.seen?.portal > 0)) throw new Error(`portal flash missing ${JSON.stringify(done)}`);

const geometry = await page.evaluate(() => globalThis.__geometry);
const from = await page.evaluate(() => (globalThis.__locoLog ?? []).length);
const runAt = { x: box.left + box.width / 2 + box.width * 0.34 * 0.9, y: box.top + box.height / 2 };
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
const runRows = await page.evaluate((start) => (globalThis.__locoLog ?? []).slice(start), from);
let dist = 0;
let time = 0;
for (let i = 1; i < runRows.length; i++) {
  dist += Math.hypot(runRows[i].x - runRows[i - 1].x, runRows[i].y - runRows[i - 1].y);
  time += runRows[i].dt;
}
const avg = frameTimes.reduce((sum, dt) => sum + dt, 0) / frameTimes.length;
const speed = time > 0 ? dist / time : 0;
const heights = [...new Set(runRows.map((row) => row.heroHeight))];
console.log(
  'RUN_5S',
  JSON.stringify({
    frames: frameTimes.length,
    avgFrameMs: Number(avg.toFixed(2)),
    fps: Number((1000 / avg).toFixed(1)),
    note: 'emulated rAF, not a device',
    speed: Number(speed.toFixed(1)),
    heroHeight: heights,
    geometry,
  }),
);
if (Math.abs(speed - 216) > 30) throw new Error(`run speed ${speed}`);
if (!heights.every((height) => height === 108)) throw new Error(`hero height ${heights}`);
if (geometry?.corridorTiles !== 5 || geometry?.gateTiles !== 6) throw new Error(`geometry ${JSON.stringify(geometry)}`);

await browser.close();
console.log('webkit look check passed');
