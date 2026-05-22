import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

// Intercept console logs
const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

async function testPage(url, label) {
  logs.length = 0;
  console.log(`\n=== ${label} ===`);
  await page.goto(`http://localhost:3000/${url}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));

  const result = await page.evaluate(() => {
    const overlay = document.getElementById('mob-overlay');
    const ham = document.getElementById('hamburger');

    // Step 1: manually add open class
    overlay.classList.add('open');
    const step1 = overlay.classList.contains('open');

    // Step 2: wait a tick, check again
    const step1AfterTick = overlay.classList.contains('open');

    // Step 3: manually remove it
    overlay.classList.remove('open');

    // Step 4: Intercept classList.add to trace calls
    const addCalls = [];
    const removeCalls = [];
    const origAdd = overlay.classList.add.bind(overlay.classList);
    const origRemove = overlay.classList.remove.bind(overlay.classList);
    overlay.classList.add = (...args) => {
      addCalls.push(args.join(','));
      origAdd(...args);
    };
    overlay.classList.remove = (...args) => {
      removeCalls.push(args.join(','));
      origRemove(...args);
    };

    // Step 5: trigger ham click
    ham.click();

    // Small sync delay to let any immediate handlers run
    // (can't async wait in evaluate, so just collect what happened sync)
    return {
      step1_addWorked: step1,
      step1AfterTick,
      addCallsAfterClick: addCalls,
      removeCallsAfterClick: removeCalls,
      overlayOpenAfterClick: overlay.classList.contains('open'),
    };
  });

  console.log(JSON.stringify(result, null, 2));

  // Wait a bit then check again (for async closes)
  await new Promise(r => setTimeout(r, 300));
  const afterDelay = await page.evaluate(() => ({
    overlayOpen: document.getElementById('mob-overlay')?.classList.contains('open'),
  }));
  console.log('After 300ms delay:', afterDelay);
}

await testPage('index.html', 'HOME (working)');
await testPage('cart.html', 'CART (failing)');
await testPage('account.html', 'ACCOUNT (failing)');

await browser.close();
