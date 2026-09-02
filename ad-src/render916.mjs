import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });  // 2160x3840

const P = '../Product Photos/';
const photo = (img, hl, a, b, out) => ['story-photo.html?img=' + encodeURIComponent(img) + '&hl=' + encodeURIComponent(hl) + '&a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b), out];
const scene = (img, hook, a, b, out) => ['story-scene.html?img=' + encodeURIComponent(img) + '&hook=' + encodeURIComponent(hook) + '&a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b), out];

const jobs = [
  photo(P+'Altara Product Image 9.png', 'Sweat. Sand. Dog hair.<br><em>Not your seats.</em>', 'Two Covers · $89', 'Delivered free · 60-day guarantee', 'altara-916-hook'),
  photo(P+'Altara Product Image 7.png', '&ldquo;Great stuff. Does not slip off the seats.&rdquo;<br><em>&mdash; Yahya S., verified</em>', 'Two Covers · $89', 'Delivered free · 60-day guarantee', 'altara-916-review'),
  photo(P+'Altara Product Image 7.png', 'His car is his second home.<br><em>Protect it.</em>', 'Gift the Twin Set · $89', 'Arrives before Father’s Day', 'altara-916-fathers'),
  photo(P+'Altara Product Image 8.png', 'Engineered like the seats<br>it protects.', 'Two Covers · $89', 'Fits any seat · 30 sec', 'altara-916-callout'),
  photo(P+'Altara Product Image 3.png', 'ALL-WEEK <em>ARMOUR</em>', 'Two Covers · $89', 'Machine washable · 60-day', 'altara-916-editorial'),
  photo(P+'Altara Product Image 7.png', 'MIDNIGHT<br><em>back in stock</em>', 'Twin Set · $89 Delivered', 'Single · Twin · Full Car', 'altara-916-midnight'),
  photo(P+'Altara Product Image 9.png', 'Altara.<br><em>Seat Protection Club</em>', 'Two Covers · $89', 'Delivered free · 60-day guarantee', 'altara-916-club'),
  photo(P+'Homepage image.png', 'Built for sweat, sand<br><em>and shared drives.</em>', '$89 · Shop Now', 'Two covers · delivered free', 'altara-916-grid'),
  scene('gen-1-gym.png', 'The gym session stays on the cover.', 'Two Covers · $89', 'Machine washable', 'altara-916-gym'),
  scene('gen-2-beach.png', 'Beach + car seats = sorted.', 'Two Covers · $89', 'Sand stays on the cover', 'altara-916-beach'),
  scene('gen-3-dog.png', 'Dog hair washes straight out.', 'Two Covers · $89', '60-day fit guarantee', 'altara-916-dog'),
  scene('gen-4-tradie.png', 'Stop trashing the work ute.', 'Two Covers · $89', 'Built for the tools', 'altara-916-tradie'),
  scene('gen-5-wash.png', 'When it cops it — machine wash.', 'Two Covers · $89', 'Comes out like new', 'altara-916-wash'),
];
for (const [url, out] of jobs) {
  await page.goto('http://localhost:3000/ad-src/' + url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'Ad Creatives/' + out + '.png' });
  console.log('ok', out);
}
await browser.close();
