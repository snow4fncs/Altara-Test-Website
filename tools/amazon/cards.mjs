// Renders the Amazon secondary images (2000 x 2000 JPEG) for both colours, and squares the lifestyle photos.
// usage (repo root, dev server on :3000): node tools/amazon/cards.mjs
// Output: Product Photos/amazon/set/<MB|CW>/NN-name.jpg, in upload order after each option's own MAIN image.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { execFileSync } from 'child_process';
const OUT = 'Product Photos/amazon/set';
const SETS = {
  MB: { c: 'mb', steps: '/Ad Creatives/premium-2026-11-26/incar-a.jpg', pos: '50% 22%',
        photos: [['02-in-car', 'Ad Creatives/premium-2026-11-26/incar-b.jpg', 0.06], ['07-in-car-2', 'Product Photos/Altara Product Image 10.png', 0.0], ['08-non-slip-backing', 'Product Photos/Altara Product Image 6.png', 0.1], ['09-in-car-3', 'Product Photos/Altara Product Image 9.png', 0.0]] },
  CW: { c: 'cw', steps: '/Product Photos/Altara Product Image 2.png', pos: '50% 20%',
        photos: [['02-in-car', 'Product Photos/Altara Product Image 2.png', 0.0], ['07-in-car-2', 'Product Photos/Altara Product Image 3.png', 0.1], ['08-magfit-clip', 'Product Photos/Altara Product Image 8.png', 0.1], ['09-non-slip-backing', 'Product Photos/Altara Product Image 6.png', 0.1]] },
};
const CARDS = [['03-features', 'features'], ['04-size', 'size'], ['05-fits-in-15-seconds', 'steps'], ['06-packs', 'packs']];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 2000, height: 2000, deviceScaleFactor: 1 });
for (const [k, s] of Object.entries(SETS)) {
  fs.mkdirSync(`${OUT}/${k}`, { recursive: true });
  for (const [name, type] of CARDS) {
    const qs = new URLSearchParams({ type, c: s.c, ...(type === 'steps' ? { photo: s.steps, pos: s.pos } : {}) });
    await p.goto('http://localhost:3000/tools/amazon/cards.html?' + qs, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 500));
    await p.screenshot({ path: `${OUT}/${k}/${name}.jpg`, type: 'jpeg', quality: 93 });
  }
  // Lifestyle photos: a centred square at the photo's own resolution (never upscaled), offset down by `top`.
  for (const [name, src, top] of s.photos)
    execFileSync('python3', ['-I', '-c', `
from PIL import Image
im=Image.open(${JSON.stringify(src)}).convert('RGB'); w,h=im.size; s=min(w,h); y=min(int(h*${top}),h-s)
im.crop(((w-s)//2,y,(w-s)//2+s,y+s)).save(${JSON.stringify(`${OUT}/${k}/${name}.jpg`)},quality=93)`]);
  console.log('ok', k, fs.readdirSync(`${OUT}/${k}`).join(', '));
}
await b.close();
