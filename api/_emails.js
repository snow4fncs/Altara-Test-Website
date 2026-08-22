// Shared email templates and sender.
//
// The leading underscore keeps Vercel from routing this as an endpoint - it is a
// library, not a function. Every template reuses the same shell as the order
// confirmation in webhook.js so the whole lifecycle looks like one brand.

export const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const money = n => '$' + Number(n || 0).toFixed(2);

const BG = '#0C0D10', CARD = '#111317', CREAM = '#EDE8DF', DIM = '#9A9590', GOLD = '#C4A97A', MUTED = '#72787F';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.altaradesign.com';

// One shell so every lifecycle email is visually identical to the receipt.
function shell({ eyebrow, heading, blocks, cta }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BG};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:48px 20px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid rgba(255,255,255,0.08);max-width:540px;width:100%;">
  <tr><td style="height:3px;background:linear-gradient(90deg,transparent,${GOLD},transparent);font-size:0;">&nbsp;</td></tr>
  <tr><td align="center" style="padding:52px 48px 28px;">
    <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:${GOLD};font-weight:500;">${eyebrow}</p>
    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:38px;font-weight:300;color:${CREAM};line-height:1.1;font-style:italic;">${heading}</p>
  </td></tr>
  ${blocks}
  ${cta ? `<tr><td align="center" style="padding:8px 48px 44px;">
    <a href="${cta.href}" style="display:inline-block;background:#4D6272;color:${CREAM};text-decoration:none;padding:14px 44px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:500;">${cta.label}</a>
    ${cta.note ? `<p style="margin:20px 0 0;font-size:11px;color:${MUTED};line-height:1.7;">${cta.note}</p>` : ''}
  </td></tr>` : ''}
  <tr><td style="padding:20px 48px;background:${BG};border-top:1px solid rgba(255,255,255,0.06);">
    <p style="margin:0;font-size:10px;color:rgba(237,232,223,0.2);text-align:center;letter-spacing:0.1em;">ALTARA &nbsp;&middot;&nbsp; Tailored for Every Drive</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

const row = (label, value) => `<tr><td style="padding:0 48px 18px;">
  <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(237,232,223,0.3);">${label}</p>
  <p style="margin:0;font-size:15px;color:${GOLD};letter-spacing:0.06em;word-break:break-all;">${value}</p></td></tr>`;

const para = text => `<tr><td style="padding:0 48px 20px;">
  <p style="margin:0;font-size:13px;color:${DIM};line-height:1.8;">${text}</p></td></tr>`;

const rule = () => `<tr><td style="padding:6px 48px 24px;"><div style="height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>`;

// ── 1. Shipped / tracking ────────────────────────────────────────────────────
export function shippedEmailHtml({ first, ref, trackingNumber, carrier, suburb, trackUrl }) {
  return shell({
    eyebrow: 'On its way',
    heading: `It's shipped,<br>${esc(first)}.`,
    blocks:
      para(`Your Altara cover is on its way${suburb ? ' to ' + esc(suburb) : ''} with ${esc(carrier)}. Delivery is usually 3&ndash;7 business days.`)
      + rule()
      + row('Tracking number', esc(trackingNumber))
      + row('Order reference', esc(ref)),
    cta: { href: trackUrl, label: 'Track your parcel',
           note: `Anything at all, just reply to this email.` },
  });
}

// ── 2. Review request ────────────────────────────────────────────────────────
export function reviewRequestEmailHtml({ first, ref }) {
  return shell({
    eyebrow: 'A small favour',
    heading: `How's it<br>holding up?`,
    blocks:
      para(`Hi ${esc(first)} &mdash; your Altara cover should have had a few days in the car by now.`)
      + para(`We're a new brand, so an honest review genuinely matters more than you'd think. Critical ones are welcome too: we publish those as readily as the good ones, because a page of nothing but five stars helps nobody decide.`)
      + para(`It takes about a minute, and only verified customers can write one &mdash; so yours carries weight.`)
      + rule()
      + row('Your order', esc(ref)),
    cta: { href: `${SITE}/review.html`, label: 'Write your review',
           note: 'Not feeling it? Reply and tell us what went wrong instead &mdash; that helps just as much.' },
  });
}

// ── 3. Abandoned checkout recovery ───────────────────────────────────────────
export function recoveryEmailHtml({ recoveryUrl, amount, currency }) {
  return shell({
    eyebrow: 'Still in your cart',
    heading: `You left<br>something.`,
    blocks:
      para(`Your cart is still saved &mdash; picking up where you left off takes one click, no re-entering anything.`)
      + para(`Two covers price as a Twin Set at <strong style="color:${CREAM}">$89</strong>, which is $29 off two singles and includes free shipping Australia-wide.`)
      + rule()
      + (amount ? row('Your cart', money(amount) + ' ' + String(currency || 'AUD').toUpperCase()) : ''),
    cta: { href: recoveryUrl, label: 'Return to checkout',
           note: '30-day returns. Secure checkout. If you changed your mind, no hard feelings &mdash; reply and tell us why and we\'ll take it on board.' },
  });
}

// ── 4. Repeat purchase ───────────────────────────────────────────────────────
export function repeatOfferEmailHtml({ first, code, discountLabel }) {
  return shell({
    eyebrow: 'For the other seats',
    heading: `Cover the<br>back too.`,
    blocks:
      para(`Hi ${esc(first)} &mdash; most people start with the front seats and come back for the rest once they see how much mess it catches.`)
      + para(`Any two covers price as a Twin Set at <strong style="color:${CREAM}">$89</strong>, mix or match: one Midnight Black and one Contrast White qualifies just the same.`)
      + (code ? rule() + row('Your code', esc(code) + (discountLabel ? ' &mdash; ' + esc(discountLabel) : '')) : ''),
    cta: { href: `${SITE}/collection.html`, label: 'Shop the collection',
           note: 'Free shipping on orders over $80.' },
  });
}

// ── sender ───────────────────────────────────────────────────────────────────
// Never throws: a failed lifecycle email must not break the caller (a webhook
// that fails makes Stripe retry, which would duplicate an order).
export async function sendEmail({ to, subject, html, tag }) {
  if (!process.env.RESEND_API_KEY) {
    console.error(`RESEND_API_KEY not set - ${tag || 'email'} skipped for`, to);
    return { sent: false, reason: 'no_api_key' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Altara <hello@altaradesign.com>', reply_to: 'hello@altaradesign.com', to, subject, html }),
    });
    const body = await res.text();
    if (!res.ok) { console.error(`Resend ${res.status} on ${tag}:`, body); return { sent: false, reason: body }; }
    console.log(`${tag || 'email'} sent to`, to);
    return { sent: true };
  } catch (err) {
    console.error(`${tag || 'email'} failed:`, err);
    return { sent: false, reason: String(err) };
  }
}
