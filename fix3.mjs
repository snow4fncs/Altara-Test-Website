import { readFileSync, writeFileSync } from 'fs';

const dir = '/Users/samuelnguyen/Website Design';
const read  = f => readFileSync(`${dir}/${f}`, 'utf8');
const write = (f, c) => { writeFileSync(`${dir}/${f}`, c, 'utf8'); console.log('✓ ' + f); };

const ALL_PAGES = [
  'index.html', 'collection.html',
  'product-midnight-black.html', 'product-contrast-white.html',
  'cart.html', 'checkout.html', 'confirmation.html',
  'account.html', 'search.html',
  'faq.html', 'shipping.html', 'returns.html', 'contact.html',
];

// ─── 1. HTML OVERFLOW-X HIDDEN (prevents lateral scroll on iOS) ───────────────
// Strategy: find the html rule and inject overflow-x: hidden; or add it to html,body rule.

function fixHtmlOverflow(html) {
  // Case A: html, body { height: 100%; }  → add overflow-x: hidden
  if (html.includes('html, body { height: 100%; }')) {
    html = html.replace(
      'html, body { height: 100%; }',
      'html, body { height: 100%; overflow-x: hidden; }'
    );
    return html;
  }
  // Case B: html { scroll-behavior: smooth; }  (index.html)
  if (html.includes('html { scroll-behavior: smooth; }')) {
    html = html.replace(
      'html { scroll-behavior: smooth; }',
      'html { scroll-behavior: smooth; overflow-x: hidden; }'
    );
    return html;
  }
  // Case C: no html rule, just body — insert html rule before body rule
  if (!html.includes('html {') && !html.includes('html,')) {
    // Find body { and insert html rule before it
    html = html.replace(
      /(\s*body\s*\{[^}]*overflow-x:\s*hidden[^}]*\})/,
      '\n    html { overflow-x: hidden; }$1'
    );
  }
  return html;
}

// ─── 2. PRODUCT PAGES — FIX .ft FOOTER CASCADE + MOBILE PADDING ─────────────
// The desktop .ft { grid-template-columns: 2fr 1fr 1fr 1fr } comes AFTER
// the @media (max-width:768px) block, overriding mobile's 1fr override.
// Fix: add !important to the mobile grid-template-columns rule,
//      and add footer { padding: 44px 24px 36px } to the mobile @media block.

function fixProductFooter(html) {
  // Add !important to mobile .ft grid-template-columns
  html = html.replace(
    /\.ft\s*\{\s*grid-template-columns:\s*1fr;\s*gap:\s*0;\s*padding-bottom:\s*0;\s*border-bottom:\s*none;\s*\}/,
    '.ft { grid-template-columns: 1fr !important; gap: 0; padding-bottom: 0; border-bottom: none; }'
  );

  // Add mobile footer padding override if not already there
  // Insert before the closing brace of @media (max-width: 768px)
  if (!html.includes('footer { padding: 44px 24px')) {
    // Find the spot: .ft-social { flex-wrap: wrap ... } is the last rule in the mobile block
    html = html.replace(
      /(\s*\.ft-social\s*\{\s*flex-wrap:\s*wrap[^}]*\})\s*\n(\s*\})/,
      '$1\n      footer { padding: 44px 24px 36px; }\n$2'
    );
  }
  return html;
}

// ─── 3. COLLECTION PAGE — ADD MISSING DESKTOP .ft CSS ────────────────────────
// collection.html has .ft HTML but zero desktop .ft CSS → footer is unstyled on desktop.
// Insert the full .ft desktop block before the @media (max-width: 768px) block.

const FT_DESKTOP_CSS = `    /* ─── FOOTER ─── */
    footer { background: var(--bg); border-top: 1px solid var(--border); padding: 72px 72px 44px; }
    .ft { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 56px; padding-bottom: 64px; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .ft-logo img { height: 110px; filter: brightness(0) invert(1); opacity: 0.5; display: block; margin-bottom: 22px; }
    .ft-tag { font-size: 13px; color: var(--muted); line-height: 1.75; font-weight: 300; max-width: 240px; }
    .ft-col h4 { font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(237,232,223,0.5); margin-bottom: 22px; }
    .ft-col ul { list-style: none; display: flex; flex-direction: column; gap: 14px; }
    .ft-col ul a { font-size: 13px; color: var(--muted); text-decoration: none; font-weight: 300; transition: color 0.2s; }
    .ft-col ul a:hover { color: rgba(237,232,223,0.72); }
    .ft-bot { display: flex; align-items: center; justify-content: space-between; padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.07); }
    .ft-copy { font-size: 11.5px; color: var(--muted); font-weight: 300; }
    .ft-em { font-size: 11.5px; color: var(--muted); letter-spacing: 0.04em; font-style: normal; }
    .ft-social { border-top: 1px solid rgba(255,255,255,0.07); padding: 28px 0 32px; display: flex; align-items: center; gap: 28px; }
    .ft-social h4 { font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(237,232,223,0.5); margin: 0; }
    .ft-social-icons { display: flex; gap: 14px; align-items: center; }
    .ft-social-link { color: var(--muted); text-decoration: none; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; transition: color 0.2s ease, border-color 0.2s ease; }
    .ft-social-link:hover { color: var(--cream); border-color: rgba(237,232,223,0.3); }
    .ft-social-link svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
`;

function fixCollectionFooter(html) {
  // Only add if desktop .ft CSS is missing
  if (html.includes('.ft { display: grid')) return html;

  // Remove the orphaned .footer-grid CSS section added by fix-all.mjs
  // (it has footer { ... } and .footer-grid { ... } which are unused since HTML uses .ft)
  // We'll replace: "    footer { background: var(--bg); border-top: 1px solid var(--border); padding: 72px 72px 44px; }"
  // which sits after the @media block, with nothing (our new CSS block goes before the @media block instead)
  html = html.replace(
    /\n    \/\* ─── FOOTER ─── \*\/\n    footer \{ background: var\(--bg\)[^}]+\}\n    \.footer-grid[^<]+(?=\n    \/\* ─── MOB)/s,
    '\n'
  );

  // Insert full .ft desktop CSS before the @media (max-width: 768px) block
  html = html.replace(
    /(\n    @media \(max-width: 768px\) \{)/,
    '\n' + FT_DESKTOP_CSS + '$1'
  );

  // Add mobile footer padding override inside mobile @media block
  if (!html.includes('footer { padding: 44px 24px')) {
    html = html.replace(
      /(\s*\.ft-social\s*\{\s*flex-wrap:\s*wrap[^}]*\})\s*\n(\s*\})/,
      '$1\n      footer { padding: 44px 24px 36px; }\n$2'
    );
  }
  return html;
}

// ─── APPLY ───────────────────────────────────────────────────────────────────

for (const page of ALL_PAGES) {
  let html = read(page);

  // Fix 1: html overflow-x
  if (!html.includes('html.*overflow-x') && !html.includes('overflow-x: hidden') || !html.match(/html[^{]*\{[^}]*overflow-x/)) {
    html = fixHtmlOverflow(html);
  }

  // Fix 2: product page footer
  if (page.startsWith('product-')) {
    html = fixProductFooter(html);
  }

  // Fix 3: collection footer
  if (page === 'collection.html') {
    html = fixCollectionFooter(html);
  }

  write(page, html);
}
