import fs from 'fs';

const files = [
  'account.html',
  'cart.html',
  'checkout.html',
  'collection.html',
  'confirmation.html',
  'contact.html',
  'faq.html',
  'product-contrast-white.html',
  'product-midnight-black.html',
  'returns.html',
  'search.html',
  'shipping.html'
];

const NAV_BEFORE = `
    nav::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(12,13,16,0.95);
      pointer-events: none;
      z-index: -1;
    }`;

for (const file of files) {
  const path = `/Users/samuelnguyen/Website Design/${file}`;
  let html = fs.readFileSync(path, 'utf8');
  const original = html;

  // ── Step 1: remove backdrop-filter from the nav {} rule only.
  // We target the nav rule by finding it and doing scoped replacements.
  // The nav rule always appears before .nav-logo, .nav-links, etc.
  // Strategy: replace the whole nav {...} block (multi-line or single-line) carefully.

  // Multi-line nav block: find opening `    nav {` up to first `    }`
  // Single-line nav block: `nav { ... }` on one line

  // We'll use a regex that matches the nav CSS block (everything from `    nav {` to its closing `}`)
  // and then apply transformations within that match.

  html = html.replace(
    /([ \t]*nav\s*\{[^}]*?\})/g,
    (match, p1) => {
      // Only process if this looks like the main nav rule (has backdrop-filter)
      if (!match.includes('backdrop-filter')) return match;
      // Skip if it's a class-modified nav (nav.scrolled, nav.search-active, etc.)
      if (/nav\.\w/.test(match.trim())) return match;
      // Skip mobile media query nav overrides (they're inside @media)
      // We can't easily detect this from just the match, so check content
      // The main nav rule has `position: fixed` or `position:fixed`
      if (!match.includes('position: fixed') && !match.includes('position:fixed')) return match;

      let fixed = match;
      // Remove backdrop-filter lines (multi-line format)
      fixed = fixed.replace(/\s*backdrop-filter:[^;]+;/g, '');
      fixed = fixed.replace(/\s*-webkit-backdrop-filter:[^;]+;/g, '');
      // Change background from semi-transparent to transparent
      fixed = fixed.replace(/background:\s*rgba\([^)]+\)/g, 'background: transparent');
      return fixed;
    }
  );

  // ── Step 2: also handle mobile media query overrides — remove backdrop-filter: none from them
  // since the nav no longer has backdrop-filter, we don't need to override it
  // (keep them harmless — removing backdrop-filter: none from nav in media queries)
  html = html.replace(
    /(@media[^{]*\{[^{}]*nav\s*\{[^}]*\}[^{}]*\})/gs,
    (mediaBlock) => {
      // Remove `backdrop-filter: none;` and `-webkit-backdrop-filter: none;` inside nav within @media
      return mediaBlock
        .replace(/\s*backdrop-filter:\s*none\s*;/g, '')
        .replace(/\s*-webkit-backdrop-filter:\s*none\s*;/g, '');
    }
  );

  // ── Step 3: insert nav::before after the main nav {} block
  // Find the end of the nav block and insert after it (only if not already present)
  if (!html.includes('nav::before')) {
    // Find the first `nav {` block closing `}` and insert after it
    html = html.replace(
      /(([ \t]*nav\s*\{[^}]*position:\s*fixed[^}]*\}))/,
      (match) => match + NAV_BEFORE
    );
  }

  if (html === original) {
    console.log(`⚠  ${file}: no changes made`);
  } else {
    fs.writeFileSync(path, html, 'utf8');
    console.log(`✅ ${file}: fixed`);
  }
}

console.log('\nDone. Verify with: grep -n "nav::before" *.html');
