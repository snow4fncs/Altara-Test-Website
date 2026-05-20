import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], defaultViewport: { width: 390, height: 844 }, headless: true });
const p = await b.newPage();
await p.goto(process.argv[2] || 'http://localhost:3000/product-midnight-black.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 500));
const info = await p.$eval('section.complete', el => {
  const r = el.getBoundingClientRect();
  return { top: r.top + window.scrollY, left: r.left, width: r.width, height: r.height };
});
console.log('Section info:', JSON.stringify(info));
await p.evaluate(y => window.scrollTo(0, y), info.top);
await new Promise(r => setTimeout(r, 300));
await p.screenshot({ path: 'temporary screenshots/screenshot-mobile-section.png', clip: { x: 0, y: info.top, width: 390, height: info.height + 10 } });
await b.close();
console.log('Done');
