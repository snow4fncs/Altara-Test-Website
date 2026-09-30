// Marketplace watcher — the scraping half.
//
// Runs headless-under-xvfb Chrome on a GitHub Actions schedule (see
// .github/workflows/watcher.yml), so it works with the laptop off. Scrapes
// eBay AU, Gumtree and Lawsons for the watch list below, then POSTs raw hits
// to /api/watcher on the live site, which owns dedupe + email alerts.
//
// Local dry run (prints instead of POSTing):
//   node watcher/scan.mjs --dry
import puppeteer from 'puppeteer-core';

const DRY = process.argv.includes('--dry');
const ENDPOINT = process.env.WATCHER_ENDPOINT || 'https://www.altaradesign.com/api/watcher';
const SECRET = process.env.WATCHER_SECRET || '';
const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── the watch list ───────────────────────────────────────────────────────────
// maxPrice is enforced client-side too (Gumtree URLs cannot carry a cap).
const EBAY = (q, udhi) =>
  `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(q).replace(/%20/g, '+')}&_sop=10&LH_PrefLoc=1${udhi ? `&_udhi=${udhi}` : ''}`;
const GUMTREE = q =>
  `https://www.gumtree.com.au/s-${encodeURIComponent(q).replace(/%20/g, '+')}/k0?sort=date`;

// Accessory listings (arm pads, foam inserts, cases) dominate under-cap
// results, so chair and hub legs carry an exclusion regex plus a price floor —
// a real Aeron is never $55.
const CHAIR_JUNK = /\b(pads?|caps?|inserts?|replacement|casters?|wheels?|cylinder|foam|repair|brackets?|screws?|armrest|arm rest|back support|lumbar pad|parts)\b/i;
const HUB_JUNK = /\b(case|mount|stand|holder|wall|cable|charger|adapter|skin|cover|screen protector)\b/i;

const WATCHES = [
  { id: 'ebay-aeron',   label: 'HM Aeron (eBay)',    url: EBAY('herman miller aeron', 600),  max: 600, min: 150, junk: CHAIR_JUNK, kind: 'ebay' },
  { id: 'ebay-embody',  label: 'HM Embody (eBay)',   url: EBAY('herman miller embody', 900), max: 900, min: 250, junk: CHAIR_JUNK, kind: 'ebay' },
  { id: 'ebay-hm',      label: 'HM generic (eBay)',  url: EBAY('herman miller chair', 300),  max: 300, min: 80,  junk: CHAIR_JUNK, kind: 'ebay' },
  { id: 'ebay-nesthub', label: 'Nest Hub (eBay)',    url: EBAY('google nest hub', 60),       max: 60,  min: 15,  junk: HUB_JUNK,   kind: 'ebay' },
  // Expensive-plate resale watch: heritage mentions at any price, or any plate
  // listing at $1,500+ (the 2-3 character tier the user is hunting).
  { id: 'ebay-plates',  label: 'NSW plates (eBay)',  url: EBAY('nsw number plate'),          kind: 'ebay',
    keep: h => /heritage/i.test(h.title) || (h.price != null && h.price >= 1500) },
  { id: 'gum-aeron',    label: 'HM Aeron (Gumtree)', url: GUMTREE('herman miller aeron'),    max: 600, min: 150, junk: CHAIR_JUNK, kind: 'gumtree' },
  { id: 'gum-embody',   label: 'HM Embody (Gumtree)',url: GUMTREE('herman miller embody'),   max: 900, min: 250, junk: CHAIR_JUNK, kind: 'gumtree' },
  { id: 'gum-nesthub',  label: 'Nest Hub (Gumtree)', url: GUMTREE('google nest hub'),        max: 60,  min: 15,  junk: HUB_JUNK,   kind: 'gumtree' },
  // New heritage-plate AUCTIONS at Lawsons (whole catalogs — this is where
  // 2-3 character plates actually surface).
  { id: 'lawsons',      label: 'Lawsons plate auction', url: 'https://www.lawsons.com.au/departments/heritage-number-plates/', kind: 'lawsons' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = () => 1500 + Math.random() * 1800;
const parsePrice = s => {
  const m = /\$\s?([\d,]+(?:\.\d{2})?)/.exec(s || '');
  return m ? Math.round(parseFloat(m[1].replace(/,/g, ''))) : null;
};

async function scrapeEbay(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/itm/"]')).map(a => {
    const m = /\/itm\/(\d{9,15})/.exec(a.href);
    if (!m) return null;
    const card = a.closest('li') || a.parentElement;
    const text = (card ? card.innerText : a.innerText || '').replace(/\s+/g, ' ').trim();
    return { rawId: m[1], text, url: 'https://www.ebay.com.au/itm/' + m[1] };
  }).filter(Boolean));
}

async function scrapeGumtree(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/web/listing/"], a[href*="/s-ad/"]')).map(a => {
    const href = a.getAttribute('href') || '';
    const m = /\/(?:web\/listing|s-ad)\/.*?(\d{8,12})/.exec(href);
    if (!m) return null;
    const card = a.closest('article, li, div[class*="card"]') || a;
    const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
    return { rawId: m[1], text, url: 'https://www.gumtree.com.au' + href.split('?')[0] };
  }).filter(Boolean));
}

async function scrapeLawsons(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/auction-catalog/"], a[href*="/auction-lot/"]')).map(a => {
    const href = a.getAttribute('href') || '';
    if (!/plate|heritage-num|numeral/i.test(href)) return null;
    const slug = href.split('/').filter(Boolean).pop();
    const text = (a.innerText || '').replace(/\s+/g, ' ').trim()
      || slug.replace(/[-_]/g, ' ').replace(/\s+\w{8,12}$/, '');
    return { rawId: slug, text: 'Lawsons: ' + text, url: new URL(href, 'https://www.lawsons.com.au').href };
  }).filter(Boolean));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false, // under xvfb on CI; off-screen locally
  args: ['--disable-blink-features=AutomationControlled', '--window-position=-2400,-2400',
         '--window-size=1280,950', '--no-first-run', '--no-default-browser-check'],
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36');

const hits = [];
const meta = {};
const globalSeen = new Set(); // an Embody search also returns Aerons — dedupe across legs
for (const w of WATCHES) {
  try {
    await page.goto(w.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(2500);
    let rows = [];
    if (w.kind === 'ebay') rows = await scrapeEbay(page);
    else if (w.kind === 'gumtree') rows = await scrapeGumtree(page);
    else rows = await scrapeLawsons(page);

    let kept = 0;
    for (const r of rows) {
      const gid = `${w.kind}:${r.rawId}`;
      if (!r.rawId || globalSeen.has(gid)) continue;
      globalSeen.add(gid);
      const title = r.text.replace(/Opens in a new window or tab/gi, '').replace(/\s+/g, ' ').trim().slice(0, 150);
      if (!title || /shop on ebay/i.test(title)) continue;
      const price = parsePrice(r.text);
      const hit = { id: gid, watch: w.label, title, price, url: r.url };
      if (w.junk && w.junk.test(title)) continue;
      if (w.max != null && price != null && price > w.max) continue;
      if (w.min != null && (price == null || price < w.min)) continue;
      if (w.keep && !w.keep(hit)) continue;
      hits.push(hit);
      kept++;
    }
    meta[w.id] = { found: rows.length, kept };
  } catch (e) {
    meta[w.id] = { error: String(e).slice(0, 120) };
  }
  await sleep(jitter());
}
await browser.close();

if (DRY) {
  console.log(JSON.stringify({ meta, hits }, null, 2));
  console.log(`DRY RUN: ${hits.length} hits across ${Object.keys(meta).length} legs`);
  process.exit(0);
}

const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(SECRET)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hits, meta }),
});
console.log('POST', res.status, await res.text());
if (!res.ok) process.exit(1);
