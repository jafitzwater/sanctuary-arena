"""Cut Act I floor transitions and camp/roadside props from the committed source sheets.

Writes lossless webp under src/assets/art/d2. The large source PNGs stay in the
repo and are not imported by the client.
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "/workspace/src/assets/art/source"
OUT = "/workspace/src/assets/art/d2"
TW, TH = 160, 80


def key_and_despill(rgba: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    r = out[:, :, 0].astype(np.int16)
    g = out[:, :, 1].astype(np.int16)
    b = out[:, :, 2].astype(np.int16)
    a = out[:, :, 3]
    mag = (a < 16) | (
        (g < 80) & (r > 170) & (b > 120) & (np.minimum(r, b) - g > 70) & (np.abs(r - b) < 120)
    )
    out[mag, 0] = 0
    out[mag, 1] = 0
    out[mag, 2] = 0
    out[mag, 3] = 0
    opaque = out[:, :, 3] > 0
    edge = opaque & ndimage.binary_dilation(~opaque)
    spill = np.minimum(r, b) - g
    mask = edge & (spill > 12)
    out[:, :, 0][mask] = np.clip(r[mask] - spill[mask], 0, 255).astype(np.uint8)
    out[:, :, 2][mask] = np.clip(b[mask] - spill[mask], 0, 255).astype(np.uint8)
    return out


def save(im: Image.Image, name: str) -> None:
    path = os.path.join(OUT, name)
    im.save(path, "WEBP", lossless=True, quality=100, method=6)
    print(name, im.size, os.path.getsize(path))


def trim(rgba: np.ndarray, pad: int = 1) -> np.ndarray:
    ys, xs = np.where(rgba[:, :, 3] > 0)
    if len(ys) == 0:
        raise SystemExit("empty sprite")
    y0, y1 = max(0, int(ys.min()) - pad), min(rgba.shape[0], int(ys.max()) + 1 + pad)
    x0, x1 = max(0, int(xs.min()) - pad), min(rgba.shape[1], int(xs.max()) + 1 + pad)
    return rgba[y0:y1, x0:x1]


def crop(sheet: np.ndarray, x: int, y: int, w: int, h: int) -> np.ndarray:
    return trim(key_and_despill(sheet[y : y + h, x : x + w]))


def grass_vector(cell: np.ndarray) -> tuple[float, float]:
    mag = (cell[:, :, 0] == 255) & (cell[:, :, 1] == 0) & (cell[:, :, 2] == 255)
    pix = cell.astype(np.int16)
    grass = (~mag) & (pix[:, :, 1] > pix[:, :, 0] + 5) & (pix[:, :, 1] > pix[:, :, 2])
    dirt = (~mag) & (pix[:, :, 0] > pix[:, :, 1] + 3) & (pix[:, :, 0] > 28)
    if grass.sum() < 400 or dirt.sum() < 400:
        return (0.0, 0.0)
    gy, gx = np.argwhere(grass).mean(0)
    dy, dx = np.argwhere(dirt).mean(0)
    return (float(gx - dx), float(gy - dy))


def pick_transitions(sheet: np.ndarray) -> list[tuple[int, int, int]]:
    """Return (x, y, side) for four grass-to-dirt diamonds, one per screen quadrant."""
    found: list[tuple[float, float, float, int, int]] = []
    for x0 in (0, 801):
        y = 7
        while y + TH <= sheet.shape[0]:
            for col in range(5):
                x = x0 + col * TW
                cell = sheet[y : y + TH, x : x + TW]
                if cell.shape[0] != TH or cell.shape[1] != TW:
                    continue
                mag = (cell[:, :, 0] == 255) & (cell[:, :, 1] == 0) & (cell[:, :, 2] == 255)
                fill = 1 - mag.mean()
                if not (0.45 <= fill <= 0.58 and bool(mag[0, 0]) and bool(mag[-1, 0])):
                    continue
                gx, gy = grass_vector(cell)
                sep = float(np.hypot(gx, gy))
                if sep < 28:
                    continue
                found.append((sep, gx, gy, x, y))
            y += TH
    # Quadrant centers: +x, +y, -x, -y (screen east, south, west, north).
    targets = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)]
    picked: list[tuple[int, int, int]] = []
    used: set[tuple[int, int]] = set()
    for tx, ty in targets:
        best = None
        for sep, gx, gy, x, y in found:
            if (x, y) in used:
                continue
            magv = np.hypot(gx, gy) or 1
            dot = (gx / magv) * tx + (gy / magv) * ty
            score = dot * 2 + sep / 80
            if best is None or score > best[0]:
                best = (score, x, y, gx, gy, dot)
        if best is None or best[5] < 0.45:
            raise SystemExit(f"no transition toward {(tx, ty)}")
        used.add((best[1], best[2]))
        picked.append((best[1], best[2], 0))
        print(f"blend {tx:+.0f},{ty:+.0f} at {best[1]},{best[2]} grass ({best[3]:.1f},{best[4]:.1f}) dot {best[5]:.2f}")
    return picked


def build_ground(outdoor: np.ndarray) -> None:
    current = np.asarray(Image.open(os.path.join(OUT, "ground.webp")).convert("RGBA"))
    if current.shape[1] != TW * 4 or current.shape[0] != TH * 6:
        raise SystemExit(f"unexpected ground {current.shape}")
    cleaned = key_and_despill(current)
    row = np.zeros((TH, TW * 4, 4), dtype=np.uint8)
    for col, (x, y, _) in enumerate(pick_transitions(outdoor)):
        cell = outdoor[y : y + TH, x : x + TW]
        row[:, col * TW : (col + 1) * TW] = key_and_despill(np.dstack([cell, np.full(cell.shape[:2], 255, np.uint8)]))
    sheet = np.concatenate([cleaned, row], axis=0)
    save(Image.fromarray(sheet), "ground.webp")


def build_props(outdoor: np.ndarray, town: np.ndarray) -> None:
    specs = {
        "tree0": (outdoor, 0, 355, 136, 399),
        "tree1": (outdoor, 320, 321, 120, 423),
        "tree2": (outdoor, 800, 324, 80, 417),
        "tree3": (outdoor, 1120, 359, 116, 395),
        "tree4": (outdoor, 1280, 395, 116, 351),
        "rock0": (outdoor, 1680, 3898, 160, 157),
        "rock1": (outdoor, 1840, 3429, 160, 121),
        "rock2": (outdoor, 801, 3171, 159, 121),
        "stump0": (outdoor, 0, 2416, 90, 84),
        "stump1": (outdoor, 2942, 2804, 98, 83),
        "stump2": (outdoor, 1158, 3710, 73, 80),
        "fence0": (town, 160, 100, 108, 197),
        "fence1": (town, 686, 78, 114, 219),
        "fence2": (town, 1040, 88, 160, 209),
        "tent0": (town, 3211, 782, 231, 150),
        "tent1": (town, 56, 802, 207, 139),
        "tent2": (town, 3906, 458, 212, 178),
        "wagon0": (town, 4160, 508, 128, 118),
    }
    for name, (sheet, x, y, w, h) in specs.items():
        sprite = crop(sheet, x, y, w, h)
        if sprite.shape[0] < 16 or sprite.shape[1] < 16:
            raise SystemExit(f"{name} too small {sprite.shape}")
        if sprite[:, :, 3].mean() < 0.2:
            raise SystemExit(f"{name} keyed away")
        save(Image.fromarray(sprite), f"{name}.webp")


def main() -> None:
    outdoor_floor = np.asarray(Image.open(os.path.join(SRC, "act1-outdoor-floor.png")).convert("RGB"))
    outdoor = np.asarray(Image.open(os.path.join(SRC, "act1-outdoor.png")).convert("RGBA"))
    town = np.asarray(Image.open(os.path.join(SRC, "act1-town-objects.png")).convert("RGBA"))
    build_ground(outdoor_floor)
    build_props(outdoor, town)


if __name__ == "__main__":
    main()
