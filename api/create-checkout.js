import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  'midnight-black': process.env.STRIPE_PRICE_MIDNIGHT_BLACK,
  'midnight-black-twin': process.env.STRIPE_PRICE_MIDNIGHT_BLACK_TWIN,
  'contrast-white': process.env.STRIPE_PRICE_CONTRAST_WHITE,
  'contrast-white-twin': process.env.STRIPE_PRICE_CONTRAST_WHITE_TWIN,
};

const PRICES = {
  'midnight-black': 59,
  'midnight-black-twin': 97,
  'contrast-white': 59,
  'contrast-white-twin': 97,
};

const FREE_SHIP_THRESHOLD = 80;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });

    const line_items = items.map(item => {
      const priceId = PRODUCTS[item.id];
      if (!priceId) throw new Error(`Unknown product: ${item.id}`);
      return { price: priceId, quantity: item.qty || 1 };
    });

    const orderTotal = items.reduce((sum, item) => sum + (PRICES[item.id] || 0) * (item.qty || 1), 0);
    const freeShipping = {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 0, currency: 'aud' },
        display_name: 'Free Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 3 },
          maximum: { unit: 'business_day', value: 7 },
        },
      },
    };
    const standardShipping = {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 995, currency: 'aud' },
        display_name: 'Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 3 },
          maximum: { unit: 'business_day', value: 7 },
        },
      },
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      currency: 'aud',
      shipping_address_collection: { allowed_countries: ['AU'] },
      shipping_options: [orderTotal >= FREE_SHIP_THRESHOLD ? freeShipping : standardShipping],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cart.html`,
      metadata: { source: 'altara-web' },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
}
