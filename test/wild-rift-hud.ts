// Item 7, Wild Rift HUD layout (Joseph t230u/t242u): pure corner layout + css mirror checks. No DOM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { CLASSES } from '../src/game/data/classes';
import { createMatch } from '../src/game/sim';
import { SIDE_SIZE } from '../src/game/teams';
import { HUD_CORNER, MINIMAP, hudCornerLayout, rectsOverlap, teamIconsHeight, teamIconsWidth, type Rect } from '../src/game/view';

// The team strip shows every allied champion except the player: SIDE_SIZE - 1 in a real match.
const ALLIES = SIDE_SIZE - 1;
for (const cls of Object.values(CLASSES)) {
  const sim = createMatch(sanctuary, cls, 1);
  const allies = sim.units.filter((u) => u.kind === 'champion' && u.team === 'ally' && u.id !== sim.playerId);
  assert.equal(allies.length, ALLIES, `${cls.id}: ${ALLIES} allies to show`);
  for (const u of allies) assert.ok(u.look, `${cls.id}: ally ${u.name} has a class look for its portrait`);
}
assert.equal(teamIconsWidth(3), 3 * HUD_CORNER.teamIcon + 2 * HUD_CORNER.teamSpacing);
assert.equal(teamIconsWidth(0), 0);

const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;

// Other HUD pieces this order does not move (measured from the build, css px).
function phoneFixed(w: number, h: number): Record<string, Rect> {
  return {
    stick: { x: 16, y: h - 106, w: 90, h: 90 },
    telemetry: { x: w / 2 - 65, y: 0, w: 130, h: 32 },
    topActions: { x: w - 92, y: 0, w: 92, h: 32 },
    belt: { x: w - 198, y: h - 194, w: 198, h: 194 },
    potions: { x: w - 228, y: h - 110, w: 44, h: 94 },
  };
}
function desktopFixed(w: number, h: number, side: number): Record<string, Rect> {
  return {
    heroPlate: { x: side + HUD_CORNER.teamGap + teamIconsWidth(ALLIES) + HUD_CORNER.barGap, y: 4, w: 196, h: 36 },
    topActions: { x: w - 218, y: 0, w: 218, h: 40 },
    belt: { x: w / 2 - 232, y: h - 150, w: 464, h: 150 },
  };
}

for (const [vw, vh, touch] of [[844, 390, true], [1280, 720, false], [932, 430, true], [1024, 640, false]] as const) {
  for (const want of [MINIMAP.minW, MINIMAP.defaultW, MINIMAP.maxW]) {
    const L = hudCornerLayout(vw, vh, want, touch, ALLIES);
    const tag = `${vw}x${vh}/${want}`;
    const mine = { minimap: L.minimap, gold: L.gold, settings: L.settings, team: L.team };
    for (const [k, r] of Object.entries(mine)) assert.ok(inside(r, vw, vh), `${tag}: ${k} on screen`);
    const keys = Object.keys(mine) as (keyof typeof mine)[];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) assert.ok(!rectsOverlap(mine[keys[i]], mine[keys[j]]), `${tag}: ${keys[i]} x ${keys[j]}`);
    }
    const fixed = touch ? phoneFixed(vw, vh) : desktopFixed(vw, vh, L.minimap.w);
    for (const [k, r] of Object.entries(mine)) {
      for (const [f, fr] of Object.entries(fixed)) assert.ok(!rectsOverlap(r, fr), `${tag}: ${k} clear of ${f}`);
    }
    // Item 2: tucked into the top-left corner.
    assert.equal(L.minimap.x, 0);
    assert.equal(L.minimap.y, 0);
    // Item 1: gold box on the left side, right under the card.
    assert.equal(L.gold.y, L.minimap.y + L.minimap.h + MINIMAP.goldGap);
    assert.ok(L.gold.x < L.minimap.x + L.minimap.w / 2, 'gold on the left side');
    // Item 3: cog right of the card, centred on its right side (or just under the ally icons on a small card).
    assert.equal(L.settings.x, L.minimap.x + L.minimap.w + HUD_CORNER.gearGap);
    const mid = L.minimap.y + L.minimap.h / 2;
    assert.ok(Math.abs(L.settings.y + L.settings.h / 2 - mid) < 1e-9 || L.settings.y === L.team.y + L.team.h + 6, `${tag}: cog midway`);
    assert.ok(L.settings.y + L.settings.h <= L.minimap.y + L.minimap.h, `${tag}: cog within the card's height`);
    // Item 4: ally icons top row, right of the card.
    assert.ok(L.team.x >= L.minimap.x + L.minimap.w && L.team.y < 10, `${tag}: allies top, right of the map`);
    if (touch) assert.ok(L.gold.y + L.gold.h + MINIMAP.stickGap <= vh - MINIMAP.stickTop, `${tag}: gold above the stick`);
  }
}
const phone = hudCornerLayout(844, 390, MINIMAP.defaultW, true, ALLIES);
assert.equal(phone.minimap.w, MINIMAP.defaultW, 'default card size unchanged on the phone');
assert.equal(hudCornerLayout(1280, 720, MINIMAP.defaultW, false, ALLIES).minimap.w, MINIMAP.defaultW, 'and on desktop');
// A notch inset moves the corner pieces in with it.
const notch = hudCornerLayout(844, 390, MINIMAP.defaultW, true, ALLIES, { top: 0, left: 44, bottom: 21 });
assert.equal(notch.minimap.x, 44);
assert.equal(notch.gold.x, 50);

// ---- css mirrors the constants ----------------------------------------------------------------------------
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const rule = (sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  assert.ok(at >= 0, `css has ${sel}`);
  const body = css.slice(at + 1);
  return body.slice(0, body.indexOf('}'));
};
const mini = rule('#minimap-toggle');
assert.ok(mini.includes(`top: max(${MINIMAP.touchTop}px`) && mini.includes(`left: max(${MINIMAP.touchLeft}px`), 'desktop card in the top-left corner');
assert.ok(!/\bright: 8px/.test(mini), 'desktop card left the top-right corner');
assert.ok(mini.includes(`max-width: calc(100vh - ${HUD_CORNER.desktopBelow}px)`));
const gold = rule('#gold-badge');
assert.ok(gold.includes(`width: ${HUD_CORNER.goldW}px`) && gold.includes(`height: ${MINIMAP.goldH}px`));
assert.ok(gold.includes(`left: calc(${HUD_CORNER.goldLeft}px`));
const gear = rule('#settings-btn');
assert.ok(gear.includes(`var(--mini-side) + ${HUD_CORNER.gearGap}px)`), 'cog left of the card + gearGap');
assert.ok(gear.includes(`var(--mini-side) / 2 - ${HUD_CORNER.gearSize / 2}px`), 'cog centred on the card side');
assert.ok(gear.includes(`${HUD_CORNER.teamTop + teamIconsHeight() + 6}px`), 'cog floor under the ally icons');
assert.ok(gear.includes(`width: ${HUD_CORNER.gearSize}px`) && gear.includes(`height: ${HUD_CORNER.gearSize}px`));
const team = rule('#team-icons');
assert.ok(team.includes(`var(--mini-side) + ${HUD_CORNER.teamGap}px)`) && team.includes(`top: calc(${HUD_CORNER.teamTop}px`));
assert.ok(team.includes(`gap: ${HUD_CORNER.teamSpacing}px`));
assert.ok(css.includes(`#team-icons canvas {\n  width: ${HUD_CORNER.teamIcon}px;\n  height: ${HUD_CORNER.teamIcon}px;`));
assert.ok(css.includes(`height: ${HUD_CORNER.teamBarH}px;`));
const bar = rule('#topbar');
assert.ok(bar.includes(`var(--mini-side) + ${HUD_CORNER.teamGap}px + var(--team-w, ${teamIconsWidth(ALLIES)}px) + ${HUD_CORNER.barGap}px)`), 'desktop bar clears the corner');
// The settings button moved out of the top bar to sit beside the minimap.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const topbar = html.slice(html.indexOf('<header id="topbar">'), html.indexOf('</header>'));
assert.ok(!topbar.includes('settings-btn'), 'cog no longer in the top bar');
assert.ok(html.includes('id="settings-btn"') && html.includes('id="team-icons"'));
assert.ok(/id="gold-badge"[\s\S]*class="coins"[\s\S]*id="gold"/.test(html), 'gold box = coin icon + number');

console.log('wild-rift-hud: ok');
