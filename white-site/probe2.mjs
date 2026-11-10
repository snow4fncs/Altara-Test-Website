import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
const p = await b.newPage(); await p.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });
console.log(await p.evaluate(() => {
  const info = sel => { const e = document.querySelector(sel); if (!e) return sel + ': none'; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return `${sel}: left=${Math.round(r.left)} w=${Math.round(r.width)} pad=${s.paddingLeft}/${s.paddingRight} ml=${s.marginLeft} display=${s.display} align=${s.alignItems} textAlign=${s.textAlign} maxW=${s.maxWidth}`; };
  return [info('.showcase-copy'), info('.showcase-copy .qa-inline'), info('.showcase-copy .qa-inline .qa-btn'), info('.showcase-copy .stat-row'), info('.craft-copy .qa-inline')].join('\n');
}));
await b.close();
