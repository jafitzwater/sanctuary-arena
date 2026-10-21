/**
 * Mobile HUD check. WebKit iPhone 14 Pro Max landscape (device dpr 3) and
 * Chromium Pixel 7 landscape. Playwright stays outside package.json.
 * Headless rAF timing is the emulator, not a phone.
 *
 * FPS before this change, same WebKit harness on this machine (DPR cap 3):
 * frames 99, avgFrameMs 50.88, fps 19.7, backing 2796x1290.
 */
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PLAYWRIGHT_ROOT ?? '/tmp/pw'}/package.json`);
const { webkit, chromium, devices } = require('playwright');

const base = process.env.STICK_URL ?? 'http://127.0.0.1:5181/sanctuary-arena/?sticklog=1&aimlog=1';

function expect(ok, message) {
  if (!ok) throw new Error(message);
}

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('PAGEERROR', error.message);
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#play-btn');
  await page.evaluate(() => {
    globalThis.__leakedClicks = 0;
    document.querySelector('#view').addEventListener(
      'click',
      (event) => {
        if (!event.defaultPrevented) globalThis.__leakedClicks += 1;
      },
      true,
    );
  });
  await page.waitForFunction(() => document.body.classList.contains('touch'));
  await page.locator('#play-btn').click();
  await page.waitForFunction(() => {
    const hud = document.querySelector('#hud');
    return !!hud && !hud.hidden;
  });
  await page.waitForTimeout(200);
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

function overlaps(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 1 && h > 1;
}

async function layout(page, label) {
  const info = await page.evaluate(() => {
    const names = ['#attack-btn', '#potion-hp', '#potion-mp', '#minimap-toggle', '.skill'];
    const nodes = [...document.querySelectorAll(names.join(','))];
    const view = document.documentElement.getBoundingClientRect();
    const overlay = document.querySelector('.mobile-hud-overlay').getBoundingClientRect();
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return {
        id: node.id || node.getAttribute('aria-label') || node.className,
        slot: node.dataset?.slot ?? '',
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    return {
      view: { width: view.width, height: view.height },
      overlay: { left: overlay.left, top: overlay.top, right: overlay.right, bottom: overlay.bottom },
      buttons: nodes.map(box),
      attack: box(document.querySelector('#attack-btn')),
      css: getComputedStyle(document.querySelector('.mobile-hud-overlay')).padding,
      fixed: getComputedStyle(document.documentElement).position,
      overflow: getComputedStyle(document.body).overflow,
      touchAction: getComputedStyle(document.body).touchAction,
      background: getComputedStyle(document.body).backgroundColor,
    };
  });
  const outside = info.buttons.filter(
    (b) => b.left < info.view.left - 0.5 || b.top < info.view.top - 0.5 || b.right > info.view.width + 0.5 || b.bottom > info.view.height + 0.5,
  );
  const hits = [];
  for (let i = 0; i < info.buttons.length; i++) {
    for (let j = i + 1; j < info.buttons.length; j++) {
      if (overlaps(info.buttons[i], info.buttons[j])) hits.push([info.buttons[i].id || info.buttons[i].slot, info.buttons[j].id || info.buttons[j].slot]);
    }
  }
  console.log(label, 'LAYOUT', JSON.stringify({ outside, hits, attack: info.attack, padding: info.css, fixed: info.fixed, overflow: info.overflow, touchAction: info.touchAction, background: info.background, buttons: info.buttons }));
  expect(outside.length === 0, `${label} buttons outside the viewport ${JSON.stringify(outside)}`);
  expect(hits.length === 0, `${label} overlapping buttons ${JSON.stringify(hits)}`);
  expect(Math.round(info.attack.width) === 72 && Math.round(info.attack.height) === 72, `${label} attack size ${info.attack.width}`);
  return info;
}

async function stickAndAim(page, label) {
  const a = { x: 140, y: 220 };
  const b = { x: 280, y: 300 };
  await touch(page, 'touchstart', a, 1);
  await raf(page, 2);
  const first = await page.evaluate(() => {
    const stick = document.querySelector('#stick');
    const rect = stick.getBoundingClientRect();
    return {
      display: getComputedStyle(stick).display,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      width: rect.width,
      trace: globalThis.__inputTrace,
    };
  });
  console.log(label, 'STICK_A', JSON.stringify(first));
  expect(first.display === 'block', `${label} stick hidden at first anchor`);
  expect(Math.abs(first.cx - a.x) < 1.5 && Math.abs(first.cy - a.y) < 1.5, `${label} stick A center ${first.cx},${first.cy}`);
  expect(first.trace?.radius === 45 && first.trace.engaged && first.trace.dest === false, `${label} stick A trace ${JSON.stringify(first.trace)}`);

  const held = { x: a.x + 40.5, y: a.y };
  await touch(page, 'touchmove', held, 1);
  const attack = await page.evaluate(() => {
    const node = document.querySelector('#attack-btn');
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await touch(page, 'touchstart', attack, 2, '#attack-btn');
  await raf(page, 3);
  const both = await page.evaluate(() => globalThis.__inputTrace);
  console.log(label, 'MULTI', JSON.stringify({ attack, both }));
  expect(both?.engaged && both.attack && both.tilt > 0.8 && both.dest === false, `${label} multi-touch ${JSON.stringify(both)}`);

  const during = await page.evaluate(() => {
    const stick = document.querySelector('#stick').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#attack-btn, .skill, #potion-hp, #potion-mp')].map((node) => node.getBoundingClientRect());
    const hit = buttons.some((rect) => {
      const w = Math.min(stick.right, rect.right) - Math.max(stick.left, rect.left);
      const h = Math.min(stick.bottom, rect.bottom) - Math.max(stick.top, rect.top);
      return w > 1 && h > 1;
    });
    return hit;
  });
  expect(!during, `${label} stick overlaps a button`);

  await touch(page, 'touchend', attack, 2, '#attack-btn');
  await touch(page, 'touchend', held, 1);
  await raf(page, 2);
  const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('#stick')).display);
  expect(hidden === 'none', `${label} stick stayed visible`);

  await touch(page, 'touchstart', b, 3);
  await raf(page, 1);
  const second = await page.evaluate(() => {
    const rect = document.querySelector('#stick').getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, trace: globalThis.__inputTrace };
  });
  console.log(label, 'STICK_B', JSON.stringify(second));
  expect(Math.abs(second.cx - b.x) < 1.5 && Math.abs(second.cy - b.y) < 1.5, `${label} stick B center ${second.cx},${second.cy}`);
  await touch(page, 'touchend', b, 3);
  await page.evaluate(() => {
    document.querySelector('#view').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 160, clientY: 240 }));
  });
  const leaked = await page.evaluate(() => globalThis.__leakedClicks);
  console.log(label, 'SYNTHETIC_CLICKS', leaked);
  expect(leaked === 0, `${label} synthetic clicks ${leaked}`);

  const aim = await page.evaluate(() => {
    const hero = { x: 0, y: 0, team: 'ally' };
    const champion = { id: 1, x: 80, y: 0, radius: 16, hp: 100, alive: true, team: 'enemy', kind: 'champion' };
    const minion = { id: 2, x: 50, y: 0, radius: 12, hp: 10, alive: true, team: 'enemy', kind: 'minion' };
    const low = { ...champion, id: 3, hp: 30 };
    const high = { ...champion, id: 4, hp: 80 };
    const fn = globalThis.getAutoTarget;
    return {
      heroOverMinion: fn([champion, minion], hero, 100)?.id,
      lowestHp: fn([high, low], hero, 100)?.id,
    };
  });
  console.log(label, 'AUTO', JSON.stringify(aim));
  expect(aim.heroOverMinion === 1 && aim.lowestHp === 3, `${label} auto target ${JSON.stringify(aim)}`);

  const q = await page.evaluate(() => {
    const node = document.querySelector('.skill');
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.evaluate(
    ({ q }) => {
      const node = document.querySelector('.skill');
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', clientX: q.x, clientY: q.y, button: 0, buttons: 1 }));
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', clientX: q.x, clientY: q.y, button: 0 }));
    },
    { q },
  );
  await raf(page, 2);
  const tap = await page.evaluate(() => globalThis.__aim);
  console.log(label, 'TAP', JSON.stringify(tap));
  expect(tap?.cast?.mode === 'tap' && tap.cast.id === 'bash' && tap.canceled === false, `${label} tap cast ${JSON.stringify(tap)}`);

  const dragTo = { x: q.x - 70, y: q.y - 40 };
  await page.evaluate(
    ({ q, dragTo }) => {
      const node = document.querySelector('.skill');
      const fire = (type, at, buttons) =>
        node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: at.x, clientY: at.y, button: 0, buttons }));
      fire('pointerdown', q, 1);
      fire('pointermove', dragTo, 1);
      globalThis.__cursorMid = document.querySelector('#aim-cursor').classList.contains('on');
      fire('pointerup', dragTo, 0);
    },
    { q, dragTo },
  );
  await raf(page, 2);
  const dragged = await page.evaluate(() => ({ cursorMid: globalThis.__cursorMid, aim: globalThis.__aim }));
  console.log(label, 'DRAG', JSON.stringify(dragged));
  expect(dragged.cursorMid === true, `${label} cursor hidden during drag`);
  expect(dragged.aim?.cast?.mode === 'aim' && Math.abs(dragged.aim.cast.clientX - dragTo.x) < 1, `${label} drag cast ${JSON.stringify(dragged.aim)}`);

  await page.evaluate(
    ({ q, dragTo }) => {
      const node = document.querySelector('.skill');
      const fire = (type, at, buttons) =>
        node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 10, pointerType: 'touch', clientX: at.x, clientY: at.y, button: 0, buttons }));
      fire('pointerdown', q, 1);
      fire('pointermove', dragTo, 1);
      fire('pointermove', q, 1);
      fire('pointerup', q, 0);
    },
    { q, dragTo },
  );
  await raf(page, 1);
  const canceled = await page.evaluate(() => globalThis.__aim);
  console.log(label, 'CANCEL', JSON.stringify(canceled));
  expect(canceled?.canceled === true && canceled.cast == null, `${label} cancel ${JSON.stringify(canceled)}`);

  await page.evaluate(() => globalThis.__aimSim.setBelt(3, 'leap-attack'));
  await raf(page, 2);
  const leap = await page.evaluate(() => {
    const node = document.querySelector('[data-slot="3"]');
    const rect = node.getBoundingClientRect();
    const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const to = { x: from.x - 90, y: from.y - 70 };
    const fire = (type, at, buttons) =>
      node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', clientX: at.x, clientY: at.y, button: 0, buttons }));
    fire('pointerdown', from, 1);
    fire('pointermove', to, 1);
    fire('pointerup', to, 0);
    return { from, to, cast: node.dataset.cast };
  });
  await raf(page, 3);
  const leaped = await page.evaluate(() => ({ aim: globalThis.__aim, leap: globalThis.__aimSim.leap() }));
  console.log(label, 'LEAP', JSON.stringify({ leap, leaped }));
  expect(leap.cast === 'leap-attack', `${label} leap not on the belt`);
  expect(leaped.aim?.cast?.id === 'leap-attack' && leaped.aim.cast.mode === 'aim', `${label} leap aim ${JSON.stringify(leaped.aim)}`);
  expect(leaped.leap != null, `${label} leap did not leave the ground`);
}

async function backingAndAudio(page, label) {
  const canvas = await page.evaluate(() => {
    const node = document.querySelector('#view');
    const rect = node.getBoundingClientRect();
    const ctx = node.getContext('2d');
    return {
      cssW: rect.width,
      cssH: rect.height,
      backingW: node.width,
      backingH: node.height,
      dpr: window.devicePixelRatio,
      ratioW: node.width / rect.width,
      imageRendering: node.style.imageRendering,
      smoothing: ctx.imageSmoothingEnabled,
      audio: globalThis.__audioState ?? 'missing',
    };
  });
  console.log(label, 'CANVAS', JSON.stringify(canvas));
  expect(Math.abs(canvas.backingW - Math.round(canvas.cssW * 2)) < 1, `${label} backing width ${canvas.backingW} css ${canvas.cssW}`);
  expect(Math.abs(canvas.backingH - Math.round(canvas.cssH * 2)) < 1, `${label} backing height ${canvas.backingH}`);
  expect(canvas.imageRendering === 'pixelated' && canvas.smoothing === false, `${label} smoothing ${JSON.stringify(canvas)}`);
  expect(canvas.audio === 'running', `${label} audio ${canvas.audio}`);
  return canvas;
}

async function fps(page) {
  const anchor = { x: 160, y: 240 };
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
  const avg = frameTimes.reduce((sum, dt) => sum + dt, 0) / frameTimes.length;
  const after = {
    frames: frameTimes.length,
    avgFrameMs: Number(avg.toFixed(2)),
    fps: Number((1000 / avg).toFixed(1)),
    note: 'emulated rAF, not a device',
  };
  console.log(
    'FPS_BEFORE',
    JSON.stringify({ frames: 99, avgFrameMs: 50.88, fps: 19.7, backing: '2796x1290', dprCap: 3, note: 'same WebKit harness on this machine before the cap-2 change' }),
  );
  console.log('FPS_AFTER', JSON.stringify(after));
  return after;
}

const iphone = devices['iPhone 14 Pro Max'];
const pixel = devices['Pixel 7'];

const web = await webkit.launch({ headless: true });
const webContext = await web.newContext({
  ...iphone,
  viewport: { width: 932, height: 430 },
  screen: { width: 932, height: 430 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const webPage = await webContext.newPage();
const webErrors = await boot(webPage);
await layout(webPage, 'WEBKIT');
await fps(webPage);
await stickAndAim(webPage, 'WEBKIT');
await backingAndAudio(webPage, 'WEBKIT');
expect(webErrors.length === 0, `webkit page errors ${webErrors.join(' | ')}`);
await web.close();

const chrome = await chromium.launch({ headless: true });
const pixelContext = await chrome.newContext({
  ...pixel,
  viewport: { width: pixel.viewport.height, height: pixel.viewport.width },
  screen: { width: pixel.viewport.height, height: pixel.viewport.width },
  isMobile: true,
  hasTouch: true,
});
const pixelPage = await pixelContext.newPage();
const pixelErrors = await boot(pixelPage);
await layout(pixelPage, 'PIXEL');
await stickAndAim(pixelPage, 'PIXEL');
await backingAndAudio(pixelPage, 'PIXEL');
expect(pixelErrors.length === 0, `pixel page errors ${pixelErrors.join(' | ')}`);
await chrome.close();
console.log('mobile hud check passed');
