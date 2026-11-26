// Meta Ad Library watch (Australia, active ads, no login): what competitors run today and what changed
// since the last run. Read-only against Meta; the only thing it writes is one JSON snapshot per day.
//
// usage (from the project root):
//   node tools/ads/adlib.mjs             full run (about 1 minute): every WATCH page plus the keywords, saves today's snapshot
//   node tools/ads/adlib.mjs --quick     keywords only (about 15 seconds); no per-page counts, no retirement check
//   node tools/ads/adlib.mjs --no-save   print the report without writing a snapshot (works with --quick too)
//
// RULE: formats and hooks are adapted, never copied; no was/now prices, no invented demos.
//
// How it reads the library: logged out, Meta serves only the first 30 ads of any view and rate-limits
// "load more", so this reads the ad data embedded in each page's HTML and widens the sample with several
// views per advertiser (top impressions, newest, video top impressions, video newest). Small pages are
// listed in full. So: "active" in (a) is the library's own total for that advertiser, everything else is
// a SAMPLE, and copy counts are minimums.
//
// Snapshots: ad-src/research/adlib/YYYY-MM-DD.json (Sydney date). Shape:
//   { date, mode, generated, counts: { page_id: { name, active, as_of } }, views: [...],
//     ads: [ { id, adv, page_id, mult, started, days, fmt, body, title, desc, cta, link } ] }
//   mult = "N ads use this creative and text". No image or video files are stored.
//   A second run on the same day is merged into that day's file (it can only add, never lose ads).
//   The report compares with the newest snapshot dated before today (or, when there is none, one saved
//   earlier today).
//
// Report sections ("hook" = first line of the ad text, grouped per advertiser):
//   (a) active ads per watched advertiser, now against the last snapshot, plus how many we sampled.
//   (b) NEW hooks: first lines not seen in any of the last 14 snapshots, most copies first. Ads that
//       started since the last snapshot come first; "older ad, new to sample" = it started earlier and
//       has only now surfaced in the 30-per-view sample.
//   (c) scale-ups: same hook, 5 or more extra copies since the last snapshot (they are spending into it).
//   (d) retired: hooks that had run 60+ days and are gone. Each is checked by ad id before it is listed,
//       because an ad can simply fall outside today's 30-per-view sample; ads found still active are kept.
//   (e) the 10 longest-running active hooks (long run = it pays, the best evidence the library gives).
//   (f) offer wording per advertiser: its most-used line with a discount or price, the seasonal line
//       (Black Friday, Cyber, Boxing Day) when that is a different one, and any sale deadline.
//       [xN] = copies carrying that exact line. NEW = the line was not in the last snapshot.
//
// A view that returns nothing prints one line starting "WARNING:" and the run still exits 0, so a daily
// job can report "blocked" by looking for that word. Nothing is saved when no ads came back at all, and a
// run that keeps failing stops asking after a few views (a fully blocked run takes about a minute).
// The library's own totals wobble by a few ads between runs minutes apart; read (a) as a trend.
// Testing aid: ADLIB_DIR=/some/folder reads and writes snapshots there instead.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------- WATCH LIST (edit here)
// page id = the number in the advertiser's Ad Library address (view_all_page_id=...), also saved as page_id.
// Optional q: 'word' narrows a page to its ads that mention that word, for brands that mostly sell
// something else (CapyCool has about 290 fan ads and one car seat towel).
const WATCH = {
  pages: [
    { name: 'Tuff Towel', id: '580021155203258' },
    { name: 'Towel Society', id: '117519094771740' },
    { name: 'Actv8', id: '113329784589467' },
    { name: 'Seat Hoodie', id: '343937758805203' },
    { name: 'Sharkskin Seat Covers', id: '108476618581179' },
    { name: 'Dryva', id: '111428541987691' },
    { name: 'Companion&Co', id: '506700645857196' },
    { name: 'Marlo&Co', id: '583333118197977' },
    { name: 'CapyCool', id: '410446385491210', q: 'seat' },
  ],
  // The last keyword is seasonal: swap it for "boxing day", "afterpay day" and so on as the year moves.
  keywords: ['car seat towel', 'seat towel', 'towel seat cover', 'waterproof car seat towel', 'car seat cover black friday'],
};
// Keyword searches also return novels, supplements and other noise. An advertiser that is not on the
// list above is kept only when its ad text matches RELEVANT and its name does not match IGNORE.
const RELEVANT = /seat[\s-]*(cover|towel|protector|hoodie)|towel[\s-]*seat|car[\s-]*towel/i;
const IGNORE = [/candychristy/i];
// ----------------------------------------------------------------

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = process.env.ADLIB_DIR || path.join(ROOT, 'ad-src/research/adlib');
const ARGS = process.argv.slice(2);
const QUICK = ARGS.includes('--quick'), NO_SAVE = ARGS.includes('--no-save');
if (ARGS.includes('--help') || ARGS.includes('-h')) {
  console.log('usage: node tools/ads/adlib.mjs [--quick] [--no-save]\n  --quick    keywords only, about 15 seconds\n  --no-save  print the report, write no snapshot\nSnapshots: ad-src/research/adlib/YYYY-MM-DD.json. The watch list is at the top of this file.');
  process.exit(0);
}
const LIB = 'https://www.facebook.com/ads/library/';
const OFFER = /\d{1,3}\s?%\s?off|\$\d+(\.\d+)?\s?off|\bsave\s+(up to\s+)?\$?\d|\bhalf price\b|\bwas\s+\$\d|\bnow\s+\$\d|\b\d\s+for\s+\$\d|\bfree gifts?\b|\bblack friday\b|\bcyber\b|\bboxing day\b|\bbfcm\b|\beofy\b|\bclick frenzy\b|\bafterpay day\b|\bdiscount\b/i;
const CODE = /\bcode:?\s+[A-Z][A-Z0-9]{3,}\b/;
const SEASON = /\bblack friday\b|\bcyber\b|\bboxing day\b|\bbfcm\b|\beofy\b|\bclick frenzy\b|\bafterpay day\b/i;
const DEADLINE = /\bsale ends\b|\bends?\s+(tonight|today|tomorrow|soon|sunday|monday|tuesday|wednesday|thursday|friday|saturday|midnight|at midnight|this (week|weekend|sunday|monday|friday|saturday)|nov|dec|jan)\b|\bending soon\b|\blast (day|night|chance)\b|\bfinal (day|hours)\b|\buntil (midnight|sunday|monday|tuesday|wednesday|thursday|friday|saturday|nov|dec|jan)/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
function sydDate(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const dayDiff = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5);
const plain = s => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const watchName = Object.fromEntries(WATCH.pages.map(p => [p.id, p.name]));
const nameOf = a => watchName[a.page_id] || clip(plain(a.adv) || '?', 28);
const textOf = a => [a.body, a.title, a.desc].filter(Boolean).join('\n');

// ---------------------------------------------------------------- reading the library
// Pulls the JSON object that follows `key` out of the page source (brace matching that respects strings).
function grabJson(html, key, ok) {
  for (let from = 0; ;) {
    const i = html.indexOf(key, from);
    if (i < 0) return null;
    from = i + key.length;
    if (html[from] !== '{') continue;
    let d = 0, s = false, e = false, k = from;
    for (; k < html.length; k++) {
      const c = html[k];
      if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; continue; }
      if (c === '"') s = true; else if (c === '{') d++; else if (c === '}' && --d === 0) break;
    }
    try { const o = JSON.parse(html.slice(from, k + 1)); if (!ok || ok(o)) return o; } catch (err) { /* try the next occurrence */ }
  }
}

// Opens a library address and waits for `parse(html)` to find its data. Two tries, images and styles skipped.
async function fetchParsed(browser, url, parse) {
  let html = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(4000);
    let p;
    try {
      p = await browser.newPage();
      await p.setUserAgent(UA);
      await p.setRequestInterception(true);
      p.on('request', r => { const t = r.resourceType(); (t === 'image' || t === 'media' || t === 'font' || t === 'stylesheet' ? r.abort() : r.continue()).catch(() => {}); });
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      for (let i = 0; i < 16; i++) {
        html = await p.content().catch(() => '');
        const data = html && parse(html);
        if (data) return { data, html };
        await sleep(750);
      }
    } catch (err) { /* fall through to the retry */ }
    finally { if (p) await p.close().catch(() => {}); }
  }
  return { data: null, html };
}

function toAd(a, today) {
  const s = a.snapshot || {}, c = (s.cards || [])[0] || {};
  const started = a.start_date ? sydDate(new Date(a.start_date * 1000)) : '';
  return {
    id: String(a.ad_archive_id), adv: s.page_name || a.page_name || '', page_id: String(a.page_id || s.page_id || ''),
    mult: a.collation_count || 1, started, days: started ? dayDiff(started, today) : null, fmt: s.display_format || '',
    body: (s.body && s.body.text) || c.body || '', title: s.title || c.title || '',
    desc: s.link_description || c.link_description || '', cta: s.cta_text || c.cta_text || '', link: s.link_url || c.link_url || '',
  };
}

const viewLabel = v => (v.kind === 'page' ? `page:${v.pg.name}:${v.media === 'video' ? 'video-' : ''}${v.sort}` : `kw:${v.q}`);
function viewUrl(v) {
  const base = `${LIB}?active_status=active&ad_type=all&country=AU&media_type=${v.media}&sort_data[mode]=${v.sort === 'new' ? 'relevancy_monthly_grouped' : 'total_impressions'}&sort_data[direction]=desc`;
  return v.kind === 'page' ? `${base}&search_type=page&view_all_page_id=${v.pg.id}${v.pg.q ? '&q=' + encodeURIComponent(v.pg.q) : ''}` : `${base}&search_type=keyword_unordered&q=${encodeURIComponent(v.q)}`;
}
async function scrapeView(browser, v, today) {
  const { data, html } = await fetchParsed(browser, viewUrl(v), h => grabJson(h, '"search_results_connection":', o => Array.isArray(o.edges)));
  if (!data) return { label: viewLabel(v), total: null, more: null, ads: [], reason: !html ? 'page did not load' : /captcha_required":true/.test(html) ? 'captcha' : 'no ad data in the page: blocked or layout changed' };
  const ads = [];
  for (const e of data.edges) for (const a of (e.node && e.node.collated_results) || []) if (a && a.ad_archive_id) ads.push(toAd(a, today));
  return { label: viewLabel(v), total: typeof data.count === 'number' ? data.count : null, more: data.page_info ? !!data.page_info.has_next_page : null, ads, reason: data.count === 0 ? 'library reports 0 active' : 'empty result' };
}
// One ad by its Library ID: is it still running? Used to confirm a "retired" hook is not just out of sample.
async function lookupAd(browser, id) {
  const { data } = await fetchParsed(browser, `${LIB}?id=${id}&country=AU`, h => grabJson(h, '"deeplink_ad_archive_result":'));
  if (!data) return { state: 'unknown' };
  const a = data.deeplink_ad_archive;
  if (!a) return { state: 'gone', ended: '' };
  return a.is_active ? { state: 'active' } : { state: 'gone', ended: a.end_date ? sydDate(new Date(a.end_date * 1000)) : '' };
}
// Runs tasks two at a time with a short pause between requests; a task may return follow-up tasks.
async function pool(tasks, fn) {
  const q = [...tasks];
  let busy = 0;
  await Promise.all([0, 1].map(async () => {
    for (;;) {
      if (!q.length) { if (!busy) return; await sleep(300); continue; }
      const t = q.shift();
      busy++;
      try { const more = await fn(t); if (more) q.push(...more); } catch (err) { /* one failed task never stops the run */ }
      busy--;
      await sleep(700 + Math.random() * 900);
    }
  }));
}

// ---------------------------------------------------------------- hooks and offers
// First line of the ad text that has words in it. Catalogue templates ("{{product.brand}}") have no hook.
function firstLine(body) {
  for (const raw of String(body || '').split('\n')) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (/[\p{L}\p{N}]/u.test(l)) return l.includes('{{') ? '' : l;
  }
  return '';
}
function hookMap(ads) {
  const m = new Map();
  for (const a of ads) {
    const line = firstLine(a.body);
    if (!line) continue;
    const key = a.page_id + '|' + (plain(line).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90) || line.slice(0, 90));
    let h = m.get(key);
    if (!h) m.set(key, h = { key, page_id: a.page_id, who: nameOf(a), text: clip(plain(line), 110), copies: 0, cards: 0, days: 0, started: '', fmts: new Set(), ads: [] });
    h.copies += a.mult || 1; h.cards++; h.days = Math.max(h.days, a.days || 0);
    if (a.started && (!h.started || a.started < h.started)) h.started = a.started;
    if (a.fmt) h.fmts.add(a.fmt);
    h.ads.push(a);
  }
  return m;
}
// Offer lines per advertiser: Map(name -> Map(key -> { text, n copies, deadline })).
function offerMap(ads) {
  const m = new Map();
  for (const a of ads) {
    for (const raw of textOf(a).split('\n')) {
      for (const piece of raw.length > 140 ? raw.split(/(?<=[.!?])\s+/) : [raw]) {
        const l = plain(piece);
        if (l.length < 6 || l.includes('{{')) continue;
        const dl = DEADLINE.test(l);
        if (!dl && !OFFER.test(l) && !CODE.test(l)) continue;
        const who = nameOf(a), key = l.toLowerCase().replace(/[^a-z0-9$%]+/g, ' ').trim();
        if (!m.has(who)) m.set(who, new Map());
        const o = m.get(who).get(key) || { text: l, n: 0, deadline: dl, num: /\d/.test(l) };
        o.n += a.mult || 1;
        m.get(who).set(key, o);
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------- snapshots
function listSnapshots() {
  return fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
}
function loadSnapshot(file) {
  try { const s = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')); return Array.isArray(s.ads) ? s : null; } catch (err) { return null; }
}
function saveSnapshot(today, snap) {
  fs.mkdirSync(DIR, { recursive: true });
  const order = Object.fromEntries(WATCH.pages.map((p, i) => [p.id, i]));
  const rank = a => (a.page_id in order ? order[a.page_id] : 999);
  snap.ads.sort((x, y) => rank(x) - rank(y) || nameOf(x).localeCompare(nameOf(y)) || (y.days || 0) - (x.days || 0));
  const { ads, ...head } = snap;
  const text = JSON.stringify(head).slice(0, -1) + ',"ads":[\n' + ads.map(a => JSON.stringify(a)).join(',\n') + '\n]}\n';
  const file = path.join(DIR, today + '.json');
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
  return file;
}

// ---------------------------------------------------------------- the run
async function main() {
  const t0 = Date.now(), today = sydDate(new Date()), warnings = [], out = [];
  const watchIds = new Set(WATCH.pages.map(p => p.id));
  const found = new Map(), counts = {}, complete = new Set(), views = [];
  const narrowed = Object.fromEntries(WATCH.pages.filter(p => p.q).map(p => [p.id, p.q.toLowerCase()]));
  const keep = a => {
    if (!a.id) return;
    const text = textOf(a) + '\n' + a.link;
    if (!watchIds.has(a.page_id) && (!RELEVANT.test(text) || IGNORE.some(re => re.test(a.adv)))) return;
    if (narrowed[a.page_id] && !text.toLowerCase().includes(narrowed[a.page_id]) && !RELEVANT.test(text)) return;
    const o = found.get(a.id);
    found.set(a.id, o ? { ...a, mult: Math.max(a.mult, o.mult) } : a);
  };

  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'], defaultViewport: { width: 1400, height: 1000 } });
  } catch (err) {
    console.log(`WARNING: Chrome did not start (${String(err.message).split('\n')[0].slice(0, 120)}). Nothing scraped, nothing saved.`);
    return;
  }
  const dog = setTimeout(() => { console.log('WARNING: run passed 9 minutes and was stopped. Nothing saved.'); browser.close().catch(() => {}).finally(() => process.exit(0)); }, 9 * 60e3);
  dog.unref();

  try {
    const tasks = [];
    if (!QUICK) for (const pg of WATCH.pages) tasks.push({ kind: 'page', pg, sort: 'imp', media: 'all' });
    for (const q of WATCH.keywords) tasks.push({ kind: 'kw', q, sort: 'imp', media: 'all' });
    let good = 0, streak = 0, skipped = 0;
    await pool(tasks, async v => {
      // Blocked runs are slow (every view waits, then retries), so stop asking once it is clearly not working.
      if ((good === 0 && streak >= 4) || streak >= 6) { skipped++; return null; }
      const r = await scrapeView(browser, v, today);
      views.push({ view: r.label, total: r.total, ads: r.ads.length });
      if (r.total == null) streak++; else { streak = 0; good++; }
      if (!r.ads.length) warnings.push(`WARNING: 0 ads from ${r.label} (${r.reason})`);
      r.ads.forEach(keep);
      if (v.kind !== 'page' || v.sort !== 'imp' || v.media !== 'all') return null;
      if (r.total != null) counts[v.pg.id] = { name: v.pg.name, active: r.total, as_of: today };
      if (!r.ads.length) return null;
      if (r.more === false) { complete.add(v.pg.id); return null; }
      return [{ ...v, sort: 'new' }, { ...v, media: 'video' }, { ...v, sort: 'new', media: 'video' }];
    });
    if (skipped) warnings.push(`WARNING: stopped early, ${skipped} views were not tried after ${streak} failed views in a row (blocked?)`);

    // Baseline: newest snapshot dated before today; failing that, one saved earlier today.
    const files = listSnapshots(), earlier = files.filter(f => f.slice(0, 10) < today);
    const todayFile = today + '.json', todaySnap = files.includes(todayFile) ? loadSnapshot(todayFile) : null;
    let base = null;
    for (let i = earlier.length - 1; i >= 0 && !base; i--) base = loadSnapshot(earlier[i]);
    if (!base) base = todaySnap;
    const history = earlier.length ? earlier.slice(-14).map(loadSnapshot).filter(Boolean) : base ? [base] : [];

    const secs = () => Math.round((Date.now() - t0) / 1000);
    if (!found.size) {
      out.push(`AD LIBRARY WATCH ${today} (Sydney), ${QUICK ? 'quick' : 'full'} run: ${views.length} views, 0 ads, ${secs()}s.`);
      out.push(...warnings, 'WARNING: no ads came back from any view. Meta is probably blocking this machine, or the page layout changed. Nothing saved.');
      console.log(out.join('\n'));
      return;
    }

    // (d) candidates: 60+ day hooks from the baseline that are missing today. Confirm each by ad id.
    const prevH = base ? hookMap(base.ads) : new Map();
    let curH = hookMap([...found.values()]);
    const retired = [];
    let stillActive = 0, unverified = 0;
    if (base && !QUICK) {
      const cands = [...prevH.values()].filter(h => h.days >= 60 && !curH.has(h.key)).sort((x, y) => y.days - x.days);
      let budget = 18;
      const jobs = [];
      for (const h of cands) {
        if (complete.has(h.page_id)) { retired.push({ h, ended: '', how: 'page listed in full' }); continue; }
        if (budget <= 0) { unverified++; continue; }
        budget -= Math.min(2, h.ads.length);
        jobs.push(h);
      }
      await pool(jobs, async h => {
        let ended = '', unknown = false;
        for (const a of [...h.ads].sort((x, y) => (y.days || 0) - (x.days || 0)).slice(0, 2)) {
          const r = await lookupAd(browser, a.id);
          if (r.state === 'active') { stillActive++; keep({ ...a, days: a.started ? dayDiff(a.started, today) : a.days }); return null; }
          if (r.state === 'unknown') unknown = true; else if (r.ended > ended) ended = r.ended;
        }
        if (unknown) unverified++; else retired.push({ h, ended, how: 'checked by ad id' });
        return null;
      });
      curH = hookMap([...found.values()]);
    }
    const cur = [...found.values()];

    // ---------------------------------------------------------------- report
    const copiesOf = h => 'x' + String(h.copies).padEnd(3);
    const fmtOf = h => [...h.fmts].join('/') || '?';
    const baseNote = !base ? 'No earlier snapshot: showing (a), (e), (f) only.' : `Compared with ${base.date}${base.date === today ? ' (saved earlier today)' : ''}${base.mode === 'quick' ? ', a quick snapshot' : ''}.`;
    out.push(`AD LIBRARY WATCH ${today} (Sydney), ${QUICK ? 'quick' : 'full'} run: ${views.length} views, ${cur.length} ads kept, ${secs()}s. ${baseNote}`);
    out.push('Sampled 30 ads per view, so copies are minimums. Adapt formats and hooks, never copy; no was/now prices, no invented demos.');
    out.push(...warnings);

    const sampled = {};
    for (const a of cur) sampled[a.page_id] = (sampled[a.page_id] || 0) + 1;
    out.push(`(a) ACTIVE ADS per advertiser${base ? `, now vs ${base.date}` : ''}`);
    for (const pg of WATCH.pages) {
      const now = counts[pg.id], was = base && base.counts && base.counts[pg.id];
      const wasTxt = was && was.active != null ? `${was.active}${was.as_of && was.as_of !== base.date ? ' on ' + was.as_of : ''}` : '';
      let line;
      const delta = now && was ? now.active - was.active : 0;
      if (now) line = `${String(now.active).padStart(4)}` + (wasTxt ? `  (was ${wasTxt}, ${delta ? (delta > 0 ? '+' : '') + delta : 'same'})` : base ? '  (no earlier count)' : '');
      else line = ` n/a${QUICK ? ' in --quick' : ', view failed'}` + (wasTxt ? `  (last count ${wasTxt})` : '');
      out.push(`  ${(pg.name + (pg.q ? ` ("${pg.q}" ads)` : '')).padEnd(22)}${line}  sampled ${sampled[pg.id] || 0}`);
    }
    const others = {};
    for (const a of cur) if (!watchIds.has(a.page_id)) others[nameOf(a)] = (others[nameOf(a)] || 0) + 1;
    const otherTxt = Object.entries(others).sort((x, y) => y[1] - x[1]).slice(0, 7).map(([n, c]) => `${clip(n, 28)} (${c})`).join(', ');
    if (otherTxt) out.push(`  also seen via keywords: ${otherTxt}`);

    if (base) {
      const seen = new Set();
      for (const s of history) for (const k of hookMap(s.ads).keys()) seen.add(k);
      const cutoff = new Date(Date.parse(base.date + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
      const older = h => !!h.started && h.started < cutoff;
      const fresh = [...curH.values()].filter(h => !seen.has(h.key)).sort((x, y) => older(x) - older(y) || y.copies - x.copies || (x.started < y.started ? 1 : -1));
      out.push(`(b) NEW HOOKS since ${base.date}: ${fresh.length}, ${fresh.filter(h => !older(h)).length} of them started since then${fresh.length > 10 ? '; top 10 by copies' : ''}`);
      for (const h of fresh.slice(0, 10)) out.push(`  ${copiesOf(h)} ${fmtOf(h).padEnd(6)} started ${h.started || '?'}  ${h.who}: ${h.text}${older(h) ? '  [older ad, new to sample]' : ''}`);
      if (!fresh.length) out.push('  none');

      const ups = [...curH.values()].map(h => ({ h, was: prevH.get(h.key) })).filter(x => x.was && x.h.copies - x.was.copies >= 5).sort((x, y) => (y.h.copies - y.was.copies) - (x.h.copies - x.was.copies));
      out.push(`(c) SCALE-UPS, same hook with 5+ more copies: ${ups.length}`);
      for (const { h, was } of ups.slice(0, 5)) out.push(`  +${h.copies - was.copies} (${was.copies} -> ${h.copies}) ${fmtOf(h)}  ${h.who}: ${h.text}`);
      if (!ups.length) out.push('  none');

      if (QUICK) out.push('(d) RETIRED after 60+ days: not checked in --quick');
      else {
        retired.sort((x, y) => y.h.days - x.h.days);
        out.push(`(d) RETIRED after 60+ days: ${retired.length} confirmed${unverified ? `, ${unverified} could not be checked` : ''}${stillActive ? `, ${stillActive} still active outside today's sample (kept)` : ''}`);
        for (const { h, ended, how } of retired.slice(0, 5)) out.push(`  ran ${h.days}d ${copiesOf(h)} ${h.who}: ${h.text}  [${ended ? 'ended ' + ended : how}]`);
        if (!retired.length) out.push('  none');
      }
    }

    out.push('(e) LONGEST-RUNNING ACTIVE HOOKS');
    for (const h of [...curH.values()].sort((x, y) => y.days - x.days || y.copies - x.copies).slice(0, 10)) out.push(`  ${String(h.days).padStart(4)}d ${copiesOf(h)} ${fmtOf(h).padEnd(6)} ${h.who}: ${h.text}`);

    const offers = offerMap(cur), prevOffers = base ? offerMap(base.ads) : null;
    const isWatched = who => WATCH.pages.some(p => p.name === who);
    const offerRows = [...offers.entries()].map(([who, m]) => {
      const all = [...m.entries()].map(([key, o]) => ({ key, ...o }));
      const best = all.filter(o => OFFER.test(o.text) || CODE.test(o.text)).sort((x, y) => (y.num - x.num) || y.n - x.n)[0] || all.sort((x, y) => y.n - x.n)[0];
      const season = all.filter(o => SEASON.test(o.text) && o.key !== best.key && !SEASON.test(best.text)).sort((x, y) => y.n - x.n)[0];
      const dl = all.filter(o => o.deadline && o.key !== best.key && !(season && o.key === season.key)).sort((x, y) => y.n - x.n)[0];
      const isNew = o => (prevOffers && !(prevOffers.get(who) && prevOffers.get(who).has(o.key)) ? 'NEW ' : '');
      const piece = (o, n) => `${isNew(o)}[x${o.n}] ${clip(o.text, n)}`;
      return { who, total: all.reduce((s, o) => s + o.n, 0), line: piece(best, 110) + (season ? `  | ${piece(season, 90)}` : '') + (dl ? `  | deadline: ${piece(dl, 80)}` : '') };
    }).sort((x, y) => (isWatched(y.who) - isWatched(x.who)) || y.total - x.total);
    out.push(`(f) OFFERS AND SALE WORDING: ${offerRows.length} advertisers${offerRows.length > 10 ? ', top 10' : ''}`);
    for (const r of offerRows.slice(0, 10)) out.push(`  ${r.who}: ${r.line}`);
    if (!offerRows.length) out.push('  none');

    // ---------------------------------------------------------------- save
    if (NO_SAVE) out.push('Not saved (--no-save).');
    else {
      const merged = new Map();
      if (todaySnap) for (const a of todaySnap.ads) merged.set(a.id, a);
      for (const a of cur) { const o = merged.get(a.id); merged.set(a.id, o ? { ...a, mult: Math.max(a.mult || 1, o.mult || 1) } : a); }
      const allCounts = {};
      for (const pg of WATCH.pages) {
        const c = counts[pg.id] || (todaySnap && todaySnap.counts && todaySnap.counts[pg.id]) || (base && base.counts && base.counts[pg.id]);
        if (c) allCounts[pg.id] = { name: pg.name, active: c.active, as_of: c.as_of || (base && base.date) || today };
      }
      const pick = a => ({ id: a.id, adv: a.adv, page_id: a.page_id, mult: a.mult || 1, started: a.started || '', days: a.started ? dayDiff(a.started, today) : (a.days ?? null), fmt: a.fmt || '', body: a.body || '', title: a.title || '', desc: a.desc || '', cta: a.cta || '', link: a.link || '' });
      const snap = { date: today, mode: QUICK && !(todaySnap && todaySnap.mode === 'full') ? 'quick' : 'full', generated: new Date().toISOString(), runs: ((todaySnap && todaySnap.runs) || (todaySnap ? 1 : 0)) + 1, counts: allCounts, views, ads: [...merged.values()].map(pick) };
      const file = saveSnapshot(today, snap);
      out.push(`Saved ${file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : file}: ${snap.ads.length} ads${todaySnap ? ` (merged with the ${todaySnap.ads.length} already saved today)` : ''}.`);
    }
    console.log(out.join('\n'));
  } finally {
    clearTimeout(dog);
    await browser.close().catch(() => {});
  }
}

await main().catch(err => console.log(`WARNING: adlib run failed (${String(err && err.message).split('\n')[0].slice(0, 160)}). Nothing more was printed or saved.`));
process.exitCode = 0;
