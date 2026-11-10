// drive the viewer: open from cell 2, press right twice, scroll once, press Escape; report state each step
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', defaultViewport: { width: 1440, height: 800 } });
const p = await b.newPage(); await p.goto('http://localhost:3001/product-midnight-black', { waitUntil: 'networkidle0' });
const state = () => p.evaluate(() => { const r = document.getElementById('pgl'); return r.hidden ? 'closed' : (document.querySelector('.pgl-n').textContent + ' ' + document.querySelector('.pgl-img').getAttribute('src').split('/').pop()); });
await p.click('.ph-thumb:nth-child(2)'); await new Promise(r => setTimeout(r, 400)); console.log('open from cell 2 →', await state());
await p.keyboard.press('ArrowRight'); await new Promise(r => setTimeout(r, 400)); console.log('→ key →', await state());
await p.keyboard.press('ArrowRight'); await new Promise(r => setTimeout(r, 400)); console.log('→ key →', await state());
await p.mouse.move(720, 400); await p.mouse.wheel({ deltaY: 120 }); await new Promise(r => setTimeout(r, 400)); console.log('scroll →', await state(), '(wraps to first)');
await p.click('.pgl-prev'); await new Promise(r => setTimeout(r, 400)); console.log('prev arrow →', await state());
await p.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 400)); console.log('Esc →', await state(), '| page scroll restored:', await p.evaluate(() => document.documentElement.style.overflow === ''));
await b.close();
