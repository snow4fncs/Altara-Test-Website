// Measures the product page columns: where the gallery ends, where the buy column ends, where the band starts,
// and (SCROLL=y) where the gallery sits in the window after scrolling, to confirm it rides along.
// usage: node white-site/probe-gap.mjs /product-midnight-black [width height]
import puppeteer from 'puppeteer-core';
const [, , route = '/product-midnight-black', w = '1440', h = '800'] = process.argv;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], defaultViewport: { width: +w, height: +h }, headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3001' + route, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 800));
const m = await page.evaluate(() => {
  const r = s => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY), h: Math.round(b.height) }; };
  const cells = [...document.querySelectorAll('.ph-thumb')].map(t => { const b = t.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)].join('x'); });
  const left = document.querySelector('.ph-left');
  const ov = []; for (let el = left && left.parentElement; el && el !== document.body; el = el.parentElement) { const cs = getComputedStyle(el); if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') ov.push(el.className + ':' + cs.overflow + '/' + cs.overflowX + '/' + cs.overflowY); }
  return { left: r('.ph-left'), thumbs: r('.ph-thumbs'), info: r('.ph-info'), more: r('.ph-more'), cmp: r('.cmp'), cells, galTop: left && left.style.getPropertyValue('--gal-top'), position: left && getComputedStyle(left).position, clippingAncestors: ov };
});
console.log(w + 'x' + h, JSON.stringify(m));
console.log('static gap gallery->band content:', m.more && m.thumbs ? m.more.top + 72 - m.thumbs.bottom : '-', '| info->band content:', m.more && m.info ? m.more.top + 72 - m.info.bottom : '-');
if (process.env.SCROLL) {
  for (const y of process.env.SCROLL.split(',')) {
    await page.evaluate(y => window.scrollTo(0, +y), y); await new Promise(r => setTimeout(r, 400));
    const v = await page.evaluate(() => { const b = document.querySelector('.ph-thumbs').getBoundingClientRect(), i = document.querySelector('.ph-info').getBoundingClientRect(); return { scrollY, galleryTopInView: Math.round(b.top), galleryBottomInView: Math.round(b.bottom), infoBottomInView: Math.round(i.bottom), windowH: innerHeight }; });
    console.log('scrolled', JSON.stringify(v));
  }
}
await browser.close();
