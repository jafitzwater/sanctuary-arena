"""Slice PR #23 source sheets into small uniform webp atlases.

Source PNGs and GIFs stay under src/assets/art/source and are not imported.
Each character atlas is N direction rows by sequence columns. Frames are
trimmed, then seated on the cell's bottom center.
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = "/workspace/src/assets/art/source"
PR23 = os.path.join(SRC, "pr23")
OUT = "/workspace/src/assets/art/d2/pr23"
TW, TH = 160, 80


def is_matte(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    grey = (np.abs(r - 170) <= 4) & (np.abs(g - 170) <= 4) & (np.abs(b - 170) <= 4)
    teal = (r < 18) & (np.abs(g - 128) <= 18) & (np.abs(b - 128) <= 18)
    magenta = (g <= 110) & (r > 170) & (b > 120) & (np.minimum(r, b) - g > 70) & (np.abs(r - b) < 120)
    matte = grey | teal | magenta
    # Light grey and the Diablo pink backdrop are sheet-wide, not highlights.
    light = (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) <= 12) & (r >= 220) & (g >= 220) & (b >= 220)
    pink = (np.abs(r - 252) <= 8) & (np.abs(g - 176) <= 8) & (np.abs(b - 176) <= 8)
    if float(light.mean()) > 0.08:
        matte = matte | light
    if float(pink.mean()) > 0.08:
        matte = matte | pink
    # Second backdrops on the sand raider and blunderbore sheets.
    for (cr, cg, cb), tol in (((216, 216, 216), 10), ((248, 248, 192), 14)):
        hit = (np.abs(r - cr) <= tol) & (np.abs(g - cg) <= tol) & (np.abs(b - cb) <= tol)
        if float(hit.mean()) > 0.08:
            matte = matte | hit
    return matte


def load_rgb(path: str) -> np.ndarray:
    im = Image.open(path)
    im.seek(0)
    return np.asarray(im.convert("RGB"))


def content_mask(rgb: np.ndarray) -> np.ndarray:
    return ~is_matte(rgb)


def bands_from_mask(mask: np.ndarray, axis: int, thresh: float, min_size: int, min_gap: int) -> list[tuple[int, int]]:
    frac = mask.mean(axis=axis)
    empty = frac < thresh
    spans: list[tuple[int, int]] = []
    in_run = False
    start = 0
    gap = 0
    for i, is_empty in enumerate(empty):
        if not is_empty:
            if not in_run:
                in_run = True
                start = i
            gap = 0
        elif in_run:
            gap += 1
            if gap >= min_gap:
                end = i - gap + 1
                if end - start >= min_size:
                    spans.append((start, end))
                in_run = False
    if in_run and len(empty) - start >= min_size:
        spans.append((start, len(empty)))
    return spans


def split_tall(mask: np.ndarray, y0: int, y1: int) -> list[tuple[int, int]]:
    height = y1 - y0
    block = mask[y0:y1]
    frac = block.mean(axis=1)
    # A packed direction block has weak gutters. Try 16, then 8 equal slices.
    for rows in (16, 8):
        slice_h = height / rows
        if not (36 <= slice_h <= 220):
            continue
        cuts = []
        ok = True
        for i in range(rows):
            a = int(round(i * slice_h))
            b = int(round((i + 1) * slice_h))
            if frac[a:b].mean() < 0.01:
                ok = False
                break
            cuts.append((y0 + a, y0 + b))
        if ok:
            return cuts
    return [(y0, y1)]


def direction_rows(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    raw = bands_from_mask(mask, axis=1, thresh=0.012, min_size=28, min_gap=3)
    flat: list[tuple[int, int]] = []
    heights = [b - a for a, b in raw]
    typical = float(np.median(heights)) if heights else 64
    for y0, y1 in raw:
        if y1 - y0 > typical * 2.3:
            flat.extend(split_tall(mask, y0, y1))
        else:
            flat.append((y0, y1))
    groups: list[list[tuple[int, int]]] = []
    i = 0
    while i < len(flat):
        taken = False
        for count in (16, 8):
            chunk = flat[i : i + count]
            if len(chunk) < count:
                continue
            hs = [b - a for a, b in chunk]
            if max(hs) > min(hs) * 1.85:
                continue
            groups.append(chunk)
            i += count
            taken = True
            break
        if not taken:
            groups.append([flat[i]])
            i += 1
    return groups


def column_boxes(mask: np.ndarray, y0: int, y1: int) -> list[tuple[int, int]]:
    return bands_from_mask(mask[y0:y1], axis=0, thresh=0.08, min_size=8, min_gap=2)


def trim(rgba: np.ndarray, pad: int = 1) -> np.ndarray:
    ys, xs = np.where(rgba[:, :, 3] > 16)
    if len(ys) == 0:
        return rgba[:1, :1]
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(rgba.shape[0], int(ys.max()) + 1 + pad)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(rgba.shape[1], int(xs.max()) + 1 + pad)
    return rgba[y0:y1, x0:x1]


def to_rgba(cell: np.ndarray) -> np.ndarray:
    rgb = cell[:, :, :3]
    alpha = np.where(is_matte(rgb), 0, 255).astype(np.uint8)
    out = np.dstack([rgb, alpha])
    out[alpha == 0] = 0
    return out


def pack_atlas(frames: list[list[np.ndarray]], target_h: int) -> tuple[np.ndarray, int, int] | None:
    rows = [row for row in frames if any(frame[:, :, 3].mean() > 0.01 for frame in row)]
    if not rows:
        return None
    cols = min(len(row) for row in rows)
    if cols < 1:
        return None
    trimmed: list[list[np.ndarray]] = []
    widths: list[int] = []
    max_h = 1
    for row in rows:
        packed = []
        for frame in row[:cols]:
            sprite = trim(frame)
            if sprite.shape[0] > target_h:
                scale = target_h / sprite.shape[0]
                sprite = np.asarray(
                    Image.fromarray(sprite).resize(
                        (max(1, int(sprite.shape[1] * scale)), target_h),
                        Image.Resampling.BOX,
                    )
                )
            packed.append(sprite)
            widths.append(sprite.shape[1])
            max_h = max(max_h, sprite.shape[0])
        trimmed.append(packed)
    median_w = int(np.median(widths)) if widths else 1
    cell_w = max(1, median_w)
    cell_h = max_h
    fitted: list[list[np.ndarray]] = []
    for row in trimmed:
        packed = []
        for sprite in row:
            if sprite.shape[1] > cell_w:
                scale = cell_w / sprite.shape[1]
                sprite = np.asarray(
                    Image.fromarray(sprite).resize(
                        (cell_w, max(1, int(sprite.shape[0] * scale))),
                        Image.Resampling.BOX,
                    )
                )
            packed.append(sprite)
        fitted.append(packed)
    trimmed = fitted
    sheet = np.zeros((cell_h * len(trimmed), cell_w * cols, 4), dtype=np.uint8)
    for r, row in enumerate(trimmed):
        for c, sprite in enumerate(row):
            sh, sw = sprite.shape[:2]
            ox = (cell_w - sw) // 2
            oy = cell_h - sh
            y = r * cell_h + oy
            x = c * cell_w + ox
            sheet[y : y + sh, x : x + sw] = sprite
    return sheet, len(trimmed), cols


def best_period(std: np.ndarray, lo: int, hi: int) -> tuple[float, int, float] | None:
    signal = std.astype(np.float64)
    signal = signal - signal.mean()
    best: tuple[float, int, float] | None = None
    for lag in range(lo, min(hi, max(lo + 1, len(signal) // 3))):
        left = signal[:-lag]
        right = signal[lag:]
        denom = float(np.linalg.norm(left) * np.linalg.norm(right)) + 1e-6
        corr = float(np.dot(left, right) / denom)
        count = len(signal) / lag
        if best is None or corr > best[0]:
            best = (corr, lag, count)
    return best


def regular_grid(rgb: np.ndarray) -> tuple[int, int] | None:
    if rgb.shape[0] < 80 or rgb.shape[1] < 80:
        return None
    row_score = best_period(rgb.std(axis=1).mean(axis=1), 36, 420)
    col_score = best_period(rgb.std(axis=0).mean(axis=1), 24, 520)
    if row_score is None or col_score is None:
        return None
    row_corr, row_lag, row_count = row_score
    col_corr, _col_lag, col_count = col_score
    rows = int(round(row_count))
    cols = int(round(col_count))
    # One direction column, as tall as the sheet (Mephisto's corpse frame).
    if row_corr > 0.8 and rows in (8, 16) and col_corr < 0.85 and rgb.shape[1] <= row_lag * 1.2:
        return rows, 1
    if row_corr > 0.82 and col_corr > 0.9 and rows in (8, 16) and 2 <= cols <= 48:
        return rows, cols
    if col_corr > 0.9 and 2 <= cols <= 40 and 1 <= rows <= 6 and row_corr > 0.35:
        return max(1, rows), cols
    return None


def slice_regular(rgb: np.ndarray, rows: int, cols: int, target_h: int) -> tuple[np.ndarray, int, int] | None:
    height, width = rgb.shape[:2]
    cell_h = height // rows
    cell_w = width // cols
    if cell_h < 16 or cell_w < 8:
        return None
    grid = []
    for row in range(rows):
        frames = []
        for col in range(cols):
            y0, x0 = row * cell_h, col * cell_w
            frames.append(to_rgba(rgb[y0 : y0 + cell_h, x0 : x0 + cell_w]))
        grid.append(frames)
    return pack_atlas(grid, target_h)


def fit_webp(image: np.ndarray, limit: int = 4096) -> np.ndarray:
    height, width = image.shape[:2]
    if width <= limit and height <= limit:
        return image
    scale = min(limit / width, limit / height)
    resized = Image.fromarray(image).resize(
        (max(1, int(width * scale)), max(1, int(height * scale))),
        Image.Resampling.BOX,
    )
    return np.asarray(resized)


def equal_boxes(mask: np.ndarray, y0: int, y1: int, cols: int) -> list[tuple[int, int]]:
    xs = np.where(mask[y0:y1].any(axis=0))[0]
    if len(xs) == 0 or cols < 1:
        return []
    x0 = int(xs[0])
    x1 = int(xs[-1]) + 1
    pitch = (x1 - x0) / cols
    return [(int(x0 + i * pitch), int(x0 + (i + 1) * pitch)) for i in range(cols)]


def slice_image(rgb: np.ndarray, target_h: int) -> list[tuple[np.ndarray, int, int]]:
    grid = regular_grid(rgb)
    if grid is not None:
        packed = slice_regular(rgb, grid[0], grid[1], target_h)
        if packed and packed[0][:, :, 3].mean() > 0.01:
            return [packed]
    mask = content_mask(rgb)
    groups = direction_rows(mask)
    atlases = []
    for group in groups:
        if len(group) not in (8, 16) and len(group) != 1:
            continue
        boxed = [(y0, y1, column_boxes(mask, y0, y1)) for y0, y1 in group]
        if len(group) >= 8:
            counts = [len(boxes) for _, _, boxes in boxed]
            med = int(np.median(counts))
            if med < 2:
                continue
            steady = min(counts) >= med * 0.75 and max(counts) <= med * 1.35
            frames: list[list[np.ndarray]] = []
            if steady:
                use = min(counts)
                for y0, y1, boxes in boxed:
                    frames.append([to_rgba(rgb[y0:y1, x0:x1]) for x0, x1 in boxes[:use]])
            else:
                for y0, y1, _boxes in boxed:
                    frames.append([to_rgba(rgb[y0:y1, x0:x1]) for x0, x1 in equal_boxes(mask, y0, y1, med)])
        else:
            y0, y1, boxes = boxed[0]
            frames = [[to_rgba(rgb[y0:y1, x0:x1]) for x0, x1 in boxes] or [to_rgba(rgb[y0:y1])]]
        if not frames or not frames[0]:
            continue
        packed = pack_atlas(frames, target_h)
        if not packed or packed[2] < 1 or packed[0][:, :, 3].mean() <= 0.01:
            continue
        # A direction block that collapsed to one full-width column is not sliced.
        if packed[1] >= 8 and packed[2] == 1 and packed[0].shape[1] > target_h * 3:
            continue
        atlases.append(packed)
    return atlases


def save_webp(image: np.ndarray, name: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    image = fit_webp(image)
    Image.fromarray(image).save(path, "WEBP", quality=80, method=0)
    print(f"  {name} {image.shape[1]}x{image.shape[0]} {os.path.getsize(path)}")


def pick_role(atlases: list[tuple[np.ndarray, int, int]]) -> dict[str, tuple[np.ndarray, int, int]]:
    def area(item: tuple[np.ndarray, int, int]) -> int:
        return int(item[0].shape[0] * item[0].shape[1])

    def aspect(item: tuple[np.ndarray, int, int]) -> float:
        image, rows, cols = item
        return (image.shape[1] / cols) / max(1.0, image.shape[0] / rows)

    directional = [item for item in atlases if item[1] in (8, 16)]
    base = directional or atlases
    usable = [item for item in base if 0.28 <= aspect(item) <= 2.6]
    pool = usable or base
    if not pool:
        raise SystemExit("no atlas")
    walk = max(pool, key=area)
    rest = [item for item in pool if item is not walk]
    idle = min(rest or [walk], key=lambda item: (item[2], area(item)))
    attack_pool = [item for item in rest if item is not idle]
    out = {"walk": walk, "idle": idle}
    if attack_pool:
        out["attack"] = max(attack_pool, key=area)
    return out


def composite(base_path: str, overlay_path: str) -> np.ndarray:
    base = load_rgb(base_path)
    over = load_rgb(overlay_path)
    if over.shape != base.shape:
        return base
    painted = ~is_matte(over)
    out = base.copy()
    out[painted] = over[painted]
    return out


def cut_unit(path: str, stem: str, target_h: int, manifest: dict, rgb: np.ndarray | None = None) -> None:
    print(stem, flush=True)
    base = load_rgb(path)
    image_rgb = base if rgb is None else rgb
    # Overlays disturb the period. Measure the grid on the uncomposited sheet.
    grid = regular_grid(base)
    if grid is not None:
        packed = slice_regular(image_rgb, grid[0], grid[1], target_h)
        roles = pick_role([packed] if packed and packed[0][:, :, 3].mean() > 0.01 else slice_image(image_rgb, target_h))
    else:
        roles = pick_role(slice_image(image_rgb, target_h))
    gif_frames = 1 if path.lower().endswith(".gif") else None
    walk_image = roles["walk"][0]
    walk_file = f"{stem}-walk.webp"
    for role, (image, rows, cols) in roles.items():
        same = role != "walk" and image.shape == walk_image.shape and bool(np.array_equal(image, walk_image))
        file_name = walk_file if same else f"{stem}-{role}.webp"
        if not same:
            save_webp(image, file_name)
        entry: dict = {"file": file_name, "rows": rows, "cols": cols, "placeholder": False}
        if gif_frames is not None:
            entry["gifFrames"] = gif_frames
        manifest[f"{stem}-{role}"] = entry


def tint_valkyrie(manifest: dict) -> None:
    src = os.path.join(OUT, "minion-hero-basic-rogue-walk.webp")
    if not os.path.exists(src):
        return
    image = np.asarray(Image.open(src).convert("RGBA")).copy()
    rgb = image[:, :, :3].astype(np.int16)
    alpha = image[:, :, 3] > 0
    rgb[:, :, 0] = np.clip(rgb[:, :, 0] + 36, 0, 255)
    rgb[:, :, 1] = np.clip(rgb[:, :, 1] + 18, 0, 255)
    rgb[:, :, 2] = np.clip(rgb[:, :, 2] - 28, 0, 255)
    image[:, :, :3] = rgb.astype(np.uint8)
    # Gold edge so the stand-in is obvious next to the real rogue.
    ys, xs = np.where(alpha)
    if len(ys):
        edge = np.zeros(alpha.shape, dtype=bool)
        edge[1:, :] |= alpha[:-1, :] & ~alpha[1:, :]
        edge[:-1, :] |= alpha[1:, :] & ~alpha[:-1, :]
        edge[:, 1:] |= alpha[:, :-1] & ~alpha[:, 1:]
        edge[:, :-1] |= alpha[:, 1:] & ~alpha[:, :-1]
        image[edge, 0] = 232
        image[edge, 1] = 196
        image[edge, 2] = 96
    name = "minion-hero-medium-valkyrie-placeholder.webp"
    save_webp(image, name)
    info = manifest["minion-hero-basic-rogue-walk"]
    manifest["minion-hero-medium-valkyrie"] = {
        "file": name,
        "rows": info["rows"],
        "cols": info["cols"],
        "placeholder": True,
        "missing": "Valkyrie",
    }


def cut_floors() -> None:
    print("floors")
    current = np.asarray(Image.open("/workspace/src/assets/art/d2/ground.webp").convert("RGBA"))
    if current.shape[1] != TW * 4:
        raise SystemExit(f"ground width {current.shape}")

    def diamonds(path: str, count: int) -> list[np.ndarray]:
        rgb = load_rgb(path)
        found: list[tuple[float, np.ndarray]] = []
        step_y = 80
        for y in range(0, rgb.shape[0] - TH + 1, step_y):
            for x in range(0, rgb.shape[1] - TW + 1, TW):
                cell = rgb[y : y + TH, x : x + TW]
                if cell.shape[0] != TH or cell.shape[1] != TW:
                    continue
                matte = is_matte(cell)
                fill = 1 - matte.mean()
                if not (0.35 <= fill <= 0.72):
                    continue
                if not bool(matte[0, 0]) or not bool(matte[-1, -1]):
                    continue
                rgba = to_rgba(cell)
                found.append((fill, rgba))
        if len(found) < count:
            # Fall back to the least-magenta 160-wide tiles, resampled.
            found = []
            for y in range(0, rgb.shape[0] - 60, 80):
                for x in range(0, max(1, rgb.shape[1] - 140), 160):
                    cell = rgb[y : y + min(TH, rgb.shape[0] - y), x : x + min(TW, rgb.shape[1] - x)]
                    rgba = to_rgba(cell)
                    pic = Image.fromarray(rgba).resize((TW, TH), Image.Resampling.BOX)
                    found.append((float(np.asarray(pic)[:, :, 3].mean()), np.asarray(pic)))
        found.sort(key=lambda item: abs(item[0] - 0.5))
        picked = []
        for _, cell in found:
            if len(picked) >= count:
                break
            picked.append(cell if cell.shape[0] == TH else np.asarray(Image.fromarray(cell).resize((TW, TH), Image.Resampling.BOX)))
        while len(picked) < count:
            picked.append(picked[-1])
        return picked

    # ground.webp rows: 0 grass, 1 bank, 2 path, 3 town, 4 pale, 5 river, 6 blend.
    replacements = {
        0: diamonds(os.path.join(SRC, "act1-outdoor-floor.png"), 4),
        2: diamonds(os.path.join(PR23, "floor-battle-path.png"), 4),
        3: diamonds(os.path.join(SRC, "act1-town-floor.png"), 4),
        4: diamonds(os.path.join(PR23, "floor-enemy-town.png"), 4),
    }
    sheet = current.copy()
    for row, cells in replacements.items():
        for col, cell in enumerate(cells):
            sheet[row * TH : (row + 1) * TH, col * TW : (col + 1) * TW] = cell
    os.makedirs("/workspace/src/assets/art/d2", exist_ok=True)
    Image.fromarray(sheet).save("/workspace/src/assets/art/d2/ground.webp", "WEBP", lossless=True, quality=100, method=4)
    print("  ground.webp", sheet.shape[1], sheet.shape[0])


def cut_boulders() -> None:
    print("boulders")
    rgb = load_rgb(os.path.join(SRC, "act1-outdoor.png"))
    mask = content_mask(rgb)
    # Rock walls sit in the lower object bands. Keep wide, short masses.
    from scipy import ndimage

    small = mask[::4, ::4]
    small = ndimage.binary_opening(small, iterations=1)
    labels, count = ndimage.label(small)
    boxes = []
    for sl in ndimage.find_objects(labels):
        if sl is None:
            continue
        y0, y1 = sl[0].start * 4, min(rgb.shape[0], sl[0].stop * 4)
        x0, x1 = sl[1].start * 4, min(rgb.shape[1], sl[1].stop * 4)
        w, h = x1 - x0, y1 - y0
        if w < 70 or h < 48 or h > 220 or w > 280:
            continue
        if w < h * 0.85:
            continue
        boxes.append((w * h, x0, y0, w, h))
    boxes.sort(reverse=True)
    picked = boxes[:3]
    if len(picked) < 3:
        raise SystemExit(f"only {len(picked)} boulder candidates")
    for i, (_, x, y, w, h) in enumerate(picked):
        sprite = trim(to_rgba(rgb[y : y + h, x : x + w]))
        if sprite.shape[0] > 120:
            scale = 120 / sprite.shape[0]
            sprite = np.asarray(
                Image.fromarray(sprite).resize((max(1, int(sprite.shape[1] * scale)), 120), Image.Resampling.BOX)
            )
        save_webp(sprite, f"boulder{i}.webp")


def main() -> None:
    manifest: dict = {}
    units = [
        ("minion-hero-basic-rogue.png", "minion-hero-basic-rogue", 96),
        ("minion-hero-hard-guard.png", "minion-hero-hard-guard", 104),
        ("minion-enemy-basic-fallen.png", "minion-enemy-basic-fallen", 80),
        ("minion-enemy-basic-goatman.png", "minion-enemy-basic-goatman", 96),
        ("minion-enemy-medium-sandraider.gif", "minion-enemy-medium-sandraider", 104),
        ("minion-enemy-medium-blunderbore.gif", "minion-enemy-medium-blunderbore", 112),
        ("minion-enemy-hard-destruction.png", "minion-enemy-hard-destruction", 120),
        ("minion-enemy-hard-bovine.gif", "minion-enemy-hard-bovine", 112),
        ("boss-herald-diablo.png", "boss-herald-diablo", 180),
        ("boss-arena-duriel.png", "boss-arena-duriel", 170),
        ("boss-arena-andariel.png", "boss-arena-andariel", 170),
        ("tower-hero-path.png", "tower-hero-path", 150),
        ("tower-enemy-path.png", "tower-enemy-path", 150),
        ("tower-hero-base.png", "tower-hero-base", 150),
        ("tower-enemy-base.png", "tower-enemy-base", 160),
    ]
    for file_name, stem, height in units:
        cut_unit(os.path.join(PR23, file_name), stem, height, manifest)
    meph = os.path.join(PR23, "boss-herald-mephisto")
    for mode in ("idle", "walk", "attack-1", "attack-2", "get-hit", "death", "die"):
        path = os.path.join(meph, f"{mode}.png")
        overlay = os.path.join(meph, f"{mode}-overlay.png")
        rgb = composite(path, overlay) if os.path.exists(overlay) else None
        cut_unit(path, f"boss-herald-mephisto-{mode}", 180, manifest, rgb)
    manifest["floor-grass"] = {"file": "ground.webp", "rows": 1, "cols": 4, "groundRow": 0, "source": "act1-outdoor-floor.png", "placeholder": False}
    manifest["floor-battle-path"] = {"file": "ground.webp", "rows": 1, "cols": 4, "groundRow": 2, "source": "floor-battle-path.png", "placeholder": False}
    manifest["floor-hero-town"] = {"file": "ground.webp", "rows": 1, "cols": 4, "groundRow": 3, "source": "act1-town-floor.png", "placeholder": False}
    manifest["floor-enemy-town"] = {"file": "ground.webp", "rows": 1, "cols": 4, "groundRow": 4, "source": "floor-enemy-town.png", "placeholder": False}
    for index in range(3):
        manifest[f"boulder-{index}"] = {"file": f"boulder{index}.webp", "rows": 1, "cols": 1, "placeholder": False}
    tint_valkyrie(manifest)
    cut_floors()
    cut_boulders()
    manifest_path = "/workspace/src/game/art/pr23-manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print("manifest", len(manifest))


if __name__ == "__main__":
    main()
