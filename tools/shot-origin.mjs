// Screenshots of the "Ships from Sydney, Australia" flag line on a phone: product page, product drawer, cart page, home drawer.
// usage: node tools/shot-origin.mjs [outdir]
import puppeteer from 'puppeteer-core';
const out = process.argv[2] || 'temporary screenshots';
const B = 'http://localhost:3000';
const browser = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', userDataDir: '/tmp/alp-shot-profile' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function clipAround(sel, name, pad = 40) {
  const el = await page.$(sel);
  if (!el) { console.log('MISSING', sel); return; }
  await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await wait(400);
  const b = await el.boundingBox();
  await page.screenshot({ path: `${out}/origin-${name}.png` });
  console.log('shot', name, JSON.stringify(await el.evaluate(e => ({ text: e.textContent, w: e.offsetWidth, scroll: document.documentElement.scrollWidth }))));
}
await page.goto(B + '/product-contrast-white.html', { waitUntil: 'networkidle0' });
await wait(800);
await clipAround('.alp-origin-pdp', 'pdp');
await page.click('#add-to-cart-btn');
await wait(1200);
await clipAround('#cd-checkout ~ *, #cd .alp-origin', 'pdp-drawer');
await page.goto(B + '/cart.html', { waitUntil: 'networkidle0' });
await wait(800);
await clipAround('#btn-checkout', 'cart');
await clipAround('.summary-card .alp-origin, #btn-checkout', 'cart2');
await page.goto(B + '/index.html', { waitUntil: 'networkidle0' });
await wait(600);
await page.evaluate(() => { const o = document.querySelector('#ald'); if (o) { o.classList.add('is-open'); o.setAttribute('aria-hidden', 'false'); } document.body.classList.add('ald-open'); });
await wait(600);
await clipAround('#ald .alp-origin', 'home-drawer');
console.log('count on home', await page.$$eval('.alp-origin', a => a.length), '| errors', JSON.stringify(errors));
await browser.close();
