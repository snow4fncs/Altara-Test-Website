import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 800 }, headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3001/product-midnight-black', { waitUntil: 'networkidle0', timeout: 45000 });
console.log(await page.evaluate(() => { const w = document.querySelector('.pi-quotes-wrap'), q = document.querySelector('.pi-quotes'), f = document.querySelector('.pi-q'), b = document.querySelector('.pi-q blockquote'), u = document.querySelector('.pi-ugc'), img = document.querySelector('.pi-ugc img'); return JSON.stringify({ wrapW: w.clientWidth, quotesW: q.clientWidth, scrollW: q.scrollWidth, figW: f.getBoundingClientRect().width, figH: f.getBoundingClientRect().height, bqLines: Math.round(b.getBoundingClientRect().height / 22 / 1.35), bqH: b.getBoundingClientRect().height, ugc: [u.clientWidth, u.clientHeight], poster: [img.naturalWidth, img.naturalHeight], mediaChildren: [...document.querySelector('.ph-more-media').children].map(c => c.className) }); }));
await browser.close();
