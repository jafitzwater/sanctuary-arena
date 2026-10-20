"""Crop owner-supplied Spriters Resource sheets into the frames the match uses.

Raw sheets stay outside the repo. Output is compressed WebP atlases plus a
JSON index under src/assets/art/d2. Background is keyed to alpha. Directions
are reduced to 8 and long clips to 6 frames so a phone can load them.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = Path('/home/ubuntu/.cursor/projects/workspace/uploads')
OUT = ROOT / 'src/assets/art/d2'
OUT.mkdir(parents=True, exist_ok=True)

PLAYER_MODES = ['NU', 'WL', 'RN', 'GH', 'A1', 'A2', 'S1', 'DD']
MONSTER_MODES = ['NU', 'WL', 'A1', 'GH', 'DD']
MAX_DIRS = 8
MAX_FRAMES = 6


def key_colors(arr: np.ndarray) -> list[np.ndarray]:
    """Flat Spriter keys: gray, white, black, teal, and magenta, when common."""
    small = arr[::6, ::6, :3].reshape(-1, 3)
    q = (small // 8).astype(np.int32)
    packed = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    vals, counts = np.unique(packed, return_counts=True)
    colors = []
    for value, count in zip(vals, counts):
        if count / len(packed) < 0.08:
            continue
        key = int(value)
        rgb = np.array(((key // 10000) * 8, ((key // 100) % 100) * 8, (key % 100) * 8), dtype=np.int16)
        spread = int(rgb.max() - rgb.min())
        teal = rgb[0] < 40 and rgb[1] > 96 and rgb[2] > 96
        magenta = rgb[0] > 200 and rgb[1] < 40 and rgb[2] > 100
        if spread < 28 or teal or magenta:
            colors.append(rgb)
    if not colors:
        colors.append(np.array((168, 168, 168), dtype=np.int16))
    return colors


def is_background(rgb: np.ndarray, keys: list[np.ndarray]) -> np.ndarray:
    bg = np.zeros(rgb.shape[:2], dtype=bool)
    pixels = rgb.astype(np.int16)
    for key in keys:
        bg |= np.abs(pixels - key).sum(axis=2) <= 28
    return bg


def foreground(arr: np.ndarray) -> np.ndarray:
    return ~is_background(arr[:, :, :3], key_colors(arr))


def spans(flags: np.ndarray, min_gap: int, min_len: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    start = None
    gap = 0
    for i, value in enumerate(flags):
        if value:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                end = i - gap + 1
                if end - start >= min_len:
                    out.append((start, end))
                start = None
    if start is not None and len(flags) - start >= min_len:
        out.append((start, len(flags)))
    return out


def split_tall(fg: np.ndarray, y0: int, y1: int) -> list[tuple[int, int]]:
    height = y1 - y0
    if height <= 110:
        return [(y0, y1)]
    # A narrow strip keeps one column of frames from filling the gaps
    # between direction rows. Measuring the full width hides those gaps.
    x0 = max(0, fg.shape[1] // 12)
    x1 = max(x0 + 8, fg.shape[1] // 3)
    density = fg[y0:y1, x0:x1].mean(axis=1)
    smooth = np.convolve(density, np.ones(5) / 5, mode='same')
    cuts = []
    for i in range(24, len(smooth) - 24):
        if smooth[i] <= smooth[i - 1] and smooth[i] <= smooth[i + 1] and smooth[i] < 0.03:
            if not cuts or i - cuts[-1] > 58:
                cuts.append(i)
    rows = []
    cursor = 0
    for cut in cuts:
        if cut - cursor > 48:
            rows.append((y0 + cursor, y0 + cut))
        cursor = cut
    if height - cursor > 48:
        rows.append((y0 + cursor, y1))
    return rows or [(y0, y1)]


def row_frames(fg: np.ndarray, y0: int, y1: int) -> list[tuple[int, int]]:
    col = fg[y0:y1].any(axis=0)
    return spans(col, 4, 12)


def group_anims(rows: list[dict]) -> list[list[dict]]:
    groups: list[list[dict]] = []
    for row in rows:
        if row['n'] < 2:
            continue
        if not groups:
            groups.append([row])
            continue
        prev = groups[-1]
        med = int(np.median([item['n'] for item in prev]))
        gap = row['y0'] - prev[-1]['y1']
        if abs(row['n'] - med) <= 3 and gap < 200 and len(prev) < 16:
            prev.append(row)
        else:
            groups.append([row])
    return [group for group in groups if len(group) >= 4]


def sample(items: list, limit: int) -> list:
    if len(items) <= limit:
        return items
    idx = [round(i * (len(items) - 1) / (limit - 1)) for i in range(limit)]
    return [items[i] for i in idx]


def crop_frame(im: Image.Image, box, keys: list[np.ndarray]) -> Image.Image:
    x0, y0, x1, y1 = box
    frame = im.crop((x0, y0, x1, y1))
    arr = np.asarray(frame)
    if arr.shape[2] == 3:
        alpha_src = np.concatenate([arr, np.full((*arr.shape[:2], 1), 255, np.uint8)], axis=2)
    else:
        alpha_src = arr.copy()
    out = alpha_src.copy()
    out[is_background(alpha_src[:, :, :3], keys), 3] = 0
    pic = Image.fromarray(out, 'RGBA')
    if pic.height > 160:
        scale = 160 / pic.height
        pic = pic.resize((max(1, int(pic.width * scale)), 160), Image.Resampling.BOX)
    return pic


def pack(frames: list[Image.Image], path: Path) -> list[dict]:
    x = y = row_h = 0
    max_w = 1024
    places = []
    for frame in frames:
        if x > 0 and x + frame.width > max_w:
            y += row_h + 1
            x = 0
            row_h = 0
        places.append((x, y, frame.width, frame.height))
        row_h = max(row_h, frame.height)
        x += frame.width + 1
    width = min(max_w, max((px + pw) for px, _, pw, _ in places))
    atlas = Image.new('RGBA', (width, y + row_h), (0, 0, 0, 0))
    for frame, (px, py, _, _) in zip(frames, places):
        atlas.paste(frame, (px, py))
    atlas.save(path, 'WEBP', quality=72, method=4)
    return [{'x': px, 'y': py, 'w': pw, 'h': ph} for px, py, pw, ph in places]


def slice_sheet(path: Path, modes: list[str]) -> dict | None:
    print('slicing', path.name, flush=True)
    src = Image.open(path).convert('RGBA')
    arr = np.asarray(src)
    keys = key_colors(arr)
    print('  keys', [tuple(int(v) for v in key) for key in keys])
    fg = foreground(arr)
    if float(fg.mean()) < 0.015:
        from scipy import ndimage

        fg = ndimage.binary_closing(fg, structure=np.ones((3, 7)))
    rough = spans(fg.any(axis=1), 8, 30)
    rows = []
    for y0, y1 in rough:
        for a, b in split_tall(fg, y0, y1):
            frames = row_frames(fg, a, b)
            if len(frames) >= 2:
                rows.append({'y0': a, 'y1': b, 'n': len(frames), 'frames': frames})
    groups = group_anims(rows)
    print('  groups', [(len(g), int(np.median([r['n'] for r in g]))) for g in groups])
    if not groups:
        return None
    chosen = groups[: len(modes)]
    anims = {}
    packed: list[Image.Image] = []
    cursor = 0
    for mode, group in zip(modes, chosen):
        directions = sample(group, MAX_DIRS)
        per_dir = []
        count = None
        for direction in directions:
            frames = sample(direction['frames'], MAX_FRAMES)
            if count is None:
                count = len(frames)
            frames = frames[:count]
            while len(frames) < count:
                frames.append(frames[-1])
            boxes = []
            for x0, x1 in frames:
                boxes.append(crop_frame(src, (x0, direction['y0'], x1, direction['y1']), keys))
            per_dir.append(boxes)
        rects = []
        for boxes in per_dir:
            for frame in boxes:
                rects.append(cursor)
                packed.append(frame)
                cursor += 1
        anims[mode] = {'frames': count or 1, 'rects': rects}
    return {'dirs': len(sample(chosen[0], MAX_DIRS)), 'anims': anims, 'packed': packed}


def write_atlas(name: str, sliced: dict | None):
    if not sliced:
        print('  skip', name)
        return
    rects = pack(sliced['packed'], OUT / f'{name}.webp')
    anims = {}
    for mode, anim in sliced['anims'].items():
        anims[mode] = {
            'frames': anim['frames'],
            'rects': [rects[index] for index in anim['rects']],
        }
    payload = {'image': f'{name}.webp', 'dirs': sliced['dirs'], 'anims': anims}
    (OUT / f'{name}.json').write_text(json.dumps(payload, separators=(',', ':')))
    webp = OUT / f'{name}.webp'
    print(f'  wrote {name} {webp.stat().st_size // 1024}KB dirs={sliced["dirs"]} anims={list(anims)}')
    if 'NU' in anims and anims['NU']['rects']:
        box = anims['NU']['rects'][0]
        atlas = Image.open(webp)
        portrait = atlas.crop((box['x'], box['y'], box['x'] + box['w'], box['y'] + box['h']))
        if name == 'barb-light':
            portrait.save(OUT / 'portrait.webp', 'WEBP', quality=75)


def floor_crop(path: Path, dest: Path, box: tuple[int, int, int, int]):
    im = Image.open(path).convert('RGB')
    crop = im.crop(box)
    crop.thumbnail((384, 384), Image.Resampling.BOX)
    crop.save(dest, 'WEBP', quality=70, method=4)
    print('floor', dest.name, dest.stat().st_size // 1024, 'KB')


def npc_crop(path: Path, dest: Path, box: tuple[int, int, int, int] | None = None):
    from scipy import ndimage

    im = Image.open(path).convert('RGBA')
    if box:
        im = im.crop(box)
    arr = np.asarray(im)
    fg = foreground(arr)
    fg = ndimage.binary_closing(fg, structure=np.ones((5, 5)))
    labels, count = ndimage.label(fg)
    if count == 0:
        print('empty npc', path.name)
        return
    sizes = ndimage.sum(fg, labels, range(1, count + 1))
    best = int(np.argmax(sizes)) + 1
    ys, xs = np.where(labels == best)
    pad = 2
    x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    x1, y1 = min(arr.shape[1], int(xs.max()) + pad + 1), min(arr.shape[0], int(ys.max()) + pad + 1)
    frame = crop_frame(im, (x0, y0, x1, y1), key_colors(arr))
    if frame.height > 220:
        scale = 220 / frame.height
        frame = frame.resize((max(1, int(frame.width * scale)), 220), Image.Resampling.BOX)
    frame.save(dest, 'WEBP', quality=75, method=4)
    print('npc', dest.name, frame.size, dest.stat().st_size // 1024, 'KB')


def main():
    write_atlas('barb-light', slice_sheet(UPLOADS / 'Classes_-_Barbarian__Light__2abc.gif', PLAYER_MODES))
    write_atlas('barb-medium', slice_sheet(UPLOADS / 'Classes_-_Barbarian__Medium__aef7.gif', PLAYER_MODES))
    write_atlas('barb-heavy', slice_sheet(UPLOADS / 'Classes_-_Barbarian__Heavy__794a.gif', PLAYER_MODES))
    write_atlas('fallen', slice_sheet(UPLOADS / 'Fallen_Parts_-_Fallen_Body_250c.png', MONSTER_MODES))
    write_atlas('shaman', slice_sheet(UPLOADS / 'Enemies_and_Bosses_-_Fallen_Shaman_e95a.png', MONSTER_MODES))
    write_atlas('zombie', slice_sheet(UPLOADS / 'Zombie_Parts_-_Zombie_Body__Light__b0c1.png', MONSTER_MODES))
    write_atlas('rogue', slice_sheet(UPLOADS / 'Non-Playable_Characters_-_Rogue_Mercenary_af91.png', MONSTER_MODES))
    floor_crop(UPLOADS / 'Act_1_Tiles_-_Town_Floor_e9e6.png', OUT / 'town-floor.webp', (0, 400, 800, 900))
    floor_crop(UPLOADS / 'Act_1_Tiles_-_Outdoor_Floor_5734.png', OUT / 'outdoor-floor.webp', (200, 800, 900, 1500))
    floor_crop(UPLOADS / 'Act_1_Tiles_-_Graveyard_Ground_6c90.png', OUT / 'grave-floor.webp', (0, 0, 800, 479))
    npc_crop(UPLOADS / 'Non-Playable_Characters_-_Akara_32e7.png', OUT / 'npc-akara.webp')
    npc_crop(UPLOADS / 'Non-Playable_Characters_-_Kashya_4d71.png', OUT / 'npc-kashya.webp')
    npc_crop(UPLOADS / 'Non-Playable_Characters_-_Warriv__Act_1__c550.png', OUT / 'npc-warriv.webp', (828, 0, 1387, 596))


if __name__ == '__main__':
    main()
