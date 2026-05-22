import { readFileSync, writeFileSync } from 'fs';

const dir = '/Users/samuelnguyen/Website Design';
const pages = [
  'index.html', 'collection.html',
  'product-midnight-black.html', 'product-contrast-white.html',
  'cart.html', 'checkout.html', 'confirmation.html',
  'account.html', 'search.html',
  'faq.html', 'shipping.html', 'returns.html', 'contact.html',
];

const OLD = `<a href="search.html" class="mob-action"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Search</span></a>`;
const NEW = `<button class="mob-action" id="mob-search-btn" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Search</span></button>`;

for (const page of pages) {
  const path = `${dir}/${page}`;
  let html = readFileSync(path, 'utf8');
  if (html.includes(OLD)) {
    html = html.replaceAll(OLD, NEW);
    writeFileSync(path, html, 'utf8');
    console.log(`✓ fixed: ${page}`);
  } else if (html.includes('mob-search-btn')) {
    console.log(`— already has button: ${page}`);
  } else {
    console.log(`✗ no match found: ${page}`);
  }
}
