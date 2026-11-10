// One-off, run from the repo root on 10 Nov 2026: makes the white edition the live site.
// 1. rebuilds white-site/*.html from the current (dark) root pages, so the latest copy edits are carried over
// 2. writes those pages back to the root with the stylesheet, runtime and transition script referenced at the root
// 3. copies alpine.css, alpine.js and the white transition.js to the root
// After this, build.mjs refuses to run (the root pages are white) and the site is edited directly in the root files.
import fs from 'fs';
import { execSync } from 'child_process';

const PAGES = ['index', 'collection', 'product-midnight-black', 'product-contrast-white', 'cart', 'confirmation', 'account',
  'auth-callback', 'reviews', 'review', 'faq', 'about', 'contact', 'shipping', 'returns', 'terms', 'privacy', 'search',
  'gym-sweat-car-seat-protection', 'beach-sand-car-seats', 'cant-wash-a-car-seat'];

execSync('node white-site/build.mjs', { stdio: 'inherit' });

let refs = 0;
for (const p of PAGES) {
  let html = fs.readFileSync(`white-site/${p}.html`, 'utf8');
  html = html.replace(/\/white-site\/(alpine\.css|alpine\.js|transition\.js)/g, (m, f) => { refs++; return '/' + f; });
  if (/white-site\//.test(html)) throw new Error(`${p}: a /white-site/ reference survived`);
  fs.writeFileSync(`${p}.html`, html);
}
for (const f of ['alpine.css', 'alpine.js', 'transition.js']) fs.copyFileSync(`white-site/${f}`, f);
console.log(`adopted: ${PAGES.length} pages written to the root, ${refs} asset references repointed, alpine.css / alpine.js / transition.js copied to the root`);
