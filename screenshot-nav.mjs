import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 }, headless: true });
const p = await b.newPage();
await p.goto(process.argv[2] || 'http://localhost:3000/faq.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 400));
await p.screenshot({ path: 'temporary screenshots/screenshot-nav-zoom.png', clip: { x: 0, y: 0, width: 1440, height: 70 } });
await b.close();
console.log('Done');
