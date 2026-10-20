"""Cut Act I floor diamonds, outdoor props, and Akara. Re-anchor barbarian feet.

Source sheets stay in the upload folder. This writes only the small atlases
the game loads. Magenta and teal mattes are removed. Floor diamonds are
dilated one pixel so the iso grid has no gaps.
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image

UP = "/home/ubuntu/.cursor/projects/workspace/uploads"
OUT = "/workspace/src/assets/art/d2"
TW, TH = 160, 80


def key_magenta(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    fringe = (r > 165) & (b > 165) & (g < 110) & (np.abs(r - b) < 90)
    white = (r > 248) & (g > 248) & (b > 248)
    alpha = np.where(fringe | white, 0, 255).astype(np.uint8)
    out = np.dstack([rgb[:, :, :3], alpha])
    return out


def dilate(rgba: np.ndarray) -> np.ndarray:
    """Grow the diamond one pixel so neighboring tiles overlap."""
    out = rgba.copy()
    opaque = rgba[:, :, 3] > 0
    h, w = opaque.shape
    ys, xs = np.where(~opaque)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if y > 0 and opaque[y - 1, x]:
            out[y, x] = rgba[y - 1, x]
        elif y + 1 < h and opaque[y + 1, x]:
            out[y, x] = rgba[y + 1, x]
        elif x > 0 and opaque[y, x - 1]:
            out[y, x] = rgba[y, x - 1]
        elif x + 1 < w and opaque[y, x + 1]:
            out[y, x] = rgba[y, x + 1]
    return out


def tile_ok(cell: np.ndarray) -> bool:
    mag = (cell[:, :, 0] > 240) & (cell[:, :, 1] < 30) & (cell[:, :, 2] > 240)
    if not mag[0, 0] or not mag[0, -1] or not mag[-1, 0]:
        return False
    frac = (~mag).mean()
    return 0.42 <= frac <= 0.62


def mean_rgb(cell: np.ndarray) -> tuple[float, float, float]:
    mag = (cell[:, :, 0] > 240) & (cell[:, :, 1] < 30) & (cell[:, :, 2] > 240)
    cols = cell[~mag].mean(axis=0)
    return float(cols[0]), float(cols[1]), float(cols[2])


def pick_outdoor() -> dict[str, list[tuple[int, int]]]:
    im = Image.open(os.path.join(UP, "Act_1_Tiles_-_Outdoor_Floor_5734.png")).convert("RGB")
    a = np.asarray(im)
    rows, cols = a.shape[0] // TH, a.shape[1] // TW
    tiles = []
    for r in range(rows):
        for c in range(cols):
            cell = a[r * TH : (r + 1) * TH, c * TW : (c + 1) * TW]
            if cell.shape[0] != TH or cell.shape[1] != TW or not tile_ok(cell):
                continue
            R, G, B = mean_rgb(cell)
            lum = R + G + B
            tiles.append((lum, G - R, c, r, R, G, B))
    grass = sorted([t for t in tiles if t[1] > 4 and 60 < t[0] < 120], key=lambda t: -t[1])
    dark = sorted(tiles, key=lambda t: t[0])
    path = sorted([t for t in tiles if t[1] < 3 and 90 < t[0] < 170], key=lambda t: t[0])
    edge = sorted([t for t in tiles if 0 <= t[1] <= 6 and 70 < t[0] < 110], key=lambda t: t[0])

    def uniq(seq, n):
        out = []
        seen = set()
        for item in seq:
            key = (item[2], item[3])
            if key in seen:
                continue
            seen.add(key)
            out.append((item[2], item[3]))
            if len(out) == n:
                break
        return out

    picked = {
        "grass": uniq(grass, 4),
        "edge": uniq(edge, 4),
        "path": uniq(path, 4),
        "dark": uniq(dark, 4),
    }
    for name, cells in picked.items():
        if len(cells) < 4:
            raise SystemExit(f"outdoor {name} only {len(cells)}")
    return picked


def pick_town() -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    im = Image.open(os.path.join(UP, "Act_1_Tiles_-_Town_Floor_e9e6.png")).convert("RGB")
    a = np.asarray(im)
    rows, cols = a.shape[0] // TH, a.shape[1] // TW
    tiles = []
    for r in range(rows):
        for c in range(cols):
            cell = a[r * TH : (r + 1) * TH, c * TW : (c + 1) * TW]
            if cell.shape[0] != TH or cell.shape[1] != TW or not tile_ok(cell):
                continue
            R, G, B = mean_rgb(cell)
            tiles.append((R + G + B, c, r))
    tiles.sort()
    mid = tiles[len(tiles) // 3 : len(tiles) // 3 + 8]
    pale = tiles[-12:]
    town = [(c, r) for _, c, r in mid[:4]]
    light = [(c, r) for _, c, r in pale[:4]]
    if len(town) < 4 or len(light) < 4:
        raise SystemExit(f"town tiles {len(town)} {len(light)}")
    return town, light


def save_ground() -> None:
    outdoor = np.asarray(Image.open(os.path.join(UP, "Act_1_Tiles_-_Outdoor_Floor_5734.png")).convert("RGB"))
    town = np.asarray(Image.open(os.path.join(UP, "Act_1_Tiles_-_Town_Floor_e9e6.png")).convert("RGB"))
    picked = pick_outdoor()
    town_cells, pale_cells = pick_town()
    order = [
        ("grass", outdoor, picked["grass"]),
        ("edge", outdoor, picked["edge"]),
        ("path", outdoor, picked["path"]),
        ("town", town, town_cells),
        ("pale", town, pale_cells),
        ("dark", outdoor, picked["dark"]),
    ]
    sheet = np.zeros((TH * len(order), TW * 4, 4), dtype=np.uint8)
    for row, (name, src, cells) in enumerate(order):
        print(name, cells)
        for col, (c, r) in enumerate(cells):
            cell = src[r * TH : (r + 1) * TH, c * TW : (c + 1) * TW]
            keyed = dilate(key_magenta(cell))
            # a real diamond still has transparent corners
            if keyed[:, :, 3].mean() < 0.4:
                raise SystemExit(f"{name} {c},{r} keyed away")
            sheet[row * TH : (row + 1) * TH, col * TW : (col + 1) * TW] = keyed
    Image.fromarray(sheet).save(os.path.join(OUT, "ground.webp"), "WEBP", quality=90, method=6)
    print("ground", sheet.shape)


def sprite_from(src: np.ndarray, x: int, y: int, w: int, h: int) -> Image.Image | None:
    crop = src[y : y + h, x : x + w]
    rgba = key_magenta(crop)
    a = rgba[:, :, 3]
    ys, xs = np.where(a > 0)
    if len(ys) < 200:
        return None
    pad = 1
    y0, y1 = max(0, ys.min() - pad), min(rgba.shape[0], ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(rgba.shape[1], xs.max() + 1 + pad)
    return Image.fromarray(rgba[y0:y1, x0:x1])


def save_props() -> None:
    outdoor = np.asarray(Image.open(os.path.join(UP, "Act_1_Tiles_-_Outdoor_ed79.png")).convert("RGB"))
    town = np.asarray(Image.open(os.path.join(UP, "Act_1_Tiles_-_Town_Objects_09ba.png")).convert("RGB"))
    specs = [
        ("tree0", outdoor, 160, 334, 130, 424),
        ("tree1", outdoor, 800, 326, 80, 416),
        ("tree2", outdoor, 2410, 762, 160, 458),
        ("tree3", outdoor, 538, 4140, 182, 384),
        ("tree4", outdoor, 1120, 5186, 160, 332),
        ("rock0", outdoor, 400, 3086, 160, 192),
        ("rock1", outdoor, 1840, 1760, 160, 190),
        ("rock2", outdoor, 66, 2076, 190, 210),
        ("fence0", outdoor, 2576, 382, 296, 130),
        ("fence1", outdoor, 2292, 3896, 256, 166),
        ("tent0", town, 3212, 782, 230, 150),
        ("tent1", town, 58, 802, 204, 138),
        ("tent2", town, 3908, 458, 208, 162),
        ("stone0", outdoor, 2812, 4748, 300, 284),
        ("stone1", outdoor, 372, 4712, 220, 302),
    ]
    for name, src, x, y, w, h in specs:
        im = sprite_from(src, x, y, w, h)
        if im is None:
            raise SystemExit(f"empty prop {name}")
        im.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=86, method=6)
        print(name, im.size)


def save_akara() -> None:
    im = Image.open(os.path.join(UP, "Non-Playable_Characters_-_Akara_32e7.png")).convert("RGBA")
    a = np.array(im)
    r, g, b = a[:, :, 0].astype(np.int16), a[:, :, 1].astype(np.int16), a[:, :, 2].astype(np.int16)
    teal = (r < 48) & (g > 80) & (g < 190) & (b > 80) & (b < 190) & (np.abs(g - b) < 55)
    gray = (np.abs(r - 170) < 12) & (np.abs(g - 170) < 12) & (np.abs(b - 170) < 12)
    alpha = np.where(teal | gray, 0, a[:, :, 3])
    rgba = np.dstack([a[:, :, :3], alpha.astype(np.uint8)])
    # 16 direction rows. Height 75 matched the sheet period.
    height, off = 75, 13
    row = rgba[off : off + height, :, :]
    op = row[:, :, 3] > 0
    col = op.any(axis=0)
    spans = []
    x = 0
    while x < len(col):
        if not col[x]:
            x += 1
            continue
        x0 = x
        while x < len(col) and col[x]:
            x += 1
        if x - x0 >= 8:
            spans.append((x0, x))
    if not spans:
        raise SystemExit("akara has no frames")
    # south-facing row, the frame with the most body pixels
    best = None
    for x0, x1 in spans:
        frame = rgba[off : off + height, x0:x1]
        n = int((frame[:, :, 3] > 0).sum())
        if best is None or n > best[0]:
            best = (n, frame)
    frame = best[1]
    ys, xs = np.where(frame[:, :, 3] > 0)
    y0, y1 = ys.min(), ys.max() + 1
    x0, x1 = xs.min(), xs.max() + 1
    cropped = Image.fromarray(frame[y0:y1, x0:x1])
    if cropped.size[0] < 8 or cropped.size[1] < 20:
        raise SystemExit(f"akara crop too small {cropped.size}")
    pink = (cropped.getpixel((0, 0))[0] > 240 and cropped.getpixel((0, 0))[1] < 20)
    if pink:
        raise SystemExit("akara still pink")
    cropped.save(os.path.join(OUT, "akara.webp"), "WEBP", quality=92, method=6)
    print("akara", cropped.size, "opaque", int((np.array(cropped)[:, :, 3] > 0).sum()), "spans", len(spans))


def foot_of(frame: np.ndarray) -> tuple[int, int]:
    alpha = frame[:, :, 3]
    ys, xs = np.where(alpha > 24)
    if len(ys) == 0:
        return frame.shape[1] // 2, frame.shape[0] - 1
    bottom = int(ys.max())
    for y in range(bottom, max(-1, bottom - 40), -1):
        cols = xs[ys == y]
        if len(cols) >= 4:
            return int(np.median(cols)), y
    return int(np.median(xs)), bottom


def repack_barbs() -> None:
    tiers = {
        "light": ["idle", "walk", "run", "attack"],
        "medium": ["idle", "walk", "run", "attack"],
        "heavy": ["idle", "walk", "run", "attack"],
    }
    cols = {"idle": 1, "walk": 4, "run": 12, "attack": 4}
    for tier, modes in tiers.items():
        frames: list[tuple[str, int, int, np.ndarray]] = []
        for mode in modes:
            im = Image.open(os.path.join(OUT, f"barb-{tier}-{mode}.webp")).convert("RGBA")
            arr = np.array(im)
            ccount = cols[mode]
            ch, cw = arr.shape[0] // 8, arr.shape[1] // ccount
            for row in range(8):
                for col in range(ccount):
                    frames.append((mode, row, col, arr[row * ch : (row + 1) * ch, col * cw : (col + 1) * cw]))
        extents = []
        feet = []
        for _, _, _, frame in frames:
            fx, fy = foot_of(frame)
            alpha = frame[:, :, 3] > 24
            ys, xs = np.where(alpha)
            if len(ys) == 0:
                extents.append((0, 0, 0, 0))
                feet.append((fx, fy))
                continue
            extents.append((fx - int(xs.min()), int(xs.max()) - fx, fy - int(ys.min()), int(ys.max()) - fy))
            feet.append((fx, fy))
        left = max(e[0] for e in extents)
        right = max(e[1] for e in extents)
        up = max(e[2] for e in extents)
        down = max(e[3] for e in extents)
        cell_w = left + right + 4
        cell_h = up + down + 4
        ax, ay = left + 2, up + 2
        packed = {mode: np.zeros((cell_h * 8, cell_w * cols[mode], 4), dtype=np.uint8) for mode in modes}
        for (mode, row, col, frame), (fx, fy) in zip(frames, feet):
            dest = packed[mode]
            dx = col * cell_w + ax - fx
            dy = row * cell_h + ay - fy
            h, w = frame.shape[:2]
            x0, y0 = max(0, dx), max(0, dy)
            x1, y1 = min(dest.shape[1], dx + w), min(dest.shape[0], dy + h)
            if x1 <= x0 or y1 <= y0:
                continue
            sx0, sy0 = x0 - dx, y0 - dy
            dest[y0:y1, x0:x1] = frame[sy0 : sy0 + (y1 - y0), sx0 : sx0 + (x1 - x0)]
        for mode, sheet in packed.items():
            Image.fromarray(sheet).save(os.path.join(OUT, f"barb-{tier}-{mode}.webp"), "WEBP", quality=90, method=6)
        body = up
        print(f"barb {tier} cell {cell_w}x{cell_h} body {body} fraction {body / cell_h:.3f}")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    save_ground()
    save_props()
    save_akara()
    repack_barbs()


if __name__ == "__main__":
    main()
