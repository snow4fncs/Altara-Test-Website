# Puts cut-out product PNGs (from cutout.swift) on pure white #FFFFFF, 2000 x 2000, product filling about 85-90%.
# usage: python3 -I tools/amazon/compose.py <out.jpg> <cut1.png> [cut2.png ...]   (several cut-outs sit side by side)
import sys
from PIL import Image

SIZE, FILL, GAP = 2000, 0.88, 40
out, srcs = sys.argv[1], sys.argv[2:]
parts = []
for s in srcs:
    im = Image.open(s).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 0 if v < 24 else v)  # drop the faint halo the mask leaves on the old backdrop
    im.putalpha(a)
    parts.append(im.crop(a.getbbox()))
h = max(p.height for p in parts)
parts = [p.resize((round(p.width * h / p.height), h), Image.LANCZOS) for p in parts]
row = Image.new('RGBA', (sum(p.width for p in parts) + GAP * (len(parts) - 1), h), (255, 255, 255, 0))
x = 0
for p in parts:
    row.alpha_composite(p, (x, 0)); x += p.width + GAP
k = SIZE * FILL / max(row.size)
row = row.resize((round(row.width * k), round(row.height * k)), Image.LANCZOS)
canvas = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 255))
canvas.alpha_composite(row, ((SIZE - row.width) // 2, (SIZE - row.height) // 2))
canvas.convert('RGB').save(out, quality=92)
c = canvas.convert('RGB')
print(out, 'corner pixels', c.getpixel((0, 0)), c.getpixel((SIZE - 1, SIZE - 1)), '| product box', row.size)
