import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

async function testPage(url, label) {
  console.log(`\n=== ${label} ===`);
  await page.goto(`http://localhost:3000/${url}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));

  const result = await page.evaluate(() => {
    const ham = document.getElementById('hamburger');
    const overlay = document.getElementById('mob-overlay');
    const closeBtn = document.getElementById('mob-close');

    // Simulate exactly what the IIFE checks
    const iifePassed = !!(ham && overlay);

    // Count all elements with these IDs
    const hamCount = document.querySelectorAll('#hamburger').length;
    const overlayCount = document.querySelectorAll('#mob-overlay').length;
    const closeBtnCount = document.querySelectorAll('#mob-close').length;

    // Try manually adding a click listener and clicking
    let listenerFired = false;
    if (ham && overlay) {
      ham.addEventListener('click', () => { listenerFired = true; }, { once: true });
      ham.click();
    }

    return {
      ham: ham ? 'found' : 'NULL',
      overlay: overlay ? 'found' : 'NULL',
      closeBtn: closeBtn ? 'found' : 'null (ok)',
      iifePassed,
      hamCount,
      overlayCount,
      closeBtnCount,
      listenerFired,
      // Show the actual text content near hamburger script
      scriptContent: (() => {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          if (s.textContent.includes('mob-overlay') && s.textContent.includes('openMenu')) {
            const idx = s.textContent.indexOf('if (!hamburger || !overlay)');
            return s.textContent.substring(idx, idx + 100);
          }
        }
        return 'script not found';
      })(),
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

await testPage('index.html', 'HOME (working)');
await testPage('cart.html', 'CART (failing)');
await testPage('account.html', 'ACCOUNT (failing)');

await browser.close();
