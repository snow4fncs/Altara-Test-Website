import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

// Capture console errors
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

async function testPage(url, label) {
  errors.length = 0;
  console.log(`\n=== ${label} ===`);
  await page.goto(`http://localhost:3000/${url}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 800));

  // Directly dispatch a click event on the hamburger via JS
  const directClickResult = await page.evaluate(() => {
    const ham = document.getElementById('hamburger');
    const overlay = document.getElementById('mob-overlay');
    if (!ham) return { error: 'no hamburger' };

    // Check if click listeners are attached (can't directly inspect, but we can test dispatch)
    const beforeOpen = overlay?.classList.contains('open');

    // Direct DOM click
    ham.click();

    const afterOpen = overlay?.classList.contains('open');
    return {
      beforeOpen,
      afterDOMClick: afterOpen,
      hamInnerHTML: ham.innerHTML.substring(0, 50),
    };
  });

  console.log('Direct ham.click() result:', directClickResult);

  if (!directClickResult.afterDOMClick) {
    // Try dispatching event manually
    const dispatchResult = await page.evaluate(() => {
      const ham = document.getElementById('hamburger');
      const overlay = document.getElementById('mob-overlay');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      ham.dispatchEvent(event);
      return { overlayOpen: overlay?.classList.contains('open') };
    });
    console.log('dispatchEvent click result:', dispatchResult);
  }

  // Check for JS errors
  if (errors.length > 0) {
    console.log('JS ERRORS:', errors);
  } else {
    console.log('No JS errors');
  }

  // Read the hamburger JS source from the page
  const hamJSSrc = await page.evaluate(() => {
    // Check if the IIFE ran by looking for a marker
    const scripts = Array.from(document.scripts);
    const src = scripts.find(s => s.innerText?.includes('hamburger'))?.innerText;
    if (!src) return 'hamburger script not found in page scripts';
    const idx = src.indexOf('Mobile hamburger menu');
    return idx >= 0 ? src.substring(idx, idx + 400) : 'Mobile hamburger menu comment not found';
  });
  console.log('Hamburger JS source:', hamJSSrc.substring(0, 300));
}

await testPage('index.html', 'HOME (working)');
await testPage('cart.html', 'CART (failing)');
await testPage('account.html', 'ACCOUNT (failing)');

await browser.close();
