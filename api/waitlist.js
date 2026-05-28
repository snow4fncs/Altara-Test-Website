import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function sendConfirmationEmail(email, name) {
  if (!process.env.RESEND_API_KEY) { console.error('RESEND_API_KEY not set — skipping email'); return; }
  const first = name ? name.trim().split(' ')[0] : 'there';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0C0D10;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0C0D10;padding:48px 20px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#111317;border:1px solid rgba(255,255,255,0.08);max-width:540px;width:100%;">
  <tr><td style="height:3px;background:linear-gradient(90deg,transparent,#C4A97A,transparent);font-size:0;">&nbsp;</td></tr>
  <tr><td align="center" style="padding:52px 48px 36px;">
    <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#C4A97A;font-weight:500;">Spot Reserved</p>
    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:48px;font-weight:300;color:#EDE8DF;line-height:1.05;font-style:italic;">You're<br>on the<br>list.</p>
  </td></tr>
  <tr><td style="padding:0 48px;"><div style="height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>
  <tr><td style="padding:32px 48px;">
    <p style="margin:0 0 14px;font-size:14px;color:#9A9590;line-height:1.7;">Hi ${first},</p>
    <p style="margin:0 0 14px;font-size:14px;color:#9A9590;line-height:1.7;">Your spot on the Altara waitlist is confirmed. You're among the first to know when we launch in August 2026.</p>
    <p style="margin:0;font-size:14px;color:#9A9590;line-height:1.7;">We'll reach out with early access and your exclusive launch offer before we open to the public.</p>
  </td></tr>
  <tr><td style="padding:0 48px;"><div style="height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>
  <tr><td style="padding:28px 48px;">
    <p style="margin:0 0 16px;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(237,232,223,0.3);">What to expect</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0;font-size:13px;color:#EDE8DF;">Early access — before anyone else</p>
        <p style="margin:3px 0 0;font-size:11px;color:#72787F;">Before public launch · August 2026</p>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0;font-size:13px;color:#EDE8DF;">Exclusive waitlist pricing</p>
        <p style="margin:3px 0 0;font-size:11px;color:#72787F;">Waitlist members only</p>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <p style="margin:0;font-size:13px;color:#EDE8DF;">Free shipping Australia-wide</p>
        <p style="margin:3px 0 0;font-size:11px;color:#72787F;">On all first orders</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:4px 48px 48px;">
    <a href="https://altara-test-website.vercel.app/collection.html" style="display:inline-block;background:#4D6272;color:#EDE8DF;text-decoration:none;padding:14px 44px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:500;">View the Collection</a>
  </td></tr>
  <tr><td style="padding:20px 48px;background:#0C0D10;border-top:1px solid rgba(255,255,255,0.06);">
    <p style="margin:0;font-size:10px;color:rgba(237,232,223,0.2);text-align:center;letter-spacing:0.1em;">ALTARA &nbsp;·&nbsp; Engineered Comfort for Modern Movement</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Altara <altara@altaradesign.com>',
        to: email,
        subject: "You're on the list — Altara launches August 2026",
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend error ${res.status}:`, body);
    }
  } catch (err) {
    console.error('Email fetch error:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, product } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const cleanEmail = email.toLowerCase().trim();

  const { error } = await supabase.from('waitlist').insert({
    name: name?.trim() || null,
    email: cleanEmail,
    product: product || null,
    source: 'website',
  });

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'already_registered' });
    console.error('Waitlist error:', error);
    return res.status(500).json({ error: 'Server error' });
  }

  await sendConfirmationEmail(cleanEmail, name);

  res.status(200).json({ success: true });
}
