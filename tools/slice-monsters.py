"""Cut Fallen, Zombie, and Fallen Shaman walk cycles from Spriters Resource sheets.

Each sheet is a grid of direction rows. Eight rows, south then clockwise, become
one atlas. Matte gray and the teal key are dropped. The plain rat sheet is not read.
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS = "/home/ubuntu/.cursor/projects/workspace/uploads"
OUT = os.path.join(ROOT, "src", "assets", "art", "d2")
os.makedirs(OUT, exist_ok=True)

FALLEN = os.path.join(UPLOADS, "Fallen_Parts_-_Fallen_Body_250c.png")
ZOMBIE = os.path.join(UPLOADS, "Zombie_Parts_-_Zombie_Body__Light__b0c1.png")
SHAMAN = os.path.join(UPLOADS, "Enemies_and_Bosses_-_Fallen_Shaman_e95a.png")


def matte(p: tuple[int, int, int]) -> bool:
    r, g, b = p[:3]
    if r < 48 and 90 < g < 175 and 90 < b < 175 and abs(g - b) < 45:
        return True
    if abs(r - g) < 8 and abs(g - b) < 8 and abs(r - 170) <= 12:
        return True
    if abs(r - g) < 8 and abs(g - b) < 8 and abs(r - 244) <= 10:
        return True
    if r > 248 and g > 248 and b > 248:
        return True
    return False


def row_bands(
    im: Image.Image,
    min_h: int = 14,
    x0: int = 0,
    x1: int | None = None,
    gap: int = 6,
) -> list[tuple[int, int]]:
    w, h = im.size
    px = im.load()
    right = w if x1 is None else min(w, x1)
    ys: list[int] = []
    for y in range(h):
        n = 0
        for x in range(x0, right, 4):
            if not matte(px[x, y]):
                n += 1
                if n >= 3:
                    ys.append(y)
                    break
    if not ys:
        return []
    bands: list[tuple[int, int]] = []
    start = prev = ys[0]
    for y in ys[1:]:
        if y - prev > gap:
            if prev - start + 1 >= min_h:
                bands.append((start, prev))
            start = y
        prev = y
    if prev - start + 1 >= min_h:
        bands.append((start, prev))
    return bands


def frames_of(px, width: int, y0: int, y1: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start = None
    for x in range(width):
        hit = False
        for y in range(y0, y1 + 1, 2):
            if not matte(px[x, y]):
                hit = True
                break
        if hit:
            if start is None:
                start = x
        elif start is not None:
            if x - start >= 8:
                runs.append((start, x - 1))
            start = None
    if start is not None and width - start >= 8:
        runs.append((start, width - 1))
    merged: list[list[int]] = []
    for a, b in runs:
        if merged and a - merged[-1][1] <= 8:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged]


def keyed(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = im.crop(box).convert("RGBA")
    px = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b, _a = px[x, y]
            if matte((r, g, b)):
                px[x, y] = (0, 0, 0, 0)
    bb = crop.getbbox()
    if not bb:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    return crop.crop(bb)


def sample_idx(n: int, k: int) -> list[int]:
    if n <= k:
        return list(range(n))
    return [round(i * (n - 1) / (k - 1)) for i in range(k)]


def pack(rows: list[list[Image.Image]]) -> Image.Image:
    pad = 1
    max_w = max(im.width for row in rows for im in row) + pad * 2
    max_h = max(im.height for row in rows for im in row) + pad * 2
    cols = max(len(row) for row in rows)
    sheet = Image.new("RGBA", (max_w * cols, max_h * len(rows)), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for c, frame in enumerate(row):
            x = c * max_w + (max_w - frame.width) // 2
            y = r * max_h + (max_h - frame.height) - pad
            sheet.paste(frame, (x, y), frame)
    return sheet


def slice_modes(
    path: str,
    walk_group: int,
    frames: int,
    label: str,
    x0: int = 0,
    x1: int | None = None,
    min_h: int = 14,
) -> None:
    im = Image.open(path).convert("RGB")
    bands = row_bands(im, min_h=min_h, x0=x0, x1=x1)
    px = im.load()
    width = im.size[0]
    print(f"{label}: {len(bands)} rows")
    start = walk_group * 8
    chosen = bands[start : start + 8]
    if len(chosen) < 8:
        raise SystemExit(f"{label} needs 8 direction rows, found {len(chosen)} at group {walk_group}")
    walk_rows: list[list[Image.Image]] = []
    idle_rows: list[list[Image.Image]] = []
    for y0, y1 in chosen:
        spans = frames_of(px, width, y0, y1)
        row_h = y1 - y0 + 1
        kept: list[tuple[int, int]] = []
        for a, b in spans:
            crop = keyed(im, (a, y0, b + 1, y1 + 1))
            if crop.height >= row_h * 0.45 and crop.width >= 8:
                kept.append((a, b))
        spans = kept or spans
        if len(spans) < 2:
            raise SystemExit(f"{label} row y={y0} has {len(spans)} frames")
        picks = sample_idx(len(spans), frames)
        walk_rows.append([keyed(im, (spans[i][0], y0, spans[i][1] + 1, y1 + 1)) for i in picks])
        idle_rows.append([keyed(im, (spans[0][0], y0, spans[0][1] + 1, y1 + 1))])
    walk = pack(walk_rows)
    idle = pack(idle_rows)
    walk.save(os.path.join(OUT, f"{label}-walk.webp"), "WEBP", lossless=True)
    idle.save(os.path.join(OUT, f"{label}-idle.webp"), "WEBP", lossless=True)
    print(f"  walk {walk.size} idle {idle.size} frames/row {[len(r) for r in walk_rows]}")


def draw_quill() -> None:
    """Crisp quill rat. No Spriters sheet exists; the plain rat sheet is not used."""
    cell_w, cell_h = 40, 30
    sheet = Image.new("RGBA", (cell_w * 2, cell_h * 8), (0, 0, 0, 0))
    outline = (26, 16, 12, 255)
    body = (122, 78, 42, 255)
    dark = (62, 38, 22, 255)
    quill = (210, 176, 110, 255)
    belly = (168, 122, 74, 255)
    eye = (236, 224, 186, 255)

    def pix(draw: ImageDraw.ImageDraw, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        draw.point((x, y), fill=color)

    def blob(draw: ImageDraw.ImageDraw, cx: int, cy: int, rx: int, ry: int, color: tuple[int, int, int, int]) -> None:
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    pix(draw, x, y, color)

    def stroke_blob(draw: ImageDraw.ImageDraw, cx: int, cy: int, rx: int, ry: int, fill: tuple[int, int, int, int]) -> None:
        blob(draw, cx, cy, rx + 1, ry + 1, outline)
        blob(draw, cx, cy, rx, ry, fill)

    # Facing: 0 south, then clockwise. Frame 1 scurries one pixel.
    for row, facing in enumerate(range(8)):
        for col in range(2):
            tile = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
            d = ImageDraw.Draw(tile)
            step = 1 if col else 0
            # 0 south, 4 north, 2 west, 6 east, odds are diagonals.
            if facing in (0, 1, 7):
                stroke_blob(d, 20, 16 + step, 10, 7, body)
                blob(d, 20, 18, 6, 3, belly)
                for i, dx in enumerate((-8, -4, 0, 4, 8)):
                    y0 = 10 + (i % 2) + step
                    d.line((20 + dx, y0 + 4, 20 + dx, y0 - 4), fill=quill)
                    pix(d, 20 + dx, y0 - 4, outline)
                stroke_blob(d, 14, 20, 3, 3, dark)
                stroke_blob(d, 26, 20, 3, 3, dark)
                pix(d, 13, 19, eye)
                pix(d, 27, 19, eye)
            elif facing == 4:
                stroke_blob(d, 20, 16, 9, 6, dark)
                for dx in (-7, -3, 1, 5):
                    d.line((20 + dx, 14, 18 + dx, 6), fill=quill)
                stroke_blob(d, 20, 12, 3, 3, body)
            elif facing in (2, 3):
                ox = -step
                stroke_blob(d, 22 + ox, 16, 11, 6, body)
                blob(d, 22 + ox, 18, 7, 3, belly)
                for i in range(5):
                    d.line((18 + ox + i, 14 - (i % 2), 14 + ox - i, 8 - i), fill=quill)
                stroke_blob(d, 12 + ox, 16, 4, 3, dark)
                pix(d, 10 + ox, 15, eye)
                d.line((8 + ox, 22, 14 + ox, 24), fill=outline)
                d.line((24 + ox, 22, 30 + ox, 24), fill=outline)
            else:
                ox = step
                stroke_blob(d, 18 + ox, 16, 11, 6, body)
                blob(d, 18 + ox, 18, 7, 3, belly)
                for i in range(5):
                    d.line((22 + ox - i, 14 - (i % 2), 26 + ox + i, 8 - i), fill=quill)
                stroke_blob(d, 28 + ox, 16, 4, 3, dark)
                pix(d, 30 + ox, 15, eye)
                d.line((10 + ox, 22, 16 + ox, 24), fill=outline)
                d.line((22 + ox, 22, 28 + ox, 24), fill=outline)
            sheet.paste(tile, (col * cell_w, row * cell_h), tile)
    path = os.path.join(OUT, "quillrat.webp")
    sheet.save(path, "WEBP", lossless=True)
    print("quill", sheet.size)


def portrait() -> None:
    src = os.path.join(OUT, "barb-light-idle.webp")
    im = Image.open(src).convert("RGBA")
    cell_h = im.height // 8
    frame = im.crop((0, 0, im.width, cell_h))
    bb = frame.getbbox()
    if bb:
        frame = frame.crop(bb)
    frame.save(os.path.join(OUT, "portrait.webp"), "WEBP", lossless=True)
    print("portrait", frame.size)


def main() -> None:
    # Group 0 on both body sheets is a standing cycle with a repeating stride.
    slice_modes(FALLEN, 0, 4, "fallen")
    slice_modes(ZOMBIE, 0, 4, "zombie")
    # Labels in the left gutter fuse rows on a full-width scan. The body strip does not.
    slice_modes(SHAMAN, 0, 4, "shaman", x0=80, x1=1600, min_h=40)
    draw_quill()
    portrait()


if __name__ == "__main__":
    main()
