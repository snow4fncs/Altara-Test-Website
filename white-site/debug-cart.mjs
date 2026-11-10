// Physical-click cart checkout probe. usage: BASE=https://www.altaradesign.com node white-site/debug-cart.mjs
// The create-checkout call is intercepted and answered with a fake URL, so no real Stripe session is created.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:3001';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await p.setRequestInterception(true);
let sent = 0;
p.on('request', r => { const u = r.url(); if (u.includes('/api/create-checkout')) { sent++; console.log('[create-checkout sent]', (r.postData() || '').slice(0, 120)); return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/sim' }) }); } if (u.startsWith('https://checkout.stripe.com/')) { console.log('[redirect]'); return r.abort(); } if (/facebook|fbevents|google/.test(u)) return r.abort(); r.continue(); });
await p.evaluateOnNewDocument(() => localStorage.setItem('altara-cart', JSON.stringify({ items: [{ id: 'contrast-white', name: 'Contrast White', price: 69, image: 'Product Photos/opt/img1-320.jpg', qty: 1 }] })));
await p.goto(BASE + '/cart', { waitUntil: 'networkidle0', timeout: 60000 });
const btnText = async () => p.$eval('#btn-checkout', e => e.textContent.trim()).catch(() => '(gone)');
await p.click('#btn-checkout'); await new Promise(r => setTimeout(r, 600));
console.log('1. click without email → button says:', await btnText(), '| sent:', sent);
await p.click('#email-input', { clickCount: 3 }); await p.keyboard.type('sim@example.com');
await p.click('#btn-checkout'); await new Promise(r => setTimeout(r, 1200));
console.log('2. type email, click once → button says:', await btnText(), '| sent:', sent);
if (!sent) { await p.click('#btn-checkout').catch(() => {}); await new Promise(r => setTimeout(r, 1200)); console.log('3. click a second time → sent:', sent); }
await b.close();
