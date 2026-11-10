// Screenshot helper for the white edition: scrolls the page so lazy images and reveal animations fire,
// then captures full page. usage: node white-site/shot.mjs <path> <label> [desktop|laptop|mobile] [clipFromY clipHeight]
// env: CART='{...}' preloads a cart; CLICK='.selector' clicks before capture.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const dir = 'temporary screenshots';
const [, , route = '/', label = 'w', mode = 'desktop', clipY, clipH] = process.argv;
const url = route.startsWith('http') ? route : 'http://localhost:3001' + route;
const nums = fs.readdirSync(dir).map(f => +(f.match(/screenshot-(\d+)/)?.[1] || 0));
const out = path.join(dir, `screenshot-${Math.max(0, ...nums) + 1}-${label}.png`);
const VP = {
  desktop: { width: 1440, height: 800, deviceScaleFactor: 1 },
  laptop: { width: 1280, height: 720, deviceScaleFactor: 1 },
  mac: { width: 1470, height: 800, deviceScaleFactor: 2 },      // 14/15-inch MacBook at 2x: what Tina sees
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}[mode];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
  defaultViewport: VP,
  headless: true,
});
const page = await browser.newPage();
if (process.env.CART) await page.evaluateOnNewDocument(c => { try { localStorage.setItem('altara-cart', c); } catch (e) {} }, process.env.CART);
await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
await page.evaluate(async () => {
  document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
  for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
  document.querySelectorAll('.rev').forEach(el => { el.style.transition = 'none'; el.classList.add('in'); });
});
await new Promise(r => setTimeout(r, 2200));
if (process.env.CLICK) { await page.click(process.env.CLICK); await new Promise(r => setTimeout(r, 1200)); }
await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))));
// "view" as clipY takes a plain viewport screenshot (what the shopper sees, fixed elements included)
const opts = clipY === 'view' ? { path: out } : { path: out, fullPage: !clipY };
if (clipY && clipY !== 'view') opts.clip = { x: 0, y: +clipY, width: VP.width, height: +clipH };
if (clipY === 'view' && process.env.SCROLL) { await page.evaluate(y => window.scrollTo(0, y), +process.env.SCROLL); await new Promise(r => setTimeout(r, 700)); }
await page.screenshot(opts);
await browser.close();
console.log(out);
