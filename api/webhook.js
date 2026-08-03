import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Number(n).toFixed(2);

// Short, human-readable reference customers can quote back to us.
export function orderRef(session) {
  const src = session.payment_intent || session.id || '';
  return 'ALT-' + src.slice(-8).toUpperCase();
}

export function orderEmailHtml({ first, ref, items, subtotal, shipping, total, address, recipient }) {
  const rows = items.map(i => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <p style="margin:0;font-size:13px;color:#EDE8DF;">${esc(i.name)}</p>
          <p style="margin:3px 0 0;font-size:11px;color:#72787F;">Qty ${esc(i.qty)}</p>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;color:#EDE8DF;white-space:nowrap;">${esc(money(i.price))}</td>
      </tr>`).join('');

  const addrLines = address
    ? [address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(' '), address.country]
        .filter(Boolean).map(l => esc(l)).join('<br>')
    : 'Address on file';

  const totalRow = (label, value, strong) => `
      <tr>
        <td style="padding:${strong ? '14px 0 0' : '6px 0 0'};font-size:${strong ? '13' : '12'}px;color:${strong ? '#EDE8DF' : '#9A9590'};">${label}</td>
        <td align="right" style="padding:${strong ? '14px 0 0' : '6px 0 0'};font-size:${strong ? '15' : '12'}px;color:${strong ? '#EDE8DF' : '#9A9590'};font-weight:${strong ? '600' : '400'};white-space:nowrap;">${value}</td>
      </tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0C0D10;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0C0D10;padding:48px 20px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#111317;border:1px solid rgba(255,255,255,0.08);max-width:540px;width:100%;">
  <tr><td style="height:3px;background:linear-gradient(90deg,transparent,#C4A97A,transparent);font-size:0;">&nbsp;</td></tr>

  <tr><td align="center" style="padding:52px 48px 32px;">
    <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#C4A97A;font-weight:500;">Order Confirmed</p>
    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:44px;font-weight:300;color:#EDE8DF;line-height:1.05;font-style:italic;">Thank you,<br>${esc(first)}.</p>
  </td></tr>

  <tr><td style="padding:0 48px;"><div style="height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>

  <tr><td style="padding:26px 48px 8px;">
    <p style="margin:0;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(237,232,223,0.3);">Order Reference</p>
    <p style="margin:6px 0 0;font-size:15px;color:#C4A97A;letter-spacing:0.08em;">${esc(ref)}</p>
  </td></tr>

  <tr><td style="padding:18px 48px 4px;">
    <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(237,232,223,0.3);">Your Order</p>
    <table cellpadding="0" cellspacing="0" width="100%">${rows}
      ${totalRow('Subtotal', esc(money(subtotal)))}
      ${totalRow('Shipping', shipping > 0 ? esc(money(shipping)) : 'Free')}
      ${totalRow('Total', esc(money(total)) + ' AUD', true)}
    </table>
  </td></tr>

  <tr><td style="padding:26px 48px 0;"><div style="height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>

  <tr><td style="padding:24px 48px;">
    <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(237,232,223,0.3);">Delivering To</p>
    <p style="margin:0;font-size:13px;color:#EDE8DF;line-height:1.65;">${esc(recipient)}<br><span style="color:#9A9590;">${addrLines}</span></p>
  </td></tr>

  <tr><td style="padding:0 48px;"><div style="height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>

  <tr><td style="padding:24px 48px;">
    <p style="margin:0 0 14px;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(237,232,223,0.3);">What Happens Next</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0;font-size:13px;color:#EDE8DF;">We pack your order</p>
        <p style="margin:3px 0 0;font-size:11px;color:#72787F;">Dispatched within 1&ndash;2 business days</p>
      </td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0;font-size:13px;color:#EDE8DF;">Tracking arrives by email</p>
        <p style="margin:3px 0 0;font-size:11px;color:#72787F;">Sent the moment it leaves us</p>
      </td></tr>
      <tr><td style="padding:9px 0;">
        <p style="margin:0;font-size:13px;color:#EDE8DF;">Delivery</p>
        <p style="margin:3px 0 0;font-size:11px;color:#72787F;">3&ndash;7 business days with Australia Post</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding:8px 48px 44px;">
    <a href="https://www.altaradesign.com/collection.html" style="display:inline-block;background:#4D6272;color:#EDE8DF;text-decoration:none;padding:14px 44px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:500;">View the Collection</a>
    <p style="margin:20px 0 0;font-size:11px;color:#72787F;line-height:1.7;">Changed your mind? You have 30 days.<br>Questions about this order? Reply to this email or contact <a href="mailto:hello@altaradesign.com" style="color:#C4A97A;text-decoration:none;">hello@altaradesign.com</a>.</p>
  </td></tr>

  <tr><td style="padding:20px 48px;background:#0C0D10;border-top:1px solid rgba(255,255,255,0.06);">
    <p style="margin:0;font-size:10px;color:rgba(237,232,223,0.2);text-align:center;letter-spacing:0.1em;">ALTARA &nbsp;&middot;&nbsp; Tailored for Every Drive</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function sendOrderEmail(payload) {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set - order confirmation email skipped for', payload.ref);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Altara <hello@altaradesign.com>',
        reply_to: 'hello@altaradesign.com',
        to: payload.email,
        subject: `Order confirmed - ${payload.ref}`,
        html: orderEmailHtml(payload),
      }),
    });
    if (!res.ok) console.error(`Resend error ${res.status}:`, await res.text());
    else console.log('Order confirmation sent for', payload.ref);
  } catch (err) {
    console.error('Order email failed:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Get line items
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { expand: ['data.price.product'] });

    const items = lineItems.data.map(item => ({
      name: item.description,
      qty: item.quantity,
      price: item.amount_total / 100,
    }));

    // Stripe moved shipping details under collected_information; keep the old
    // path as a fallback so this works across API versions.
    const shipping = session.collected_information?.shipping_details
      || session.shipping_details
      || null;

    if (!shipping?.address) {
      console.error('No shipping address on session', session.id, '- order is not shippable');
    }

    // Save order to Supabase. Prefer the delivery recipient over the cardholder:
    // they are often different people.
    const { error } = await supabase.from('orders').insert({
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent,
      customer_email: session.customer_details?.email,
      customer_name: shipping?.name || session.customer_details?.name || null,
      shipping_address: shipping?.address || null,
      items,
      subtotal: session.amount_subtotal / 100,
      total: session.amount_total / 100,
      currency: session.currency,
      status: 'paid',
    });

    if (error) console.error('Supabase insert error:', error);

    // Confirmation email. Awaited so the serverless function is not torn down
    // mid-request, and never allowed to fail the webhook - Stripe would retry
    // and we would write a duplicate order.
    const email = session.customer_details?.email;
    if (email) {
      const recipient = shipping?.name || session.customer_details?.name || '';
      await sendOrderEmail({
        email,
        first: (recipient.trim().split(' ')[0]) || 'there',
        recipient: recipient || 'Customer',
        ref: orderRef(session),
        items,
        subtotal: session.amount_subtotal / 100,
        shipping: (session.shipping_cost?.amount_total || 0) / 100,
        total: session.amount_total / 100,
        address: shipping?.address || null,
      });
    } else {
      console.error('No customer email on session', session.id, '- confirmation email skipped');
    }
  }

  res.status(200).json({ received: true });
}
