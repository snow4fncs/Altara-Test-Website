export default async function handler(req, res) {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    return res.status(200).json({ status: 'FAIL', reason: 'RESEND_API_KEY is not set in Vercel environment variables' });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Altara <hello@altaradesign.com>',
      to: req.query.to || 'test@example.com',
      subject: 'Altara email test',
      html: '<p>This is a test email from Altara.</p>',
    }),
  });

  const body = await response.json();

  return res.status(200).json({
    status: response.ok ? 'OK' : 'FAIL',
    httpStatus: response.status,
    resendResponse: body,
    keyPrefix: key.substring(0, 8) + '...',
  });
}
