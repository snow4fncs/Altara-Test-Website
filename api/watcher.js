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
    // Phone first: an SMS via Twilio when the account is configured, otherwise a push via ntfy,
    // and email only when neither is set up. One message per scan, the top few listings in it.
    const lines = shown.slice(0, 4).map(h => `${h.title.slice(0, 50)}${h.price != null ? ' $' + Number(h.price).toLocaleString() : ''} ${h.url}`);
    const text = `Watcher: ${fresh.length} new\n${lines.join('\n')}${fresh.length > 4 ? `\n+${fresh.length - 4} more` : ''}`;
    const sms = await sendSms(text);
    const push = sms.sent ? { sent: false } : await sendPush(`Watcher: ${fresh.length} new`, text);
    if (sms.sent || push.sent) emailed = true;
    else ({ sent: emailed } = await sendEmail({ to: ALERT_TO, subject: `Watcher: ${fresh.length} new — ${top}`, html, tag: 'watcher-alert' }));
  }

  // Seed/save: on first run remember EVERY reported id (not just the capped
  // batch) so pre-existing listings never false-alert on the second scan.
  const remember = firstRun ? hits.filter(h => h && h.id).map(h => h.id) : fresh.map(h => h.id);
  await saveSeen([...seen, ...remember]);
  return res.status(200).json({ ok: true, received: hits.length, new: fresh.length, firstRun, emailed, meta });
}

// SMS through Twilio. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (the Twilio number)
// and WATCHER_SMS_TO (the phone, +61 format) on the server. Skipped quietly when any is missing.
async function sendSms(body) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_FROM: from, WATCHER_SMS_TO: to } = process.env;
  if (!sid || !tok || !from || !to) return { sent: false, reason: 'sms_not_configured' };
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1500) }),
    });
    if (!r.ok) { console.error('Twilio error', r.status, await r.text()); return { sent: false, reason: 'twilio_' + r.status }; }
    return { sent: true };
  } catch (e) { console.error('Twilio failed:', e.message); return { sent: false, reason: e.message }; }
}

// Push notification through ntfy.sh: install the ntfy app, subscribe to a private topic name, set
// WATCHER_NTFY_TOPIC to it. Free, instant, no account needed.
async function sendPush(title, body) {
  const topic = process.env.WATCHER_NTFY_TOPIC;
  if (!topic) return { sent: false, reason: 'push_not_configured' };
  try {
    const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: 'POST', headers: { Title: title, Priority: 'high', Tags: 'eyes' }, body });
    return { sent: r.ok };
  } catch (e) { console.error('ntfy failed:', e.message); return { sent: false, reason: e.message }; }
}
