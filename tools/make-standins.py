"""Draw Diablo II-like stand-ins for UI and creatures that have no usable sheet.

These are original drawings in the classic palette (red life globe, blue mana
globe, bronze skill squares, inventory-style item icons). They are not ripped
frames. Run from the repo root: python3 tools/make-standins.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / 'src/assets/art/ui'
ICONS = ROOT / 'src/assets/art/icons'
GEN = ROOT / 'src/assets/art/generated'
for folder in (UI, ICONS, GEN):
    folder.mkdir(parents=True, exist_ok=True)

INK = (12, 8, 6, 255)
GOLD = (212, 176, 96, 255)
BRONZE = (96, 64, 32, 255)
BROWN = (48, 28, 16, 255)
LEATHER = (120, 72, 36, 255)
SKIN = (210, 158, 114, 255)
STEEL = (176, 184, 192, 255)
DARK_STEEL = (72, 76, 84, 255)
RED = (164, 28, 24, 255)
RED_HI = (236, 92, 56, 255)
BLUE = (28, 72, 168, 255)
BLUE_HI = (140, 196, 240, 255)
WOOD = (92, 56, 28, 255)


def new(w, h, color=(0, 0, 0, 0)):
    return Image.new('RGBA', (w, h), color)


def skill_plate():
    im = new(48, 48, (24, 16, 10, 255))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 47, 47), outline=GOLD)
    d.rectangle((2, 2, 45, 45), outline=BRONZE)
    return im, d


def save(im, path):
    im.save(path, optimize=True)
    print(path.relative_to(ROOT), im.size)


def orb(kind):
    im = new(128, 128, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((4, 4, 123, 123), fill=(28, 18, 10, 255))
    d.ellipse((10, 10, 117, 117), fill=(168, 132, 64, 255))
    d.ellipse((16, 16, 111, 111), fill=(36, 22, 12, 255))
    if kind == 'life':
        d.ellipse((22, 22, 105, 105), fill=(92, 12, 10, 255))
        d.ellipse((22, 48, 105, 105), fill=RED)
        d.pieslice((22, 22, 105, 105), 200, 340, fill=RED_HI)
        d.ellipse((36, 34, 58, 52), fill=(255, 210, 180, 90))
    else:
        d.ellipse((22, 22, 105, 105), fill=(8, 16, 48, 255))
        d.ellipse((22, 48, 105, 105), fill=BLUE)
        d.pieslice((22, 22, 105, 105), 200, 340, fill=BLUE_HI)
        d.ellipse((36, 34, 58, 52), fill=(220, 240, 255, 90))
    d.arc((16, 16, 111, 111), 200, 340, fill=(240, 220, 160, 255), width=2)
    return im


def belt():
    im = new(640, 96, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((8, 18, 631, 88), 8, fill=(42, 32, 24, 255), outline=GOLD, width=3)
    d.rounded_rectangle((14, 24, 625, 82), 6, outline=BRONZE)
    for i in range(18):
        x = 24 + i * 34
        d.line((x, 28, x, 78), fill=(28, 20, 14, 255))
    for i in range(4):
        x = 168 + i * 78
        d.rounded_rectangle((x, 30, x + 64, 76), 4, fill=(18, 12, 8, 180), outline=(120, 96, 56, 255))
    return im


def icon_bash():
    im, d = skill_plate()
    d.polygon([(16, 34), (22, 14), (30, 14), (36, 36), (24, 40)], fill=WOOD)
    d.polygon([(20, 18), (28, 10), (34, 16), (26, 22)], fill=STEEL)
    d.arc((8, 8, 40, 40), 300, 40, fill=(255, 220, 120, 255), width=2)
    return im


def icon_shout():
    im, d = skill_plate()
    d.ellipse((16, 14, 32, 34), fill=SKIN)
    d.polygon([(14, 16), (18, 8), (22, 16)], fill=STEEL)
    d.polygon([(26, 16), (30, 8), (34, 16)], fill=STEEL)
    d.arc((6, 18, 20, 34), 100, 260, fill=GOLD, width=2)
    d.arc((28, 18, 42, 34), 280, 80, fill=GOLD, width=2)
    return im


def icon_stun():
    im, d = skill_plate()
    d.rounded_rectangle((20, 12, 28, 36), 3, fill=WOOD)
    d.ellipse((16, 30, 32, 40), fill=(72, 44, 20, 255))
    for cx, cy in ((12, 14), (36, 16), (14, 28), (38, 30)):
        d.regular_polygon((cx, cy, 4), 4, rotation=20, fill=(240, 230, 180, 255))
    return im


def icon_leap():
    im, d = skill_plate()
    d.ellipse((18, 10, 28, 20), fill=SKIN)
    d.line((22, 20, 30, 30), fill=LEATHER, width=3)
    d.line((22, 22, 12, 18), fill=LEATHER, width=2)
    d.line((30, 30, 24, 40), fill=LEATHER, width=2)
    d.line((30, 30, 38, 38), fill=LEATHER, width=2)
    d.line((12, 16, 8, 28), fill=STEEL, width=2)
    d.arc((8, 34, 40, 46), 200, 340, fill=(180, 160, 120, 255), width=2)
    return im


def icon_orders():
    im, d = skill_plate()
    d.line((24, 8, 24, 42), fill=WOOD, width=3)
    d.polygon([(24, 10), (40, 16), (24, 24)], fill=RED)
    d.polygon([(26, 12), (36, 16), (26, 21)], fill=GOLD)
    return im


def icon_whirl():
    im, d = skill_plate()
    d.ellipse((18, 16, 30, 30), fill=LEATHER)
    d.ellipse((20, 10, 28, 18), fill=SKIN)
    d.arc((8, 8, 40, 40), 20, 200, fill=(220, 230, 255, 255), width=3)
    d.arc((12, 12, 36, 36), 200, 20, fill=STEEL, width=2)
    return im


def flask(color, hi):
    im = new(40, 40, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((16, 4, 24, 12), 2, fill=(210, 180, 120, 255))
    d.polygon([(12, 16), (28, 16), (32, 36), (8, 36)], fill=color)
    d.polygon([(14, 18), (20, 18), (18, 32), (12, 32)], fill=hi)
    d.rectangle((14, 12, 26, 16), fill=(80, 90, 96, 255))
    return im


def club():
    im = new(56, 84, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((24, 28, 34, 78), 4, fill=WOOD)
    d.ellipse((14, 8, 42, 40), fill=(72, 44, 24, 255))
    d.ellipse((18, 12, 30, 24), fill=(140, 96, 56, 255))
    return im


def sword(length, curve=0, wide=False):
    im = new(56, 84, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((24, 62, 32, 80), fill=WOOD)
    d.polygon([(16, 60), (40, 60), (36, 66), (20, 66)], fill=GOLD)
    if curve:
        d.line((28, 58, 34, 36, 40, 12), fill=STEEL, width=5 if wide else 4)
        d.line((30, 56, 36, 34, 42, 14), fill=(230, 236, 240, 255), width=1)
    else:
        top = 6 if length > 60 else 14
        d.polygon([(24, 58), (32, 58), (30, top), (26, top)], fill=STEEL)
        d.line((27, 56, 28, top + 4), fill=(230, 236, 240, 255), width=1)
        if wide:
            d.polygon([(20, 58), (36, 58), (33, 16), (23, 16)], fill=STEEL)
    return im


def armor(tone, studs=False, rings=False):
    im = new(56, 72, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(16, 14), (40, 14), (46, 28), (40, 64), (16, 64), (10, 28)], fill=tone)
    d.polygon([(22, 14), (34, 14), (32, 22), (24, 22)], fill=(20, 12, 8, 255))
    d.line((28, 22, 28, 60), fill=GOLD, width=2)
    if studs:
        for y in (30, 42, 54):
            for x in (18, 28, 38):
                d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=STEEL)
    if rings:
        for y in range(26, 62, 6):
            d.arc((14, y, 42, y + 8), 20, 160, fill=DARK_STEEL, width=2)
    return im


def helm(kind):
    im = new(48, 48, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if kind == 'cap':
        d.pieslice((8, 10, 40, 42), 200, 340, fill=LEATHER)
        d.chord((8, 22, 40, 40), 0, 180, fill=(72, 40, 20, 255))
    elif kind == 'skull':
        d.pieslice((8, 8, 40, 40), 200, 340, fill=STEEL)
        d.ellipse((16, 22, 22, 28), fill=INK)
        d.ellipse((26, 22, 32, 28), fill=INK)
    elif kind == 'helm':
        d.pieslice((6, 6, 42, 42), 190, 350, fill=STEEL)
        d.polygon([(6, 24), (42, 24), (36, 34), (12, 34)], fill=DARK_STEEL)
        d.rectangle((20, 20, 28, 28), fill=(40, 24, 16, 255))
    else:
        d.pieslice((4, 4, 44, 44), 200, 340, fill=STEEL)
        d.rectangle((8, 24, 40, 36), fill=DARK_STEEL)
        d.polygon([(18, 28), (30, 28), (28, 40), (20, 40)], fill=(20, 16, 12, 255))
        d.rectangle((22, 8, 26, 16), fill=GOLD)
    return im


def belt_item(wide):
    im = new(56, 28, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((4, 8, 51, 20), 4, fill=LEATHER if not wide else (84, 48, 24, 255), outline=GOLD)
    d.rectangle((24, 6, 32, 22), fill=GOLD if wide else BRONZE)
    if wide:
        d.rectangle((8, 10, 14, 18), fill=STEEL)
        d.rectangle((42, 10, 48, 18), fill=STEEL)
    return im


def figure(draw, ox, oy, scale, cape, bow=False, legs=0):
    s = scale
    skin = SKIN
    draw.ellipse((ox + 10 * s, oy + 2 * s, ox + 22 * s, oy + 16 * s), fill=skin)
    draw.polygon(
        [
            (ox + 8 * s, oy + 6 * s),
            (ox + 14 * s, oy),
            (ox + 18 * s, oy + 6 * s),
        ],
        fill=cape,
    )
    draw.polygon(
        [
            (ox + 6 * s, oy + 16 * s),
            (ox + 26 * s, oy + 16 * s),
            (ox + 24 * s, oy + 36 * s),
            (ox + 8 * s, oy + 36 * s),
        ],
        fill=cape,
    )
    draw.line(
        [
            (ox + 12 * s, oy + 36 * s),
            (ox + (10 + legs) * s, oy + 52 * s),
        ],
        fill=(48, 28, 20, 255),
        width=max(2, int(3 * s)),
    )
    draw.line(
        [
            (ox + 20 * s, oy + 36 * s),
            (ox + (22 - legs) * s, oy + 52 * s),
        ],
        fill=(48, 28, 20, 255),
        width=max(2, int(3 * s)),
    )
    if bow:
        draw.arc((ox + 22 * s, oy + 14 * s, ox + 34 * s, oy + 40 * s), 250, 110, fill=WOOD, width=max(2, int(2 * s)))
        draw.line((ox + 28 * s, oy + 16 * s, ox + 28 * s, oy + 38 * s), fill=(220, 210, 180, 255), width=1)


def blood_raven(step):
    im = new(96, 128, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    figure(d, 18, 8, 1.7, (120, 16, 18, 255), bow=True, legs=4 if step else -2)
    d.ellipse((46, 18, 54, 26), fill=(20, 8, 8, 255))
    return im


def quill_rat(step):
    im = new(96, 72, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    shift = 4 if step else 0
    body = (96, 62, 28, 255)
    belly = (196, 160, 110, 255)
    d.ellipse((16 + shift, 28, 78 + shift, 58), fill=body)
    d.ellipse((48 + shift, 24, 84 + shift, 48), fill=body)
    d.pieslice((18 + shift, 34, 70 + shift, 60), 10, 170, fill=belly)
    d.ellipse((70 + shift, 28, 78 + shift, 36), fill=(20, 12, 8, 255))
    d.polygon([(78 + shift, 36), (92, 40), (78 + shift, 42)], fill=body)
    for i, x in enumerate(range(24, 68, 7)):
        h = 16 + (i % 3) * 4
        d.line((x + shift, 36, x - 6 + shift, 36 - h), fill=(42, 28, 16, 255), width=2)
    d.ellipse((22 + shift, 50, 30 + shift, 58), fill=body)
    d.ellipse((58 + shift, 50, 66 + shift, 58), fill=body)
    return im


def portrait():
    im = new(64, 64, (20, 12, 8, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((16, 10, 48, 46), fill=SKIN)
    d.polygon([(14, 22), (24, 6), (28, 20)], fill=STEEL)
    d.polygon([(36, 20), (40, 6), (50, 22)], fill=STEEL)
    d.pieslice((12, 18, 52, 58), 200, 340, fill=(92, 24, 18, 255))
    d.rectangle((18, 40, 46, 62), fill=LEATHER)
    return im


def main():
    save(orb('life'), UI / 'orb-life.png')
    save(orb('mana'), UI / 'orb-mana.png')
    save(belt(), UI / 'belt-frame.png')
    save(icon_bash(), ICONS / 'bash.png')
    save(icon_shout(), ICONS / 'shout.png')
    save(icon_stun(), ICONS / 'stun.png')
    save(icon_leap(), ICONS / 'leap-attack.png')
    save(icon_orders(), ICONS / 'battle-orders.png')
    save(icon_whirl(), ICONS / 'whirlwind.png')
    save(flask(RED, RED_HI), ICONS / 'health-potion.png')
    save(flask(BLUE, BLUE_HI), ICONS / 'mana-potion.png')
    save(club(), ICONS / 'clb.png')
    save(sword(74), ICONS / 'ssd.png')
    save(sword(74, curve=1), ICONS / 'flc.png')
    save(sword(80, wide=True), ICONS / '2hs.png')
    save(armor((150, 118, 78, 255)), ICONS / 'qui.png')
    save(armor(LEATHER), ICONS / 'lea.png')
    save(armor(LEATHER, studs=True), ICONS / 'stu.png')
    save(armor((120, 124, 128, 255), rings=True), ICONS / 'rng.png')
    save(helm('cap'), ICONS / 'cap.png')
    save(helm('skull'), ICONS / 'skp.png')
    save(helm('helm'), ICONS / 'hlm.png')
    save(helm('full'), ICONS / 'fhl.png')
    save(belt_item(False), ICONS / 'lbl.png')
    save(belt_item(True), ICONS / 'mbl.png')
    save(blood_raven(0), GEN / 'blood-raven.png')
    save(blood_raven(1), GEN / 'blood-raven-walk.png')
    save(quill_rat(0), GEN / 'quillrat.png')
    save(quill_rat(1), GEN / 'quillrat-walk.png')
    save(portrait(), ROOT / 'src/assets/art/d2/portrait.webp')


if __name__ == '__main__':
    (ROOT / 'src/assets/art/d2').mkdir(parents=True, exist_ok=True)
    main()
