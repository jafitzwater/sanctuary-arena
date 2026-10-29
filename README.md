# Sanctuary Arena

A personal, non-commercial browser MOBA with a Diablo II theme. The match is Sanctuary: three paths from the Rogue Encampment to Harrogath, split by a river. The Barbarian's goal is the enemy Worldstone. Act I's single Blood Moor lane is still in the data files for the older tests.

The look is an isometric take on Act I. The Barbarian and the mapped monsters are 8-direction sheets from Flare, repacked to WebP by `tools/slice-flare.py` and drawn from `src/assets/art/flare/`. Flare's art is dual licensed CC BY-SA 3.0 and GPL-3.0. Share-alike covers those sprite sheets and adaptations of them; it does not relicense the rest of this repository. Blood Raven, rogues, willowisps, mummies, demons, towers, bases, and seals stay procedural. The page does not hotlink art or audio. Sound effects and the ambient bed are synthesized in the browser (`src/game/audio.ts`). See [CREDITS.md](CREDITS.md).

Numbers for the Barbarian, the skill tree, Act I normal shop bases, and Act I monsters come from Diablo II 1.13c text files, converted once by `tools/import-d2.mjs` into `src/game/data/d2/`. The match does not fetch them at runtime. See [Diablo II data](#diablo-ii-data).

**https://jafitzwater.github.io/sanctuary-arena/**

That URL updates when this branch is merged to `main` and the Pages workflow finishes.

## How to play

Destroy the **Harrogath Worldstone**. If the **Encampment Worldstone** falls, you lose. Three paths leave each town: the frozen Barricade, the Blood Moor, and the Kurast road. You can walk the wilderness between them. You respawn beside the campfire after a short timer. Gold comes from last hits, hero kills, destroyed towers, and a slow trickle. Spend it at Akara while you are inside the Encampment (or while you are dead).

Bash starts on Q at rank 1. Shout, Stun, Leap Attack, Battle Orders, and Whirlwind unlock at levels 2, 4, 6, 8, and 10. A skill can be viewed as soon as its level arrives, but it goes on the belt only after you spend a point and it reaches rank 1. Learning one fills an empty slot. Only four skills are equipped. A gold **+** on a skill button, or on a loadout icon, spends a skill point (ranks go from 1 to 3; skill rework order). **T** or **Points** opens a compact stats panel: four big **+** buttons for strength, dexterity, vitality, and energy (five points each level after level 1). The Loadout tab is where you drag a learned skill onto Q W E R, or tap it and then a slot. The gold badge on Points is the number of unspent skill and stat points.

Life at level 1 is 240. Each level adds 4, and each point of vitality adds 4. A level 5 Barbarian who put every point into vitality has 336 life. At level 10 that is 456. Attack damage starts at 15 and each point of strength above 30 adds 0.15. A health potion restores 105. Run speed is 216, town walk is 144, and Blood Raven runs at 93 so she can still be caught. Lane creeps stay slower (Fallen 66, Quill Rat 50, Zombie 34).

| Skill | Level | Rank 1 | Each further rank |
| --- | --- | --- | --- |
| Bash | 1 | 150% damage, 8 mana, 5s | +15% damage, +2 mana |
| Shout | 2 | +10 armor for 6s, you and nearby allies, 12 mana, 14s | +6 armor |
| Stun | 4 | 115% damage and 0.6s stun, 10 mana, 7s | +5% damage, +0.25s stun |
| Leap Attack | 6 | Jump and hit for 135% damage, 14 mana, 9s | +15% damage, +2 mana |
| Battle Orders | 8 | +6% maximum life for 8s, 18 mana, 16s | +6% life |
| Whirlwind | 10 | Spin, each hit 32% damage, 22 mana, 11s | +4% damage per hit, +4 mana |

Akara sells one weapon, one armor, one helm, and one belt. A new piece replaces the old one and refunds half the old price. Club is cheap at level 1. Short Sword (40 strength) at level 3. Falchion (50 strength) at level 5 — a level 5 Barbarian who put every stat point into strength (base 30 + 20) can equip it. Two-Handed Sword (65 strength, 30 dexterity) at level 8. Armor and helms follow the same levels, except studded leather and the helm still ask for 55 strength. You carry 3 health potions and 3 mana potions. A Sash (level 2) raises that to 4. A Belt (level 6, 45 strength) raises it to 5. Strength adds melee damage. Dexterity adds a little armor and attack speed. Vitality adds life and energy adds mana for every class.

The shop follows the mobile MOBA pattern (Wild Rift, Mobile Legends, Pokémon Unite) and the desktop League shop: a recommended-item chip near the HUD buys in one tap when you can afford it and you are in camp, the shop has category tabs beside a large icon grid, and tapping an icon only opens the detail with one Buy button. Tap the dimmed backdrop or the **×** to close. On a phone the fight pauses while Shop, Points, or Help is open.

### Touch (landscape)

Turn the phone sideways. Portrait shows a rotate hint and pauses the match. The touch layout follows a Diablo Immortal thumb pattern. A wide desktop window keeps the classic bottom belt and the red and blue orbs.

- Portrait, life bar, and mana bar sit at the top left. The target's name and health sit top center when something is selected or in reach. The minimap is top right, with Points, Shop, Help, and Sound beside it. Under those buttons, a recommended-item chip lights up when you can buy the next piece in camp.
- The stick is the large control at the bottom left and the only way to move, including diagonally along the isometric ground. Tapping the map does not walk or chase.
- **Attack** is the big round button in the bottom-right corner (about 80px on an 844×390 phone). Exactly four skills, at least 64px, arc around it with a clear gap so a thumb does not hit the wrong button. A dark sweep and a number show the cooldown. A blue rim means you are short on mana. A gold **+** on a skill spends a point. Skills that are still locked by level stay out of the arc until they unlock.
- Smaller round **HP** and **MP** buttons sit above the arc and show potion counts.
- **Shop** opens a panel with category tabs (Recommended, Potions, Weapons, Armor, Helms, Belts), a large icon grid, and a detail column with one Buy button. Outside the Rogue Encampment the menu button reads **Camp**, the panel can stay open, and Buy reads Camp until you walk back. Tap the dimmed area or **×** to close. Points is a short stats sheet, with Loadout as the second tab.

The page sets `minimum-scale=1`, `maximum-scale=1`, and `user-scalable=no`. The game surface uses `touch-action: none`. A second tap within a third of a second, a pinch, and iOS `gesturestart` / `gesturechange` / `gestureend` are cancelled so mashing Attack or a skill cannot zoom the page on iOS Safari or Android Chrome. A single tap inside Shop, Points, or Help is not cancelled, so those panels can scroll. The category grid is short enough that a phone usually does not need to scroll.

### Mouse and keyboard

- Click the ground to move. Click an enemy to attack them. Either mouse button works. The life and mana orbs stay at the bottom corners, and the four skills stay in a belt along the bottom.
- Arrow keys move as well.
- **Q W E R** and **1–4** cast the four belt slots. An empty slot opens Points. **Shift** plus a belt key ranks that skill up.
- **Space** attacks the nearest enemy (and chases one if you are standing still).
- **T** opens stats and the loadout. **B** opens and closes the shop. **5** drinks a health potion, **6** a mana potion. **Esc** closes panels. You can carry 3 of each potion. A Sash raises that to 4, and a Belt raises it to 5. The recommended chip at the lower left buys the next affordable item while you are in camp.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open **http://127.0.0.1:5173/sanctuary-arena/** — the dev server uses the same `/sanctuary-arena/` base path as GitHub Pages.

```bash
npm run build
npm run preview
```

Preview is **http://127.0.0.1:4173/sanctuary-arena/**.

## Project layout

```
src/game/data/d2/        1.13c JSON (CharStats, Barbarian skills, Act I items, monsters, PlrMode)
src/game/data/classes/   ClassDef modules (stats, skill list, colors)
src/game/data/acts/      ActDef modules (lane, bases, towers, waves, theme)
src/game/data/units.ts   Minions and monsters referenced by wave tables
src/game/data/items.ts   Short shop catalog (four gear slots and two potions)
src/game/skills/         Skill id → behavior
src/game/art/sheets.ts   Sprite slots keyed by PlrMode token. Swap a URL to change art.
src/game/sim.ts          Match loop: movement, waves, combat, gold
src/game/render.ts       Isometric ground, sprites, and minimap
src/assets/art/          Bundled sprites and the Blood Moor texture
tools/import-d2.mjs      Converts the vendored 1.13c TXT files into src/game/data/d2
src/game/input.ts        Mouse, keyboard, virtual stick
src/game/hud.ts          DOM HUD, skill tree, and shop
src/game/Game.ts         Composition root. This is the file that picks the act and class.
```

The simulator does not hard-code Barbarian or Sanctuary beyond `Game.ts` calling `createMatch(sanctuary, barbarian)`. Registries live in `src/game/data/classes/index.ts` and `src/game/data/acts/index.ts`.

### Add a class

The other six Diablo II classes (Amazon, Necromancer, Paladin, Sorceress, Druid, Assassin) slot in as data plus skill functions:

1. Add `src/game/data/classes/<id>.ts` exporting a `ClassDef`: base stats, per-level growth, and a `skills` array (`id`, key, cooldown, mana, unlock level, max rank, description).
2. Register it in `src/game/data/classes/index.ts`.
3. Add handlers in `src/game/skills/` and register each skill id in `src/game/skills/index.ts`. Handlers receive the sim, the hero, the rank, and an aim point. They should call `damageUnit` from `combat.ts` rather than inventing a second damage path.
4. Draw the champion in `sheetFor` inside `src/game/render.ts` (the `defId` is the class id). Drop frames in `src/assets/art/` and credit them in this file.
5. Point `createMatch` in `src/game/Game.ts` at the new class, or add a picker on the title screen later.

Avoid binding skill keys to the arrow keys. Digits 1–4 are the alternate hotkeys; 5 and 6 drink potions.

### Add an act

Acts II–V are another `ActDef`:

1. Add `src/game/data/acts/act2.ts` (and so on) with a lane polyline, plaza radius, jungle shoulder, two bases, towers sitting on the lane, a wave table of unit ids, an enemy champion, and a `theme`.
2. Register it in `src/game/data/acts/index.ts`.
3. New monsters go in `src/game/data/units.ts` as ids the wave table can name, plus a branch in `sheetFor` in `render.ts`.
4. New scenery: extend `buildScenery` / `paintRoad` in `render.ts`. Unknown props still draw as trees.
5. Pass the act into `createMatch` from `Game.ts`.

Act I keeps the hero on the road, a jungle shoulder beside it, and a plaza around each base. Sanctuary sets `paths` so each road has its own minions. Cliffs bound the map, the ground between paths is blocked except den and shrine clearings, and the river blocks movement except where a road or clearing crosses it. Towers on a path should stay on that path's polyline so minions march into them. Guardians stand off the road, beside the Worldstone.

## Deploy

`.github/workflows/pages.yml` builds on pull requests, and on a push to `main` it publishes `dist/` with GitHub Pages actions. The Vite `base` is `/sanctuary-arena/`, so script and style URLs resolve under the project site.

Merging to `main` runs the deploy workflow and updates https://jafitzwater.github.io/sanctuary-arena/. Pages should stay set to **GitHub Actions** as the source.

## Diablo II data

`tools/import-d2.mjs` reads the 1.13c tables vendored in `tools/vendor/d2-113c` and writes JSON under `src/game/data/d2`. `manifest.json` records the patch, the scale constants, and the sources:

- Tables: [fabd/diablo2 `code/d2_113_data`](https://github.com/fabd/diablo2/tree/master/code/d2_113_data) — CharStats, Skills, SkillDesc, Weapons, Armor, ItemTypes, MonStats, PlrMode.
- English strings for Barbarian skills 126–155: [blizzhackers/d2data `localestrings-eng.json`](https://github.com/blizzhackers/d2data/blob/master/json/localestrings-eng.json).

Column meaning follows the public [Diablo II data file guide](https://wolfieeiflow.github.io/diabloiidatafileguide/) and the d2mods knowledge base. Life, mana, stamina, and stat-per-level columns are stored in fourths.

The match is shorter than a Diablo II character, so the importer scales those rows. The live Barbarian then uses the numbers in How to play (240 life, 4 per level, 4 per vitality, 15 attack damage, run 216) instead of the imported skirmish life of 780. Monster, tower, and base life and damage follow that same ratio. Armor and mana costs are unchanged.

- Barbarian life and mana are multiplied so a fight is a skirmish, not a 20-minute duel. Vitality and energy still add life and mana. Five stat points arrive each level after level 1.
- Skill mana is doubled from the text file. Bash starts at 4. Whirlwind starts at 50. Unlock level is `max(1, round(reqlevel / 6))` so the tree opens during a match. `reqLevel` keeps the original number. Cooldowns are match pacing; the delay column is empty.
- Shop weapons are normal bases a Barbarian can hold (`code == normcode`), level 12 or lower. Attack bonus is average weapon damage times 4. A second one-hander is an offhand and adds about half. An exclusive two-hander clears the offhand. A one-or-two-hand sword uses two-hand damage and `2handedwclass` until an offhand is equipped. Strength and dexterity gate the purchase. Quest items (Wirt's Leg, the Horadric Malus, and the like) are left out. Potions stay the match's own health and mana flasks.
- Fallen, zombies, quill rats, and Blood Raven take life and damage from MonStats, then scaled down so a wave is a lane fight. Rogue allies are still hand-authored.

Weapon class (`wclass` / `2handedwclass`) picks the attack pose: one-hand classes use A1, two-hand classes (`2HS`, `2HT`, `STF`) use A2. Other frames follow PlrMode tokens on the Barbarian token BA: NU neutral, WL walk, RN run, S1 cast, GH get hit, DD death.

Re-run the importer after editing the vendored text files:

```bash
node tools/import-d2.mjs
```

### Sprites

Live units come from Flare (`tools/slice-flare.py`, `src/game/art/flare.ts`). The atlases are served from `public/flare/`. Rows are the eight compass directions, east then clockwise. Columns are the frames of one animation. Walk reuses Flare's run sheet and plays it at 4 Hz; run plays it at 6.25 Hz; idle is the stance at 1 Hz. Attack frames follow the champion windup and backswing. A unit with no sheet falls back to the procedural figure. The Flare sheets are CC BY-SA 3.0 (share-alike) and GPL-3.0; see [CREDITS.md](CREDITS.md).

Older Spriters Resource crops and their slicers (`tools/slice-explicit.py`, `tools/slice-act1.py`, `tools/slice-monsters.py`) are not the live unit renderer. The ground, orbs, and belt are still the project's own drawings. Plate icons for attack, Bash, Shout, Stun, Leap Attack, Whirlwind, Recall, potions, and settings are game-icons.net SVGs in `src/assets/ui/icons/`. Battle Orders and the gear icons stay in `src/assets/art/icons/`. The Kenney stick is `src/assets/ui/joystick/`.

Still procedural: Blood Raven, rogue, rogue archer, willowisp, mummy, demon, towers, bases, and seals. Fallen uses the goblin sheet, the goatman uses the minotaur, the quill rat uses the antlion, and the hungry dead share the zombie sheet. Level-up plays the existing three-note cue plus a gold ring and a "Level N" floater, and refills life and mana after the new maximums.

## Known gaps

- The title screen lists all seven classes. Only the Barbarian can be played. Four allied heroes and five enemies reuse that kit. Akara can hire one rogue for 45 seconds. Item records can carry a tier (base, magic, rare, unique, set), magic find, gold find, sockets, runes, and charms. The shop still sells only the four base slots, potions, and the hire.
- The match uses six Barbarian skills and a four-slot belt, not the full 30-skill tree. The 1.13c JSON is still in the repo as the reference for names and raw numbers. Ranks stop at 5. Battle Orders raises life only. Shout raises defense for a few seconds.
- Cooldowns and monster damage are scaled for a short match. Exceptional and elite items are not in the shop. Dual wield uses the slower swing and about half the offhand damage.
- Blood Raven kites and retreats; she does not cast a skill kit. Rogues use the mercenary sheet, not a separate archer body.
- Audio is synthesized, not the Diablo II soundtrack. Flare supplies a die animation for the units that have a sheet.
- The isometric camera shows the lane from a 2:1 angle. Movement on the stick and arrow keys follows the screen, not the raw map axes.
