import fs from 'fs';

const files = [
  'account.html',
  'cart.html',
  'checkout.html',
  'collection.html',
  'confirmation.html',
  'contact.html',
  'faq.html',
  'index.html',
  'product-contrast-white.html',
  'product-midnight-black.html',
  'returns.html',
  'search.html',
  'shipping.html'
];

const NON_HOME = files.filter(f => f !== 'index.html');

for (const file of files) {
  const path = `/Users/samuelnguyen/Website Design/${file}`;
  let html = fs.readFileSync(path, 'utf8');
  const original = html;

  // ── FIX 1: Simplify hamburger handler on ALL pages (click-only, remove touchend + _tapped)
  // Match the full hamburger JS block: let _tapped ... hamburger.addEventListener('click', ...)
  html = html.replace(
    /let _tapped = false;\s*hamburger\.addEventListener\('touchend',\s*\(e\)\s*=>\s*\{[^}]+\}\);\s*hamburger\.addEventListener\('click',\s*\(\)\s*=>\s*\{[^}]+\}\);/gs,
    `hamburger.addEventListener('click', () => {
        overlay.classList.contains('open') ? closeMenu() : openMenu();
      });`
  );

  if (file !== 'index.html') {
    // ── FIX 2: Replace nav::before with direct solid background on nav (non-home pages only)
    // Remove nav::before block
    html = html.replace(
      /\n\s*nav::before\s*\{[^}]*\}/g,
      ''
    );

    // ── FIX 3: On non-home pages, ensure main nav CSS is solid background, no backdrop-filter
    // Replace: background: transparent (from our previous fix) → background: rgba(12,13,16,0.97)
    html = html.replace(
      /(position:\s*fixed[^}]*?)background:\s*transparent([^}]*\})/gs,
      (match, before, after) => {
        // Only target nav rule (has position: fixed)
        if (!match.includes('display: flex') && !match.includes('display:flex')) return match;
        return before + 'background: rgba(12,13,16,0.97)' + after;
      }
    );

    // ── FIX 4: Remove all backdrop-filter from nav-related rules in mobile media queries
    // Clean the mobile nav override: remove backdrop-filter properties
    html = html.replace(
      /(@media[^{]*\{)([\s\S]*?)(\}(?:\s*@media|\s*<\/style>|\s*<\/head>|\s*\.mob-ol|\s*\.checkout|\s*\.order|\s*\.col-|\s*\.cart-|\s*\.page-|\s*\.back-|\s*\.step|\s*\.support|\s*\.ft-|\s*\.hero|\s*\.grid|\s*\.product|\s*\.faq|\s*\.acc|\s*\.form|\s*\/\*\s*─))/gs,
      (match, open, inner, close) => {
        // Remove backdrop-filter: none from nav rules inside media queries
        const cleaned = inner.replace(
          /(nav\s*\{[^}]*)backdrop-filter\s*:\s*none\s*;([^}]*\})/g,
          '$1$2'
        ).replace(
          /(nav\s*\{[^}]*)-webkit-backdrop-filter\s*:\s*none\s*;([^}]*\})/g,
          '$1$2'
        );
        return open + cleaned + close;
      }
    );
  }

  if (html === original) {
    console.log(`⚠  ${file}: no changes`);
  } else {
    fs.writeFileSync(path, html, 'utf8');
    console.log(`✅ ${file}: fixed`);
  }
}

console.log('\nVerification:');
for (const file of files) {
  const html = fs.readFileSync(`/Users/samuelnguyen/Website Design/${file}`, 'utf8');
  const hasTouchend = html.includes("addEventListener('touchend'");
  const hasTapped = html.includes('_tapped');
  const hasNavBefore = html.includes('nav::before');
  console.log(`${file}: touchend=${hasTouchend} _tapped=${hasTapped} nav::before=${hasNavBefore}`);
}
