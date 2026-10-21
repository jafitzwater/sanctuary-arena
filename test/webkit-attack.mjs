/**
 * Attack cycle on WebKit, iPhone 14 Pro Max, landscape, dpr 3.
 * Run: node test/webkit-attack.mjs
 * Playwright stays off package.json. Headless rAF is not a phone.
 */
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PLAYWRIGHT_ROOT ?? '/tmp/pw'}/package.json`);
const { webkit, devices } = require('playwright');

const base = process.env.STICK_URL ?? 'http://127.0.0.1:5181/sanctuary-arena/?attacklog=1&sticklog=1';
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
  const attack = document.querySelector('#attack-btn');
  if (!stick || !attack) return false;
  return stick.getBoundingClientRect().width > 40 && attack.getBoundingClientRect().width > 20;
});

async function raf(times = 1) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  }
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

function gaps(rows) {
  const fires = rows.filter((row) => row.event === 'AttackFired');
  const out = [];
  for (let i = 1; i < fires.length; i++) out.push(Number((fires[i].t - fires[i - 1].t).toFixed(3)));
  return { fires: fires.length, gaps: out };
}

async function log() {
  return page.evaluate(() => globalThis.__attackLog ?? []);
}

await attackDown();
await page.waitForTimeout(3200);
await attackUp();
await raf(2);
const standing = gaps(await log());
console.log('STANDING', JSON.stringify(standing));

await page.evaluate(() => {
  globalThis.__attackLog = [];
});
await page.waitForTimeout(700);
await attackDown();
await raf(1);
const box = await stickBox();
const max = box.width * 0.34;
const at = { x: box.left + box.width / 2 + max * 0.9, y: box.top + box.height / 2 };
await touch('touchstart', at);
await raf(3);
await touch('touchend', at);
await attackUp();
await raf(2);
const windup = await log();
console.log('WINDUP_CANCEL', JSON.stringify(windup));

await page.evaluate(() => {
  globalThis.__attackLog = [];
});
await page.waitForTimeout(200);
await attackDown();
await page.waitForFunction(() => (globalThis.__attackLog ?? []).some((row) => row.event === 'AttackFired'), null, {
  timeout: 2000,
});
await touch('touchstart', at);
await raf(3);
await touch('touchend', at);
await attackUp();
await raf(1);
const backswing = await log();
console.log('BACKSWING_MOVE', JSON.stringify(backswing));

await page.evaluate(() => {
  globalThis.__attackLog = [];
});
await page.waitForTimeout(800);
await attackDown();
const started = Date.now();
while (Date.now() - started < 3200) {
  const phase = await page.evaluate(() => {
    const rows = globalThis.__attackLog ?? [];
    return rows.length ? rows[rows.length - 1].phase : '';
  });
  if (phase === 'Backswing') {
    await touch('touchstart', at);
    await raf(2);
    await touch('touchend', at);
  }
  await raf(1);
}
await attackUp();
const orb = gaps(await log());
console.log('ORB', JSON.stringify(orb));

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
const standMean = mean(standing.gaps);
const orbMean = mean(orb.gaps);
console.log('DPS', JSON.stringify({ standMean, orbMean, interval: 0.78 }));

const windupTry = windup.slice(Math.max(0, windup.map((row) => row.event).lastIndexOf('AttackStarted')));
const windupFired = windupTry.some((row) => row.event === 'AttackFired');
const windupCanceled = windupTry.some((row) => row.event === 'AttackCanceled' && row.reason === 'move');
const windupMoved = new Set(windupTry.map((row) => row.x)).size > 1;
const backFired = backswing.some((row) => row.event === 'AttackFired');
const backMoved = backswing.some((row) => row.event === 'BackswingCanceled') || backswing.some((row, index) => index > 0 && row.x !== backswing[0].x);
const backCd = backswing.some((row) => row.event === 'BackswingCanceled' && row.cooldownMs > 0);

if (!standing.gaps.length || standing.gaps.some((gap) => Math.abs(gap - 0.78) > 0.08)) {
  throw new Error(`standing gaps ${standing.gaps}`);
}
if (windupFired || !windupCanceled || !windupMoved) throw new Error(`windup cancel ${JSON.stringify(windup)}`);
if (!backFired || !backMoved || !backCd) throw new Error(`backswing ${JSON.stringify(backswing)}`);
if (!orb.gaps.length || Math.abs(orbMean - standMean) > 0.08) throw new Error(`orb ${orbMean} vs ${standMean}`);

await browser.close();
console.log('webkit attack check passed');
