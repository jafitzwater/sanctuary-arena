#!/usr/bin/env python3
"""
t364u "Put the approved bosses in the game": repacks the Sprite Director's approved boss atlases into lossless
WebP atlases + frame tables in the Rakanishu format (src/game/art/rakanishu-atlas.json), so the same loader,
foot anchor and ring approach applies. Pixels are copied 1:1 (no scaling, no recolour).

Input (read-only, approved by Joseph): /workspace/audit/<src>-atlas.{png,json}. Each is 8 dirs x (idle 8 +
attack 12) frames, every frame already trimmed to its opaque bbox; json = {cell, frames: {"<dir>_<anim>_<i>":
{x, y, w, h, ox, oy}}} with (ox, oy) the crop offset inside a cell of `cell` px whose feet are snapped to the
bottom row (boss_post.py), so the foot point is (cell/2, cell).
The source packs with a 1 px gap; this repack leaves a 4 px transparent gutter (the runtime 1 px outline reaches
up to 3 atlas px) and shelf-packs tallest first at the narrowest width (<= 2048) that keeps decoded bytes lowest.
Contrast pivot = mean luma of the opaque pixels of all frames (same definition as rakanishu-atlas.py; the full
sheet's mean luma equals this, as the sheet holds exactly these 160 frames).

Output: public/sprites/bosses/<id>-atlas.webp, src/game/art/boss-atlases.json
Columns: 0-7 idle8, 8-19 attack12. Rows: n ne e se s sw w nw (the class-sheet row order).
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

AUDIT = Path('/workspace/audit')
ROOT = Path(__file__).resolve().parent.parent
DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
ANIMS = [('idle', 8), ('attack', 12)]
GUTTER = 4
# id -> (approved source, credit note)
BOSSES = {
    'countess': 'countess-3d-v2',
    'radament': 'radament-3d-v2',
    'izual': 'bosses-3d-v1-izual',
    'council-a': 'bosses-3d-v1-council-a',
    'council-b': 'bosses-3d-v1-council-b',
    'council-c': 'bosses-3d-v1-council-c',
}


def pack(frames, width):
    order = sorted(range(len(frames)), key=lambda i: (-frames[i]['h'], -frames[i]['w']))
    x = y = GUTTER
    shelf = 0
    pos = {}
    for i in order:
        f = frames[i]
        assert f['w'] + 2 * GUTTER <= width
        if x + f['w'] + GUTTER > width:
            x = GUTTER
            y += shelf + GUTTER
            shelf = 0
        pos[i] = (x, y)
        x += f['w'] + GUTTER
        shelf = max(shelf, f['h'])
    h = (y + shelf + GUTTER + 3) // 4 * 4
    return h, pos


out_meta = {}
out_dir = ROOT / 'public/sprites/bosses'
out_dir.mkdir(parents=True, exist_ok=True)
total = 0
for bid, src in BOSSES.items():
    meta = json.loads((AUDIT / f'{src}-atlas.json').read_text())
    img = np.array(Image.open(AUDIT / f'{src}-atlas.png').convert('RGBA'))
    cell = int(meta['cell'])
    assert len(meta['frames']) == 160, (bid, len(meta['frames']))
    frames = []
    for r, d in enumerate(DIRS):
        col = 0
        for anim, n in ANIMS:
            for i in range(n):
                k = meta['frames'][f'{d}_{anim}_{i}']
                px = img[k['y']:k['y'] + k['h'], k['x']:k['x'] + k['w']]
                assert px.shape[:2] == (k['h'], k['w'])
                a = px[..., 3] > 0
                assert a[0].any() and a[-1].any() and a[:, 0].any() and a[:, -1].any(), (bid, d, anim, i, 'crop not tight')
                frames.append({'row': r, 'col': col, 'ox': k['ox'], 'oy': k['oy'], 'w': k['w'], 'h': k['h'], 'px': px})
                col += 1
    assert len(frames) == 160
    best = None
    for width in (1024, 1280, 1536, 1792, 2048):
        h, pos = pack(frames, width)
        if best is None or width * h < best[0] * best[1]:
            best = (width, h, pos)
    W, H, pos = best
    atlas = np.zeros((H, W, 4), np.uint8)
    for i, f in enumerate(frames):
        x, y = pos[i]
        f['x'], f['y'] = x, y
        atlas[y:y + f['h'], x:x + f['w']] = f['px']
    path = out_dir / f'{bid}-atlas.webp'
    Image.fromarray(atlas, 'RGBA').save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    back = np.array(Image.open(path).convert('RGBA'))
    assert (back == atlas).all(), bid
    allpx = np.concatenate([f['px'].reshape(-1, 4) for f in frames])
    op = allpx[allpx[:, 3] > 16][:, :3].astype(np.float64)
    pivot = float((op[:, 0] * 0.299 + op[:, 1] * 0.587 + op[:, 2] * 0.114).mean())
    # Body height (feet to the top of the figure) in the idle cells: median over the 8 directions of idle frame 0.
    idle_tops = sorted(cell - f['oy'] for f in frames if f['col'] == 0)
    body = int(round((idle_tops[3] + idle_tops[4]) / 2))
    out_meta[bid] = {
        'source': f'{src}-atlas.png (Sprite Director, approved by Joseph t364u)',
        'cell': cell, 'footX': cell // 2, 'footY': cell, 'w': W, 'h': H, 'pivot': round(pivot, 3), 'body': body,
        'frames': [[f['row'], f['col'], f['x'], f['y'], f['w'], f['h'], f['ox'], f['oy']] for f in frames],
    }
    mib = W * H * 4 / 2 ** 20
    total += mib
    src_mib = img.shape[0] * img.shape[1] * 4 / 2 ** 20
    print(f'{bid:10s} cell {cell} atlas {W}x{H} = {mib:.2f} MiB decoded (source {img.shape[1]}x{img.shape[0]} = {src_mib:.2f}), '
          f'webp {path.stat().st_size} B, pivot {pivot:.1f}, body {body} px')
(ROOT / 'src/game/art/boss-atlases.json').write_text(json.dumps(out_meta, separators=(',', ':')) + '\n')
print(f'total {total:.2f} MiB decoded')
