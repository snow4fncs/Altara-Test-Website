// usage: node white-site/probe.mjs <path> [mobile]   -> prints document height and any element wider than the viewport
import puppeteer from 'puppeteer-core';
const [, , route = '/', mode = 'desktop'] = process.argv;
const mobile = mode === 'mobile';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', defaultViewport: mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 800 } });
const p = await b.newPage(); await p.goto('http://localhost:3001' + route, { waitUntil: 'networkidle0' });
console.log(await p.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed'; }).slice(0, 8).map(e => e.tagName + '.' + String(e.className).slice(0, 40) + ' ' + Math.round(e.getBoundingClientRect().right));
  return { height: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: w, overflowing: wide };
}));
await b.close();
