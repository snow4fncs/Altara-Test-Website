// Opens the fitting video on the product page and checks it can be seeked (needs Range support from the dev server).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1440, height: 800 }, headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3001/product-midnight-black', { waitUntil: 'networkidle0', timeout: 45000 });
await page.evaluate(() => document.querySelector('#pi-ugc').scrollIntoView());
await page.click('#pi-ugc');
const r = await page.evaluate(() => new Promise(res => {
  const v = document.querySelector('video.pi-ugc-video'); if (!v) return res({ error: 'no video element' });
  const done = () => {
    const seekableEnd = v.seekable.length ? v.seekable.end(0) : -1;
    v.currentTime = Math.max(0, v.duration - 1.5);
    v.addEventListener('seeked', () => res({ duration: +v.duration.toFixed(2), seekableEnd: +seekableEnd.toFixed(2), jumpedTo: +v.currentTime.toFixed(2), readyState: v.readyState, controls: v.controls, src: v.currentSrc.split('/').pop() }), { once: true });
    setTimeout(() => res({ error: 'seek never completed', duration: v.duration, seekableEnd, currentTime: v.currentTime }), 6000);
  };
  if (v.readyState >= 1) done(); else v.addEventListener('loadedmetadata', done, { once: true });
  setTimeout(() => res({ error: 'metadata never loaded', readyState: v.readyState, networkState: v.networkState }), 8000);
}));
console.log(JSON.stringify(r));
await browser.close();
