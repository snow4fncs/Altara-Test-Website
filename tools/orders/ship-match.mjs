// Match AusPost labels to unshipped paid orders on FULL NAME + POSTCODE (rule-shipping-match-discipline),
// then mark them shipped through /api/fulfilment (which sends the tracking email).
// usage: node tools/orders/ship-match.mjs labels.json          (dry run: prints the pairings)
//        node tools/orders/ship-match.mjs labels.json --apply  (ships the clean matches only)
// labels.json: [{ "name": "Full Name", "postcode": "2570", "tracking": "997..." }, ...]
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const U = env.SUPABASE_URL, K = env.SUPABASE_SERVICE_KEY;
const labels = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const apply = process.argv.includes('--apply');
const norm = s => String(s || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const r = await fetch(U + '/rest/v1/orders?select=id,created_at,customer_name,shipping_address,items,tracking_number,shipped_at&status=eq.paid&shipped_at=is.null&limit=1000', { headers: { apikey: K, Authorization: 'Bearer ' + K } });
if (!r.ok) throw new Error('read failed ' + r.status);
const orders = await r.json();

const plan = [], skipped = [];
for (const l of labels) {
  const hits = orders.filter(o => norm(o.customer_name) === norm(l.name) && String(o.shipping_address?.postal_code || '').trim() === l.postcode);
  const preorder = hits.some(o => (o.items || []).some(it => it.preorder));
  if (hits.length !== 1) { skipped.push(l.name + ' ' + l.postcode + ': ' + hits.length + ' matching unshipped orders'); continue; }
  if (preorder) { skipped.push(l.name + ' ' + l.postcode + ': order still has a pre-order line'); continue; }
  const o = hits[0];
  plan.push({ o, l });
  console.log('MATCH ' + o.customer_name + ' | ' + (o.shipping_address?.city || '') + ' ' + o.shipping_address?.postal_code + ' | ' + (o.items || []).map(i => i.qty + 'x ' + i.name).join(', ') + ' | ' + o.id.slice(0, 8) + ' -> ' + l.tracking);
}
for (const s of skipped) console.log('SKIP  ' + s);
const left = orders.filter(o => !plan.some(p => p.o.id === o.id) && !(o.items || []).some(it => it.preorder));
console.log('in-stock orders still unshipped after this: ' + left.length + (left.length ? ' (' + left.map(o => o.customer_name + ' ' + o.shipping_address?.postal_code).join('; ') + ')' : ''));

if (apply) for (const { o, l } of plan) {
  const res = await fetch('https://www.altaradesign.com/api/fulfilment', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': env.ADMIN_TOKEN }, body: JSON.stringify({ action: 'ship', id: o.id, tracking_number: l.tracking, carrier: 'Australia Post' }) });
  console.log('SHIP ' + o.customer_name + ': ' + res.status + ' ' + await res.text());
}
