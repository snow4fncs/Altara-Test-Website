// Drives real touch gestures on the phone-sized product page and reports which photo is active after each.
import puppeteer from 'puppeteer-core';
const base = process.env.BASE || 'http://localhost:3000';
const route = process.argv[2] || '/product-contrast-white';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'], headless: true,
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const page = await browser.newPage();
await page.goto(base + route, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 800));
const box = await page.$eval('.ph-image-area', el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const state = async () => JSON.stringify(await page.evaluate(() => {
  const t = [...document.querySelectorAll('.ph-thumb')];
  const a = t.findIndex(b => b.classList.contains('active'));
  const m = document.querySelector('.ph-main-img');
  const pgl = document.getElementById('pgl');
  const band = document.querySelector('.ph-image-area .pre-band'), rib = document.querySelector('.ph-image-area .pre-ribbon-wrap');
  const ir = m.getBoundingClientRect();
  const bandOff = band ? (() => { const r = band.getBoundingClientRect(); return [Math.round(r.left - ir.left), Math.round(ir.bottom - r.bottom), Math.round(r.width - ir.width)]; })() : null;
  const ribOff = rib ? (() => { const r = rib.getBoundingClientRect(); return [Math.round(r.left - ir.left), Math.round(r.top - ir.top)]; })() : null;
  return { active: a, src: (m.getAttribute('src') || '').split('/').pop(), viewer: !!(pgl && !pgl.hidden), y: Math.round(scrollY), cls: m.className, band: bandOff, rib: ribOff };
}));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gesture(dx, dy, ms = 160, steps = 8) {
  const x0 = box.x + box.w / 2 - dx / 2, y0 = box.y + box.h / 2 - dy / 2;
  await page.touchscreen.touchStart(x0, y0);
  for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(x0 + dx * i / steps, y0 + dy * i / steps); await sleep(ms / steps); }
  await page.touchscreen.touchEnd();
  await sleep(450);
  return state();
}
console.log('image area', box);
console.log('start        ', await state());
console.log('flick 30px L ', await gesture(-30, 0));
console.log('drag 50px L  ', await gesture(-50, 4));
console.log('diag 80L/110D', await gesture(-80, 110));
console.log('swipe 130 L  ', await gesture(-130, 6));
await page.screenshot({ path: process.env.SHOT || 'temporary screenshots/screenshot-swipe-probe.png' });
console.log('swipe 130 L  ', await gesture(-130, -8));
console.log('swipe 120 R  ', await gesture(120, 0));
console.log('slow 100 L   ', await gesture(-100, 2, 1400, 14));
// right swipe past the first photo does nothing
await page.evaluate(() => document.querySelectorAll('.ph-thumb')[0].click()); await sleep(300);
console.log('at first     ', await state());
console.log('swipe 130 R  ', await gesture(130, 0));
// left swipe past the last photo does nothing
await page.evaluate(() => { const t = document.querySelectorAll('.ph-thumb'); t[t.length - 1].click(); }); await sleep(300);
console.log('at last      ', await state());
console.log('swipe 130 L  ', await gesture(-130, 0));
// a plain tap still opens the viewer
await page.touchscreen.tap(box.x + box.w / 2, box.y + box.h / 2); await sleep(500);
console.log('tap          ', await state());
await page.keyboard.press('Escape'); await sleep(400);
// vertical scroll over the photo scrolls the page and keeps the photo
const before = await state();
await page.touchscreen.touchStart(box.x + box.w / 2, box.y + box.h / 2 + 100);
for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(box.x + box.w / 2 + 3 * i, box.y + box.h / 2 + 100 - 25 * i); await sleep(20); }
await page.touchscreen.touchEnd(); await sleep(500);
console.log('vert scroll  ', before.active, '->', await state());
await browser.close();
