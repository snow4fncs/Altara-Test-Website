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
  'midnight-black-twin': 89,
  'contrast-white': 59,
  'contrast-white-twin': 89,
};

const FREE_SHIP_THRESHOLD = 80;

// ─── Twin Set bundle ────────────────────────────────────────────────────────
// Any two single covers are charged as a Twin Set: 2 x $59 = $118 becomes $89,
// so $29 comes off per pair. Mix or match, because two singles of one colour
// are the same goods as that colour's Twin Set and must not cost more.
//
// This is recomputed here from the submitted cart. The cart page shows the same
// figure for transparency, but nothing the browser sends about pricing is
// trusted - only the item ids and quantities.
const BUNDLE_PAIR_SAVING = 29;

export function bundleDiscount(items) {
  const singles = items
    .filter(i => !/-twin$/.test(String(i.id)))
    .reduce((n, i) => n + Math.max(1, Number(i.qty) || 1), 0);
  return Math.floor(singles / 2) * BUNDLE_PAIR_SAVING;
}

// Coupons are reused by deterministic id so we do not litter the account with a
// new object per checkout. Created on first use, so there is nothing to set up
// in the Stripe dashboard.
async function bundleCouponId(amountAud) {
  const id = `altara-twin-bundle-${amountAud}`;
  try {
    const existing = await stripe.coupons.retrieve(id);
    return existing.id;
  } catch (err) {
    if (err?.raw?.code !== 'resource_missing' && err?.statusCode !== 404) throw err;
    const created = await stripe.coupons.create({
      id,
      amount_off: amountAud * 100,
      currency: 'aud',
      duration: 'once',
      name: `Twin Set bundle (-$${amountAud})`,
    });
    return created.id;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items, fbp, fbc, promo_code } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });

    // Meta's browser cookies and the user agent, carried through Stripe so the
    // webhook can attach them to the server-side Purchase event. Without these
    // the event still lands but Meta matches it to a person far less often.
    const clip = v => (v ? String(v).slice(0, 480) : '');
    const metaContext = {
      fbp: clip(fbp),
      fbc: clip(fbc),
      ua: clip(req.headers['user-agent']),
      ip: clip((req.headers['x-forwarded-for'] || '').split(',')[0].trim()),
    };

    const line_items = items.map(item => {
      const priceId = PRODUCTS[item.id];
      if (!priceId) throw new Error(`Unknown product: ${item.id}`);
      return { price: priceId, quantity: item.qty || 1 };
    });

    const discount = bundleDiscount(items);
    const grossTotal = items.reduce((sum, item) => sum + (PRICES[item.id] || 0) * (item.qty || 1), 0);
    // Free shipping is judged on what the customer actually pays.
    const orderTotal = grossTotal - discount;
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

    const params = {
      mode: 'payment',
      line_items,
      currency: 'aud',
      shipping_address_collection: { allowed_countries: ['AU'] },
      // Phone doubles as a courier contact and one of Meta's strongest match
      // keys - it was the notable absence from the pixel's match quality score.
      phone_number_collection: { enabled: true },
      shipping_options: [orderTotal >= FREE_SHIP_THRESHOLD ? freeShipping : standardShipping],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cart.html`,
      metadata: {
        source: 'altara-web',
        bundle_discount_aud: String(discount),
        meta_fbp: metaContext.fbp,
        meta_fbc: metaContext.fbc,
        meta_ua: metaContext.ua,
        meta_ip: metaContext.ip,
      },
    };

    // Abandoned-checkout recovery. Stripe keeps the cart alive after the
    // session expires and mints a recovery URL, which api/webhook.js emails to
    // the customer on checkout.session.expired. Without this flag there is no
    // URL to send them back to and the cart is simply lost.
    params.after_expiration = {
      recovery: { enabled: true, allow_promotion_codes: discount === 0 },
    };

    // Stripe rejects a session that both carries an automatic discount and
    // offers the promotion code field, so the two are mutually exclusive: a
    // bundle order gets the bundle, everything else can redeem a code.
    if (discount > 0) {
      params.discounts = [{ coupon: await bundleCouponId(discount) }];
    } else if (promo_code) {
      // The cart validated this before checkout; re-verify here because the
      // browser is never trusted with pricing. Invalid or expired by now -> fall
      // back to the manual code field rather than failing the checkout.
      const found = await stripe.promotionCodes.list({ code: String(promo_code).slice(0, 50), active: true, limit: 1 });
      if (found.data[0]) params.discounts = [{ promotion_code: found.data[0].id }];
      else params.allow_promotion_codes = true;
    } else {
      params.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(params);

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
}
