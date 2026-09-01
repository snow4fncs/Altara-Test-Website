import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { shippedEmailHtml, reviewRequestEmailHtml, repeatOfferEmailHtml, sendEmail } from './_emails.js';

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

const orderRefFrom = pi => 'ALT-' + String(pi || '').slice(-8).toUpperCase();
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
        ref: orderRefFrom(o.stripe_payment_intent),
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
  if (action === 'repeat_offer') {
    const { data, error } = await supabase
      .from('orders').select('id, customer_email, customer_name, repeat_email_at')
      .eq('status', 'paid').is('repeat_email_at', null);
    if (error) return res.status(500).json({ error: 'Could not load buyers' });

    // One email per person, not per order - repeat customers exist.
    const seen = new Set(); const targets = [];
    for (const o of data || []) {
      const key = String(o.customer_email || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key); targets.push(o);
    }

    let sent = 0;
    for (const o of targets) {
      const r = await sendEmail({
        to: o.customer_email,
        subject: 'Cover the back seats too',
        html: repeatOfferEmailHtml({ first: firstName(o.customer_name), code: req.body.code, discountLabel: req.body.discount_label }),
        tag: 'repeat_offer',
      });
      if (r.sent) sent++;
    }
    if (targets.length) {
      await supabase.from('orders')
        .update({ repeat_email_at: new Date().toISOString() })
        .in('customer_email', targets.map(t => t.customer_email));
    }
    return res.status(200).json({ success: true, recipients: targets.length, sent });
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

  const ref = orderRefFrom(order.stripe_payment_intent);
  const first = firstName(order.customer_name);

  // ── mark shipped + send tracking ──
  if (action === 'ship') {
    const num = String(tracking_number || '').trim();
    if (!num) return res.status(400).json({ error: 'tracking_number is required' });
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
    const num = String(tracking_number || '').trim();
    if (!num) return res.status(400).json({ error: 'tracking_number is required' });
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
