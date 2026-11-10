import puppeteer from 'puppeteer-core';
const mode = process.argv[2] || 'desktop';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', defaultViewport: mode === 'mobile' ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 800 } });
const p = await b.newPage(); await p.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });
console.log(await p.evaluate(() => {
  const r = sel => { const e = document.querySelector(sel); if (!e) return sel + ': none'; const b = e.getBoundingClientRect(), s = getComputedStyle(e); return `${sel}: top=${Math.round(b.top + scrollY)} h=${Math.round(b.height)} minH=${s.minHeight} height=${s.height} overflow=${s.overflow} pos=${s.position} display=${s.display} cols=${s.gridTemplateColumns}`; };
  return [r('.craft'), r('.craft-copy'), r('.craft-list'), r('.craft-copy .qa-inline'), r('.craft-visual'), r('.rvb'), r('.rvb-head')].join('\n');
}));
await b.close();
