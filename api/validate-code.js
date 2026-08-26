import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Validates a promotion code before checkout so the cart can show the saving,
// instead of the customer discovering an invalid code after leaving the site.
// Read-only; the code is applied for real in create-checkout.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const code = String(req.query.code || '').trim();
  if (!code || code.length > 50) return res.status(400).json({ error: 'Enter a code first' });

  // The payable cart total (after any bundle saving), so codes with a
  // minimum-order restriction are refused here with the shortfall spelled
  // out, rather than "applying" in the cart and failing inside Stripe.
  const subtotal = Number(req.query.subtotal);

  try {
    const found = await stripe.promotionCodes.list({ code, active: true, limit: 1, expand: ['data.coupon'] });
    const pc = found.data[0];
    if (!pc || !pc.coupon || !pc.coupon.valid) {
      return res.status(404).json({ error: 'That code is not valid' });
    }

    const minimum = pc.restrictions?.minimum_amount ? pc.restrictions.minimum_amount / 100 : null;
    if (minimum && Number.isFinite(subtotal) && subtotal < minimum) {
      const short = (minimum - subtotal).toFixed(2).replace(/\.00$/, '');
      return res.status(400).json({
        error: `${pc.code} needs an order of $${minimum} or more — add $${short} to use it.`,
        minimum,
      });
    }

    return res.status(200).json({
      code: pc.code,
      name: pc.coupon.name || pc.code,
      percent_off: pc.coupon.percent_off || null,
      amount_off: pc.coupon.amount_off ? pc.coupon.amount_off / 100 : null,
      currency: pc.coupon.currency || 'aud',
      minimum,
    });
  } catch (err) {
    console.error('Code validation error:', err);
    return res.status(500).json({ error: 'Could not check that code' });
  }
}
