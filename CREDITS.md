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

## Class and wave-mob sheets (batch 3 item a)

`public/sprites/classes/*-sheet-64.png`: from Joseph's supplied concept sprites (Sprite Director downscale). No third-party license; Joseph approved committing them (Oct 27).
`public/sprites/mobs/*-sheet-64.png` (rogue, valkyrie, Act 2 and Act 3 mercenary): original art generated for this project from Joseph-approved concepts. No Diablo 2 ripped assets. No third-party license.
