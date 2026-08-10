import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// ─────────────────────────────────────────────────────────────────────────────
// Local mock of /api/reviews.
//
// This file is the dev server only - it is never deployed (Vercel serves the
// real functions in api/). It exists so the review flow can be exercised end to
// end on localhost without a Supabase connection: submit a review, see it land
// in the moderation queue, publish it, watch it appear on the product page.
//
// Differences from production, deliberately:
//   - reviews live in memory, so a restart returns to the seed set below
//   - purchase verification accepts any valid email (there is no orders table)
//   - the admin token is the literal string "dev"
// ─────────────────────────────────────────────────────────────────────────────

const DEV_ADMIN_TOKEN = 'dev';
const PRODUCTS = ['midnight-black', 'contrast-white'];
const baseId = id => String(id || '').replace(/-twin$/, '');

let nextId = 100;

// Seed set for local review. All dated August 2026. Written to vary in length,
// register and shape rather than repeating one template - some are a single
// blunt line, some ramble, some lead with a complaint. Each is tied to something
// specific about its colourway: Midnight Black hides marks and disappears into a
// dark interior, Contrast White is the styling pick that shows dirt sooner.
const reviews = [
  // ── Midnight Black ────────────────────────────────────────────────────────
  {
    id: 'seed-mb-1', product: 'midnight-black', email: 'seed.mb1@example.com',
    reviewer_name: 'Dani R.', rating: 5, created_at: '2026-08-09T07:40:00Z',
    title: 'Solved a problem I had stopped trying to solve',
    body: 'Maroubra, in the water by quarter to six most mornings. For about two years my solution was an old towel folded over the seat, which slid into the footwell roughly every second time I got in. I had accepted that as just part of swimming. This does not move. I have not thought about it once since the first week, which is the highest compliment I can give a thing like this.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-2', product: 'midnight-black', email: 'seed.mb2@example.com',
    reviewer_name: 'Kon S.', rating: 5, created_at: '2026-08-09T21:15:00Z',
    title: '',
    body: 'Ordered a second one four days later for my wife’s car. That is the review.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-3', product: 'midnight-black', email: 'seed.mb3@example.com',
    reviewer_name: 'Marcus T.', rating: 4, created_at: '2026-08-08T19:05:00Z',
    title: 'Netball season saviour, with a caveat about washing',
    body: 'Bought it for the drive home from the gym and it has ended up earning its keep on Saturdays instead, when two kids get in still damp and covered in whatever the courts are made of. Handles it. My only gripe is that you do end up washing it more than you expect — twice a week here — and I would rather have bought two from the start so there is always one on the seat. Four stars because I had to learn that the hard way.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-4', product: 'midnight-black', email: 'seed.mb4@example.com',
    reviewer_name: 'Ellie K.', rating: 5, created_at: '2026-08-07T12:22:00Z',
    title: 'The black was the right call with kids',
    body: 'Two under four, so the back seat had genuinely become a lost cause — water bottles, half a sandwich, sand from god knows where. I nearly ordered the white one because it is prettier and I am glad I did not. This hides everything between washes and that turns out to matter far more to me day to day than how much water it can hold. My husband did not notice it was there for about a fortnight, which I am taking as a good sign.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-5', product: 'midnight-black', email: 'seed.mb5@example.com',
    reviewer_name: 'Sam O.', rating: 5, created_at: '2026-08-06T06:15:00Z',
    title: '',
    body: 'Shift work, so I am getting into the car at 7am and again at 11pm, often not fresh. Six weeks in, washed weekly, no smell has developed. That was the specific thing I was worried about and it has not happened.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-6', product: 'midnight-black', email: 'seed.mb6@example.com',
    reviewer_name: 'Trent B.', rating: 4, created_at: '2026-08-05T16:48:00Z',
    title: 'The grip backing is the actual feature',
    body: 'Concreting, so the car takes dust, sweat and whatever is on my boots. Material is fine, no complaints. What sold me was the rubber backing — I have had two of these style covers before and both crept forward until they bunched behind my back by lunchtime. This one has not shifted. Losing a star only because getting it seated over the headrest properly took me two goes and I would not have worked it out without the note.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-7', product: 'midnight-black', email: 'seed.mb7@example.com',
    reviewer_name: 'Wes L.', rating: 3, created_at: '2026-08-04T11:00:00Z',
    title: 'Good product, wrong car',
    body: 'Being fair to it: it absorbs well, the backing grips properly, and the stitching looks like it will outlast the car. Three stars is about fit, not quality. The bench in my Hilux is wider than a normal front seat and there is a strip of about four centimetres either side left uncovered, so I still get a damp patch at the edges. If you drive a ute, measure before you order. If I had a sedan this would be five.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-8', product: 'midnight-black', email: 'seed.mb8@example.com',
    reviewer_name: 'Priya N.', rating: 4, created_at: '2026-08-03T09:30:00Z',
    title: '',
    body: 'My reasoning was resale rather than comfort. Leather interior, three years from selling, and I did not want the driver’s seat looking obviously more worn than the other three. On that measure it does the job and it looks considerably more deliberate than I expected — nobody has asked why I have a towel on my seat, because it does not read as one. I would prefer a slightly deeper drop at the back of the base but that is a preference, not a fault.',
    verified: true, approved: true,
  },
  {
    id: 'seed-mb-9', product: 'midnight-black', email: 'seed.mb9@example.com',
    reviewer_name: 'Hana K.', rating: 5, created_at: '2026-08-02T14:10:00Z',
    title: 'Eleven weeks of rideshare, still holding',
    body: 'I drive Friday to Sunday so the seat sees a lot of strangers and I wash the cover about four times a week. Eleven weeks in: no pilling, no fading, the embroidery has not lifted. Off and back on in under a minute between shifts. At this rate of washing I expected to be replacing it by now.',
    verified: true, approved: true,
  },

  // ── Contrast White ────────────────────────────────────────────────────────
  {
    id: 'seed-cw-1', product: 'contrast-white', email: 'seed.cw1@example.com',
    reviewer_name: 'Jules W.', rating: 5, created_at: '2026-08-09T15:20:00Z',
    title: 'For anyone worried the white goes grey',
    body: 'That was the only thing stopping me ordering, so: five washes in, still white. Not bright-white-out-of-the-packet white, but nowhere near grey either. The piping is the whole reason I chose this over the black and it still looks sharp against a dark interior. Two people have assumed it came with the car.',
    verified: true, approved: true,
  },
  {
    id: 'seed-cw-2', product: 'contrast-white', email: 'seed.cw2@example.com',
    reviewer_name: 'Cass M.', rating: 5, created_at: '2026-08-08T08:55:00Z',
    title: '',
    body: 'Pilates at six, school drop-off at half eight, and I did not want the inside of my car to look like a gym bag in between. This is the first thing I have found that handles the sweaty part without looking utilitarian. The light trim genuinely lifts the interior.',
    verified: true, approved: true,
  },
  {
    id: 'seed-cw-3', product: 'contrast-white', email: 'seed.cw3@example.com',
    reviewer_name: 'Ben A.', rating: 4, created_at: '2026-08-07T17:35:00Z',
    title: 'Buy the black one instead if you have a dog',
    body: 'Performance is not the issue — wet labrador straight off the sand, muddy boots, all absorbed without reaching the seat. The issue is that I picked the wrong colour for my life. Paw marks show on the white within a day or two and I am washing it more often than I would like as a result. Excellent product, and I would give it five if I had ordered the Midnight Black. Learn from me.',
    verified: true, approved: true,
  },
  {
    id: 'seed-cw-4', product: 'contrast-white', email: 'seed.cw4@example.com',
    reviewer_name: 'Nadia F.', rating: 5, created_at: '2026-08-06T10:05:00Z',
    title: 'Bought it for sweat, kept it for the heat',
    body: 'Brisbane, no garage, car parked in full sun all day. The thing I actually use it for now is not absorbency at all — it is that I can get in at four in the afternoon and sit down without the leather burning the back of my legs. Completely unexpected benefit and now the main one. Handles the gym side of things too.',
    verified: true, approved: true,
  },
  {
    id: 'seed-cw-5', product: 'contrast-white', email: 'seed.cw5@example.com',
    reviewer_name: 'Rory D.', rating: 4, created_at: '2026-08-05T13:40:00Z',
    title: '',
    body: 'Two to three hours on the bike Sunday mornings, then an hour’s drive home in kit that is completely soaked through. Nothing reaches the seat, which is all I wanted. Four rather than five because I got chain grease on it being careless climbing in and it took two washes to shift — on the black that would never have shown.',
    verified: true, approved: true,
  },
  {
    id: 'seed-cw-6', product: 'contrast-white', email: 'seed.cw6@example.com',
    reviewer_name: 'Imogen S.', rating: 5, created_at: '2026-08-04T09:15:00Z',
    title: 'Get the twin, not the single',
    body: 'Ordered one, immediately wished I had ordered two, ordered a second. One on its own looks slightly odd and unbalanced from the outside. Fit is snug on a sedan and the embroidery is neat rather than shouty.',
    verified: true, approved: true,
  },
  {
    id: 'seed-cw-7', product: 'contrast-white', email: 'seed.cw7@example.com',
    reviewer_name: 'Dev M.', rating: 5, created_at: '2026-08-03T18:30:00Z',
    title: 'Bought for Dad, he has since bought his own',
    body: 'Father’s Day was coming and he plays bowls three times a week in the heat, so it seemed like a safe bet. Arrived in four days, packaged well enough that I did not need to re-wrap it. He then ordered the black one for the passenger side, which tells you more than anything I could say about it.',
    verified: true, approved: true,
  },

  // ── One left unpublished so the moderation queue is not empty locally ─────
  {
    id: 'seed-pending', product: 'midnight-black', email: 'seed.pending@example.com',
    reviewer_name: 'Alex P.', rating: 5, created_at: '2026-08-09T06:30:00Z',
    title: 'Pending example, for the moderation queue',
    body: 'This one is deliberately left unpublished so the queue has something in it when you open it locally. Publish or reject it to watch the flow work end to end.',
    verified: true, approved: false,
  },
];

function summarise(list) {
  const count = list.length;
  const average = count ? list.reduce((s, r) => s + r.rating, 0) / count : 0;
  const distribution = [5, 4, 3, 2, 1].map(n => ({ stars: n, count: list.filter(r => r.rating === n).length }));
  return { count, average: Math.round(average * 10) / 10, distribution };
}

const publicShape = r => ({
  reviewer_name: r.reviewer_name, rating: r.rating, title: r.title,
  body: r.body, verified: r.verified, created_at: r.created_at,
  product: r.product,
});

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve(null); } });
  });
}

async function handleReviews(req, res, query) {
  const isAdmin = (req.headers['x-admin-token'] || '') === DEV_ADMIN_TOKEN;

  if (req.method === 'GET') {
    // moderation queue
    if (query.get('pending') === '1') {
      if (!isAdmin) return send(res, 401, { error: 'Admin token required' });
      const pending = reviews.filter(r => !r.approved)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return send(res, 200, { reviews: pending.map(r => ({ ...publicShape(r), id: r.id })) });
    }

    const requested = query.get('product') || 'all';
    let scope;
    if (requested === 'all') {
      scope = reviews.filter(r => r.approved);
    } else {
      const product = baseId(requested);
      if (!PRODUCTS.includes(product)) return send(res, 400, { error: 'Unknown product' });
      scope = reviews.filter(r => r.approved && r.product === product);
    }
    scope = scope.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return send(res, 200, { ...summarise(scope), reviews: scope.map(publicShape) });
  }

  if (req.method === 'POST') {
    const payload = await readBody(req);
    if (!payload) return send(res, 400, { error: 'Malformed request' });

    // moderation actions
    if (payload.action === 'approve' || payload.action === 'reject') {
      if (!isAdmin) return send(res, 401, { error: 'Admin token required' });
      const idx = reviews.findIndex(r => r.id === payload.id);
      if (idx === -1) return send(res, 404, { error: 'Review not found' });
      if (payload.action === 'approve') reviews[idx].approved = true;
      else reviews.splice(idx, 1);
      return send(res, 200, { success: true });
    }

    const { product, email, name, rating, title, body } = payload;
    const prod = baseId(product);
    if (!PRODUCTS.includes(prod)) return send(res, 400, { error: 'Unknown product' });
    if (!email || !String(email).includes('@')) return send(res, 400, { error: 'A valid email is required' });
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return send(res, 400, { error: 'Rating must be 1-5' });
    if (!body || String(body).trim().length < 10) return send(res, 400, { error: 'Please write a little more' });

    const cleanEmail = String(email).toLowerCase().trim();
    if (reviews.some(r => r.email === cleanEmail && r.product === prod)) {
      return send(res, 409, { error: 'You have already reviewed this product.' });
    }

    reviews.push({
      id: 'local-' + (nextId++),
      product: prod,
      email: cleanEmail,
      reviewer_name: String(name || '').trim().slice(0, 60) || 'Altara customer',
      rating: stars,
      title: String(title || '').trim().slice(0, 120) || null,
      body: String(body).trim().slice(0, 2000),
      verified: true,
      approved: false,
      created_at: new Date().toISOString(),
    });
    console.log(`  → review submitted for ${prod} (${stars}★) — pending in /admin-reviews.html`);
    return send(res, 200, { success: true });
  }

  return send(res, 405, { error: 'Method not allowed' });
}

const server = http.createServer(async (req, res) => {
  const [rawPath, rawQuery] = req.url.split('?');
  const query = new URLSearchParams(rawQuery || '');

  if (rawPath === '/api/reviews') return handleReviews(req, res, query);

  let urlPath = rawPath;
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, decodeURIComponent(urlPath));
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Serving at http://localhost:${PORT}`);
  console.log(`Mock reviews API active — ${reviews.filter(r => r.approved).length} published, ${reviews.filter(r => !r.approved).length} pending`);
  console.log(`Moderation queue: http://localhost:${PORT}/admin-reviews.html  (token: ${DEV_ADMIN_TOKEN})`);
});
