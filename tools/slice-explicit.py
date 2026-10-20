"""Slice Spriters Resource sheets on explicit mode bands.

Each mode is a known y-range measured from the sheet labels (Town Walk, Neutral,
Run, Attack1). Inside a band, direction rows are the gaps in a torso strip, and
each frame is the whole cell between gutters so the weapon stays with the body.
"""

from __future__ import annotations

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS = "/home/ubuntu/.cursor/projects/workspace/uploads"
OUT = os.path.join(ROOT, "src", "assets", "art", "d2")
os.makedirs(OUT, exist_ok=True)

# Even direction rows only (0,2,...,14): south, then clockwise.
DIRS = (0, 2, 4, 6, 8, 10, 12, 14)


def bg_barb(p: tuple[int, int, int]) -> bool:
    r, g, b = p
    if abs(r - g) < 18 and abs(g - b) < 18 and (r < 18 or r > 210 or 145 <= r <= 195):
        return True
    return r > 220 and g > 185 and b > 140 and abs(r - g) < 45 and r - b > 25


def rows_in(px, y0: int, y1: int, width: int, strips: list[tuple[int, int]], min_h: int = 36) -> list[tuple[int, int]]:
    def hit(y: int) -> bool:
        for a, b in strips:
            n = 0
            for x in range(a, min(b, width), 2):
                if not bg_barb(px[x, y]):
                    n += 1
                    if n > 5:
                        return True
        return False

    bands: list[list[int]] = []
    start = -1
    for y in range(y0, y1):
        if hit(y):
            if start < 0:
                start = y
        elif start >= 0:
            bands.append([start, y - 1])
            start = -1
    if start >= 0:
        bands.append([start, y1 - 1])
    merged: list[list[int]] = []
    for band in bands:
        if merged and band[0] - merged[-1][1] <= 4:
            merged[-1][1] = band[1]
        else:
            merged.append(band)
    return [(a, b) for a, b in merged if b - a + 1 >= min_h]


def frames_in(px, y0: int, y1: int, width: int) -> list[tuple[int, int]]:
    top = y0 + max(4, (y1 - y0) // 5)
    bot = y1 - max(4, (y1 - y0) // 7)
    runs: list[list[int]] = []
    start = -1
    for x in range(width):
        n = 0
        for y in range(top, bot, 2):
            if not bg_barb(px[x, y]):
                n += 1
                if n > 2:
                    break
        if n > 2:
            if start < 0:
                start = x
        elif start >= 0:
            if x - start > 12:
                runs.append([start, x - 1])
            start = -1
    if start >= 0 and width - start > 12:
        runs.append([start, width - 1])
    merged: list[list[int]] = []
    for run in runs:
        if merged and run[0] - merged[-1][1] <= 8:
            merged[-1][1] = run[1]
        else:
            merged.append(run)
    return [(a, b) for a, b in merged]


def cell_box(runs: list[tuple[int, int]], index: int, y0: int, y1: int) -> tuple[int, int, int, int]:
    a, b = runs[index]
    left = a - 14 if index == 0 else max((runs[index - 1][1] + a) // 2, a - 18)
    right = b + 14 if index == len(runs) - 1 else min((b + runs[index + 1][0]) // 2, b + 18)
    return left, y0, right, y1


def pick(count: int, want: int) -> list[int]:
    if want <= 1 or count <= 1:
        return [0]
    if count <= want:
        return list(range(count))
    return [round(i * (count - 1) / (want - 1)) for i in range(want)]


def leading(count: int, want: int) -> list[int]:
    """First frames of the row. Later blobs on a Spriters row are the next weapon group."""
    return list(range(min(count, want)))


def keyed(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = im.crop(box).convert("RGBA")
    pix = crop.load()
    w, h = crop.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if bg_barb((r, g, b)):
                pix[x, y] = (0, 0, 0, 0)
    bbox = crop.getbbox()
    if not bbox:
        return crop
    return crop.crop(bbox)


def foot_of_image(im: Image.Image) -> tuple[int, int]:
    px = im.load()
    w, h = im.size
    rows: list[list[int]] = [[] for _ in range(h)]
    bottom = -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 24:
                rows[y].append(x)
                bottom = y
    if bottom < 0:
        return w // 2, h - 1
    y = bottom
    limit = max(0, bottom - 40)
    while y > limit and len(rows[y]) < 4:
        y -= 1
    cols = rows[y] or rows[bottom]
    return cols[len(cols) // 2], y


def pack_feet(frames: list[list[Image.Image]], name: str) -> None:
    """Place every frame so its opaque foot sits on the same cell point."""
    placed: list[tuple[int, int, Image.Image, int, int]] = []
    left = right = up = down = 0
    for r, row in enumerate(frames):
        for c, frame in enumerate(row):
            fx, fy = foot_of_image(frame)
            w, h = frame.size
            left = max(left, fx)
            right = max(right, w - 1 - fx)
            up = max(up, fy)
            down = max(down, h - 1 - fy)
            placed.append((r, c, frame, fx, fy))
    cell_w = left + right + 1
    cell_h = up + down + 1
    cols = max(len(row) for row in frames)
    sheet = Image.new("RGBA", (cell_w * cols, cell_h * len(frames)), (0, 0, 0, 0))
    for r, c, frame, fx, fy in placed:
        sheet.paste(frame, (c * cell_w + left - fx, r * cell_h + up - fy), frame)
    path = os.path.join(OUT, name + ".webp")
    sheet.save(path, "WEBP", quality=90, method=6)
    print(f"  {name} {sheet.size} cell {cell_w}x{cell_h} {os.path.getsize(path)//1024}KB")


def pack(frames: list[list[Image.Image]], name: str) -> None:
    rows = len(frames)
    cols = max(len(row) for row in frames)
    max_w = max(frame.width for row in frames for frame in row)
    max_h = max(frame.height for row in frames for frame in row)
    sheet = Image.new("RGBA", (max_w * cols, max_h * rows), (0, 0, 0, 0))
    for r, row in enumerate(frames):
        for c, frame in enumerate(row):
            x = c * max_w + (max_w - frame.width) // 2
            y = r * max_h + (max_h - frame.height)
            sheet.paste(frame, (x, y), frame)
    path = os.path.join(OUT, name + ".webp")
    sheet.save(path, "WEBP", quality=42, method=4)
    print(f"  {name} {sheet.size} {os.path.getsize(path)//1024}KB")


def ascii_frame(frame: Image.Image) -> None:
    small = frame.resize((36, 28), Image.Resampling.BOX)
    pix = small.load()
    for y in range(small.height):
        print("".join("#" if pix[x, y][3] > 40 else "." for x in range(small.width)))


def slice_barb(path: str, tier: str, modes: dict[str, tuple[int, int, list[tuple[int, int]], int]]) -> None:
    print("barb", tier)
    im = Image.open(path).convert("RGB")
    px = im.load()
    width, height = im.size
    for mode, (y0, y1, strips, want) in modes.items():
        bands = []
        for x0 in range(16, min(width - 40, 720), 28):
            found = rows_in(px, y0, min(y1, height), width, [(x0, x0 + 48)], 24)
            if len(found) == 16:
                bands = found
                break
            if abs(len(found) - 16) < abs(len(bands) - 16):
                bands = found
        print(f"  {mode} rows {len(bands)} y {bands[0] if bands else None}")
        if len(bands) < 8:
            raise SystemExit(f"{tier} {mode} expected direction rows, got {len(bands)}")
        # Prefer 16. If more, keep the 16 tallest in order.
        if len(bands) > 16:
            ranked = sorted(bands, key=lambda band: band[1] - band[0], reverse=True)[:16]
            bands = sorted(ranked)
        # Split the gutters so the cell includes the head and weapon, not only the torso strip.
        spans: list[tuple[int, int]] = []
        for i, (a, b) in enumerate(bands):
            top = y0 if i == 0 else (bands[i - 1][1] + a) // 2
            bot = y1 if i == len(bands) - 1 else (b + bands[i + 1][0]) // 2
            spans.append((top, bot))
        if len(spans) >= 16:
            chosen = [spans[i] for i in DIRS]
        elif len(spans) == 8:
            chosen = spans
        else:
            step = len(spans) / 8
            chosen = [spans[min(len(spans) - 1, int(i * step))] for i in range(8)]
        grid: list[list[Image.Image]] = []
        widths = []
        for row_y0, row_y1 in chosen:
            runs = frames_in(px, row_y0, row_y1, width)
            if len(runs) < 2:
                raise SystemExit(f"{tier} {mode} row {row_y0} has {len(runs)} frames")
            choose = leading if mode == "run" else pick
            row_frames = []
            for index in choose(len(runs), want):
                row_frames.append(keyed(im, cell_box(runs, index, row_y0, row_y1)))
            widths.append(row_frames[0].width)
            grid.append(row_frames)
        print(f"    frames/row {len(frames_in(px, chosen[0][0], chosen[0][1], width))} kept {len(grid[0])} content-w {widths}")
        if mode == "run":
            pack_feet(grid, f"barb-{tier}-{mode}")
        else:
            pack(grid, f"barb-{tier}-{mode}")
        if tier == "light" and mode in ("walk", "idle", "attack"):
            print(f"    sample {mode}")
            ascii_frame(grid[0][0])
    im.close()


def tight_key(im: Image.Image, color: tuple[int, int, int], tol: int) -> Image.Image:
    rgba = im.convert("RGBA")
    pix = rgba.load()
    w, h = rgba.size
    cr, cg, cb = color
    for y in range(h):
        for x in range(w):
            r, g, b, _a = pix[x, y]
            if abs(r - cr) <= tol and abs(g - cg) <= tol and abs(b - cb) <= tol:
                pix[x, y] = (0, 0, 0, 0)
    return rgba


def slice_grid(path: str, name: str, key_color: tuple[int, int, int], tol: int, want: int) -> bool:
    im = Image.open(path).convert("RGB")
    px = im.load()
    width, height = im.size
    corner = px[2, 2]
    print(name, im.size, "corner", corner)

    def is_bg(p: tuple[int, int, int]) -> bool:
        return all(abs(p[i] - key_color[i]) <= tol for i in range(3))

    bands: list[tuple[int, int]] = []
    start = -1
    for y in range(height):
        n = sum(1 for x in range(width // 3, width // 3 + 40, 2) if not is_bg(px[x, y]))
        if n > 4:
            if start < 0:
                start = y
        elif start >= 0:
            if y - start > 28:
                bands.append((start, y - 1))
            start = -1
    if start >= 0 and height - start > 28:
        bands.append((start, height - 1))
    print("  rows", len(bands), bands[:3])
    if len(bands) < 8:
        im.close()
        return False
    use = [bands[i] for i in DIRS if i < len(bands)]
    if len(use) < 8 and len(bands) >= 8:
        use = bands[:8]
    grid: list[list[Image.Image]] = []
    for row_y0, row_y1 in use:
        runs: list[tuple[int, int]] = []
        sx = -1
        mid0, mid1 = row_y0 + 8, row_y1 - 8
        for x in range(width):
            n = sum(1 for y in range(mid0, mid1, 2) if not is_bg(px[x, y]))
            if n > 2:
                if sx < 0:
                    sx = x
            elif sx >= 0:
                if x - sx > 10:
                    runs.append((sx, x - 1))
                sx = -1
        if len(runs) < 1:
            im.close()
            return False
        row = []
        for index in pick(len(runs), want):
            a, b = runs[index]
            left = max(0, a - 8)
            right = min(width - 1, b + 8)
            crop = im.crop((left, max(0, row_y0 - 4), right + 1, min(height, row_y1 + 4)))
            keyed_img = tight_key(crop, key_color, tol)
            box = keyed_img.getbbox()
            row.append(keyed_img.crop(box) if box else keyed_img)
        grid.append(row)
    pack(grid, name)
    im.close()
    return True


def save_tile(path: str, box: tuple[int, int, int, int], name: str) -> None:
    im = Image.open(path).convert("RGB")
    crop = im.crop(box)
    out = os.path.join(OUT, name + ".webp")
    crop.save(out, "WEBP", quality=50, method=4)
    print(name, crop.size, os.path.getsize(out) // 1024, "KB")
    im.close()


def save_sprite(path: str, box: tuple[int, int, int, int], key_color: tuple[int, int, int], tol: int, name: str) -> None:
    im = Image.open(path).convert("RGB")
    keyed_img = tight_key(im.crop(box), key_color, tol)
    bbox = keyed_img.getbbox()
    if bbox:
        keyed_img = keyed_img.crop(bbox)
    out = os.path.join(OUT, name + ".webp")
    keyed_img.save(out, "WEBP", quality=50, method=4)
    print(name, keyed_img.size, os.path.getsize(out) // 1024, "KB")
    im.close()


NARROW = [(200, 270)]
WIDE = [(40, 100), (180, 260), (400, 480), (700, 780), (1100, 1180)]

LIGHT = {
    "idle": (1855, 3500, NARROW, 1),
    "walk": (12, 1838, NARROW, 4),
    "run": (3512, 5260, WIDE, 12),
    "attack": (5275, 7362, WIDE, 4),
}
MEDIUM = {
    "walk": (12, 1948, NARROW, 4),
    "run": (1960, 3830, WIDE, 12),
    "attack": (3848, 6160, WIDE, 4),
}
HEAVY = {
    "walk": (12, 1836, NARROW, 4),
    "run": (1855, 3670, WIDE, 12),
    "attack": (3690, 5955, WIDE, 4),
}

if __name__ == "__main__":
    base = UPLOADS
    slice_barb(os.path.join(base, "Classes_-_Barbarian__Light__2abc.gif"), "light", LIGHT)
    slice_barb(os.path.join(base, "Classes_-_Barbarian__Medium__aef7.gif"), "medium", MEDIUM)
    slice_barb(os.path.join(base, "Classes_-_Barbarian__Heavy__794a.gif"), "heavy", HEAVY)
    # Medium and heavy sheets have no Neutral block. Idle is the first town-walk pose.
    for tier in ("medium", "heavy"):
        src = Image.open(os.path.join(OUT, f"barb-{tier}-walk.webp"))
        w, h = src.size
        cols = 4
        cell_w, cell_h = w // cols, h // 8
        idle = Image.new("RGBA", (cell_w, cell_h * 8), (0, 0, 0, 0))
        for row in range(8):
            idle.paste(src.crop((0, row * cell_h, cell_w, (row + 1) * cell_h)), (0, row * cell_h))
        idle.save(os.path.join(OUT, f"barb-{tier}-idle.webp"), "WEBP", quality=42, method=4)
        print("idle-from-walk", tier, idle.size)
        src.close()
