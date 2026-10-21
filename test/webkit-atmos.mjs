/**
 * Atmosphere check. WebKit iPhone 14 Pro Max landscape (device dpr 3) and
 * Chromium Pixel 7 landscape. Playwright stays outside package.json.
 * Headless rAF timing is the emulator, not a phone.
 *
 * FPS before this pass, same WebKit harness on this machine (PR #32, cap 2):
 * frames 116, avgFrameMs 43.14, fps 23.2, backing 1864x860.
 */
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PLAYWRIGHT_ROOT ?? '/tmp/pw'}/package.json`);
const { webkit, chromium, devices } = require('playwright');

const base = process.env.ATMOS_URL ?? 'http://127.0.0.1:5181/sanctuary-arena/?atmoslog=1&sticklog=1';

const WEBKIT_RECTS = {
  'minimap-toggle': [820, 0, 932, 40, 112, 40],
  '0': [790, 366, 838, 414, 48, 48],
  '1': [798, 310, 846, 358, 48, 48],
  '2': [836, 244, 884, 292, 48, 48],
  '3': [868, 296, 916, 344, 48, 48],
  'attack-btn': [852, 350, 924, 422, 72, 72],
  'potion-hp': [726, 320, 770, 364, 44, 44],
  'potion-mp': [726, 370, 770, 414, 44, 44],
};

const PIXEL_RECTS = {
  'minimap-toggle': [727, 0, 839, 40, 112, 40],
  '0': [697, 348, 745, 396, 48, 48],
  '1': [705, 292, 753, 340, 48, 48],
  '2': [743, 226, 791, 274, 48, 48],
  '3': [775, 278, 823, 326, 48, 48],
  'attack-btn': [759, 332, 831, 404, 72, 72],
  'potion-hp': [633, 302, 677, 346, 44, 44],
  'potion-mp': [633, 352, 677, 396, 44, 44],
};

function expect(ok, message) {
  if (!ok) throw new Error(message);
}

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('PAGEERROR', error.message);
  });
  await page.addInitScript(() => {
    const orig = Document.prototype.createElement;
    let created = 0;
    Document.prototype.createElement = function createElement(tag, options) {
      if (String(tag).toLowerCase() === 'canvas') created += 1;
      return orig.call(this, tag, options);
    };
    Object.defineProperty(globalThis, '__canvasCreates', { get: () => created });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#play-btn');
  await page.waitForFunction(() => document.body.classList.contains('touch'));
  await page.locator('#play-btn').click();
  await page.waitForFunction(() => {
    const hud = document.querySelector('#hud');
    return !!hud && !hud.hidden;
  });
  await page.waitForTimeout(250);
  return errors;
}

async function raf(page, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  }
}

async function touch(page, type, at, id = 1, target = '#view') {
  await page.evaluate(
    ({ type, at, id, target }) => {
      const node = document.querySelector(target);
      const end = type === 'touchend' || type === 'touchcancel';
      const item = { identifier: id, clientX: at.x, clientY: at.y, pageX: at.x, pageY: at.y, target: node };
      const event = new Event(type, { bubbles: true, cancelable: true });
      event.touches = end ? [] : [item];
      event.targetTouches = event.touches;
      event.changedTouches = [item];
      node.dispatchEvent(event);
      const pointerType = type === 'touchstart' ? 'pointerdown' : type === 'touchmove' ? 'pointermove' : 'pointerup';
      node.dispatchEvent(
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
    { type, at, id, target },
  );
}

function keyOf(button) {
  if (button.slot !== '') return button.slot;
  return button.id;
}

async function layout(page, label, expected) {
  const buttons = await page.evaluate(() => {
    const names = ['#attack-btn', '#potion-hp', '#potion-mp', '#minimap-toggle', '.skill'];
    return [...document.querySelectorAll(names.join(','))].map((node) => {
      const r = node.getBoundingClientRect();
      return {
        id: node.id || '',
        slot: node.dataset?.slot ?? '',
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    });
  });
  console.log(label, 'RECTS', JSON.stringify(buttons));
  for (const button of buttons) {
    const want = expected[keyOf(button)];
    expect(!!want, `${label} unexpected control ${keyOf(button)}`);
    const got = [button.left, button.top, button.right, button.bottom, button.width, button.height];
    for (let i = 0; i < want.length; i++) {
      expect(Math.abs(got[i] - want[i]) < 1, `${label} ${keyOf(button)} [${got}] wanted [${want}]`);
    }
  }
  expect(buttons.length === Object.keys(expected).length, `${label} control count ${buttons.length}`);
}

async function fonts(page, label) {
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('700 16px "Cinzel Decorative"');
    await document.fonts.load('16px Metamorphous');
    await document.fonts.ready;
    return {
      cinzel: document.fonts.check('700 16px "Cinzel Decorative"'),
      metamorph: document.fonts.check('16px Metamorphous'),
      label: !!document.querySelector('.d2-text'),
      item: !!document.querySelector('#item-tags') && !!getComputedStyle(document.querySelector('#item-tags')).pointerEvents,
    };
  });
  console.log(label, 'FONTS', JSON.stringify(loaded));
  expect(loaded.cinzel && loaded.metamorph, `${label} fonts ${JSON.stringify(loaded)}`);
}

async function fps(page) {
  const anchor = { x: 160, y: 240 };
  const before = await page.evaluate(() => ({
    creates: globalThis.__canvasCreates,
    light: globalThis.__atmosCtl.probe().lightAlloc,
  }));
  await touch(page, 'touchstart', anchor, 4);
  await touch(page, 'touchmove', { x: anchor.x + 40.5, y: anchor.y }, 4);
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
  await touch(page, 'touchend', anchor, 4);
  const after = await page.evaluate(() => {
    const canvas = document.querySelector('#view');
    const rect = canvas.getBoundingClientRect();
    return {
      creates: globalThis.__canvasCreates,
      light: globalThis.__atmosCtl.probe().lightAlloc,
      ambient: globalThis.__atmosCtl.probe().ambientAlpha,
      cssW: rect.width,
      cssH: rect.height,
      w: canvas.width,
      h: canvas.height,
    };
  });
  const avg = frameTimes.reduce((sum, dt) => sum + dt, 0) / frameTimes.length;
  const result = {
    frames: frameTimes.length,
    avgFrameMs: Number(avg.toFixed(2)),
    fps: Number((1000 / avg).toFixed(1)),
    css: `${after.cssW}x${after.cssH}`,
    backing: `${after.w}x${after.h}`,
    lightBefore: before.light,
    lightAfter: after.light,
    canvasBefore: before.creates,
    canvasAfter: after.creates,
    ambient: after.ambient,
  };
  console.log('FPS_AFTER', JSON.stringify(result));
  expect(after.light === before.light && after.light >= 1, `light buffer realloc ${JSON.stringify(result)}`);
  expect(after.ambient === 0.88, `ambient ${after.ambient}`);
  const idle = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = globalThis.__canvasCreates;
        const light = globalThis.__atmosCtl.probe().lightAlloc;
        let n = 0;
        const tick = () => {
          n += 1;
          if (n < 20) requestAnimationFrame(tick);
          else resolve({ start, light, end: globalThis.__canvasCreates, lightEnd: globalThis.__atmosCtl.probe().lightAlloc });
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log('CANVAS_IDLE', JSON.stringify(idle));
  expect(idle.end === idle.start && idle.lightEnd === idle.light, `per-frame canvas ${JSON.stringify(idle)}`);
  return result;
}

function delta(a, b) {
  if (!a || !b) return 999;
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

async function blood(page, label) {
  const spot = await page.evaluate(() => globalThis.__atmosCtl.nearest());
  expect(!!spot, `${label} no enemy minion`);
  const before = await page.evaluate((point) => globalThis.__atmosCtl.sampleMap(point.x, point.y), spot);
  const killed = await page.evaluate(() => globalThis.__atmosCtl.killNearest());
  expect(!!killed, `${label} kill failed`);
  await raf(page, 4);
  const mid = await page.evaluate((point) => ({
    pixel: globalThis.__atmosCtl.sampleMap(point.x, point.y),
    blood: globalThis.__atmosCtl.probe().blood,
  }), spot);
  await raf(page, 10);
  const later = await page.evaluate((point) => globalThis.__atmosCtl.sampleMap(point.x, point.y), spot);
  console.log(label, 'BLOOD', JSON.stringify({ before, mid, later, spot }));
  expect(delta(before, mid.pixel) > 30, `${label} blood did not change the map`);
  expect(delta(mid.pixel, later) === 0, `${label} blood did not persist`);
  expect(mid.blood > 0, `${label} blood stamp count`);
}

async function flash(page, label) {
  await raf(page, 2);
  const hero = await page.evaluate(() => globalThis.__atmosCtl.probe().hero);
  expect(!!hero, `${label} hero screen missing`);
  const outside = { x: hero.x + Math.max(40, hero.h * 0.7), y: hero.y - 6 };
  const torso = { x: hero.x, y: hero.y - hero.h * 0.45 };
  const before = await page.evaluate(
    ({ outside, torso }) => ({
      outside: globalThis.__atmosCtl.sampleView(outside.x, outside.y),
      torso: globalThis.__atmosCtl.sampleView(torso.x, torso.y),
    }),
    { outside, torso },
  );
  await page.evaluate(() => globalThis.__atmosCtl.setHitFlash());
  await raf(page, 1);
  const after = await page.evaluate(
    ({ outside, torso }) => ({
      outside: globalThis.__atmosCtl.sampleView(outside.x, outside.y),
      torso: globalThis.__atmosCtl.sampleView(torso.x, torso.y),
      creates: globalThis.__canvasCreates,
    }),
    { outside, torso },
  );
  await raf(page, 6);
  const settled = await page.evaluate(() => globalThis.__canvasCreates);
  console.log(label, 'FLASH', JSON.stringify({ hero, outside, torso, before, after, settled }));
  expect(delta(before.outside, after.outside) < 40, `${label} flash tinted outside the unit`);
  expect(delta(before.torso, after.torso) > 40, `${label} flash missed the silhouette`);
  expect(settled === after.creates, `${label} flash canvas allocated again`);
}

async function drops(page, label) {
  const info = await page.evaluate(() => ({
    drops: globalThis.__atmosCtl.probe().drops,
    itemClass: !!document.querySelector('style, link') && getComputedStyle(document.body).pointerEvents !== undefined,
  }));
  const css = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'd2-item-label';
    probe.style.position = 'absolute';
    probe.style.left = '-999px';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const result = { bg: style.backgroundColor, pe: style.pointerEvents, font: style.fontFamily };
    probe.remove();
    return result;
  });
  console.log(label, 'DROPS', JSON.stringify({ drops: info.drops, css, groundDrops: info.drops === 0 ? 'none' : 'present' }));
  expect(info.drops === 0, `${label} unexpected ground drops ${info.drops}`);
  expect(css.pe === 'none', `${label} item label pointer events ${css.pe}`);
}

async function run(browserType, contextOptions, label, rects, measureFps) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = await boot(page);
  await layout(page, label, rects);
  await fonts(page, label);
  if (measureFps) await fps(page);
  else {
    await raf(page, 8);
    const stable = await page.evaluate(async () => {
      const a = { creates: globalThis.__canvasCreates, light: globalThis.__atmosCtl.probe().lightAlloc };
      await new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          n += 1;
          if (n < 20) requestAnimationFrame(tick);
          else resolve(undefined);
        };
        requestAnimationFrame(tick);
      });
      return { before: a, after: { creates: globalThis.__canvasCreates, light: globalThis.__atmosCtl.probe().lightAlloc } };
    });
    console.log(label, 'LIGHT', JSON.stringify(stable));
    expect(stable.before.light === stable.after.light && stable.before.light >= 1, `${label} light realloc`);
    expect(stable.before.creates === stable.after.creates, `${label} per-frame canvas`);
  }
  await blood(page, label);
  await flash(page, label);
  await drops(page, label);
  expect(errors.length === 0, `${label} page errors ${errors.join(' | ')}`);
  await browser.close();
}

const iphone = devices['iPhone 14 Pro Max'];
const pixel = devices['Pixel 7'];

await run(
  webkit,
  {
    ...iphone,
    viewport: { width: 932, height: 430 },
    screen: { width: 932, height: 430 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  'WEBKIT',
  WEBKIT_RECTS,
  true,
);

await run(
  chromium,
  {
    ...pixel,
    viewport: { width: pixel.viewport.height, height: pixel.viewport.width },
    screen: { width: pixel.viewport.height, height: pixel.viewport.width },
    isMobile: true,
    hasTouch: true,
  },
  'PIXEL',
  PIXEL_RECTS,
  false,
);

console.log('atmosphere check passed');
