// One tap on the other colourway must open it on a phone, including the tap that comes while the page still glides
// after a swipe (iPhone Safari spends that tap on stopping the glide, so the page opens it from the touch itself).
// A drag that starts on a tile scrolls instead, a long press does nothing, and desktop click and Enter still work.
// usage (repo root): node white-site/probe-colourway-tap.mjs   (BASE=https://www.altaradesign.com for production)
import puppeteer from 'puppeteer-core';
const base = process.env.BASE || 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'], headless: true });
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const ROUTES = [['/product-midnight-black', /contrast-white/], ['/product-contrast-white', /midnight-black/]];
const results = [];

async function open(route, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  // don't send test traffic to the ad pixel
  await page.setRequestInterception(true);
  page.on('request', r => (/facebook|fbevents|tiktok|_vercel\/(insights|speed)/.test(r.url()) ? r.abort() : r.continue()));
  let navs = 0;
  page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
  // which click reached the tile: the browser's own (trusted) or the one the page sends from a clean tap (script)
  const clicks = { browser: 0, page: 0 };
  await page.exposeFunction('__tileClick', trusted => { clicks[trusted ? 'browser' : 'page']++; });
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('a.pi-var')) window.__tileClick(e.isTrusted); }, true);
  });
  await page.goto(base + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(1300); // the page fades in
  const start = navs;
  return { page, clicks, navs: () => navs - start, cdp: await page.createCDPSession() };
}
const tile = page => page.$eval('a.pi-var[href]', el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 40)), top: r.top, bottom: r.bottom }; });
const toView = (page, block = 'center') => page.$eval('a.pi-var[href]', (el, block) => el.scrollIntoView({ block, behavior: 'instant' }), block);
function check(name, ok, detail) { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); }

for (const [route, other] of ROUTES) {
  const from = route.slice(9);
  // 1. at rest: one tap opens the other colourway, exactly once, without needing the browser's own click
  {
    const s = await open(route, PHONE);
    await toView(s.page); await sleep(400);
    const t = await tile(s.page);
    await s.page.touchscreen.tap(t.x, t.y); await sleep(1600);
    const url = s.page.url();
    check(`${from}: one tap opens the other colourway`, other.test(url) && s.navs() === 1 && s.clicks.page === 1 && s.clicks.browser === 0,
      `${url.replace(base, '')}, ${s.navs()} page load, opened by the tap itself: ${s.clicks.page === 1 ? 'yes' : 'no'}, browser click: ${s.clicks.browser}`);
    await s.page.close();
  }
  // 2. the tap that comes while the page still glides after a flick on the photo
  {
    const s = await open(route, PHONE);
    await toView(s.page, 'end'); await s.page.evaluate(() => window.scrollBy(0, 140)); await sleep(300);
    const ph = await s.page.$eval('.ph-image-area', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, bottom: r.bottom }; });
    let gliding = 0;
    await s.page.evaluate(() => { window.__sc = 0; addEventListener('scroll', () => window.__sc++, { passive: true }); });
    await s.cdp.send('Input.synthesizeScrollGesture', { x: Math.round(ph.x), y: Math.round(Math.max(30, Math.min(ph.bottom - 20, 140))), yDistance: -90, speed: 1600, gestureSourceType: 'touch', preventFling: false });
    await sleep(40);
    const t = await tile(s.page);
    const sc0 = await s.page.evaluate(() => window.__sc);
    await sleep(30);
    gliding = (await s.page.evaluate(() => window.__sc)) - sc0;
    await s.page.touchscreen.tap(t.x, t.y); await sleep(1600);
    check(`${from}: one tap right after a flick on the photo opens it`, other.test(s.page.url()) && s.navs() === 1 && s.clicks.page === 1, `page still scrolling at the tap: ${gliding > 0 ? 'yes' : 'no'}, ${s.navs()} page load`);
    await s.page.close();
  }
  // 3. a drag that starts on a tile scrolls the page and opens nothing
  {
    const s = await open(route, PHONE);
    await toView(s.page); await sleep(400);
    const t = await tile(s.page); const y0 = await s.page.evaluate(() => scrollY);
    await s.page.touchscreen.touchStart(t.x, t.y);
    for (let i = 1; i <= 8; i++) { await s.page.touchscreen.touchMove(t.x, t.y - 12 * i); await sleep(25); }
    await s.page.touchscreen.touchEnd(); await sleep(1200);
    const y1 = await s.page.evaluate(() => scrollY);
    check(`${from}: a drag that starts on a tile scrolls and opens nothing`, s.navs() === 0 && y1 > y0 + 40, `scrolled ${Math.round(y1 - y0)}px`);
    await s.page.close();
  }
  // 4. a long press is left to the browser (Safari shows its link preview; headless Chrome, with no menu, treats it as
  //    a tap exactly as the live site did before this change), so the page itself must not open anything
  {
    const s = await open(route, PHONE);
    await toView(s.page); await sleep(400);
    const t = await tile(s.page);
    await s.page.touchscreen.touchStart(t.x, t.y); await sleep(800); await s.page.touchscreen.touchEnd(); await sleep(1200);
    check(`${from}: a long press is left to the browser`, s.clicks.page === 0, `page-sent clicks: ${s.clicks.page}`);
    await s.page.close();
  }
  // 5. desktop: mouse click and Enter key still open it
  {
    const s = await open(route, DESK);
    await toView(s.page); await sleep(400);
    const t = await tile(s.page);
    await s.page.mouse.click(t.x, t.y); await sleep(1600);
    check(`${from}: desktop mouse click opens it`, other.test(s.page.url()) && s.navs() === 1);
    await s.page.close();
  }
  {
    const s = await open(route, DESK);
    await s.page.focus('a.pi-var[href]'); await s.page.keyboard.press('Enter'); await sleep(1600);
    check(`${from}: Enter key opens it`, other.test(s.page.url()) && s.navs() === 1);
    await s.page.close();
  }
}
await browser.close();
const bad = results.filter(r => !r.ok);
console.log(bad.length ? `\n${bad.length} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
