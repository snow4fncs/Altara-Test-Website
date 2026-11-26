// Renders the Amazon Premium A+ artwork into Product Photos/amazon/aplus/ at twice Amazon's stated size.
// usage (repo root, dev server on :3000): node tools/amazon/aplus.mjs
//   01-hero.jpg            1464:600  both colourways, studio photographs (aplus.html?type=hero)
//   01-hero-m.jpg          600:450   phone version of the hero (aplus.html?type=herom)
//   02-layers.jpg          800:600   the three layers (aplus.html?type=layers)
//   03-fit-1..4.jpg        300:225   photo crops: headrest, base, MagFit clip, non-slip backing
//   04-use-*.jpg           1464:600  lifestyle panels cropped from aplus/src/*.jpg (21:9 sources)
//   04-use-*-m.jpg         600:450   the same panels cut for phones, centred on the seat
//   05-pack-<SKU>.jpg      200:225   each option's own MAIN image on white
// Amazon rejects files over 2 MB, so everything is saved as JPEG under that.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { execFileSync } from 'child_process';
const OUT = 'Product Photos/amazon/aplus';
fs.mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
for (const [name, type, w, h] of [['01-hero', 'hero', 1464, 600], ['01-hero-m', 'herom', 600, 450], ['02-layers', 'layers', 800, 600]]) {
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await p.goto('http://localhost:3000/tools/amazon/aplus.html?type=' + type, { waitUntil: 'networkidle0', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 });
}
await b.close();

// Photo crops. box = [left, top, width] as fractions of the source; height follows from the ratio.
const CROPS = [
  ['03-fit-1-headrest', 'Ad Creatives/premium-2026-11-26/incar-a.jpg', [0.0, 0.02, 1.0], 4 / 3, 1200],
  ['03-fit-2-base', 'Product Photos/Altara Product Image 3.png', [0.0, 0.40, 1.0], 4 / 3, 1200],
  // The car maker's badges on the steering wheel are painted out (A+ rejects other companies' logos): boxes in output pixels.
  ['03-fit-3-magfit', 'Product Photos/Altara Product Image 8.png', [0.0, 0.14, 1.0], 4 / 3, 1200, [[314, 602, 386, 638], [356, 756, 394, 772]]],
  ['03-fit-4-backing', 'Product Photos/Altara Product Image 6.png', [0.0, 0.22, 1.0], 4 / 3, 1200],
  ['04-use-gym', `${OUT}/src/gym-b.jpg`, [0.0, 0.0, 1.0], 1464 / 600, 2928],
  ['04-use-beach', `${OUT}/src/beach-a.jpg`, [0.0, 0.0, 1.0], 1464 / 600, 2928],
  ['04-use-dog', `${OUT}/src/dog.jpg`, [0.0, 0.0, 1.0], 1464 / 600, 2928],
  ['04-use-everyday', `${OUT}/src/everyday.jpg`, [0.0, 0.0, 1.0], 1464 / 600, 2928],
  ['04-use-gym-m', `${OUT}/src/gym-b.jpg`, [0.43, 0.0, 0.57], 4 / 3, 1200],
  ['04-use-beach-m', `${OUT}/src/beach-a.jpg`, [0.43, 0.0, 0.57], 4 / 3, 1200],
  ['04-use-dog-m', `${OUT}/src/dog.jpg`, [0.43, 0.0, 0.57], 4 / 3, 1200],
  ['04-use-everyday-m', `${OUT}/src/everyday.jpg`, [0.43, 0.0, 0.57], 4 / 3, 1200],
];
const PACKS = [['ALT-MB-1', '1 MAIN - Single Midnight Black (ALT-MB-1).jpg'], ['ALT-MB-2', '1 MAIN - Twin Set Midnight Black (ALT-MB-2).jpg'], ['ALT-MB-4', '1 MAIN - Full Car Midnight Black (ALT-MB-4).jpg'],
  ['ALT-CW-1', '1 MAIN - Single (ALT-CW-1).jpg'], ['ALT-CW-2', '1 MAIN - Twin Set (ALT-CW-2).jpg'], ['ALT-CW-4', '1 MAIN - Full Car (ALT-CW-4).jpg']];
execFileSync('python3', ['-I', '-c', `
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageStat
OUT, crops, packs = ${JSON.stringify(OUT)}, json.loads(${JSON.stringify(JSON.stringify(CROPS))}), json.loads(${JSON.stringify(JSON.stringify(PACKS))})
def save(im, path):
    q = 90
    while True:
        im.save(path, quality=q, optimize=True)
        if os.path.getsize(path) < 1900000 or q <= 70: break
        q -= 4
for name, src, (l, t, wf), ratio, outw, *rest in crops:
    if not os.path.exists(src): print('skip (no source yet)', name); continue
    im = Image.open(src).convert('RGB'); W, H = im.size
    w = round(W * wf); h = round(w / ratio)
    if h > H: h = H; w = round(h * ratio)
    x = min(round(W * l), W - w); y = min(round(H * t), H - h)
    im = im.crop((x, y, x + w, y + h))
    ow = min(outw, w) if w < outw * 0.75 else outw
    im = im.resize((ow, round(ow / ratio)), Image.LANCZOS)
    for x0, y0, x1, y1 in (rest[0] if rest else []):
        ring = Image.new('L', im.size, 0); d = ImageDraw.Draw(ring)
        d.rectangle((x0 - 6, y0 - 6, x1 + 6, y1 + 6), fill=255); d.rectangle((x0, y0, x1, y1), fill=0)
        colour = tuple(round(v) for v in ImageStat.Stat(im, ring).median)
        mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).rounded_rectangle((x0, y0, x1, y1), radius=(y1 - y0) // 2, fill=255)
        im.paste(Image.new('RGB', im.size, colour), (0, 0), mask.filter(ImageFilter.GaussianBlur(3)))
    save(im, f'{OUT}/{name}.jpg'); print(name, im.size)
for sku, f in packs:
    im = Image.open('Product Photos/amazon/' + f).convert('RGB')
    im.thumbnail((760, 760), Image.LANCZOS)
    c = Image.new('RGB', (800, 900), (255, 255, 255)); c.paste(im, ((800 - im.width) // 2, (900 - im.height) // 2))
    save(c, f'{OUT}/05-pack-{sku}.jpg'); print(sku, c.size)
for f in sorted(os.listdir(OUT)):
    if f.endswith('.jpg'): print(f, Image.open(f'{OUT}/{f}').size, os.path.getsize(f'{OUT}/{f}') // 1024, 'KB')
`], { stdio: 'inherit' });
