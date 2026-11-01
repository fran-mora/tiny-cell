#!/usr/bin/env python3
"""Draw the Tiny Cell app icon: a glowing single cell with a flagellum."""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons'); os.makedirs(OUT, exist_ok=True)
S = 1024
random.seed(3)

def draw(pad=0.0):
    img = Image.new('RGB', (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - S * 0.5, y - S * 0.45) / S
            t = min(1, d * 1.5)
            px[x, y] = (int(14 + (2 - 14) * t), int(92 + (14 - 92) * t), int(100 + (26 - 100) * t))
    # plankton motes
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    for _ in range(40):
        x, y, r = random.randint(0, S), random.randint(0, S), random.randint(3, 9)
        ld.ellipse([x - r, y - r, x + r, y + r], fill=(255, 232, 140, random.randint(90, 200)))
    lay = lay.filter(ImageFilter.GaussianBlur(2)); img.paste(lay, (0, 0), lay)
    R = S * (0.25 - pad * 0.6)
    cx, cy = S * 0.54, S * 0.47
    # glow
    g = Image.new('RGBA', (S, S), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
    gd.ellipse([cx - R * 1.6, cy - R * 1.6, cx + R * 1.6, cy + R * 1.6], fill=(110, 255, 225, 110))
    g = g.filter(ImageFilter.GaussianBlur(S * 0.06)); img.paste(g, (0, 0), g)
    # flagellum
    f = Image.new('RGBA', (S, S), (0, 0, 0, 0)); fd = ImageDraw.Draw(f)
    pts = []
    for i in range(60):
        t = i / 59
        x = cx - R * 0.95 - t * R * 1.5
        y = cy + R * 0.35 + math.sin(t * math.pi * 2.4) * R * 0.28 * t + t * R * 0.5
        pts.append((x, y))
    fd.line(pts, fill=(210, 255, 245, 230), width=int(S * 0.018), joint='curve')
    f = f.filter(ImageFilter.GaussianBlur(1.5)); img.paste(f, (0, 0), f)
    # membrane + cytoplasm (wobbly blob)
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); cp = c.load()
    def rad(a):
        return R * (1 + 0.05 * math.sin(a * 3 + 0.7) + 0.035 * math.sin(a * 5 + 2.1))
    for y in range(int(cy - R * 1.2), int(cy + R * 1.2)):
        for x in range(int(cx - R * 1.2), int(cx + R * 1.2)):
            dx, dy = x - cx, y - cy
            a = math.atan2(dy, dx); rr = math.hypot(dx, dy) / rad(a)
            if rr > 1: continue
            edge = rr ** 6
            hl = max(0, 1 - math.hypot(dx + R * 0.35, dy + R * 0.4) / (R * 0.9))
            r_ = int(60 + 120 * edge + 120 * hl); g_ = int(200 + 50 * edge + 40 * hl); b_ = int(185 + 60 * edge + 50 * hl)
            al = int(170 + 85 * edge)
            if rr > 0.93: r_, g_, b_, al = 215, 255, 248, 255
            cp[x, y] = (min(255, r_), min(255, g_), min(255, b_), al)
    c = c.filter(ImageFilter.SMOOTH_MORE); img.paste(c, (0, 0), c)
    d = ImageDraw.Draw(img)
    # nucleus + organelles
    nx, ny, nr = cx + R * 0.12, cy + R * 0.05, R * 0.3
    d.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], fill=(48, 128, 176))
    d.ellipse([nx - nr * 0.45, ny - nr * 0.5, nx + nr * 0.15, ny - nr * 0.05], fill=(150, 220, 245))
    for (ox, oy, orr, col) in [(-0.45, -0.3, 0.09, (120, 255, 150)), (-0.25, 0.45, 0.08, (120, 255, 150)), (0.5, -0.35, 0.07, (255, 170, 100)), (0.45, 0.45, 0.06, (255, 230, 140))]:
        x, y, r = cx + R * ox, cy + R * oy, R * orr
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    return img

big = draw(0.0)
big.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'))
big.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'icon-192.png'))
big.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, 'apple-touch-icon.png'))
draw(0.08).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'maskable-512.png'))
print('icons written')
