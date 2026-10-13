import { createClient } from '@supabase/supabase-js';
import { summarise } from './stock.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Public, coarse stock signal for the product pages, so "Low stock" is only
// ever shown when it is true. Exposes a band ("fewer than 50"), never the
// exact count, and nothing about sales.
const LOW_AT = 60;
// Shown on the product page while a colour is sold out. Edit when the supplier confirms a date.
const RESTOCK = { 'midnight-black': 'mid November', 'contrast-white': 'soon' };
const band = n => Math.ceil(Math.max(n, 1) / 25) * 25;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const [{ data: orders }, { data: movements }] = await Promise.all([
      supabase.from('orders').select('items, created_at, status').eq('status', 'paid').limit(2000),
      supabase.from('stock_movements').select('*'),
    ]);
    const s = summarise(orders || [], movements || []);
    const out = {};
    for (const [sku, v] of Object.entries(s)) {
      // Fewer than two covers cannot make a Twin Set, so the colour is treated as sold out.
      out[sku] = v.remaining < 2 ? { status: 'out', restock: RESTOCK[sku] || 'soon' } : v.remaining <= LOW_AT ? { status: 'low', under: band(v.remaining) } : { status: 'ok' };
    }
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(200).json(out);
  } catch (err) {
    console.error('stock-level error:', err.message);
    res.status(200).json({});
  }
}
