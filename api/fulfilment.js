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

const COLS = 'id, created_at, customer_email, customer_name, shipping_address, items, total, currency, status, stripe_payment_intent, tracking_number, carrier, shipped_at, review_email_at, repeat_email_at';

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin token required' });

  // ── list orders with fulfilment state ──
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('orders').select(COLS).eq('status', 'paid')
      .order('created_at', { ascending: false }).limit(200);
    if (error) { console.error('Fulfilment list error:', error); return res.status(500).json({ error: 'Could not load orders' }); }

    const now = Date.now();
    const orders = (data || []).map(o => {
      const shippedDaysAgo = o.shipped_at ? Math.floor((now - new Date(o.shipped_at)) / 86400000) : null;
      return {
        ...o,
        ref: orderRefFrom(o.stripe_payment_intent),
        // A review nudge only makes sense once the parcel has had time to land
        // and be used - 10 days after dispatch, and only once.
        review_due: !!o.shipped_at && !o.review_email_at && shippedDaysAgo >= 10,
        shipped_days_ago: shippedDaysAgo,
      };
    });
    return res.status(200).json({ orders });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, id, tracking_number, carrier } = req.body || {};
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

  if (!id) return res.status(400).json({ error: 'id is required' });

  const { data: order, error: findErr } = await supabase
    .from('orders').select(COLS).eq('id', id).single();
  if (findErr || !order) return res.status(404).json({ error: 'Order not found' });

  const ref = orderRefFrom(order.stripe_payment_intent);
  const first = firstName(order.customer_name);

  // ── mark shipped + send tracking ──
  if (action === 'ship') {
    const num = String(tracking_number || '').trim();
    if (!num) return res.status(400).json({ error: 'tracking_number is required' });
    const car = String(carrier || 'Australia Post').trim();

    const { error: upErr } = await supabase.from('orders')
      .update({ tracking_number: num, carrier: car, shipped_at: new Date().toISOString() })
      .eq('id', id);
    if (upErr) { console.error('Ship update error:', upErr); return res.status(500).json({ error: 'Could not save tracking' }); }

    const result = await sendEmail({
      to: order.customer_email,
      subject: `Your Altara order has shipped - ${ref}`,
      html: shippedEmailHtml({
        first, ref, trackingNumber: num, carrier: car,
        suburb: order.shipping_address?.city || '',
        trackUrl: trackUrl(car, num),
      }),
      tag: 'shipped',
    });
    // Tracking is saved either way; the email is best-effort.
    return res.status(200).json({ success: true, emailed: result.sent, reason: result.reason });
  }

  // ── review request ──
  if (action === 'review_request') {
    if (order.review_email_at) return res.status(409).json({ error: 'Review request already sent for this order' });
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
