import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

async function testPage(url, label) {
  console.log(`\n=== Testing ${label} ===`);
  await page.goto(`http://localhost:3000/${url}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 600));

  // Check if hamburger exists and is visible
  const hamInfo = await page.evaluate(() => {
    const ham = document.getElementById('hamburger');
    const overlay = document.getElementById('mob-overlay');
    if (!ham) return { error: 'hamburger not found' };
    const rect = ham.getBoundingClientRect();
    const computed = getComputedStyle(ham);
    const overlayRect = overlay ? overlay.getBoundingClientRect() : null;
    const overlayComputed = overlay ? getComputedStyle(overlay) : null;

    // Check what element is AT the center of the hamburger
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(centerX, centerY);

    return {
      hamRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      hamDisplay: computed.display,
      hamZIndex: computed.zIndex,
      hamPointerEvents: computed.pointerEvents,
      overlayDisplay: overlayComputed?.display,
      overlayOpacity: overlayComputed?.opacity,
      overlayPointerEvents: overlayComputed?.pointerEvents,
      overlayZIndex: overlayComputed?.zIndex,
      navBackdrop: getComputedStyle(document.getElementById('nav'))?.backdropFilter,
      topElementAtHam: topEl?.tagName + (topEl?.id ? '#'+topEl.id : '') + (topEl?.className ? '.'+topEl.className.split(' ')[0] : ''),
      overlayHasOpen: overlay?.classList.contains('open'),
    };
  });
  console.log('State before tap:', JSON.stringify(hamInfo, null, 2));

  // Simulate touch tap on hamburger center
  const rect = hamInfo.hamRect;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Method 1: touchscreen tap
  await page.touchscreen.tap(x, y);
  await new Promise(r => setTimeout(r, 500));

  const afterTouch = await page.evaluate(() => {
    return {
      overlayOpen: document.getElementById('mob-overlay')?.classList.contains('open'),
      hamOpen: document.getElementById('hamburger')?.classList.contains('open'),
    };
  });
  console.log('After touch tap:', afterTouch);

  if (!afterTouch.overlayOpen) {
    // Method 2: mouse click
    await page.mouse.click(x, y);
    await new Promise(r => setTimeout(r, 400));
    const afterClick = await page.evaluate(() => ({
      overlayOpen: document.getElementById('mob-overlay')?.classList.contains('open'),
    }));
    console.log('After mouse click:', afterClick);
  }

  return afterTouch.overlayOpen;
}

const results = {};
results['index.html'] = await testPage('index.html', 'HOME PAGE');
results['cart.html'] = await testPage('cart.html', 'CART PAGE');
results['account.html'] = await testPage('account.html', 'ACCOUNT PAGE');
results['collection.html'] = await testPage('collection.html', 'COLLECTION PAGE');

console.log('\n=== SUMMARY ===');
for (const [page, works] of Object.entries(results)) {
  console.log(`${page}: hamburger ${works ? '✅ WORKS' : '❌ FAILS'}`);
}

await browser.close();
