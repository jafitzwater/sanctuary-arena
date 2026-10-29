// Four UI/size changes (Joseph t250u): nameplate bars + badge, champion sprite scale, minimap icons, ability buttons.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BADGE_RIM, FRAME, xpRingRadius } from '../src/game/unitFrame';
import { CHAMPION_SPRITE_SCALE, ICONS, MINIMAP_ICON_SHADE, championSpriteScale } from '../src/game/view';

// 1. Nameplates: hp 12, mana 8, level circle 36 px diameter, 2 px XP ring fully inside the circle.
assert.equal(FRAME.hp, 12);
assert.equal(FRAME.mana, 8);
assert.equal(FRAME.circle * 2, 36, 'level circle diameter 36');
assert.equal(FRAME.ring, 2, 'XP ring 2 px thick');
const ringOuter = xpRingRadius() + FRAME.ring / 2;
assert.ok(ringOuter <= FRAME.circle - BADGE_RIM, `ring outer edge ${ringOuter} inside the rim`);
assert.ok(xpRingRadius() - FRAME.ring / 2 > 0);

// 2. Champion sprites x1.15; minions, towers, bases, seals unchanged.
assert.equal(CHAMPION_SPRITE_SCALE, 1.15);
assert.equal(championSpriteScale('champion'), 1.15);
for (const kind of ['minion', 'tower', 'base', 'seal']) assert.equal(championSpriteScale(kind), 1, kind);

// 3. Minimap icons restored to pre-#84 sizes [JOSEPH t255u]; 20% dark layer under icons kept.
assert.equal(ICONS.nexus, 13);
assert.equal(ICONS.guardTower, 8);
assert.equal(ICONS.laneTower, 6);
assert.equal(ICONS.champion, 13);
assert.equal(MINIMAP_ICON_SHADE, 0.2);

// 4. Ability buttons 64 px with a 3 px border (desktop squares, narrow/short media rules, touch petals).
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const base = css.match(/\n\.skill \{([^}]*)\}/);
assert.ok(base);
assert.match(base[1], /width: 64px;/);
assert.match(base[1], /height: 64px;/);
assert.match(base[1], /border: 3px solid/);
assert.match(css, /\n {2}\.skill \{ width: 64px; height: 64px; \}/);
assert.match(css, /body:not\(\.touch\) \.skill \{ width: 64px; height: 64px; \}/);
const touch = css.match(/body\.touch \.skill \{([^}]*)\}/);
assert.ok(touch);
assert.match(touch[1], /width: 64px;/);
assert.match(touch[1], /height: 64px;/);
assert.match(touch[1], /border-radius: 50%;/);
assert.match(touch[1], /border: 3px solid/);
assert.ok(!/\.skill[^{]*\{[^}]*width: (44|48|62)px/.test(css.replace(/\.skill \.(rank|plus)[^}]*\}/g, '')), 'no old button sizes left');

console.log('four ui sizes ok');
