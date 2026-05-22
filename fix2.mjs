import { readFileSync, writeFileSync } from 'fs';
const dir = '/Users/samuelnguyen/Website Design';
const read = f => readFileSync(`${dir}/${f}`, 'utf8');
const write = (f, c) => { writeFileSync(`${dir}/${f}`, c, 'utf8'); console.log('✓ ' + f); };

// ─── 1. FIX FOOTER CSS ORDER ─────────────────────────────────────────────────
// Pages where footer desktop CSS was inserted AFTER the @media block —
// mobile overrides are being overridden by later desktop rules.
// Fix: strip footer mobile rules from inside @media, add a new @media AFTER footer CSS.

const FOOTER_MOBILE_BLOCK = `
  @media (max-width: __BP__px) {
    footer { padding: 44px 24px 36px; }
    .footer-grid { grid-template-columns: 1fr; gap: 0; margin-bottom: 0; }
    .footer-logo img { height: 80px; margin-bottom: 14px; }
    .footer-tagline { margin-bottom: 28px; }
    .footer-col { border-top: 1px solid var(--border); }
    .footer-col h4 { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; margin-bottom: 0; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    .footer-col h4::after { content: '+'; font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 300; opacity: 0.4; transition: transform 0.3s ease; line-height: 1; }
    .footer-col.open h4::after { transform: rotate(45deg); }
    .footer-col ul { display: none; padding-bottom: 16px; }
    .footer-col.open ul { display: flex; }
    .footer-social { flex-wrap: wrap; padding: 18px 0 22px; gap: 14px; }
    .footer-bottom { flex-direction: column; gap: 8px; text-align: center; }
  }`;

const FOOTER_MOBILE_RULES = [
  /\n?\s*footer\s*\{\s*padding:\s*44px[^}]*\}/g,
  /\n?\s*\.footer-grid\s*\{\s*grid-template-columns:\s*1fr[^}]*\}/g,
  /\n?\s*\.footer-logo\s+img\s*\{\s*height:\s*80px[^}]*\}/g,
  /\n?\s*\.footer-tagline\s*\{\s*margin-bottom:\s*28px[^}]*\}/g,
  /\n?\s*\.footer-col\s*\{\s*border-top:[^}]*\}/g,
  /\n?\s*\.footer-col\s+h4\s*\{\s*display:\s*flex;\s*justify-content:\s*space-between[^}]*\}/g,
  /\n?\s*\.footer-col\s+h4::after\s*\{\s*content:\s*'\+'[^}]*\}/g,
  /\n?\s*\.footer-col\.open\s+h4::after\s*\{[^}]*\}/g,
  /\n?\s*\.footer-col\s+ul\s*\{\s*display:\s*none[^}]*\}/g,
  /\n?\s*\.footer-col\.open\s+ul\s*\{[^}]*\}/g,
  /\n?\s*\.footer-social\s*\{\s*flex-wrap[^}]*\}/g,
  /\n?\s*\.footer-bottom\s*\{\s*flex-direction:\s*column[^}]*\}/g,
];

function fixFooterCSSOrder(html, bp) {
  // 1. Remove footer mobile rules from inside @media blocks
  for (const rx of FOOTER_MOBILE_RULES) {
    html = html.replace(rx, '');
  }
  // 2. Insert new @media block with proper breakpoint AFTER the last footer CSS rule, before </style>
  const block = FOOTER_MOBILE_BLOCK.replace('__BP__', bp);
  html = html.replace(/(\s*<\/style>)/, block + '\n$1');
  return html;
}

// ─── 2. MOB OVERLAY — ADD INLINE SEARCH INPUT ────────────────────────────────
const MOB_SEARCH_CSS = `
    /* ─── MOB OVERLAY INLINE SEARCH ─── */
    .mob-search-bar { display: none; align-items: center; gap: 12px; padding: 14px 24px; border-bottom: 1px solid var(--border); background: var(--bg); flex-shrink: 0; }
    .mob-search-bar.open { display: flex; }
    .mob-search-input-wrap { flex: 1; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.18); }
    .mob-search-input-wrap svg { width: 16px; height: 16px; stroke: rgba(237,232,223,0.4); fill: none; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
    .mob-search-field { flex: 1; background: none; border: none; color: var(--cream); font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 300; padding: 8px 0; outline: none; caret-color: var(--gold); letter-spacing: 0.02em; }
    .mob-search-field::placeholder { color: rgba(237,232,223,0.28); }
    .mob-search-submit { background: none; border: none; color: var(--gold); font-size: 20px; padding: 0 0 0 8px; cursor: pointer; line-height: 1; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }`;

const MOB_SEARCH_HTML = `  <div class="mob-search-bar" id="mob-search-bar" aria-hidden="true">
    <form class="mob-search-input-wrap" action="search.html" method="get" id="mob-search-form">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="mob-search-field" type="search" name="q" placeholder="Search products…" autocomplete="off" id="mob-search-field" aria-label="Search">
    </form>
    <button class="mob-search-submit" type="submit" form="mob-search-form" aria-label="Submit search">→</button>
  </div>`;

const MOB_SEARCH_JS = `
  // Mobile overlay inline search
  (function() {
    const searchBtn = document.getElementById('mob-search-btn');
    const searchBar = document.getElementById('mob-search-bar');
    const searchField = document.getElementById('mob-search-field');
    if (!searchBtn || !searchBar) return;
    searchBtn.addEventListener('click', () => {
      const open = searchBar.classList.toggle('open');
      searchBar.setAttribute('aria-hidden', String(!open));
      if (open && searchField) { setTimeout(() => searchField.focus(), 60); }
    });
  })();`;

// Replace <a href="search.html" class="mob-action"> with a button
function addMobSearch(html) {
  // Replace search link in mob-ol-header-right with a button
  html = html.replace(
    /<a href="search\.html" class="mob-action"[^>]*>\s*<svg viewBox="0 0 24 24"><circle[^<]*<\/circle><line[^<]*<\/line><\/svg>\s*<span>Search<\/span>\s*<\/a>/g,
    `<button class="mob-action" id="mob-search-btn" aria-label="Search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Search</span>
        </button>`
  );
  // Add search bar HTML after mob-ol-header div (before mob-ol-body)
  if (!html.includes('mob-search-bar')) {
    html = html.replace(
      /(<\/div>\s*\n\s*<div class="mob-ol-body">)/,
      `</div>\n${MOB_SEARCH_HTML}\n  <div class="mob-ol-body">`
    );
  }
  // Add CSS before </style>
  if (!html.includes('mob-search-bar')) {
    html = html.replace('</style>', MOB_SEARCH_CSS + '\n  </style>');
  }
  // Add JS before last </script>
  if (!html.includes('mob-search-btn')) {
    const lastScript = html.lastIndexOf('</script>');
    if (lastScript !== -1) html = html.slice(0, lastScript) + MOB_SEARCH_JS + '\n  ' + html.slice(lastScript);
  }
  return html;
}

// ─── 3. PRODUCT IMAGE — REMOVE RIGHT-SIDE GRADIENT ──────────────────────────
function fixProductGradient(html) {
  // Remove the left-direction gradient that causes black fade on right side of product image
  // Keep only the bottom gradient (to top) which provides a natural grounding effect
  html = html.replace(
    /\.ph-image-area::after\s*\{[^}]*background:[^}]*linear-gradient[^}]*\}/g,
    `.ph-image-area::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 15%; background: linear-gradient(to top, var(--bg) 0%, transparent 100%); pointer-events: none; z-index: 1; }`
  );
  return html;
}

// ─── APPLY FIXES ─────────────────────────────────────────────────────────────

// Footer CSS order fix (only pages where desktop CSS was appended after mobile @media)
const FOOTER_ORDER_PAGES = {
  'cart.html': 900,
  'checkout.html': 768,
  'confirmation.html': 768,
  'account.html': 768,
  'search.html': 768,
};

// Mob search: all pages
const ALL_PAGES = [
  'index.html', 'collection.html',
  'product-midnight-black.html', 'product-contrast-white.html',
  'cart.html', 'checkout.html', 'confirmation.html',
  'account.html', 'search.html',
  'faq.html', 'shipping.html', 'returns.html', 'contact.html',
];

for (const [page, bp] of Object.entries(FOOTER_ORDER_PAGES)) {
  let html = read(page);
  html = fixFooterCSSOrder(html, bp);
  write(page, html);
}

// Mob search and product gradient
for (const page of ALL_PAGES) {
  let html = read(page);
  html = addMobSearch(html);
  if (page.startsWith('product-')) html = fixProductGradient(html);
  write(page, html);
}
