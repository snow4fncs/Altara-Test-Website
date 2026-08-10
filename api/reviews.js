import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const PRODUCTS = ['midnight-black', 'contrast-white'];
// A twin-set buyer is still a buyer of the base product.
const baseId = id => String(id || '').replace(/-twin$/, '');

const PUBLIC_COLS = 'reviewer_name, rating, title, body, verified, created_at, product';

function summarise(rows) {
  const count = rows.length;
  const average = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
  const distribution = [5, 4, 3, 2, 1].map(n => ({ stars: n, count: rows.filter(r => r.rating === n).length }));
  return { count, average: Math.round(average * 10) / 10, distribution };
}

// Moderation is disabled unless ADMIN_TOKEN is set, so a missing env var fails
// closed rather than leaving the queue open.
function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const supplied = String(req.headers['x-admin-token'] || '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  // ── list approved reviews, for one product or across the range ──
  if (req.method === 'GET') {
    // moderation queue — everything awaiting a decision
    if (req.query.pending === '1') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Admin token required' });

      const { data, error } = await supabase
        .from('reviews')
        .select(`id, ${PUBLIC_COLS}`)
        .eq('approved', false)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Pending reviews fetch error:', error);
        return res.status(500).json({ error: 'Could not load the queue' });
      }
      return res.status(200).json({ reviews: data });
    }

    const requested = req.query.product || 'all';

    let query = supabase
      .from('reviews')
      .select(PUBLIC_COLS)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(200);

    if (requested !== 'all') {
      const product = baseId(requested);
      if (!PRODUCTS.includes(product)) return res.status(400).json({ error: 'Unknown product' });
      query = query.eq('product', product);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Reviews fetch error:', error);
      return res.status(500).json({ error: 'Could not load reviews' });
    }

    return res.status(200).json({ ...summarise(data), reviews: data });
  }

  // ── submit a review, or moderate one ──
  if (req.method === 'POST') {
    const payload = req.body || {};

    // moderation actions
    if (payload.action === 'approve' || payload.action === 'reject') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Admin token required' });
      if (!payload.id) return res.status(400).json({ error: 'Review id is required' });

      const { error } = payload.action === 'approve'
        ? await supabase.from('reviews').update({ approved: true }).eq('id', payload.id)
        : await supabase.from('reviews').delete().eq('id', payload.id);

      if (error) {
        console.error('Moderation error:', error);
        return res.status(500).json({ error: 'Could not update that review' });
      }
      return res.status(200).json({ success: true });
    }

    const { product, email, name, rating, title, body } = payload;
    const prod = baseId(product);

    if (!PRODUCTS.includes(prod)) return res.status(400).json({ error: 'Unknown product' });
    if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'A valid email is required' });
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    if (!body || String(body).trim().length < 10) return res.status(400).json({ error: 'Please write a little more' });

    const cleanEmail = String(email).toLowerCase().trim();

    // Verified purchase: this email must have an order containing this product.
    const { data: orders } = await supabase
      .from('orders')
      .select('items')
      .eq('customer_email', cleanEmail)
      .eq('status', 'paid');

    const purchased = (orders || []).some(o =>
      (o.items || []).some(i => baseId(i.id) === prod || String(i.name || '').toLowerCase().includes(prod.replace('-', ' ')))
    );

    if (!purchased) {
      return res.status(403).json({ error: 'We could not find an order for this email. Reviews are open to verified customers only.' });
    }

    // One review per customer per product.
    const { data: existing } = await supabase
      .from('reviews').select('id').eq('product', prod).eq('email', cleanEmail).limit(1);
    if (existing && existing.length) {
      return res.status(409).json({ error: 'You have already reviewed this product.' });
    }

    const { error } = await supabase.from('reviews').insert({
      product: prod,
      email: cleanEmail,
      reviewer_name: String(name || '').trim().slice(0, 60) || 'Altara customer',
      rating: stars,
      title: String(title || '').trim().slice(0, 120) || null,
      body: String(body).trim().slice(0, 2000),
      verified: true,
      approved: false, // you approve it before it appears
    });

    if (error) {
      console.error('Review insert error:', error);
      return res.status(500).json({ error: 'Could not save your review' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
