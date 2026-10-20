# Sanctuary Arena

A personal, non-commercial browser MOBA with a Diablo II theme. This proof of concept is one lane on Act I: the Barbarian walks from the Rogue Encampment, across the Blood Moor, to Andariel's altar in the Catacombs.

All art is drawn in the canvas with shapes. No game assets are shipped.

The live site is intended for GitHub Pages:

**https://jafitzwater.github.io/sanctuary-arena/**

That URL starts working after this branch is merged to `main`, the deploy workflow has run, and Pages is set to deploy from GitHub Actions (see below).

## How to play

Destroy **Andariel's altar**. If the **Rogue Encampment** falls, you lose. You respawn beside the campfire after a short timer. Gold comes from last hits, hero kills, destroyed towers, and a slow trickle. Spend it at Akara while you are inside the Encampment (or while you are dead). Skill points are spent with the **+** on a skill button, or with Shift plus that skill's key.

The Barbarian starts with Bash. Leap, War Cry, and Whirlwind unlock at levels 2, 3, and 4.

| Skill | Key | What it does |
| --- | --- | --- |
| Bash | Q | Heavy hit and a short stun. If nothing is in reach, the next attack bashes. |
| Leap | W | Jump toward the pointer (or your facing, on a phone) and slow whatever you land on. |
| War Cry | E | Empowers nearby Rogues and slows nearby enemies. |
| Whirlwind | R | Spin and move, damaging enemies around you. |

### Touch (landscape)

Turn the phone sideways. Portrait shows a rotate hint and pauses the match.

- The stick on the left moves.
- **Attack** strikes whatever is in reach. Tap an enemy to lock onto them, then walk in with the stick.
- Tap empty ground to walk there when you are not using the stick.
- The four round buttons cast skills. A gold **+** spends a skill point (tap the main button to learn a skill you do not know yet).
- **HP** / **MP** drink potions. **Shop** opens Akara's goods. Buttons are sized for thumbs.

The page sets `maximum-scale=1` and `user-scalable=no`, and touch scrolling is swallowed outside the shop and help sheets so the browser does not zoom or pull the page.

### Mouse and keyboard

- Click the ground to move. Click an enemy to attack them. Either mouse button works.
- Arrow keys move as well. W is Leap, so WASD is not movement.
- **Q W E R** cast the four skills. **Shift** plus a skill key ranks it up. **1–4** are the same skills.
- **Space** attacks the nearest enemy (and chases one if you are standing still).
- **B** opens and closes the shop. **5** drinks a health potion, **6** a mana potion. **Esc** closes panels.

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
src/game/data/classes/   ClassDef modules (stats, skill list, colors)
src/game/data/acts/      ActDef modules (lane, bases, towers, waves, theme)
src/game/data/units.ts   Minions and monsters referenced by wave tables
src/game/data/items.ts   Shop catalog
src/game/skills/         Skill id → behavior
src/game/sim.ts          Match loop: movement, waves, combat, gold
src/game/render.ts       Procedural map and sprites
src/game/input.ts        Mouse, keyboard, virtual stick
src/game/hud.ts          DOM HUD and shop
src/game/Game.ts         Composition root. This is the file that picks the act and class.
```

The simulator does not hard-code Barbarian or Act I beyond `Game.ts` calling `createMatch(act1, barbarian)`. Registries live in `src/game/data/classes/index.ts` and `src/game/data/acts/index.ts`.

### Add a class

The other six Diablo II classes (Amazon, Necromancer, Paladin, Sorceress, Druid, Assassin) slot in as data plus skill functions:

1. Add `src/game/data/classes/<id>.ts` exporting a `ClassDef`: base stats, per-level growth, and a `skills` array (`id`, key, cooldown, mana, unlock level, max rank, description).
2. Register it in `src/game/data/classes/index.ts`.
3. Add handlers in `src/game/skills/` and register each skill id in `src/game/skills/index.ts`. Handlers receive the sim, the hero, the rank, and an aim point. They should call `damageUnit` from `combat.ts` rather than inventing a second damage path.
4. Draw the champion in `drawSprite` inside `src/game/render.ts` (the `defId` is the class id).
5. Point `createMatch` in `src/game/Game.ts` at the new class, or add a picker on the title screen later.

Avoid binding skill keys to the arrow keys. Digits 1–4 are the alternate hotkeys; 5 and 6 drink potions.

### Add an act

Acts II–V are another `ActDef`:

1. Add `src/game/data/acts/act2.ts` (and so on) with a lane polyline, plaza radius, jungle shoulder, two bases, towers sitting on the lane, a wave table of unit ids, an enemy champion, and a `theme`.
2. Register it in `src/game/data/acts/index.ts`.
3. New monsters go in `src/game/data/units.ts` as ids the wave table can name, plus a branch in `drawSprite`.
4. New scenery: set `theme.decor` to a new id and handle it in `paintMap` in `render.ts`. Unknown decor still draws the road, plazas, and props.
5. Pass the act into `createMatch` from `Game.ts`.

The walkable ground is the road, a jungle shoulder beside it, and a plaza around each base. That keeps one lane without a path that walks around every tower. Towers should stay on the polyline so minions march into them.

## Deploy

`.github/workflows/pages.yml` builds on pull requests, and on a push to `main` it publishes `dist/` with GitHub Pages actions. The Vite `base` is `/sanctuary-arena/`, so script and style URLs resolve under the project site.

Pages is not turned on yet (`has_pages` is false, and the token used here cannot change repository settings). The owner needs to:

1. Merge this branch to `main`.
2. Open **Settings → Pages → Build and deployment**.
3. Set **Source** to **GitHub Actions** (not "Deploy from a branch").
4. If GitHub asks to approve the `github-pages` environment, approve it.

The first green run of "Deploy GitHub Pages" on `main` is what creates https://jafitzwater.github.io/sanctuary-arena/. Private Pages needs GitHub Pro, which this account has.

## Known gaps

- One class and one act. No fog of war, no jungle camps, no inhibitors, no item actives beyond potions.
- Blood Raven kites and retreats; she does not cast a skill kit.
- Balance is tuned for a short proof-of-concept match, not a 30-minute game.
- Art is procedural shapes, so characters read as icons more than illustrations.
