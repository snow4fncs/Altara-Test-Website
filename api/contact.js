// Contact form handler - sends the enquiry through Resend instead of forcing
// the customer's own mail client open (real feedback from a real customer).
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { first_name, last_name, email, order_number, subject, message, website } = req.body || {};
  // Honeypot: bots fill the hidden field; humans never see it. Pretend success.
  if (website) return res.status(200).json({ success: true });

  const name = [first_name, last_name].map(v => String(v || '').trim()).filter(Boolean).join(' ').slice(0, 120);
  const from = String(email || '').trim().slice(0, 200);
  const msg = String(message || '').trim().slice(0, 5000);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from) || msg.length < 5) {
    return res.status(400).json({ error: 'Please add your name, a valid email, and a message.' });
  }
  const order = String(order_number || '').trim().slice(0, 40);
  const topic = String(subject || '').trim().slice(0, 40);

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set - contact enquiry dropped for', from);
    return res.status(502).json({ error: 'Sending is unavailable right now. Please email hello@altaradesign.com directly.' });
  }

  const html = `<p style="margin:0 0 8px"><strong>${esc(name)}</strong> &lt;${esc(from)}&gt;</p>
${order ? `<p style="margin:0 0 4px">Order: ${esc(order)}</p>` : ''}
${topic ? `<p style="margin:0 0 12px">Topic: ${esc(topic)}</p>` : ''}
<p style="white-space:pre-wrap;margin:0">${esc(msg)}</p>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Altara Website <hello@altaradesign.com>',
        to: 'hello@altaradesign.com',
        reply_to: from,
        subject: `Enquiry${topic ? ': ' + topic : ''} — ${name}`,
        html,
      }),
    });
    if (!r.ok) {
      console.error('Contact send failed:', await r.text());
      return res.status(502).json({ error: 'Sending failed. Please email hello@altaradesign.com directly.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact error:', err);
    return res.status(502).json({ error: 'Sending failed. Please email hello@altaradesign.com directly.' });
  }
}
