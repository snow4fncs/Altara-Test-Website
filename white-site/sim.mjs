// Funnel simulations against the white edition on :3001. Run from repo root: node white-site/sim.mjs
// Drives real pages with Puppeteer the way a shopper would, counts clicks to reach secure payment,
// captures what each checkout call would send to Stripe, and reports timings. Stripe itself is stubbed:
// /api/create-checkout answers with a fake URL and the redirect is recorded instead of followed.
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://localhost:3001';   // BASE=http://localhost:3000 once the root pages are the white edition; BASE=https://www.altaradesign.com for live (Stripe stays stubbed)
const VP = { desktop: { width: 1440, height: 800 }, mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const results = [];

async function session(mode, fn) {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], defaultViewport: VP[mode], headless: true });
  const page = await browser.newPage();
  const state = { clicks: 0, checkoutPayloads: [], redirected: null, consoleErrors: [] };
  page.on('console', m => { if (m.type() === 'error') state.consoleErrors.push(m.text().slice(0, 120)); });
  page.on('pageerror', e => state.consoleErrors.push('pageerror: ' + String(e).slice(0, 120)));
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/api/create-checkout')) { state.checkoutPayloads.push(JSON.parse(req.postData() || '{}')); return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/sim' }) }); }
    if (u.startsWith('https://checkout.stripe.com/')) { state.redirected = u; return req.abort(); }
    if (/facebook|fbevents|googleapis|gstatic/.test(u)) return req.abort();
    req.continue();
  });
  const click = async (sel, opts = {}) => { await page.waitForSelector(sel, { visible: true, timeout: 8000 }); await page.click(sel); state.clicks++; await new Promise(r => setTimeout(r, opts.wait || 500)); };
  const type = async (sel, text) => { await page.waitForSelector(sel, { visible: true, timeout: 8000 }); await page.click(sel, { clickCount: 3 }); await page.keyboard.type(text); };
  const goto = async p => { await page.goto(BASE + p, { waitUntil: 'networkidle0', timeout: 45000 }); };
  const text = async sel => page.$eval(sel, e => e.textContent.trim()).catch(() => null);
  const visible = async sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'; }).catch(() => false);
  try { await fn({ page, state, click, type, goto, text, visible }); }
  finally { await browser.close(); }
  return state;
}
function record(name, mode, ok, detail, state) { results.push({ name, mode, ok, detail, clicks: state ? state.clicks : '', errors: state ? state.consoleErrors.length : '', errorSample: state ? (state.consoleErrors[0] || '') : '' }); }
const waitRedirect = async (page, state, ms = 4000) => { const t = Date.now(); while (!state.redirected && Date.now() - t < ms) await new Promise(r => setTimeout(r, 100)); return !!state.redirected; };

/* ── Scenarios ── */
async function homeQuickAddToPayment(mode) {
  const st = await session(mode, async ({ page, state, click, type }) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.scrollTo(0, 900)); await new Promise(r => setTimeout(r, 400));
    await click('.range-tile .qa-btn[data-add="midnight-black-twin"]', { wait: 700 });
    const open = await page.$eval('#ald', e => e.classList.contains('open'));
    const total = await page.$eval('#ald-checkout-label', e => e.textContent);
    await click('#ald-checkout', { wait: 800 });
    const ok = await waitRedirect(page, state);
    const payload = state.checkoutPayloads[0] || {};
    record('Home tile quick-add → drawer → payment (no email asked)', mode, open && ok && !payload.customer_email && payload.items?.[0]?.id === 'midnight-black-twin', `drawer ${open ? 'opened' : 'closed'}, ${total}, sent ${JSON.stringify(payload.items)}, email field absent: ${!payload.customer_email}`, state);
  });
}
async function productAddToPayment(mode) {
  const st = await session(mode, async ({ page, state, click, type }) => {
    await page.goto(BASE + '/product-contrast-white', { waitUntil: 'networkidle0' });
    await click('#add-to-cart-btn', { wait: 900 });
    const open = await page.$eval('#cd', e => e.classList.contains('open')).catch(() => false);
    await click('#cd-checkout', { wait: 800 });
    const ok = await waitRedirect(page, state);
    const p = state.checkoutPayloads[0] || {};
    record('Product page add → drawer → payment', mode, open && ok && !!p.items?.length, `drawer ${open ? 'opened' : 'closed'}, sent ${JSON.stringify(p.items)}`, state);
  });
}
async function heroToProductToPayment(mode) {
  await session(mode, async ({ page, state, click, type }) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await click('.hero a.btn-primary', { wait: 1500 });
    await page.waitForSelector('#add-to-cart-btn', { visible: true });
    const url = page.url();
    await click('#add-to-cart-btn', { wait: 900 });
    await click('#cd-checkout', { wait: 800 });
    const ok = await waitRedirect(page, state);
    record('Hero CTA → product → add → payment', mode, ok, `landed ${url.replace(BASE, '')}, sent ${JSON.stringify((state.checkoutPayloads[0] || {}).items)}`, state);
  });
}
async function cartPageFlow(mode) {
  await session(mode, async ({ page, state, click, type }) => {
    await page.evaluateOnNewDocument(() => localStorage.setItem('altara-cart', JSON.stringify({ items: [{ id: 'contrast-white', name: 'Contrast White', price: 69, image: 'Product Photos/opt/img1-320.jpg', qty: 1 }] })));
    await page.goto(BASE + '/cart', { waitUntil: 'networkidle0' });
    const before = await page.$eval('body', b => b.innerText);
    await click('.qty-btn[aria-label="Increase quantity"]', { wait: 600 });
    const after = await page.$eval('body', b => b.innerText);
    const pairPriced = /89\.00|\$89/.test(after);
    // checkout goes straight through: no email field on the page any more
    const emailField = await page.$('#email-input');
    await click('#btn-checkout', { wait: 800 });
    const ok = await waitRedirect(page, state);
    const p = state.checkoutPayloads[0] || {};
    record('Cart page: qty +1 → pair pricing → payment (no email asked)', mode, pairPriced && !emailField && ok && !p.customer_email, `two singles ${pairPriced ? 'priced as $89 Twin Set' : 'NOT repriced'}; email field ${emailField ? 'STILL PRESENT' : 'absent'}; redirect ${ok}; payloads ${JSON.stringify(state.checkoutPayloads)}`, state);
  });
}
async function stickyMobileBar() {
  await session('mobile', async ({ page, state, click, type, visible }) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    const hidden = !(await page.$eval('#home-satc', e => e.classList.contains('is-on')));
    await page.evaluate(() => window.scrollTo(0, 1400)); await new Promise(r => setTimeout(r, 600));
    const shown = await page.$eval('#home-satc', e => e.classList.contains('is-on'));
    await click('#home-satc .qa-btn', { wait: 700 });
    const open = await page.$eval('#ald', e => e.classList.contains('open'));
    await click('#ald-checkout', { wait: 800 });
    const ok = await waitRedirect(page, state);
    record('Mobile sticky bar → drawer → payment', 'mobile', hidden && shown && open && ok, `hidden at top: ${hidden}, shown after scroll: ${shown}, drawer: ${open}`, state);
  });
}
async function drawerQtyAndRemove() {
  await session('desktop', async ({ page, state, click }) => {
    await page.goto(BASE + '/collection', { waitUntil: 'networkidle0' });
    await click('.product-tile .qa-btn[data-add="contrast-white-twin"]', { wait: 600 });
    await click('#ald-items button[data-act="inc"]', { wait: 300 });
    const t1 = await page.$eval('#ald-checkout-label', e => e.textContent);
    await click('#ald-items button[data-act="dec"]', { wait: 300 });
    const t2 = await page.$eval('#ald-checkout-label', e => e.textContent);
    await click('#ald-items button[data-act="rm"]', { wait: 300 });
    const empty = await page.$eval('#ald-items', e => /empty/i.test(e.textContent));
    const badge = await page.$eval('#nav-cart-badge', e => e.textContent.trim());
    record('Collection quick-add → qty 2 (Full Car price) → qty 1 → remove', 'desktop', /159/.test(t1) && /89/.test(t2) && empty && badge === '', `${t1} → ${t2} → ${empty ? 'empty' : 'not empty'}, badge "${badge}"`, state);
  });
}
async function navCartGoesToCartPage() {
  await session('desktop', async ({ page, state, click }) => {
    await page.evaluateOnNewDocument(() => localStorage.setItem('altara-cart', JSON.stringify({ items: [{ id: 'midnight-black-twin', name: 'Midnight Black Twin Set', price: 89, image: 'Product Photos/opt/twin-set-midnight-black-320.jpg', qty: 1 }] })));
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    let drawerFlashed = false;
    await page.exposeFunction('__drawerFlash', () => { drawerFlashed = true; });
    await page.evaluate(() => { const d = document.querySelector('#ald'); if (d) new MutationObserver(() => { if (d.classList.contains('open')) window.__drawerFlash(); }).observe(d, { attributes: true, attributeFilter: ['class'] }); });
    await click('a[href="cart.html"].nav-icon-btn', { wait: 2000 });
    const url = page.url();
    record('Nav cart icon goes straight to the cart page', 'desktop', /\/cart/.test(url) && !drawerFlashed, `landed ${url.replace(BASE, '')}, drawer ${drawerFlashed ? 'FLASHED OPEN' : 'stayed closed'}`, state);
  });
}
async function noEmailDrawer() {
  await session('desktop', async ({ page, state, click }) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.scrollTo(0, 900)); await new Promise(r => setTimeout(r, 300));
    await click('.range-tile .qa-btn[data-add="contrast-white-twin"]', { wait: 600 });
    const field = await page.$('#ald-email');
    await click('#ald-checkout', { wait: 800 });
    const ok = await waitRedirect(page, state);
    record('Drawer has no email field and checks out in one click', 'desktop', !field && ok && state.checkoutPayloads.length === 1, `email field ${field ? 'STILL PRESENT' : 'absent'}, redirect ${ok}, ${state.checkoutPayloads.length} checkout call`, state);
  });
}
async function carousel() {
  await session('desktop', async ({ page, state, click }) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    const a = await page.evaluate(() => document.querySelector('.ab-msg.is-on').textContent);
    await new Promise(r => setTimeout(r, 5200));
    const b = await page.evaluate(() => document.querySelector('.ab-msg.is-on').textContent);
    await click('.ab-prev', { wait: 700 });
    const c = await page.evaluate(() => document.querySelector('.ab-msg.is-on').textContent);
    const barH = await page.$eval('.announce-bar', e => e.getBoundingClientRect().height);
    record('Announcement carousel rotates and arrows work', 'desktop', a !== b && c === a && Math.round(barH) === 40, `"${a}" → "${b}" → back to "${c}", bar ${barH}px`, state);
  });
}
async function faqSearch() {
  await session('desktop', async ({ page, state, type }) => {
    await page.goto(BASE + '/faq', { waitUntil: 'networkidle0' });
    const all = await page.$$eval('.faq-item', els => els.length);
    await type('#faq-q', 'wash'); await new Promise(r => setTimeout(r, 300));
    const shown = await page.$$eval('.faq-item', els => els.filter(e => !e.hidden).length);
    await type('#faq-q', 'zzzz'); await new Promise(r => setTimeout(r, 300));
    const none = await page.$eval('.faq-none', e => !e.hidden);
    record('FAQ search filters answers', 'desktop', shown > 0 && shown < all && none, `${all} questions; "wash" → ${shown}; nonsense → contact prompt ${none ? 'shown' : 'missing'}`, state);
  });
}
async function deliveryEstimate() {
  await session('desktop', async ({ page, state }) => {
    await page.goto(BASE + '/product-contrast-white', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 900));
    const steps = await page.$$eval('.pi-step', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    const d = steps.find(s => /Delivered/.test(s)) || '';
    record('Product page shows delivery date window', 'desktop', /[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+ [A-Z][a-z]{2}/.test(d), d, state);
  });
}
async function timings() {
  for (const p of ['/', '/product-midnight-black', '/cart']) {
    await session('desktop', async ({ page, state }) => {
      await page.goto(BASE + p, { waitUntil: 'load' });
      const t = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource'); return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), kb: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024), req: res.length }; });
      record(`Timing ${p}`, 'desktop', t.load < 3000, `DOM ready ${t.dcl}ms, load ${t.load}ms, ${t.req} requests, ${t.kb} KB (local)`, state);
    });
  }
}

const scenarios = [
  () => homeQuickAddToPayment('desktop'), () => homeQuickAddToPayment('mobile'),
  () => productAddToPayment('desktop'), () => productAddToPayment('mobile'),
  () => heroToProductToPayment('desktop'),
  () => cartPageFlow('desktop'), () => cartPageFlow('mobile'),
  stickyMobileBar, drawerQtyAndRemove, navCartGoesToCartPage, noEmailDrawer, carousel, faqSearch, deliveryEstimate, timings,
];
for (const s of scenarios) { try { await s(); } catch (e) { results.push({ name: s.name || 'scenario', mode: '', ok: false, detail: 'threw: ' + String(e).slice(0, 160), clicks: '', errors: '' }); } }

const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('RESULT', 7) + pad('SCENARIO', 62) + pad('MODE', 9) + pad('CLICKS', 7) + 'DETAIL');
for (const r of results) console.log(pad(r.ok ? 'PASS' : 'FAIL', 7) + pad(r.name, 62) + pad(r.mode, 9) + pad(r.clicks, 7) + r.detail + (r.errors ? `  [${r.errors} console errors: ${r.errorSample}]` : ''));
console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);
