// "People buying it": drives the real site like a shopper, all the way onto Stripe's payment page, then
// reads the checkout session back from Stripe to confirm exactly what would be charged, which payment
// methods are offered and what the pre-order note says. Nothing is paid and no email is entered, so the
// sessions lapse on their own (2 hours) and trigger no recovery email. The Meta pixel is blocked, so a
// simulation never feeds the ad account.
// usage (repo root): node tools/sim-buy.mjs                 live site
//                    BASE=http://localhost:3000 node tools/sim-buy.mjs   local pages (checkout still goes to production)
//                    SHIPS="end of November" overrides the expected pre-order date
import fs from 'fs';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.BASE || 'https://www.altaradesign.com').replace(/\/$/, '');
const SHIPS = process.env.SHIPS || 'end of November';
const SHOTS = process.env.SHOTS || 'temporary screenshots';
// Black is a pre-order only while the live stock feed says so (it landed on 25 Nov 2026).
const PRE = await fetch('https://www.altaradesign.com/api/stock-level').then(r => r.json()).then(j => (j['midnight-black'] || {}).status === 'preorder').catch(() => false);
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => /^[A-Z_0-9]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const VP = { mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, desktop: { width: 1440, height: 800 } };
const UA = { mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const stripeGet = async id => (await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}?expand[]=line_items&expand[]=shipping_cost.shipping_rate`, { headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY } })).json();
// Control: one checkout made through the live API and never opened in a browser, to read which payment methods
// Stripe offers before it tailors them to a device. Unpaid, no email, lapses in 2 hours like the others.
const CONTROL_PM = await (async () => { try {
  const r = await (await fetch('https://www.altaradesign.com/api/create-checkout', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.altaradesign.com' }, body: JSON.stringify({ items: [{ id: 'contrast-white-twin', qty: 1 }] }) })).json();
  const id = (String(r.url || '').match(/cs_(live|test)_[A-Za-z0-9]+/) || [])[0]; if (!id) return [];
  return (await stripeGet(id)).payment_method_types || [];
} catch { return []; } })();
const CONTROL_BNPL = CONTROL_PM.filter(m => /afterpay|klarna|zip/.test(m));
const results = [];

async function shopper(name, mode, expect, drive) {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], defaultViewport: VP[mode], headless: true });
  const page = await browser.newPage(); if (UA[mode]) await page.setUserAgent(UA[mode]);
  const errors = []; let clicks = 0; const t0 = Date.now();
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (/facebook\.(com|net)|fbevents|fbcdn/.test(u)) return r.abort(); r.continue(); });
  const click = async (sel, ms = 700) => { await page.waitForSelector(sel, { visible: true, timeout: 15000 }); await page.click(sel); clicks++; await wait(ms); };
  const out = { name, mode, ok: false, notes: [] };
  const check = (label, pass, got) => { out.notes.push((pass ? 'ok   ' : 'FAIL ') + label + (pass ? '' : ' -> got ' + got)); if (!pass) out.failed = true; };
  try {
    await drive({ page, click, check });
    // The site hands over to Stripe's own page.
    await page.waitForFunction(() => location.hostname === 'checkout.stripe.com', { timeout: 30000 });
    const id = (page.url().match(/cs_(live|test)_[A-Za-z0-9]+/) || [])[0];
    check('landed on Stripe payment page', !!id, page.url().slice(0, 60));
    out.secs = ((Date.now() - t0) / 1000).toFixed(1); out.clicks = clicks;
    await page.waitForFunction(() => /\$\s?\d+\.\d\d/.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
    // The payment form (and the note beside the Pay button) paints a few seconds after the price, and on a
    // phone much of it is not in the body's visible text. Read every frame, visible and raw text both.
    await wait(6000);
    let text = '';
    for (const f of page.frames()) { try { text += ' ' + await f.evaluate(() => document.body ? document.body.innerText + ' ' + document.body.textContent : ''); } catch { /* cross-origin frame gone */ } }
    text = text.replace(/\s+/g, ' ');
    const shot = `${SHOTS}/sim-buy-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    await page.screenshot({ path: shot }).catch(() => {}); out.shot = shot;
    // The Pay button and the note beside it sit at the bottom of Stripe's form, inside markup that page text
    // cannot read on a phone. Photograph it; the wording itself is checked on the session below.
    await page.evaluate(() => { const top = document.scrollingElement || document.documentElement; top.scrollTo(0, top.scrollHeight); for (const el of document.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTo(0, el.scrollHeight); });
    await wait(1500); await page.screenshot({ path: shot.replace(/\.png$/, '-pay.png') }).catch(() => {});
    check('Stripe page shows ' + expect.totalText, text.includes(expect.totalText), text.slice(0, 160));
    for (const w of expect.pageHas || []) check(`Stripe page says "${w}"`, text.toLowerCase().includes(w.toLowerCase()), text.slice(0, 200));
    // What Stripe itself holds for this session: the source of truth for what a buyer would be charged.
    const s = await stripeGet(id);
    if (s.error) { check('read session back from Stripe', false, s.error.message); }
    else {
      const lines = (s.line_items?.data || []).map(l => `${l.quantity} x ${l.description} = $${(l.amount_total / 100).toFixed(2)}`);
      out.notes.push('     lines: ' + lines.join(' | '));
      out.notes.push(`     subtotal $${(s.amount_subtotal / 100).toFixed(2)}, discount $${((s.total_details?.amount_discount || 0) / 100).toFixed(2)}, shipping $${((s.total_details?.amount_shipping || 0) / 100).toFixed(2)}, TOTAL $${(s.amount_total / 100).toFixed(2)} ${String(s.currency).toUpperCase()}`);
      out.notes.push('     pay with: ' + (s.payment_method_types || []).join(', ') + ' | mode ' + (s.livemode ? 'live' : 'test') + ' | expires in ' + Math.round((s.expires_at * 1000 - Date.now()) / 60000) + ' min');
      check('amount charged is ' + expect.total, s.amount_total === expect.total, s.amount_total);
      check('currency AUD', s.currency === 'aud', s.currency);
      const note = s.custom_text?.submit?.message || '';
      if (expect.preorder) {
        check(`pre-order note says "ships ${SHIPS}"`, note.includes('ships ' + SHIPS), note || '(no note)');
        check('order will be flagged as a pre-order shipping ' + SHIPS, s.metadata?.preorder_ships === SHIPS, JSON.stringify(s.metadata));
        check('note promises a refund before dispatch', /refund/i.test(note), note);
      } else check('no pre-order note on an in-stock order', !note && !s.metadata?.preorder_ships, note || JSON.stringify(s.metadata));
      check('Australia only', (s.shipping_address_collection?.allowed_countries || []).join() === 'AU', JSON.stringify(s.shipping_address_collection));
      // Stripe picks the pay-later options per shopper (Zip was on 55 of 60 real checkouts in mid November),
      // so the rule is: card always, and at least one way to pay in instalments.
      const pm = s.payment_method_types || [];
      check('offers card', pm.includes('card'), pm.join());
      const here = pm.filter(m => /afterpay|klarna|zip/.test(m));
      if (here.length) check('offers pay-later (' + here.join(', ') + ')', true, '');
      else check('offers pay-later to shoppers (' + CONTROL_BNPL.join(', ') + '; Stripe hides it from this automated browser)', CONTROL_BNPL.length > 0, 'control session: ' + CONTROL_PM.join());
      check('abandoned checkout can be recovered', !!s.after_expiration?.recovery?.enabled, JSON.stringify(s.after_expiration));
    }
    if (errors.length) out.notes.push('     page errors: ' + errors.slice(0, 2).join(' | '));
    out.ok = !out.failed;
  } catch (e) { out.notes.push('FAIL ' + String(e.message).slice(0, 200) + ' @ ' + page.url().slice(0, 80)); await page.screenshot({ path: `${SHOTS}/sim-buy-FAILED-${name.replace(/[^a-z0-9]+/gi, '-')}.png` }).catch(() => {}); }
  finally { await browser.close(); }
  results.push(out);
  console.log(`\n${out.ok ? 'PASS' : 'FAIL'}  ${name}  [${mode}${out.clicks ? `, ${out.clicks} taps, ${out.secs}s to Stripe` : ''}]`); for (const n of out.notes) console.log('  ' + n);
}

const product = (path, pack) => async ({ page, click, check }) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#add-to-cart-btn', { visible: true, timeout: 20000 }); await wait(2500);   // stock feed has painted
  if (PRE && path.includes('midnight')) { const band = await page.evaluate(() => (document.querySelector('.pre-band') || {}).innerText || ''); check(`page band says "Ships ${SHIPS}"`, band.replace(/\s+/g, ' ').toLowerCase().includes(('ships ' + SHIPS).toLowerCase()), band || '(no band)'); const top = await page.evaluate(() => (document.getElementById('pi-preorder-top') || {}).innerText || ''); check('price block says the same date', top.includes('Ships ' + SHIPS), top || '(none)'); }
  if (pack !== 'twin') { await page.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'center' }), 'pack-' + pack); await click('#pack-' + pack, 400); }
  await page.evaluate(() => document.getElementById('add-to-cart-btn').scrollIntoView({ block: 'center' })); await wait(300);
  await click('#add-to-cart-btn', 1000);
  const open = await page.$eval('#cd', e => e.classList.contains('open')).catch(() => false); check('cart drawer opened', open, open);
  await click('#cd-checkout', 500);
};

const cartPage = async ({ page, click, check }) => {
  await page.evaluateOnNewDocument(() => localStorage.setItem('altara-cart', JSON.stringify({ items: [{ id: 'midnight-black-twin', name: 'Midnight Black Twin Set', price: 89, image: 'Product Photos/opt/twin-set-midnight-black-320.jpg', qty: 1 }] })));
  await page.goto(BASE + '/cart', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForSelector('#btn-checkout', { visible: true }); await wait(2500);
  const t = await page.evaluate(() => document.body.innerText);
  if (PRE) check(`cart says "Pre-order · ships ${SHIPS}"`, t.includes('ships ' + SHIPS), (t.match(/Pre-order[^\n]*/) || [''])[0]);
  else check('cart has no pre-order wording for an in-stock colour', !/pre-?order/i.test(t), (t.match(/[^\n]*pre-?order[^\n]*/i) || [''])[0]);
  check('cart shows the 60-day guarantee for a Twin Set', /60-day fit guarantee/.test(t), (t.match(/\d\d-day fit guarantee[^\n]*/) || [''])[0]);
  await click('#btn-checkout', 500);
};
// Two line items collapse behind "View details" on a phone, so for the mixed pair the names are checked from the session.
const SCENARIOS = [
  ['Midnight Black Twin Set, from an ad', 'mobile', { total: 8900, totalText: '$89.00', preorder: PRE, pageHas: ['Midnight Black'] }, product('/product-midnight-black', 'twin')],
  ['Contrast White Twin Set (in stock)', 'mobile', { total: 8900, totalText: '$89.00', pageHas: ['Contrast White'] }, product('/product-contrast-white', 'twin')],
  ['Contrast White single cover + postage', 'mobile', { total: 7895, totalText: '$78.95', pageHas: ['Contrast White'] }, product('/product-contrast-white', 'single')],
  ['Full Car, four covers', 'mobile', { total: 15900, totalText: '$159.00', pageHas: ['Contrast White'] }, product('/product-contrast-white', 'fullcar')],
  ['Full Car in Midnight Black, from the Black Friday ad', 'mobile', { total: 15900, totalText: '$159.00', preorder: PRE, pageHas: ['Midnight Black'] }, product('/product-midnight-black', 'fullcar')],
  ['Mixed pair, one of each colour', 'mobile', { total: 8900, totalText: '$89.00', preorder: PRE, pageHas: [] }, product('/product-midnight-black', 'mixed')],
  ['Cart page on a laptop, Midnight Black Twin Set', 'desktop', { total: 8900, totalText: '$89.00', preorder: PRE, pageHas: ['Midnight Black'] }, cartPage],
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;   // ONLY=1,5 runs just those
for (const [i, sc] of SCENARIOS.entries()) if (!ONLY || ONLY.includes(i + 1)) await shopper(...sc);

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} shoppers reached Stripe with the right order${pass === results.length ? '' : '  <-- FAILURES ABOVE'}`);
process.exit(pass === results.length ? 0 : 1);
