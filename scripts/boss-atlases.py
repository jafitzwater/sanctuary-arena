#!/usr/bin/env python3
"""
t370u "Put boss walk / hit / death / wind-up in the game" (was t364u): repacks the Sprite Director's per-animation
boss atlases (t366u + addendum t368u, approved by Joseph) into lossless WebP atlases + frame tables, one atlas per
boss per animation, so the game can load idle + walk first and attack / hit / death on demand.
Pixels are copied 1:1 (no scaling, no recolour).

Input (read-only): /workspace/audit/bosses-3d-v2-<boss>-atlas-<anim>.{png,json}, anim in idle, attack, walk, hit,
death. Each holds 8 dirs x N frames ("<dir>_<anim>_<i>"), every frame trimmed to its opaque bbox; (ox, oy) is the
crop offset inside a cell of cell.w x cell.h px whose anchor (feet on the ground) is json `anchor`, stored as the
pixel row the feet stand on, so the foot point is (anchor.x, anchor.y + 1): the same point as the approved C-cell
bottom-centre (cell/2, cell) of the t364u atlases (checked below: the v2 idle frames are pixel-identical to the
approved idle frames and sit at the same place relative to that point).
The v2 attack atlases hold the retimed wind-up (impact on column 6, BOSS_WINDUP 0.42 s).
The source packs with a 1 px gap; this repack leaves a 4 px transparent gutter (the runtime outline reaches up to
3 atlas px) and shelf-packs tallest first at the width (512-2048) that keeps decoded bytes lowest.
Contrast pivot = mean luma of the approved t364u atlas (unchanged, so the approved idle look stays the same).

Output: public/sprites/bosses/<id>-<anim>.webp, src/game/art/boss-atlases.json
Rows: n ne e se s sw w nw (the class-sheet row order). Columns: frame index within the animation.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

AUDIT = Path('/workspace/audit')
ROOT = Path(__file__).resolve().parent.parent
DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
ANIMS = [('idle', 8), ('walk', 8), ('attack', 12), ('hit', 4), ('death', 10)]
GUTTER = 4
# id -> approved t364u atlas (pivot + idle identity check)
APPROVED = {
    'countess': 'countess-3d-v2',
    'radament': 'radament-3d-v2',
    'izual': 'bosses-3d-v1-izual',
    'council-a': 'bosses-3d-v1-council-a',
    'council-b': 'bosses-3d-v1-council-b',
    'council-c': 'bosses-3d-v1-council-c',
}
# World units per 8-frame walk loop (Sprite Director log table, t366u).
STRIDE = {'countess': 114.4, 'radament': 200.9, 'izual': 190.0, 'council-a': 145.9, 'council-b': 145.9, 'council-c': 145.9}


def pack(frames, width):
    order = sorted(range(len(frames)), key=lambda i: (-frames[i]['h'], -frames[i]['w']))
    x = y = GUTTER
    shelf = 0
    pos = {}
    for i in order:
        f = frames[i]
        if f['w'] + 2 * GUTTER > width:
            return None
        if x + f['w'] + GUTTER > width:
            x = GUTTER
            y += shelf + GUTTER
            shelf = 0
        pos[i] = (x, y)
        x += f['w'] + GUTTER
        shelf = max(shelf, f['h'])
    h = (y + shelf + GUTTER + 3) // 4 * 4
    return h, pos


def luma_mean(img):
    px = img.reshape(-1, 4)
    op = px[px[:, 3] > 16][:, :3].astype(np.float64)
    return float((op[:, 0] * 0.299 + op[:, 1] * 0.587 + op[:, 2] * 0.114).mean())


out_meta = {}
out_dir = ROOT / 'public/sprites/bosses'
out_dir.mkdir(parents=True, exist_ok=True)
total = 0
for bid, approved in APPROVED.items():
    ameta = json.loads((AUDIT / f'{approved}-atlas.json').read_text())
    aimg = np.array(Image.open(AUDIT / f'{approved}-atlas.png').convert('RGBA'))
    acell = int(ameta['cell'])
    pivot = luma_mean(aimg)
    entry = None
    line = []
    for anim, n in ANIMS:
        meta = json.loads((AUDIT / f'bosses-3d-v2-{bid}-atlas-{anim}.json').read_text())
        img = np.array(Image.open(AUDIT / f'bosses-3d-v2-{bid}-atlas-{anim}.png').convert('RGBA'))
        cw, ch = int(meta['cell']['w']), int(meta['cell']['h'])
        foot_x, foot_y = int(meta['anchor']['x']), int(meta['anchor']['y']) + 1
        assert int(meta['approvedCell']) == acell, (bid, anim)
        assert len(meta['frames']) == 8 * n, (bid, anim, len(meta['frames']))
        if entry is None:
            entry = {'source': f'bosses-3d-v2-{bid}-atlas-*.png (Sprite Director t366u/t368u, approved by Joseph t370u)',
                     'cellW': cw, 'cellH': ch, 'approvedCell': acell, 'footX': foot_x, 'footY': foot_y,
                     'pivot': round(pivot, 3), 'stride': STRIDE[bid], 'anims': {}}
        assert (cw, ch, foot_x, foot_y) == (entry['cellW'], entry['cellH'], entry['footX'], entry['footY']), (bid, anim)
        assert abs(float(meta['walk']['strideWorldUnits']) - STRIDE[bid]) <= 0.2, (bid, meta['walk'])
        frames = []
        for r, d in enumerate(DIRS):
            for i in range(n):
                k = meta['frames'][f'{d}_{anim}_{i}']
                px = img[k['y']:k['y'] + k['h'], k['x']:k['x'] + k['w']]
                assert px.shape[:2] == (k['h'], k['w'])
                a = px[..., 3] > 0
                assert a[0].any() and a[-1].any() and a[:, 0].any() and a[:, -1].any(), (bid, d, anim, i, 'crop not tight')
                assert 0 <= k['ox'] and k['ox'] + k['w'] <= cw and 0 <= k['oy'] and k['oy'] + k['h'] <= ch, (bid, d, anim, i)
                if anim == 'idle':
                    # Same pixels, same place relative to the foot point as the approved idle frame.
                    q = ameta['frames'][f'{d}_idle_{i}']
                    qp = aimg[q['y']:q['y'] + q['h'], q['x']:q['x'] + q['w']]
                    assert qp.shape == px.shape and (qp == px).all(), (bid, d, i, 'idle differs from approved')
                    assert (k['ox'] - foot_x, k['oy'] - foot_y) == (q['ox'] - acell // 2, q['oy'] - acell), (bid, d, i)
                frames.append({'row': r, 'col': i, 'ox': k['ox'], 'oy': k['oy'], 'w': k['w'], 'h': k['h'], 'px': px})
        best = None
        for width in (512, 640, 768, 896, 1024, 1280, 1536, 1792, 2048):
            res = pack(frames, width)
            if res and (best is None or width * res[0] < best[0] * best[1]):
                best = (width, res[0], res[1])
        W, H, pos = best
        atlas = np.zeros((H, W, 4), np.uint8)
        for i, f in enumerate(frames):
            x, y = pos[i]
            f['x'], f['y'] = x, y
            atlas[y:y + f['h'], x:x + f['w']] = f['px']
        path = out_dir / f'{bid}-{anim}.webp'
        Image.fromarray(atlas, 'RGBA').save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)
        back = np.array(Image.open(path).convert('RGBA'))
        assert (back == atlas).all(), (bid, anim)
        if anim == 'idle':
            # Body height (feet to the top of the figure): median over the 8 directions of idle frame 0.
            tops = sorted(foot_y - f['oy'] for f in frames if f['col'] == 0)
            entry['body'] = int(round((tops[3] + tops[4]) / 2))
        entry['anims'][anim] = {'w': W, 'h': H, 'frames': [[f['row'], f['col'], f['x'], f['y'], f['w'], f['h'], f['ox'], f['oy']] for f in frames]}
        mib = W * H * 4 / 2 ** 20
        total += mib
        line.append(f'{anim} {W}x{H} {mib:.2f} MiB ({path.stat().st_size // 1024} KiB)')
    out_meta[bid] = entry
    print(f'{bid:10s} body {entry["body"]} pivot {pivot:.1f}: ' + '; '.join(line))
(ROOT / 'src/game/art/boss-atlases.json').write_text(json.dumps(out_meta, separators=(',', ':')) + '\n')
print(f'total {total:.2f} MiB decoded')
