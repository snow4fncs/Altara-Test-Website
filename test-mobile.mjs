import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const existing = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0')).filter(Boolean);
let next = nums.length ? Math.max(...nums) + 1 : 1;
const save = (label) => path.join(dir, `screenshot-${next++}-${label}.png`);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  headless: true,
});

const page = await browser.newPage();
// Simulate iPhone 14 Pro
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

// --- CHECKOUT: nav top + hamburger test ---
await page.goto('http://localhost:3000/checkout.html', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: save('checkout-top'), fullPage: false });
console.log('checkout top done');

// Click hamburger
await page.click('#hamburger');
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: save('checkout-hamburger-opened'), fullPage: false });
console.log('checkout hamburger done');

// Close menu
const overlayOpen = await page.$eval('#mob-overlay', el => el.classList.contains('open'));
console.log('Overlay has .open class:', overlayOpen);

// --- INDEX: nav top ---
await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: save('index-top'), fullPage: false });
console.log('index top done');

// --- PRODUCT CONTRAST WHITE: footer ---
await page.goto('http://localhost:3000/product-contrast-white.html', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));
// Scroll to footer
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: save('contrast-white-footer'), fullPage: false });
// Also take a full page shot to see everything
await page.screenshot({ path: save('contrast-white-full'), fullPage: true });
console.log('contrast-white footer done');

await browser.close();
console.log('All screenshots done');
