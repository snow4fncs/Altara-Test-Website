import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Same fail-closed admin check as the fulfilment console.
function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(String(req.headers['x-admin-token'] || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const SKUS = { 'midnight-black': 'Midnight Black', 'contrast-white': 'Contrast White' };
const KINDS = ['received', 'incoming', 'adjust'];
const MISSING_TABLE = '42P01';
// Below this many covers on hand a colour is flagged low (10 Twin Sets).
export const LOW_UNITS = 20;

// Order lines carry only a name, so colour and units per line are read from it.
export function lineSku(name) { return /contrast/i.test(name) ? 'contrast-white' : /midnight/i.test(name) ? 'midnight-black' : null; }
export function lineUnits(name) { return /full\s*car/i.test(name) ? 4 : /twin/i.test(name) ? 2 : 1; }

export function summarise(orders, movements) {
  const now = Date.now(), d30 = now - 30 * 86400000;
  const out = {};
  for (const sku of Object.keys(SKUS)) out[sku] = { sku, label: SKUS[sku], sold: 0, sold_30d: 0, received: 0, incoming: 0, remaining: 0, days_cover: null, low: false };
  for (const o of orders) for (const it of o.items || []) {
    const sku = lineSku(it.name); if (!sku) continue;
    const u = lineUnits(it.name) * (it.qty || 1);
    out[sku].sold += u;
    if (new Date(o.created_at).getTime() >= d30) out[sku].sold_30d += u;
  }
  for (const m of movements) {
    if (!out[m.sku]) continue;
    if (m.kind === 'incoming') out[m.sku].incoming += m.qty;
    else out[m.sku].received += m.qty;
  }
  for (const s of Object.values(out)) {
    s.remaining = s.received - s.sold;
    const rate = s.sold_30d / 30;
    s.days_cover = rate > 0 ? Math.max(0, Math.floor(s.remaining / rate)) : null;
    s.low = s.remaining <= LOW_UNITS;
  }
  return out;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin token required' });

  if (req.method === 'GET') {
    const { data: orders, error: oErr } = await supabase.from('orders')
      .select('items, created_at, status').eq('status', 'paid').limit(2000);
    if (oErr) { console.error('stock: orders read', oErr); return res.status(500).json({ error: 'Could not read orders' }); }
    let { data: movements, error: mErr } = await supabase.from('stock_movements')
      .select('*').order('created_at', { ascending: false });
    let migration_required = false;
    if (mErr && mErr.code === MISSING_TABLE) { migration_required = true; movements = []; }
    else if (mErr) { console.error('stock: movements read', mErr); return res.status(500).json({ error: 'Could not read stock movements' }); }
    return res.status(200).json({ summary: summarise(orders || [], movements), movements, migration_required, low_units: LOW_UNITS });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, id } = req.body || {};

  if (action === 'add') {
    const { sku, kind, note, expected_at } = req.body;
    const qty = Math.trunc(Number(req.body.qty));
    if (!SKUS[sku]) return res.status(400).json({ error: 'Choose a colour' });
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Choose a type' });
    if (!Number.isFinite(qty) || qty === 0 || Math.abs(qty) > 100000) return res.status(400).json({ error: 'Enter a quantity in covers' });
    if (kind !== 'adjust' && qty < 0) return res.status(400).json({ error: 'Received and incoming quantities must be positive' });
    const row = { sku, kind, qty, note: String(note || '').slice(0, 200) || null, expected_at: kind === 'incoming' && expected_at ? expected_at : null };
    const { data, error } = await supabase.from('stock_movements').insert(row).select().single();
    if (error && error.code === MISSING_TABLE) return res.status(409).json({ error: 'Run supabase-stock.sql in Supabase first', migration_required: true });
    if (error) { console.error('stock: insert', error); return res.status(500).json({ error: 'Could not save' }); }
    return res.status(200).json({ success: true, movement: data });
  }

  if (action === 'receive') {
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { data, error } = await supabase.from('stock_movements')
      .update({ kind: 'received', received_at: new Date().toISOString() }).eq('id', id).eq('kind', 'incoming').select().single();
    if (error) { console.error('stock: receive', error); return res.status(500).json({ error: 'Could not mark received' }); }
    if (!data) return res.status(404).json({ error: 'No incoming order with that id' });
    return res.status(200).json({ success: true, movement: data });
  }

  if (action === 'delete') {
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabase.from('stock_movements').delete().eq('id', id);
    if (error) { console.error('stock: delete', error); return res.status(500).json({ error: 'Could not delete' }); }
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
