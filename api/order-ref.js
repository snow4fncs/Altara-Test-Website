import Stripe from 'stripe';
import { orderRef } from './_ref.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// The confirmation page only knows the Checkout session id. This returns the
// same ALT-MB2-XXXXXX reference the emails and the fulfilment console use, so
// the customer never sees two different numbers for one order. Read-only, and
// it reveals nothing beyond colour and cover count.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const id = String(req.query.session_id || '');
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'Bad session id' });
  try {
    const [session, lines] = await Promise.all([
      stripe.checkout.sessions.retrieve(id),
      stripe.checkout.sessions.listLineItems(id, { limit: 20 }),
    ]);
    const items = lines.data.map(l => ({ name: l.description, qty: l.quantity }));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(200).json({ ref: orderRef(session.payment_intent || session.id, items) });
  } catch (err) {
    console.error('order-ref error:', err.message);
    res.status(404).json({ error: 'Session not found' });
  }
}
