import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Finance feed for the admin dashboard: real money from Stripe balance
// transactions (gross, processing fees, refunds, net, payouts), order/unit
// counts from Supabase, and Meta ad spend when a token is configured.
// COGS and shipping assumptions live client-side where they can be edited.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(String(req.headers['x-admin-token'] || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const DAY_MS = 86400000;
const sydneyDay = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin token required' });

  const days = Math.min(Number(req.query.days) || 30, 90);
  const sinceMs = Date.now() - days * DAY_MS;
  const sinceSec = Math.floor(sinceMs / 1000);

  try {
    // ── Stripe: every balance transaction in the window ──
    const daily = {}; // day -> { gross, fees, refunds, net }
    const bucket = d => (daily[d] = daily[d] || { gross: 0, fees: 0, refunds: 0, net: 0, orders: 0, covers: 0, adspend: 0 });
    const payouts = [];
    let totalPayouts = 0;
    let after;
    for (let page = 0; page < 20; page++) {
      const batch = await stripe.balanceTransactions.list({
        created: { gte: sinceSec }, limit: 100, ...(after ? { starting_after: after } : {}),
      });
      for (const t of batch.data) {
        const day = sydneyDay(t.created * 1000);
        const b = bucket(day);
        if (t.type === 'charge' || t.type === 'payment') {
          b.gross += t.amount / 100;
          b.fees += t.fee / 100;
          b.net += t.net / 100;
        } else if (t.type === 'refund' || t.type === 'payment_refund') {
          b.refunds += Math.abs(t.amount) / 100;
          b.net += t.net / 100;
          b.fees += t.fee / 100;
        } else if (t.type === 'payout') {
          payouts.push({ day, amount: Math.abs(t.amount) / 100 });
          totalPayouts += Math.abs(t.amount) / 100;
        }
      }
      if (!batch.has_more) break;
      after = batch.data[batch.data.length - 1].id;
    }

    // ── Orders: volume and covers shipped per day ──
    const sinceIso = new Date(sinceMs).toISOString();
    const { data: orders, error } = await supabase
      .from('orders').select('created_at, items, total')
      .eq('status', 'paid').gte('created_at', sinceIso).limit(2000);
    if (error) throw error;
    for (const o of orders || []) {
      const b = bucket(sydneyDay(o.created_at));
      b.orders += 1;
      for (const it of o.items || []) {
        const per = /twin/i.test(String(it.id || '') + ' ' + String(it.name || '')) ? 2 : 1;
        b.covers += per * (Number(it.qty) || 1);
      }
    }

    // ── Meta ad spend, when the token is configured on the server ──
    let adSpendAvailable = false;
    if (process.env.FB_USER_TOKEN_LL) {
      try {
        const since = new Date(sinceMs).toISOString().slice(0, 10);
        const until = new Date().toISOString().slice(0, 10);
        const url = `https://graph.facebook.com/v21.0/act_2548980925519496/insights?fields=spend&time_increment=1&time_range={"since":"${since}","until":"${until}"}&access_token=${process.env.FB_USER_TOKEN_LL}`;
        const r = await fetch(url);
        const j = await r.json();
        if (j.data) {
          adSpendAvailable = true;
          for (const row of j.data) bucket(row.date_start).adspend = Number(row.spend) || 0;
        }
      } catch (e) { console.error('Meta spend fetch failed:', e.message); }
    }

    const daysOut = Object.keys(daily).sort().map(d => ({ day: d, ...daily[d] }));
    res.status(200).json({ days: daysOut, payouts, total_payouts: totalPayouts, ad_spend_available: adSpendAvailable, window_days: days });
  } catch (err) {
    console.error('Finance error:', err);
    res.status(500).json({ error: err.message });
  }
}
