# Credits

Sanctuary Arena draws its own interface and keeps these third-party assets in the repository. Nothing is hotlinked at runtime.

## Game icons

[game-icons.net](https://game-icons.net/), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Recolored to `#c7b377`. Transparent SVG in `src/assets/ui/icons/`.

| File | Icon | Author | Source |
| --- | --- | --- | --- |
| `battle-axe.svg` | Attack | Lorc | https://game-icons.net/1x1/lorc/battle-axe.html |
| `shield-bash.svg` | Bash | Delapouite | https://game-icons.net/1x1/delapouite/shield-bash.html |
| `screaming.svg` | Shout | Lorc | https://game-icons.net/1x1/lorc/screaming.html |
| `knockout.svg` | Stun | Skoll | https://game-icons.net/1x1/skoll/knockout.html |
| `wingfoot.svg` | Leap Attack | Lorc | https://game-icons.net/1x1/lorc/wingfoot.html |
| `whirlwind.svg` | Whirlwind | Lorc | https://game-icons.net/1x1/lorc/whirlwind.html |
| `portal.svg` | Recall | Lorc | https://game-icons.net/1x1/lorc/portal.html |
| `health-potion.svg` | Health potion | Delapouite | https://game-icons.net/1x1/delapouite/health-potion.html |
| `magic-potion.svg` | Mana potion | Delapouite | https://game-icons.net/1x1/delapouite/magic-potion.html |
| `cog.svg` | Settings | Lorc | https://game-icons.net/1x1/lorc/cog.html |

Battle Orders still uses the project's own `src/assets/art/icons/battle-orders.png`. Gear icons in that folder are also original to this project.

## Joystick

[Kenney Mobile Controls](https://kenney.nl/assets/mobile-controls) by Kenney (Kenney Vleugels), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| File | Source file |
| --- | --- |
| `src/assets/ui/joystick/base.png` | `Sprites/Style A/Large (2×)/joystick_circle_pad_a.png` |
| `src/assets/ui/joystick/knob.png` | `Sprites/Style A/Large (2×)/joystick_circle_nub_a.png` |

## Character and monster sprites

[Flare](https://flarerpg.org/) art from the [flare-game](https://github.com/flareteam/flare-game) fantasycore mod, by Clint Bellanger and the Flare contributors. Dual licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) and [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Share-alike applies to these sheets and to adaptations of them. `tools/slice-flare.py` repacks the source PNGs (their alpha is kept; nothing is chroma-keyed) into 8-direction WebP atlases in `src/assets/art/flare/`.

| Atlas | Flare source |
| --- | --- |
| Barbarian | Male paper doll: plate boots, greaves, cuirass, gauntlets, helm, short hair, battle axe (`mods/fantasycore/animations/avatar/male/`) |
| Skeleton | `mods/fantasycore/animations/enemies/skeleton.txt` |
| Zombie (also hungry dead) | `mods/fantasycore/animations/enemies/zombie.txt` |
| Goblin (drawn for Fallen) | `mods/fantasycore/animations/enemies/goblin.txt` |
| Minotaur (drawn for goatman) | `mods/fantasycore/animations/enemies/minotaur.txt` |
| Antlion (drawn for quill rat) | `mods/fantasycore/animations/enemies/antlion.txt` |

Flare's run cycle is also the walk cycle. Playback still uses this game's clocks: idle 1 Hz, walk 4 Hz, run 6.25 Hz, and the attack sheet follows the existing windup and backswing.

These units stay procedural (`src/game/art/figures.ts`, `src/game/art/d2look.ts`): Blood Raven, rogue, rogue archer, willowisp, mummy, demon, towers, bases, and seals.

## Barbarian class sheet (3D v3, order t297u)

`public/sprites/classes/barbarian-full-sheet-64.png` is rendered from 3D models and animations. All third-party sources are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); attribution is not required but given here.

| Source | Used for |
| --- | --- |
| [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) [Standard] by Quaternius ([download](https://quaternius.itch.io/universal-base-characters)), CC0 1.0 | `Superhero_Male_FullBody` body mesh and rig |
| [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) [Standard] by Quaternius ([download](https://quaternius.itch.io/universal-animation-library)), CC0 1.0 | `UAL1_Standard.glb`: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop` (blended into the run), `Death01` |

Original work for this project: topknot and ponytail, face stripe and arm band, leather pauldrons, chest strap, boots, kilt, the axe, materials and palette, and the overhead axe chop (self-keyframed). Rendered headless in Blender 4.5 LTS (orthographic, 8 directions rendered separately, no mirroring), then mapped to the barbarian's 48-colour palette. No Mixamo, CC-BY or ripped art. The Diablo II Barbarian was a look-only reference; none of its pixels are in the sheet.

## Sorceress class sheet (3D v1, order t302u)

`public/sprites/classes/sorceress-full-sheet-64.png` is rendered from 3D models and animations. All third-party sources are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); attribution is not required but given here.

| Source | Used for |
| --- | --- |
| [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) [Standard] by Quaternius ([download](https://quaternius.itch.io/universal-base-characters)), CC0 1.0 | `Superhero_Female_FullBody` body mesh and rig; `Hairstyles/Rigged to Head Bone/Hair_Long` hair mesh (same pack) |
| [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) [Standard] by Quaternius ([download](https://quaternius.itch.io/universal-animation-library)), CC0 1.0 | `UAL1_Standard.glb`: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop` (blended into the run), `Spell_Simple_Enter` and `Spell_Simple_Shoot` (body of the staff cast), `Death01` |

Original work for this project: the outfit (teal-green bodice with gold hem, dark shorts and short skirt, green front tabard, shoulder pads, gold belt, knee boots and bracers), gold circlet, waist-long hair tail, boot cuffs, the short staff with its blue gem, materials and palette, the staff-forward cast attack (right-hand IK), and the staff falling in death. Rendered headless in Blender 4.5 LTS (orthographic, 8 directions rendered separately, no mirroring), then mapped to the sorceress's 48-colour palette. No Mixamo, CC-BY or ripped art. The Diablo II Sorceress was a look-only reference; none of its pixels are in the sheet.

## Base floor (batch 3 item 7)

`public/env/stone_path_128x64.png` is the stone path sheet from [Isometric ground tiles](https://opengameart.org/content/isometric-ground-tiles) by rubberduck, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required. Both mirrored base yards use the first 16 full-diamond variants, darkened. See `public/env/LICENSE-stone_path.txt`.

## Map 12k theme (order "Map size and Diablo 2 theme from reference")

All new terrain art is procedural Canvas 2D code (`src/game/art/zoneTheme.ts`, `src/game/data/mapZones.ts`): zone palettes, lava river, bridge, decals, trees, sandstone and obsidian features. No new image assets. The Diablo 2 acts and the reference image are a style reference only; nothing from Lords of Pain, The Spriters Resource or the reference image is in the repo.
