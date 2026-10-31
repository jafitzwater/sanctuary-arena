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

## 3D floor tiles (order t330u)

`public/tiles/*.webp` (512x256 seamless tiles: `plains_0/1`, `sand_0/1`, `jungle_0/1`, `fire_0/1`, `lava_0`, `cobble_0` and its height map `cobble_0_h`) were rendered for this project in Blender 4.5 Cycles (orthographic, the game's 2:1 camera) from the PBR texture sets below, then converted to WebP. All sources are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); attribution is not required but given here.

| Source | Used for |
| --- | --- |
| Poly Haven [`leafy_grass`](https://polyhaven.com/a/leafy_grass), CC0 1.0 | plains base, jungle moss |
| Poly Haven [`forrest_ground_01`](https://polyhaven.com/a/forrest_ground_01), CC0 1.0 | plains patches |
| Poly Haven [`brown_mud_leaves_01`](https://polyhaven.com/a/brown_mud_leaves_01), CC0 1.0 | plains dirt |
| Poly Haven [`dry_ground_rocks`](https://polyhaven.com/a/dry_ground_rocks), CC0 1.0 | sand base |
| Poly Haven [`gravelly_sand`](https://polyhaven.com/a/gravelly_sand), CC0 1.0 | sand patches |
| Poly Haven [`rock_ground_02`](https://polyhaven.com/a/rock_ground_02), CC0 1.0 | sand stony patches |
| Poly Haven [`forest_leaves_02`](https://polyhaven.com/a/forest_leaves_02), CC0 1.0 | jungle base |
| Poly Haven [`mud_forest`](https://polyhaven.com/a/mud_forest), CC0 1.0 | jungle mud |
| Poly Haven [`burned_ground_01`](https://polyhaven.com/a/burned_ground_01), CC0 1.0 | river-of-flame base |
| Poly Haven [`mud_cracked_dry_03`](https://polyhaven.com/a/mud_cracked_dry_03), CC0 1.0 | river-of-flame crack mask (displacement only) |
| Poly Haven [`rock_ground`](https://polyhaven.com/a/rock_ground), CC0 1.0 | river-of-flame rock, lava crust |
| Poly Haven [`cobblestone_05`](https://polyhaven.com/a/cobblestone_05), CC0 1.0 | lane and bridge cobble (`cobble_0`, `cobble_0_h`) |
| ambientCG [`Lava004`](https://ambientcg.com/view?id=Lava004), CC0 1.0 | lava river (`lava_0`) |

The blends between grounds, the lava bank, glow and lip, and the lane edges are composited in code (`src/game/floorBake.ts`). If a tile fails to load, a code-drawn tile (`src/game/art/floorTiles.ts`) takes its place. The Diablo II tiles were a mood and tile-size reference only; none of their pixels are used.

## 3D camps (order t337u)

`public/camps/camp-3d-{jungle,plains,desert,forge}.webp` (the jungle cave, Cairn Stones, desert ruin gate and Hell Forge camps at the four monster dens) were rendered for this project in Blender 4.5 Cycles with the floor-tile rig (orthographic, the game's 2:1 camera, 1 image px = 1 bake px), by the Sprite Director's camp-3d-v1 samples, then converted to WebP with alpha (`scripts/import-camps.sh`). The `-foot.png` y-sort maps are generated from the same scenes (`scripts/camp-footmap.py`, Cycles position pass). All sources are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); attribution is not required but given here.

| Source | Used for |
| --- | --- |
| Poly Haven models [`rock_face_01`](https://polyhaven.com/a/rock_face_01), [`rock_moss_set_01`](https://polyhaven.com/a/rock_moss_set_01), [`rock_moss_set_02`](https://polyhaven.com/a/rock_moss_set_02), CC0 1.0 | jungle cave wall |
| Poly Haven models [`boulder_01`](https://polyhaven.com/a/boulder_01), [`namaqualand_boulder_02`](https://polyhaven.com/a/namaqualand_boulder_02), [`sand_rocks_small_01`](https://polyhaven.com/a/sand_rocks_small_01), CC0 1.0 | boulders and rocks (jungle, plains, desert) |
| Poly Haven models [`fir_tree_01`](https://polyhaven.com/a/fir_tree_01), [`shrub_02`](https://polyhaven.com/a/shrub_02), [`fern_02`](https://polyhaven.com/a/fern_02), [`grass_medium_01`](https://polyhaven.com/a/grass_medium_01), CC0 1.0 | jungle trees and undergrowth, plains grass |
| Poly Haven models [`ceramic_vase_01`](https://polyhaven.com/a/ceramic_vase_01), [`antique_ceramic_vase_01`](https://polyhaven.com/a/antique_ceramic_vase_01), CC0 1.0 | desert pots |
| Poly Haven textures [`rock_boulder_cracked`](https://polyhaven.com/a/rock_boulder_cracked), [`sandstone_blocks_08`](https://polyhaven.com/a/sandstone_blocks_08), [`stone_tiles_02`](https://polyhaven.com/a/stone_tiles_02), [`rock_wall_08`](https://polyhaven.com/a/rock_wall_08), [`rusty_metal_02`](https://polyhaven.com/a/rusty_metal_02), CC0 1.0 | cairn stones, ruin gate and flagstones, forge platform, brick and iron |
| Poly Haven textures `mud_forest`, `brown_mud_leaves_01`, `forest_leaves_02`, `forrest_ground_01`, `leafy_grass`, `gravelly_sand`, `dry_ground_rocks`, `mud_cracked_dry_03`, `burned_ground_01`, `rock_ground` (see 3D floor tiles above), CC0 1.0 | camp clearings, blended into the zone floors |
| ambientCG [`Lava004`](https://ambientcg.com/view?id=Lava004), CC0 1.0 | Hell Forge lava moat |

The standing stones, carved runes, ruin pillars and lintel, forge, anvil, torches, braziers, demon statues and rock spikes are self-made geometry and textures (this project). If a camp image fails to load, its den keeps the code-drawn clearing.
