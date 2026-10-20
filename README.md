# Sanctuary Arena

A personal, non-commercial browser MOBA with a Diablo II theme. This proof of concept is one lane on Act I: the Barbarian walks from the Rogue Encampment, across the Blood Moor, to Andariel's altar in the Catacombs.

The look is an original isometric take on Act I: a Blood Moor ground texture, a Barbarian with idle, walk, attack, whirlwind, and leap frames, Fallen, zombies, Rogues, Blood Raven, camp tents, a palisade, campfires, and an Andariel altar. Sprites are generated for this personal project and bundled under `src/assets/art/`. They are not ripped from Diablo II or from the browser game D2 Vampire Survivors, and the page does not hotlink any art or audio. Sound effects and the ambient bed are synthesized in the browser (`src/game/audio.ts`).

**https://jafitzwater.github.io/sanctuary-arena/**

That URL updates when this branch is merged to `main` and the Pages workflow finishes.

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

- The red orb (bottom left) is life. The blue orb (bottom right) is mana. The stick sits above the life orb and moves you on the screen, including diagonally along the isometric ground.
- **Attack** and the skill belt sit along the bottom. Attack strikes whatever is in reach. Tap an enemy to lock onto them, then walk in with the stick.
- Tap empty ground to walk there when you are not using the stick.
- The four belt buttons cast skills. A gold **+** spends a skill point (tap the main button to learn a skill you do not know yet).
- **HP** / **MP** drink potions. **Shop** always opens Akara's list. Outside the Rogue Encampment the button reads **Shop · camp**, the panel stays open, and it says she will not sell until you walk back. Buys stay disabled out there. Buttons are sized for thumbs and respond to the tap itself, not a delayed click.

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
src/game/render.ts       Isometric ground, sprites, and minimap
src/assets/art/          Bundled original sprites and the Blood Moor texture
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

## Known gaps

- One class and one act. No fog of war, no jungle camps, no inhibitors, no item actives beyond potions.
- Blood Raven kites and retreats; she does not cast a skill kit.
- Balance is tuned for a short proof-of-concept match, not a 30-minute game.
- Art is original generated pixel sprites (eight Barbarian frames, two-step Fallen and zombie walks, one pose each for the Rogue, Blood Raven, and props) rather than Diablo II's full 16-direction sheets. Rogue archers reuse Blood Raven's bow pose with a blue tint. Trees are drawn in code. Audio is synthesized, not the Diablo II soundtrack.
- The isometric camera shows the lane from a 2:1 angle. Movement on the stick and arrow keys follows the screen, not the raw map axes.
