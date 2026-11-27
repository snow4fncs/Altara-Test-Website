// Screenshots of the shop's key pages at phone and desktop size, for a visual check before and after a change.
// usage (repo root, dev server on :3000): node tools/site/shots.mjs <label> [base] [pages,comma,separated] [fold|full]
//   base defaults to http://localhost:3000 ; pass https://www.altaradesign.com to shoot the live site
//   saves to "temporary screenshots/site-<label>-<page>-<phone|desk>.png"; fold = first screen only (default), full = whole page
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const label = process.argv[2] || 'check';
const base = (process.argv[3] || 'http://localhost:3000').replace(/\/$/, '');
const pages = (process.argv[4] || 'index,collection,product-midnight-black,product-contrast-white,cart').split(',');
const mode = process.argv[5] || 'fold';
const dir = 'temporary screenshots';
fs.mkdirSync(dir, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
for (const [kind, vp] of [['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desk', { width: 1440, height: 900, deviceScaleFactor: 1 }]]) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (kind === 'phone') await page.setUserAgent(UA);
  // keep simulated visits out of the ad account and analytics
  await page.setRequestInterception(true);
  page.on('request', r => (/facebook\.(com|net)|connect\.facebook|google-analytics|googletagmanager/.test(r.url()) ? r.abort() : r.continue()));
  for (const name of pages) {
    const url = base + '/' + (name === 'index' ? '' : name + (base.includes('localhost') ? '.html' : ''));
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise(r => setTimeout(r, 1200));
      await page.evaluate(() => document.querySelectorAll('.rev').forEach(el => { el.style.transition = 'none'; el.classList.add('in'); }));
      await new Promise(r => setTimeout(r, 300));
      const out = `${dir}/site-${label}-${name}-${kind}.png`;
      await page.screenshot({ path: out, fullPage: mode === 'full' });
      console.log('saved', out);
    } catch (e) { console.log('FAILED', url, String(e).slice(0, 120)); }
  }
  await page.close();
}
await browser.close();
