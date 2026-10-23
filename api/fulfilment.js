import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { shippedEmailHtml, reviewRequestEmailHtml, repeatOfferEmailHtml, sendEmail } from './_emails.js';
import { orderRef } from './_ref.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Same fail-closed pattern as the review queue: no ADMIN_TOKEN set means this
// endpoint is unusable rather than open.
function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(String(req.headers['x-admin-token'] || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// How long after dispatch a review request unlocks. Long enough that the
// customer has actually used the thing, short enough that the purchase is
// still fresh in mind.
const REVIEW_UNLOCK_DAYS = 5;

const orderRefFrom = o => orderRef(o.stripe_payment_intent, o.items);

// A customer email must never carry a junk tracking link. Carriers here use
// 8-40 letters/digits (AusPost: 99722... or R...; Sendle/Aramex similar);
// anything else is a typo and the whole action is refused before any email.
const cleanTracking = s => String(s || '').replace(/\s+/g, '');
const looksLikeTracking = s => /^[A-Za-z0-9-]{8,40}$/.test(s);
const firstName = name => (String(name || '').trim().split(/\s+/)[0] || 'there');

// Australia Post is the default; the link shape is carrier-specific.
function trackUrl(carrier, number) {
  const n = encodeURIComponent(number);
  if (/sendle/i.test(carrier)) return `https://track.sendle.com/tracking?ref=${n}`;
  if (/aramex|fastway/i.test(carrier)) return `https://www.aramex.com.au/tools/track/?l=${n}`;
  if (/couriers\s*please/i.test(carrier)) return `https://www.couriersplease.com.au/tools-track/no/${n}`;
  return `https://auspost.com.au/mypost/track/search?id=${n}`;
}

const COLS = 'id, created_at, customer_email, customer_name, shipping_address, items, total, currency, status, stripe_payment_intent, tracking_number, carrier, shipped_at, shipped_email_at, label_printed_at, review_email_at, repeat_email_at';

// The shipped_email_at column ships in a migration (supabase-shipped-email.sql).
// Until it is run, orders must still be served and updated - just without the
// emailed-state - rather than 500ing the console.
const MISSING_COLUMN = '42703';
const COLS_NO_LABEL = COLS.replace(' label_printed_at,', '');
const COLS_LEGACY = COLS_NO_LABEL.replace(' shipped_email_at,', '');
async function stampShippedEmail(id) {
  const { error } = await supabase.from('orders')
    .update({ shipped_email_at: new Date().toISOString() }).eq('id', id);
  if (error && error.code !== MISSING_COLUMN) console.error('shipped_email_at stamp error:', error);
}

// Repeat offer goes out this many days after dispatch when sent by the daily
// job: long enough to have used the cover, soon enough to still be top of mind.
const REPEAT_OFFER_DAYS = 14;

async function sendRepeatOffers({ minDays, limit, code, discountLabel }) {
  const cutoff = new Date(Date.now() - minDays * 86400000).toISOString();
  const { data, error } = await supabase
    .from('orders').select('id, customer_email, customer_name, repeat_email_at, shipped_at')
    .eq('status', 'paid').is('repeat_email_at', null).not('shipped_at', 'is', null)
    .lte('shipped_at', cutoff).order('shipped_at', { ascending: true });
  if (error) { console.error('repeat_offer load error:', error); return { error: 'Could not load buyers' }; }

  // One email per person, not per order - repeat customers exist.
  const seen = new Set(); const targets = [];
  for (const o of data || []) {
    const key = String(o.customer_email || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); targets.push(o);
  }
  const batch = targets.slice(0, limit);

  let sent = 0;
  for (const o of batch) {
    const r = await sendEmail({
      to: o.customer_email,
      subject: 'Cover the back seats too',
      html: repeatOfferEmailHtml({ first: firstName(o.customer_name), code, discountLabel }),
      tag: 'repeat_offer',
    });
    if (r.sent) {
      sent++;
      await supabase.from('orders').update({ repeat_email_at: new Date().toISOString() })
        .ilike('customer_email', o.customer_email);
    }
  }
  return { recipients: batch.length, sent, remaining: targets.length - batch.length };
}

async function sendDueReviewRequests({ limit }) {
  const cutoff = new Date(Date.now() - REVIEW_UNLOCK_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from('orders').select('id, customer_email, customer_name, stripe_payment_intent, shipped_at, items')
    .eq('status', 'paid').is('review_email_at', null).not('shipped_at', 'is', null)
    .lte('shipped_at', cutoff).order('shipped_at', { ascending: true }).limit(limit);
  if (error) { console.error('review due load error:', error); return { error: 'Could not load orders' }; }

  const { data: reviewRows } = await supabase.from('reviews').select('email');
  const reviewed = new Set((reviewRows || []).map(r => String(r.email || '').toLowerCase()));

  let sent = 0, skipped = 0;
  for (const o of data || []) {
    const key = String(o.customer_email || '').toLowerCase();
    if (!key || reviewed.has(key)) { skipped++; continue; }
    const r = await sendEmail({
      to: o.customer_email,
      subject: "How's your Altara cover holding up?",
      html: reviewRequestEmailHtml({ first: firstName(o.customer_name), ref: orderRefFrom(o) }),
      tag: 'review_request',
    });
    if (r.sent) {
      sent++;
      await supabase.from('orders').update({ review_email_at: new Date().toISOString() }).eq('id', o.id);
    }
  }
  return { due: (data || []).length, sent, skipped_already_reviewed: skipped };
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin token required' });

  // ── list orders with fulfilment state ──
  if (req.method === 'GET') {
    let { data, error } = await supabase
      .from('orders').select(COLS).eq('status', 'paid')
      .order('created_at', { ascending: false }).limit(200);
    if (error && error.code === MISSING_COLUMN) {
      console.error('orders.label_printed_at missing - run supabase-label-printed.sql. Trying without it.');
      ({ data, error } = await supabase.from('orders').select(COLS_NO_LABEL).eq('status', 'paid')
        .order('created_at', { ascending: false }).limit(200));
    }
    if (error && error.code === MISSING_COLUMN) {
      console.error('orders.shipped_email_at missing - run supabase-shipped-email.sql. Serving without it.');
      ({ data, error } = await supabase.from('orders').select(COLS_LEGACY).eq('status', 'paid')
        .order('created_at', { ascending: false }).limit(200));
    }
    if (error) { console.error('Fulfilment list error:', error); return res.status(500).json({ error: 'Could not load orders' }); }

    // Who has already written a review. Matched by email rather than by order,
    // because a repeat customer reviews the product once, not once per order -
    // and nobody should be asked again after they have already obliged.
    const { data: reviewRows } = await supabase
      .from('reviews').select('email, rating, approved');
    const reviewsByEmail = new Map();
    for (const r of reviewRows || []) {
      const key = String(r.email || '').toLowerCase();
      if (key && !reviewsByEmail.has(key)) reviewsByEmail.set(key, r);
    }

    const now = Date.now();
    const orders = (data || []).map(o => {
      const shippedDaysAgo = o.shipped_at ? Math.floor((now - new Date(o.shipped_at)) / 86400000) : null;
      const review = reviewsByEmail.get(String(o.customer_email || '').toLowerCase()) || null;
      return {
        ...o,
        ref: orderRefFrom(o),
        has_review: !!review,
        review_rating: review ? review.rating : null,
        review_published: review ? !!review.approved : null,
        // A review nudge only makes sense once the parcel has landed and been
        // used, only once per order, and never once they have already written one.
        review_due: !!o.shipped_at && !o.review_email_at && !review && shippedDaysAgo >= REVIEW_UNLOCK_DAYS,
        shipped_days_ago: shippedDaysAgo,
      };
    });
    return res.status(200).json({ orders, review_unlock_days: REVIEW_UNLOCK_DAYS });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, id, tracking_number, carrier, shipped_at, notify } = req.body || {};
  // Default to notifying: the normal case is a parcel the customer is waiting on.
  const shouldNotify = notify !== false;
  if (!action) return res.status(400).json({ error: 'action is required' });

  // ── repeat-purchase offer: past buyers, one email each ──
  // Only people whose parcel has had time to arrive and be used (min_days
  // after dispatch, default 10). Each recipient is stamped the moment their
  // email sends, so a timeout part-way through can never double-send on retry.
  if (action === 'repeat_offer') {
    const r = await sendRepeatOffers({
      minDays: Number(req.body.min_days) || 10,
      limit: Math.min(Number(req.body.limit) || 40, 80),
      code: req.body.code, discountLabel: req.body.discount_label,
    });
    return res.status(200).json({ success: true, ...r });
  }

  // ── daily automation: review requests + repeat offers that are due ──
  // Hit once a day by .github/workflows/daily-emails.yml. Idempotent: every
  // send is stamped on the order, so running it twice sends nothing twice.
  // -- morning ad watch: yesterday's numbers, kill-rule flags, rejected ads, account changes --
  if (action === 'ad_watch') {
    const report = await adWatch();
    const to = String(req.body.to || 'hello@altaradesign.com');
    const sent = req.body.dry ? { sent: false, reason: 'dry' } : await sendEmail({ to, subject: report.subject, html: report.html, tag: 'ad-watch' });
    return res.status(200).json({ success: true, sent, ...report.data, ...(req.body.dry ? { html: report.html } : {}) });
  }

  if (action === 'daily_emails') {
    const reviews = await sendDueReviewRequests({ limit: 40 });
    const repeats = await sendRepeatOffers({ minDays: REPEAT_OFFER_DAYS, limit: 40 });
    return res.status(200).json({ success: true, reviews, repeats });
  }

  // -- mark a batch of orders as exported / postage bought --
  if (action === 'mark_labels') {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean).slice(0, 200) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids are required' });
    const { error } = await supabase.from('orders')
      .update({ label_printed_at: new Date().toISOString() })
      .in('id', ids).is('shipped_at', null);
    if (error && error.code === MISSING_COLUMN) {
      return res.status(200).json({ success: false, migration_required: true });
    }
    if (error) { console.error('mark_labels error:', error); return res.status(500).json({ error: 'Could not mark labels' }); }
    return res.status(200).json({ success: true, marked: ids.length });
  }

  // -- undo a label mark on one order --
  if (action === 'label_reset') {
    if (!req.body.id) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabase.from('orders')
      .update({ label_printed_at: null }).eq('id', req.body.id);
    if (error) { console.error('label_reset error:', error); return res.status(500).json({ error: 'Could not reset the label mark' }); }
    return res.status(200).json({ success: true });
  }

  if (!id) return res.status(400).json({ error: 'id is required' });

  let { data: order, error: findErr } = await supabase
    .from('orders').select(COLS).eq('id', id).single();
  if (findErr && findErr.code === MISSING_COLUMN) {
    ({ data: order, error: findErr } = await supabase.from('orders').select(COLS_NO_LABEL).eq('id', id).single());
  }
  if (findErr && findErr.code === MISSING_COLUMN) {
    ({ data: order, error: findErr } = await supabase.from('orders').select(COLS_LEGACY).eq('id', id).single());
  }
  if (findErr || !order) return res.status(404).json({ error: 'Order not found' });

  const ref = orderRefFrom(order);
  const first = firstName(order.customer_name);

  // ── mark shipped + send tracking ──
  if (action === 'ship') {
    const num = cleanTracking(tracking_number);
    if (!num) return res.status(400).json({ error: 'tracking_number is required' });
    if (!looksLikeTracking(num)) return res.status(400).json({ error: 'That tracking number does not look valid (8-40 letters/digits) - nothing saved, no email sent' });
    const car = String(carrier || 'Australia Post').trim();
    // A parcel posted days ago should carry its real dispatch date, otherwise
    // the review-request clock restarts from whenever it was keyed in.
    let when = new Date().toISOString();
    if (shipped_at) {
      const d = new Date(shipped_at);
      if (isNaN(d)) return res.status(400).json({ error: 'shipped_at is not a valid date' });
      if (d.getTime() > Date.now() + 864e5) return res.status(400).json({ error: 'shipped_at cannot be in the future' });
      when = d.toISOString();
    }

    const { error: upErr } = await supabase.from('orders')
      .update({ tracking_number: num, carrier: car, shipped_at: when })
      .eq('id', id);
    if (upErr) { console.error('Ship update error:', upErr); return res.status(500).json({ error: 'Could not save tracking' }); }

    const result = shouldNotify ? await sendEmail({
      to: order.customer_email,
      subject: `Your Altara order has shipped - ${ref}`,
      html: shippedEmailHtml({
        first, ref, trackingNumber: num, carrier: car,
        suburb: order.shipping_address?.city || '',
        trackUrl: trackUrl(car, num),
      }),
      tag: 'shipped',
    }) : { sent: false, reason: 'not_requested' };
    if (result.sent) await stampShippedEmail(id);
    // Tracking is saved either way; the email is best-effort.
    return res.status(200).json({ success: true, notified: shouldNotify, emailed: result.sent, reason: result.reason });
  }

  // ── correct a tracking number without re-dating the dispatch ──
  if (action === 'edit_tracking') {
    if (!order.shipped_at) return res.status(409).json({ error: 'That order has not been marked shipped yet' });
    const num = cleanTracking(tracking_number);
    if (!num) return res.status(400).json({ error: 'tracking_number is required' });
    if (!looksLikeTracking(num)) return res.status(400).json({ error: 'That tracking number does not look valid (8-40 letters/digits) - nothing saved, no email sent' });
    const car = String(carrier || order.carrier || 'Australia Post').trim();

    // shipped_at is deliberately untouched - the parcel left when it left, and
    // the review-request clock runs from that, not from when a typo was fixed.
    const { error: upErr } = await supabase.from('orders')
      .update({ tracking_number: num, carrier: car }).eq('id', id);
    if (upErr) { console.error('Edit tracking error:', upErr); return res.status(500).json({ error: 'Could not save tracking' }); }

    // Re-notifying is opt-in here: most edits are correcting a typo, and the
    // customer has already had one email.
    const result = shouldNotify ? await sendEmail({
      to: order.customer_email,
      subject: `Updated tracking for your Altara order - ${ref}`,
      html: shippedEmailHtml({
        first, ref, trackingNumber: num, carrier: car,
        suburb: order.shipping_address?.city || '',
        trackUrl: trackUrl(car, num),
      }),
      tag: 'tracking_updated',
    }) : { sent: false, reason: 'not_requested' };
    if (result.sent) await stampShippedEmail(id);
    return res.status(200).json({ success: true, notified: shouldNotify, emailed: result.sent, reason: result.reason });
  }

  // ── review request ──
  if (action === 'review_request') {
    if (order.review_email_at) return res.status(409).json({ error: 'Review request already sent for this order' });
    // The UI hides the button, but the endpoint must refuse independently -
    // asking someone who has already reviewed is the one thing this must not do.
    const { data: existing } = await supabase
      .from('reviews').select('id').ilike('email', order.customer_email || '').limit(1);
    if (existing && existing.length) {
      return res.status(409).json({ error: 'This customer has already left a review' });
    }
    const result = await sendEmail({
      to: order.customer_email,
      subject: "How's your Altara cover holding up?",
      html: reviewRequestEmailHtml({ first, ref }),
      tag: 'review_request',
    });
    if (result.sent) await supabase.from('orders').update({ review_email_at: new Date().toISOString() }).eq('id', id);
    return res.status(200).json({ success: true, emailed: result.sent, reason: result.reason });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ── Ad watch ─────────────────────────────────────────────────────────────────
// One morning email: what yesterday cost and sold, which ads have tripped the
// kill rule ($15+ in three days with no sale), anything Meta has rejected, and
// every change made in the account in the last day. Facts only, no decisions.
const SYD = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const ACT = 'act_2548980925519496';
async function fbGet(path, params) {
  const u = new URL('https://graph.facebook.com/v21.0/' + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  u.searchParams.set('access_token', process.env.FB_USER_TOKEN_LL);
  let out = []; let j = await (await fetch(u)).json();
  if (j.error) throw new Error(j.error.message);
  out.push(...(j.data || []));
  for (let i = 0; i < 5 && j.paging?.next; i++) { j = await (await fetch(j.paging.next)).json(); out.push(...(j.data || [])); }
  return out;
}
const acts = r => { const m = {}; for (const x of r.actions || []) m[x.action_type] = Number(x.value); for (const x of r.action_values || []) m[x.action_type + '_value'] = Number(x.value); return m; };
const money = n => '$' + (Math.round(Number(n) || 0)).toLocaleString('en-AU');

async function adWatch() {
  const now = Date.now();
  const today = SYD(now), yesterday = SYD(now - 86400000), threeAgo = SYD(now - 3 * 86400000);
  const [yRows, wRows, bad, changes, { data: orders }] = await Promise.all([
    fbGet(ACT + '/insights', { level: 'ad', fields: 'ad_id,ad_name,adset_name,spend,impressions,inline_link_clicks,actions,action_values', time_range: { since: yesterday, until: yesterday }, limit: 500 }),
    fbGet(ACT + '/insights', { level: 'ad', fields: 'ad_id,ad_name,adset_name,spend,actions,action_values', time_range: { since: threeAgo, until: yesterday }, limit: 500 }),
    fbGet(ACT + '/ads', { fields: 'name,effective_status,ad_review_feedback', effective_status: ['DISAPPROVED', 'WITH_ISSUES'], limit: 100 }),
    fbGet(ACT + '/activities', { fields: 'event_type,event_time,object_name,actor_name,extra_data', since: yesterday, until: today, limit: 200 }),
    supabase.from('orders').select('created_at, total, items').eq('status', 'paid').gte('created_at', new Date(now - 3 * 86400000).toISOString()),
  ]);
  const real = (orders || []).filter(o => SYD(o.created_at) === yesterday);
  const realRev = real.reduce((n, o) => n + Number(o.total || 0), 0);
  const preorders = real.filter(o => (o.items || []).some(i => i.preorder)).length;
  let spend = 0, imp = 0, clicks = 0, metaPur = 0;
  const yByAd = yRows.map(r => { const a = acts(r); spend += +r.spend; imp += +r.impressions; clicks += +r.inline_link_clicks; metaPur += a.purchase || 0; return { name: r.ad_name, set: r.adset_name, spend: +r.spend, pur: a.purchase || 0, rev: a.purchase_value || 0 }; }).sort((p, q) => q.spend - p.spend);
  const kill = wRows.map(r => { const a = acts(r); return { id: r.ad_id, name: r.ad_name, set: r.adset_name, spend: +r.spend, pur: a.purchase || 0 }; }).filter(x => x.spend >= 15 && x.pur === 0).sort((p, q) => q.spend - p.spend);
  // Say which of those are still running: a paused ad on the list is history, a live one is money going out today.
  if (kill.length) {
    try { const j = await (await fetch(`https://graph.facebook.com/v21.0/?ids=${kill.map(k => k.id).join(',')}&fields=effective_status&access_token=${process.env.FB_USER_TOKEN_LL}`)).json(); for (const k of kill) k.live = (j[k.id] || {}).effective_status === 'ACTIVE'; } catch (e) { for (const k of kill) k.live = true; }
  }
  const liveKill = kill.filter(k => k.live);
  const winners = wRows.map(r => { const a = acts(r); return { name: r.ad_name, spend: +r.spend, pur: a.purchase || 0, rev: a.purchase_value || 0 }; }).filter(x => x.pur >= 2).sort((p, q) => (q.rev / q.spend) - (p.rev / p.spend));
  const changeRows = changes.filter(c => !/^ad_account_/.test(c.event_type)).slice(0, 25);
  const mer = spend ? realRev / spend : 0;

  const esc = v => String(v == null ? '' : v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const row = cells => '<tr>' + cells.map((c, i) => `<td style="padding:6px 8px;border-bottom:1px solid #2a2d33;font-size:13px;color:#EDE8DF;${i ? 'text-align:right;white-space:nowrap;' : ''}">${c}</td>`).join('') + '</tr>';
  const table = (head, rows) => `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 22px;">${row(head.map(h => `<span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9A9590">${h}</span>`))}${rows.join('')}</table>`;
  const h2 = t => `<p style="margin:22px 0 4px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C4A97A;">${t}</p>`;
  const verdict = mer >= 2.5 ? 'Good day.' : mer >= 1.6 ? 'Profitable, thin.' : spend ? 'Lost money on ads.' : 'No spend recorded.';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#0C0D10;font-family:Helvetica,Arial,sans-serif;"><div style="max-width:620px;margin:0 auto;padding:36px 24px;color:#EDE8DF;">
    <p style="margin:0 0 6px;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#C4A97A;">Altara ad watch</p>
    <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px;font-weight:300;color:#EDE8DF;">${esc(yesterday)} &middot; ${verdict}</p>
    ${table(['', 'Spend', 'Orders', 'Revenue', 'MER'], [row(['Yesterday (real orders from the store)', money(spend), String(real.length) + (preorders ? ` <span style="color:#C4A97A">(${preorders} pre-order)</span>` : ''), money(realRev), mer.toFixed(2)]), row(['Meta-attributed purchases', '', String(metaPur), '', '']), row(['Click rate / landing page views', (imp ? (100 * clicks / imp).toFixed(2) + '%' : '-'), '', '', ''])])}
    ${h2('Spend by ad yesterday')}${table(['Ad', 'Spend', 'Sales', 'Rev'], yByAd.filter(a => a.spend >= 1).map(a => row([esc(a.name), money(a.spend), String(a.pur), money(a.rev)])))}
    ${h2('Kill rule: $15+ over three days, no sale')}${kill.length ? table(['Ad', '3-day spend'], kill.map(k => row([esc(k.name) + ` <span style="color:#9A9590">(${esc(k.set)})</span>` + (k.live ? ' <strong style="color:#D98A8A">LIVE</strong>' : ' <span style="color:#72787F">paused</span>'), money(k.spend)]))) : '<p style="font-size:13px;color:#9A9590">Nothing tripped it.</p>'}
    ${h2('Working: 2+ sales in three days')}${winners.length ? table(['Ad', 'Spend', 'Sales', 'ROAS'], winners.map(w => row([esc(w.name), money(w.spend), String(w.pur), (w.rev / w.spend).toFixed(1)]))) : '<p style="font-size:13px;color:#9A9590">Nothing with two sales yet.</p>'}
    ${h2('Rejected or flagged by Meta')}${bad.length ? table(['Ad', 'Status'], bad.map(b => row([esc(b.name), esc(b.effective_status)]))) : '<p style="font-size:13px;color:#9A9590">None. Account is clean.</p>'}
    ${h2('Changes in the account, last day')}${changeRows.length ? table(['When', 'What', 'Object'], changeRows.map(c => row([esc(new Date(c.event_time).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' })), esc(c.event_type.replace(/_/g, ' ')), esc(c.object_name || '')]))) : '<p style="font-size:13px;color:#9A9590">No changes.</p>'}
    <p style="margin-top:28px;font-size:11px;color:#72787F;">Sent by the fulfilment API each morning. Spend is Meta's figure for the Sydney day; orders and revenue are the store's own.</p>
  </div></body></html>`;
  const subject = `Ads ${yesterday}: ${money(spend)} spent, ${real.length} order${real.length === 1 ? '' : 's'}, ${money(realRev)}${liveKill.length ? `, ${liveKill.length} to kill` : ''}${bad.length ? `, ${bad.length} REJECTED` : ''}`;
  return { subject, html, data: { day: yesterday, spend, real_orders: real.length, revenue: realRev, mer, meta_purchases: metaPur, kill: kill.map(k => ({ id: k.id, name: k.name, spend: k.spend, live: !!k.live })), rejected: bad.map(b => b.name), changes: changeRows.length } };
}
