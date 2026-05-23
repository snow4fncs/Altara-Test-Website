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

    // Save order to Supabase
    const { error } = await supabase.from('orders').insert({
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent,
      customer_email: session.customer_details?.email,
      customer_name: session.customer_details?.name,
      shipping_address: session.shipping_details?.address,
      items,
      subtotal: session.amount_subtotal / 100,
      total: session.amount_total / 100,
      currency: session.currency,
      status: 'paid',
    });

    if (error) console.error('Supabase insert error:', error);
  }

  res.status(200).json({ received: true });
}
