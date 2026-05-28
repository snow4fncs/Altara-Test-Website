import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, product } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const { error } = await supabase.from('waitlist').insert({
    name: name?.trim() || null,
    email: email.toLowerCase().trim(),
    product: product || null,
    source: 'website',
  });

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'already_registered' });
    console.error('Waitlist error:', error);
    return res.status(500).json({ error: 'Server error' });
  }

  res.status(200).json({ success: true });
}
