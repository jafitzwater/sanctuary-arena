#!/usr/bin/env python3
"""Repack Flare character sheets into 8-direction WebP atlases.

Source art is CC BY-SA 3.0 and GPL, from
https://github.com/flareteam/flare-game (mods/fantasycore).
Frames keep the source PNG alpha. Nothing is chroma-keyed.

Flare stores a packed sheet plus a definition whose frames are
`index, direction, x, y, w, h, offset_x, offset_y`.
Direction numbers follow the engine: 0 SW, 1 W, 2 NW, 3 N, 4 NE, 5 E, 6 SE, 7 S.
Atlas rows are the game compass: 0 E, then clockwise (E SE S SW W NW N NE).
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "flare"
MANIFEST = ROOT / "src" / "game" / "art" / "flare-manifest.json"
CACHE = Path("/tmp/flare-src")
BASE = "https://raw.githubusercontent.com/flareteam/flare-game/master/mods/fantasycore/"

# Flare direction index -> compass row. Must match src/game/art/flare-frames.ts.
FLARE_TO_COMPASS = [3, 4, 5, 6, 7, 0, 1, 2]

HERO_LAYERS = [
    "plate_boots",
    "plate_greaves",
    "plate_cuirass",
    "plate_gauntlets",
    "head_short",
    "plate_helm",
    "battle_axe",
]

ENEMIES = ["skeleton", "zombie", "goblin", "minotaur", "antlion"]

ATTACK_SECTIONS = ("swing", "attack", "melee", "shoot", "cast", "spell")
IDLE_SECTIONS = ("stance", "idle")
RUN_SECTIONS = ("run",)
WALK_SECTIONS = ("walk",)
DIE_SECTIONS = ("die", "death")

# About the on-screen body height. DPR 2 still scales this up in the canvas.
MAX_CELL = 128
WEBP_QUALITY = 54

Frame = tuple[int, int, int, int, int, int, str]
Frames = dict[tuple[int, int], Frame]


def fetch(rel: str) -> Path:
    dest = CACHE / rel
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = BASE + rel
    print("get", rel)
    urllib.request.urlretrieve(url, dest)
    return dest


def parse_def(path: Path) -> tuple[dict[str, str], dict[str, Frames]]:
    images: dict[str, str] = {}
    section = ""
    frames: dict[str, Frames] = {}
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("image="):
            rest = line.split("=", 1)[1].strip()
            if "," in rest:
                rel, key = rest.split(",", 1)
                images[key.strip()] = rel.strip()
            else:
                images[""] = rest
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            frames.setdefault(section, {})
            continue
        if not line.startswith("frame=") or not section:
            continue
        parts = [part.strip() for part in line.split("=", 1)[1].split(",")]
        if len(parts) < 8:
            continue
        index, direction, x, y, w, h, ox, oy = (int(float(part)) for part in parts[:8])
        key = parts[8] if len(parts) > 8 else ""
        frames[section][(index, direction)] = (x, y, w, h, ox, oy, key)
    return images, frames


def pick(frames: dict[str, Frames], names: tuple[str, ...]) -> str | None:
    for name in names:
        if frames.get(name):
            return name
    return None


def load_rgba(path: Path) -> Image.Image:
    image = Image.open(path)
    if image.mode == "P":
        image = image.convert("RGBA")
    elif image.mode != "RGBA":
        raise SystemExit(f"{path} is {image.mode}, expected an alpha channel")
    return image


def paste_frame(base: Image.Image, crop: Image.Image, left: int, top: int) -> None:
    base.paste(crop, (left, top), crop)


def pack_section(layers: list[tuple[dict[str, Image.Image], dict[str, str], Frames]]) -> tuple[Image.Image, dict] | None:
    keys: set[tuple[int, int]] = set()
    for _opened, _paths, frames in layers:
        keys.update(frames.keys())
    if not keys:
        return None
    cols = max(index for index, _direction in keys) + 1
    placed: list[tuple[int, int, Image.Image, int, int]] = []
    min_x = min_y = 10**9
    max_x = max_y = -10**9
    for index, direction in sorted(keys):
        pieces: list[tuple[Image.Image, int, int]] = []
        for opened, paths, frames in layers:
            rect = frames.get((index, direction))
            if not rect:
                continue
            x, y, w, h, ox, oy, ikey = rect
            image = opened.get(ikey)
            if image is None:
                rel = paths.get(ikey) or paths.get("")
                if not rel:
                    continue
                image = load_rgba(fetch(rel))
                opened[ikey] = image
            crop = image.crop((x, y, x + w, y + h))
            pieces.append((crop, -ox, -oy))
        if not pieces:
            continue
        left = min(px for _crop, px, _py in pieces)
        top = min(py for _crop, _px, py in pieces)
        right = max(px + crop.width for crop, px, _py in pieces)
        bottom = max(py + crop.height for crop, _px, py in pieces)
        sheet = Image.new("RGBA", (max(1, right - left), max(1, bottom - top)), (0, 0, 0, 0))
        for crop, px, py in pieces:
            paste_frame(sheet, crop, px - left, py - top)
        foot_x = -left
        foot_y = -top
        placed.append((index, direction, sheet, foot_x, foot_y))
        min_x = min(min_x, -foot_x)
        min_y = min(min_y, -foot_y)
        max_x = max(max_x, sheet.width - foot_x)
        max_y = max(max_y, sheet.height - foot_y)
    if not placed:
        return None
    cell_w = max(1, max_x - min_x)
    cell_h = max(1, max_y - min_y)
    foot_x = -min_x
    foot_y = -min_y
    atlas = Image.new("RGBA", (cell_w * cols, cell_h * 8), (0, 0, 0, 0))
    for index, direction, sheet, fx, fy in placed:
        row = FLARE_TO_COMPASS[direction]
        dest_x = index * cell_w + (foot_x - fx)
        dest_y = row * cell_h + (foot_y - fy)
        paste_frame(atlas, sheet, dest_x, dest_y)
    if cell_h > MAX_CELL:
        scale = MAX_CELL / cell_h
        cell_w = max(1, round(cell_w * scale))
        cell_h = max(1, round(cell_h * scale))
        foot_x = round(foot_x * scale)
        foot_y = round(foot_y * scale)
        resized = atlas.resize((cell_w * cols, cell_h * 8), Image.Resampling.LANCZOS)
        atlas = resized
    body = opaque_height(atlas, cell_w, cell_h)
    meta = {
        "cols": cols,
        "rows": 8,
        "fw": cell_w,
        "fh": cell_h,
        "footX": foot_x,
        "footY": foot_y,
        "body": body,
    }
    return atlas, meta


def opaque_height(atlas: Image.Image, fw: int, fh: int) -> int:
    # South-facing first frame. Compass row 2.
    cell = atlas.crop((0, 2 * fh, fw, 3 * fh))
    bbox = cell.getchannel("A").getbbox()
    if not bbox:
        return fh
    return max(1, bbox[3] - bbox[1])


def save_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=WEBP_QUALITY, method=6, exact=True)


def creature_from_defs(defs: list[Path], label: str) -> dict | None:
    layers: list[tuple[dict[str, Image.Image], dict[str, str], dict[str, Frames]]] = []
    for path in defs:
        images, frames = parse_def(path)
        layers.append(({}, images, frames))
    catalog = layers[0][2]
    wanted = {
        "idle": pick(catalog, IDLE_SECTIONS),
        "run": pick(catalog, RUN_SECTIONS),
        "walk": pick(catalog, WALK_SECTIONS),
        "attack": pick(catalog, ATTACK_SECTIONS),
        "die": pick(catalog, DIE_SECTIONS),
    }
    anims: dict[str, dict] = {}
    notes: list[str] = []
    for anim, section in wanted.items():
        if not section:
            notes.append(f"no {anim} section")
            continue
        packed_layers = [(opened, paths, frames.get(section, {})) for opened, paths, frames in layers]
        packed = pack_section(packed_layers)
        if not packed:
            notes.append(f"empty {anim}")
            continue
        image, meta = packed
        meta["file"] = f"{label}-{anim}.webp"
        save_webp(image, OUT / meta["file"])
        anims[anim] = meta
        print(
            f"  {label} {anim} {meta['cols']}x{meta['rows']} cell {meta['fw']}x{meta['fh']} body {meta['body']} {(OUT / meta['file']).stat().st_size}"
        )
    if "run" in anims and "walk" not in anims:
        anims["walk"] = dict(anims["run"])
        notes.append("walk reuses the run sheet at the walk clock")
    if "idle" not in anims or "run" not in anims:
        print("FLAG skip", label, notes)
        return None
    body = anims["idle"].get("body") or anims["idle"]["fh"]
    return {"body": body, "anims": anims, "note": "; ".join(notes)}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in OUT.glob("*.webp"):
        stale.unlink()
    creatures: dict[str, dict] = {}
    print("hero")
    hero_defs = [fetch(f"animations/avatar/male/{layer}.txt") for layer in HERO_LAYERS]
    hero = creature_from_defs(hero_defs, "barbarian")
    if hero:
        hero["note"] = "Flare male plate armor, short hair, and battle axe. " + hero["note"]
        creatures["barbarian"] = hero
    for name in ENEMIES:
        print(name)
        packed = creature_from_defs([fetch(f"animations/enemies/{name}.txt")], name)
        if packed:
            creatures[name] = packed
    manifest = {
        "rows": "compass 0 east, then clockwise",
        "creatures": creatures,
        "aliases": {
            "fallen": "goblin",
            "goatman": "minotaur",
            "quillrat": "antlion",
            "hungry-dead": "zombie",
        },
    }
    # Drop aliases whose sheet failed to build.
    manifest["aliases"] = {key: value for key, value in manifest["aliases"].items() if value in creatures}
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total = sum(path.stat().st_size for path in OUT.glob("*.webp"))
    print("webp bytes", total, "files", len(list(OUT.glob("*.webp"))))


if __name__ == "__main__":
    main()
