// Marketplace watcher — the alerting half.
//
// watcher/scan.mjs (running on a GitHub Actions schedule) POSTs raw
// marketplace hits here. This endpoint dedupes them against a seen-set kept
// in Supabase storage and emails genuinely new listings via Resend, so
// alerts work with the user's laptop off.
import crypto from 'crypto';
import { esc, sendEmail } from './_emails.js';

const SEEN_URL = () => `${process.env.SUPABASE_URL}/storage/v1/object/social/watcher-seen.json`;
const SEEN_CAP = 4000;
const ALERT_TO = process.env.WATCHER_ALERT_TO || 'tina.yang@lvpfunds.com.au';

const sb = () => ({
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  apikey: process.env.SUPABASE_SERVICE_KEY,
});

function keyOk(req) {
  const expected = process.env.WATCHER_SECRET;
  if (!expected) return false; // fail closed
  const got = String(req.query.key || '');
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function loadSeen() {
  try {
    const res = await fetch(SEEN_URL(), { headers: sb() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.ids) ? data.ids : [];
  } catch { return []; }
}

async function saveSeen(ids) {
  const body = JSON.stringify({ ids: ids.slice(-SEEN_CAP), updated: new Date().toISOString() });
  const res = await fetch(SEEN_URL(), {
    method: 'POST',
    headers: { ...sb(), 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body,
  });
  if (!res.ok) console.error('watcher seen-set save failed:', res.status, await res.text());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!keyOk(req)) return res.status(401).json({ error: 'Bad key' });

  const { hits = [], meta = {} } = req.body || {};
  if (!Array.isArray(hits)) return res.status(400).json({ error: 'hits must be an array' });

  const seen = await loadSeen();
  const seenSet = new Set(seen);
  const fresh = hits.filter(h => h && h.id && h.title && !seenSet.has(h.id)).slice(0, 40);

  // First ever run: everything currently listed is "new". Seed the seen-set
  // silently instead of flooding the inbox; alerts start from the next scan.
  const firstRun = seen.length === 0;

  let emailed = false;
  if (fresh.length && !firstRun) {
    const shown = fresh.slice(0, 15);
    const rows = shown.map(h =>
      `<tr><td style="padding:10px 14px;border-bottom:1px solid #eee;">
         <p style="margin:0 0 2px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">${esc(h.watch || '')}</p>
         <a href="${esc(h.url)}" style="font-size:14px;color:#1a1a1a;text-decoration:underline;">${esc(h.title)}</a>
         ${h.price != null ? `<p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111;">$${Number(h.price).toLocaleString()}</p>` : ''}
       </td></tr>`).join('');
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#888;">Marketplace watcher</p>
      <p style="font-size:18px;color:#111;">${fresh.length} new listing${fresh.length === 1 ? '' : 's'}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #eee;">${rows}</table>
      ${fresh.length > shown.length ? `<p style="font-size:12px;color:#666;">+ ${fresh.length - shown.length} more this scan.</p>` : ''}
      <p style="font-size:11px;color:#999;margin-top:14px;">Scans every ~30 min via GitHub Actions. Edit the watch list in watcher/scan.mjs.</p>
    </div>`;
    const top = fresh[0].title.slice(0, 60);
    ({ sent: emailed } = await sendEmail({
      to: ALERT_TO,
      subject: `Watcher: ${fresh.length} new — ${top}`,
      html,
      tag: 'watcher-alert',
    }));
  }

  await saveSeen([...seen, ...fresh.map(h => h.id)]);
  return res.status(200).json({ ok: true, received: hits.length, new: fresh.length, firstRun, emailed, meta });
}
