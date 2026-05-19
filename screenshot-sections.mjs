import puppeteer from 'puppeteer-core';
import fs from 'fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
  headless: true,
});

const page = await browser.newPage();
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1000));

// Force all scroll-reveal elements visible instantly
await page.evaluate(() => {
  document.querySelectorAll('.rev').forEach(el => {
    el.style.transition = 'none';
    el.classList.add('in');
  });
});

const dir = '/Users/samuelnguyen/Website Design/temporary screenshots';

const sections = [
  { selector: '.trust', label: 'trustbar' },
  { selector: '.showcase', label: 'showcase' },
  { selector: '.features-sec', label: 'features' },
  { selector: '.craft', label: 'craft' },
  { selector: '.cta-strip', label: 'cta' },
  { selector: 'footer', label: 'footer' },
];

for (const s of sections) {
  const el = await page.$(s.selector);
  if (!el) { console.log('not found:', s.selector); continue; }
  await el.screenshot({ path: `${dir}/sec-${s.label}.png` });
  console.log('saved:', s.label);
}

await browser.close();
