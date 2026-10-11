// Order reference and parcel sizing, derived from what was bought.
//
// ALT-MB2-RRYWCJ  ->  Midnight Black, 2 covers, then six characters from the
// Stripe payment intent so it stays unique. Colour codes: MB Midnight Black,
// CW Contrast White, MX mixed. The number is the total covers in the order
// (a Twin Set is two), so MB4 is a Full Car and CW1 a single.
//
// Stored items carry {name, qty, price} and sometimes an id, so detection reads
// both. Used by the webhook (emails, Meta purchase id), the fulfilment API
// (console, review requests, labels) and the local mock server.

const isTwin = i => /-twin$/.test(String(i.id || '')) || /twin/i.test(String(i.name || ''));
const isWhite = i => /white|contrast/i.test(String(i.id || '') + ' ' + String(i.name || ''));

export function coverUnits(items) {
  return (items || []).reduce((n, i) => n + (isTwin(i) ? 2 : 1) * (Number(i.qty) || 1), 0);
}

export function colourCode(items) {
  const list = items || [];
  const white = list.some(isWhite), black = list.some(i => !isWhite(i));
  return white && black ? 'MX' : white ? 'CW' : 'MB';
}

export function orderRef(paymentIntent, items) {
  const tail = String(paymentIntent || '').slice(-6).toUpperCase();
  return `ALT-${colourCode(items)}${coverUnits(items)}-${tail}`;
}

// Australia Post satchel by cover count: single S, Twin Set M, three L,
// Full Car (four or more) XL. Weight is the figure MyPost asks for, in kg.
export function parcel(items) {
  const n = coverUnits(items);
  if (n <= 1) return { type: 'AP_SATCHEL_S', kg: '1', label: 'Small' };
  if (n === 2) return { type: 'AP_SATCHEL_M', kg: '1', label: 'Medium' };
  if (n === 3) return { type: 'AP_SATCHEL_L', kg: '3', label: 'Large' };
  return { type: 'AP_SATCHEL_XL', kg: '3', label: 'Extra Large' };
}
