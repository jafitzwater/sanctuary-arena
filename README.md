# Sanctuary Arena

A personal, non-commercial browser MOBA with a Diablo II theme. This proof of concept is one lane on Act I: the Barbarian walks from the Rogue Encampment, across the Blood Moor, to Andariel's altar in the Catacombs.

The look is an isometric take on Act I. Sprites are generated for this personal project and bundled under `src/assets/art/` (idle, walk, run, attack, cast, get-hit, death, whirlwind, and leap for the Barbarian, plus Fallen, zombies, a quill rat, Rogues, Blood Raven, tents, a palisade, campfires, and an Andariel altar). The page does not hotlink art or audio. Sound effects and the ambient bed are synthesized in the browser (`src/game/audio.ts`).

Numbers for the Barbarian, the skill tree, Act I normal shop bases, and Act I monsters come from Diablo II 1.13c text files, converted once by `tools/import-d2.mjs` into `src/game/data/d2/`. The match does not fetch them at runtime. See [Diablo II data](#diablo-ii-data).

**https://jafitzwater.github.io/sanctuary-arena/**

That URL updates when this branch is merged to `main` and the Pages workflow finishes.

## How to play

Destroy **Andariel's altar**. If the **Rogue Encampment** falls, you lose. You respawn beside the campfire after a short timer. Gold comes from last hits, hero kills, destroyed towers, and a slow trickle. Spend it at Akara while you are inside the Encampment (or while you are dead).

Bash starts on Q. Shout, Stun, Leap Attack, Battle Orders, and Whirlwind unlock at levels 2, 4, 6, 8, and 10. A newly unlocked skill fills an empty belt slot. Only four skills are equipped. **T** or **Points** opens the list: spend a skill point with **+** (ranks go from 1 to 5), spend the five stat points per level on strength, dexterity, vitality, or energy, then drag a skill onto Q W E R or tap a skill and then a slot. The gold badge is the number of unspent points.

| Skill | Level | Rank 1 | Each further rank |
| --- | --- | --- | --- |
| Bash | 1 | 150% damage, 8 mana, 5s | +15% damage, +2 mana |
| Shout | 2 | +10 armor for 6s, you and nearby allies, 12 mana, 14s | +6 armor |
| Stun | 4 | 115% damage and 0.6s stun, 10 mana, 7s | +5% damage, +0.25s stun |
| Leap Attack | 6 | Jump and hit for 135% damage, 14 mana, 9s | +15% damage, +2 mana |
| Battle Orders | 8 | +6% maximum life for 8s, 18 mana, 16s | +6% life |
| Whirlwind | 10 | Spin, each hit 32% damage, 22 mana, 11s | +4% damage per hit, +4 mana |

Akara sells one weapon, one armor, one helm, and one belt. A new piece replaces the old one and refunds half the old price. Club is cheap at level 1. Short Sword (40 strength) at level 3. Falchion (55 strength) at level 5. Two-Handed Sword (65 strength, 30 dexterity) at level 8. Armor and helms follow the same levels. You carry 3 health potions and 3 mana potions. A Sash (level 2) raises that to 4. A Belt (level 6, 45 strength) raises it to 5. Strength adds melee damage. Dexterity adds a little armor and attack speed. Vitality adds life and energy adds mana for every class.

### Touch (landscape)

Turn the phone sideways. Portrait shows a rotate hint and pauses the match. The touch layout follows a Diablo Immortal thumb pattern. A wide desktop window keeps the classic bottom belt and the red and blue orbs.

- Portrait, life bar, and mana bar sit at the top left. The target's name and health sit top center when something is selected or in reach. The minimap is top right, with Tree, Shop, Help, and Sound beside it.
- The stick is the large control at the bottom left and the only way to move, including diagonally along the isometric ground. Tapping the map does not walk or chase.
- **Attack** is the big round button in the bottom-right corner. It strikes whatever is already in reach. Exactly four skills arc around it. A dark sweep and a number show the cooldown. A blue rim means you are short on mana. Locked skills stay in the Points list until their level.
- Smaller round **HP** and **MP** buttons sit above the arc and show potion counts.
- **Shop** always opens Akara's list. Outside the Rogue Encampment the button reads **Camp**, the panel stays open, and buys stay disabled until you walk back.

The page sets `minimum-scale=1`, `maximum-scale=1`, and `user-scalable=no`. The game surface uses `touch-action: none`. A second tap within a third of a second, a pinch, and iOS `gesturestart` / `gesturechange` / `gestureend` are cancelled so mashing Attack or a skill cannot zoom the page on iOS Safari or Android Chrome. Shop, help, and the skill tree still scroll vertically.

### Mouse and keyboard

- Click the ground to move. Click an enemy to attack them. Either mouse button works. The life and mana orbs stay at the bottom corners, and the four skills stay in a belt along the bottom.
- Arrow keys move as well.
- **Q W E R** and **1–4** cast the four belt slots. An empty slot opens Points. **Shift** plus a belt key ranks that skill up.
- **Space** attacks the nearest enemy (and chases one if you are standing still).
- **T** opens skills and stats. **B** opens and closes the shop. **5** drinks a health potion, **6** a mana potion. **Esc** closes panels. You can carry 3 of each potion. A Sash raises that to 4, and a Belt raises it to 5.

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
src/game/data/items.ts   Shop catalog (potions plus the Act I JSON)
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

The simulator does not hard-code Barbarian or Act I beyond `Game.ts` calling `createMatch(act1, barbarian)`. Registries live in `src/game/data/classes/index.ts` and `src/game/data/acts/index.ts`.

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

The walkable ground is the road, a jungle shoulder beside it, and a plaza around each base. That keeps one lane without a path that walks around every tower. Towers should stay on the polyline so minions march into them.

## Deploy

`.github/workflows/pages.yml` builds on pull requests, and on a push to `main` it publishes `dist/` with GitHub Pages actions. The Vite `base` is `/sanctuary-arena/`, so script and style URLs resolve under the project site.

Merging to `main` runs the deploy workflow and updates https://jafitzwater.github.io/sanctuary-arena/. Pages should stay set to **GitHub Actions** as the source.

## Diablo II data

`tools/import-d2.mjs` reads the 1.13c tables vendored in `tools/vendor/d2-113c` and writes JSON under `src/game/data/d2`. `manifest.json` records the patch, the scale constants, and the sources:

- Tables: [fabd/diablo2 `code/d2_113_data`](https://github.com/fabd/diablo2/tree/master/code/d2_113_data) — CharStats, Skills, SkillDesc, Weapons, Armor, ItemTypes, MonStats, PlrMode.
- English strings for Barbarian skills 126–155: [blizzhackers/d2data `localestrings-eng.json`](https://github.com/blizzhackers/d2data/blob/master/json/localestrings-eng.json).

Column meaning follows the public [Diablo II data file guide](https://wolfieeiflow.github.io/diabloiidatafileguide/) and the d2mods knowledge base. Life, mana, stamina, and stat-per-level columns are stored in fourths.

The match is shorter than a Diablo II character, so the importer scales those rows:

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

The Spriters Resource hosts Diablo II and Lord of Destruction sheets (Barbarian by mode and weapon class, Act I monsters, Rogues, and town tiles) at <https://www.spriters-resource.com/pc_computer/diablo2diablo2lordofdestruction/>. Those are Blizzard assets. This personal, non-commercial project would bundle them for private testing only, with no runtime hotlink. Downloads from that host answered with a Cloudflare challenge (`403` / "Just a moment...") from this environment, including direct asset URLs, so the sheets are not in the repo.

The frames under `src/assets/art/` are original stand-ins, including run, get-hit, death, cast, and the quill rat. `src/game/art/sheets.ts` is the swap point: replace a URL there and the renderer picks it up. DCC and COF files are not extracted.

## Known gaps

- One playable class and one act. The other six classes have CharStats rows in JSON only. No fog of war, no jungle camps, no inhibitors.
- The match uses six Barbarian skills and a four-slot belt, not the full 30-skill tree. The 1.13c JSON is still in the repo as the reference for names and raw numbers. Ranks stop at 5. Battle Orders raises life only. Shout raises defense for a few seconds.
- Cooldowns and monster damage are scaled for a short match. Exceptional and elite items are not in the shop. Dual wield uses the slower swing and about half the offhand damage.
- Blood Raven kites and retreats; she does not cast a skill kit. The quill rat has one pose. Rogue archers reuse Blood Raven's bow pose with a blue tint.
- Art is generated pixel sprites in the PlrMode layout, not 16-direction BA sheets. The Spriters Resource download was blocked, as noted above. Trees are drawn in code. Audio is synthesized, not the Diablo II soundtrack.
- The isometric camera shows the lane from a 2:1 angle. Movement on the stick and arrow keys follows the screen, not the raw map axes.
