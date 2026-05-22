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

// ─── 1. FIX SEARCH ICON "WHITE BOX" ─────────────────────────────────────────
// .mob-action is used on <button> elements (mob-search-btn) but has no
// background:none / border:none reset → browser default button style shows
// as white box. Add the reset to all pages.

function fixMobActionBtn(html) {
  // The mob-action CSS block — add background: none; border: none; to it
  return html.replace(
    /\.mob-action\s*\{\s*\n(\s*display: flex; flex-direction: column; align-items: center; gap: 5px;\s*\n\s*color[^}]+\})/,
    `.mob-action {\n$1`.replace(
      'display: flex; flex-direction: column; align-items: center; gap: 5px;',
      'display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: none;'
    )
  );
}

// Safer version: just do a string replace on the specific content
function fixMobAction(html) {
  // The mob-action block always starts with this exact content
  const OLD = `display: flex; flex-direction: column; align-items: center; gap: 5px;
      color: rgba(237,232,223,0.5); text-decoration: none;
      touch-action: manipulation; -webkit-tap-highlight-color: transparent;
      padding: 8px 16px; transition: color 0.18s ease; min-width: 56px;`;
  const NEW = `display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: none;
      color: rgba(237,232,223,0.5); text-decoration: none;
      touch-action: manipulation; -webkit-tap-highlight-color: transparent;
      padding: 8px 16px; transition: color 0.18s ease; min-width: 56px;`;
  if (!html.includes(OLD)) {
    // Try single-line variant (some pages have it on one line)
    return html.replace(
      /\.mob-action\s*\{\s*\n?\s*display: flex; flex-direction: column; align-items: center; gap: 5px;\s*\n?\s*color: rgba\(237,232,223,0\.5\)/,
      '.mob-action {\n      display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: none;\n      color: rgba(237,232,223,0.5)'
    );
  }
  return html.replace(OLD, NEW);
}

// ─── 2. FIX FOOTER ACCORDION — PRODUCT PAGES ─────────────────────────────────
// Desktop .ft-col ul { display: flex } comes AFTER the @media block that sets
// display: none, so on mobile all accordion items are pre-expanded.
// Fix: add !important to the mobile none/flex rules.

function fixFtColAccordion(html) {
  html = html.replace(
    '.ft-col ul { display: none; padding-bottom: 14px; }',
    '.ft-col ul { display: none !important; padding-bottom: 14px; }'
  );
  html = html.replace(
    '.ft-col.open ul { display: flex; }',
    '.ft-col.open ul { display: flex !important; }'
  );
  return html;
}

// ─── 3. FIX CHECKOUT HAMBURGER — MOB OVERLAY AFTER SCRIPTS ──────────────────
// The mob-overlay <div> was placed AFTER the </script> tags, so
// getElementById('mob-overlay') returns null when the IIFE runs → listener never attaches.
// Fix: move mob-overlay to just before the first <script> (after </footer>).

function fixCheckoutOverlayOrder(html) {
  // Extract the mob-overlay block
  const start = '\n\n  <div class="mob-overlay" id="mob-overlay"';
  const startIdx = html.indexOf(start);
  if (startIdx === -1) {
    console.log('  ! Could not find mob-overlay start');
    return html;
  }
  // Find the closing </div>\n</body> — mob-overlay is last div before </body>
  const endMarker = '\n</body>';
  const endIdx = html.lastIndexOf(endMarker);
  if (endIdx === -1) {
    console.log('  ! Could not find </body>');
    return html;
  }

  const overlayHtml = html.slice(startIdx, endIdx);
  // Remove from original location
  html = html.slice(0, startIdx) + '\n</body>' + html.slice(endIdx + '\n</body>'.length);

  // Find insertion point: just before the first <script> after </footer>
  const footerEnd = html.indexOf('</footer>');
  if (footerEnd === -1) {
    console.log('  ! Could not find </footer>');
    return html;
  }
  const afterFooter = footerEnd + '</footer>'.length;
  const insertPoint = html.indexOf('\n\n  <script>', afterFooter);
  if (insertPoint === -1) {
    // Try single newline
    const insertPoint2 = html.indexOf('\n  <script>', afterFooter);
    if (insertPoint2 === -1) {
      console.log('  ! Could not find <script> after </footer>');
      return html;
    }
    return html.slice(0, insertPoint2) + overlayHtml + '\n' + html.slice(insertPoint2);
  }
  return html.slice(0, insertPoint) + overlayHtml + '\n' + html.slice(insertPoint);
}

// ─── 4. FIX CHECKOUT SEARCH ICON — STILL AN <a> TAG ─────────────────────────
// The mob-search-btn replacement script matched the wrong format for checkout.html
// (which had aria-label on the anchor). Fix it directly.

function fixCheckoutSearchBtn(html) {
  // Replace the search anchor with aria-label in checkout overlay
  const OLD = `        <a href="search.html" class="mob-action" aria-label="Search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Search</span>
        </a>`;
  const NEW = `        <button class="mob-action" id="mob-search-btn" aria-label="Search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Search</span>
        </button>`;
  return html.replace(OLD, NEW);
}

// ─── 5. FIX CORRUPTED CSS IN CHECKOUT ───────────────────────────────────────
// Lines with ".mob-ol-" and ".mob-overlay.open .mob-ol-" are truncated selectors
// that corrupt the mob-ol-actions rule. Remove them.

function fixCheckoutCorruptedCSS(html) {
  html = html.replace(
    '\n    .mob-ol-\n    .mob-overlay.open .mob-ol-\n    .mob-ol-actions { display: flex; gap: 0; }',
    '\n    .mob-ol-actions { display: flex; gap: 0; }'
  );
  return html;
}

// ─── APPLY ───────────────────────────────────────────────────────────────────

for (const page of ALL_PAGES) {
  let html = read(page);

  // Fix 1: search icon white box
  html = fixMobAction(html);

  // Fix 2: product accordion
  if (page.startsWith('product-')) {
    html = fixFtColAccordion(html);
  }

  // Fix 3+4+5: checkout specific
  if (page === 'checkout.html') {
    html = fixCheckoutCorruptedCSS(html);
    html = fixCheckoutSearchBtn(html);
    html = fixCheckoutOverlayOrder(html);
  }

  write(page, html);
}
