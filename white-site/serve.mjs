// Local-only preview server for the white edition: http://localhost:3001
// Serves white-site/*.html for page routes, everything else (images, fonts, /api mocks) from the main dev server on :3000.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!path.extname(p) && !p.startsWith('/api/')) p += '.html';
  const local = path.join(ROOT, path.basename(p));
  if (p.endsWith('.html') && !p.startsWith('/white-site/') && fs.existsSync(local)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(local));
  }
  // proxy everything else to the main dev server (assets, fonts, /white-site/*, local API mocks)
  const fwd = http.request({ host: 'localhost', port: 3000, path: req.url, method: req.method, headers: req.headers }, r => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  fwd.on('error', () => { res.writeHead(502); res.end('Start the main dev server first: node serve.mjs'); });
  req.pipe(fwd);
}).listen(PORT, () => console.log('Altara white edition on http://localhost:' + PORT));
