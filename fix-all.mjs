import { readFileSync, writeFileSync } from 'fs';

const dir = '/Users/samuelnguyen/Website Design';

// ─── STANDARD FOOTER CSS ──────────────────────────────────────────────────────
const FOOTER_CSS = `
    /* ─── FOOTER ─── */
    footer { background: var(--bg); border-top: 1px solid var(--border); padding: 72px 72px 44px; }
    .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 56px; margin-bottom: 64px; }
    .footer-logo img { height: 110px; filter: brightness(0) invert(1); opacity: 0.5; display: block; margin-bottom: 22px; }
    .footer-tagline { font-size: 13px; font-weight: 300; color: var(--muted); line-height: 1.75; max-width: 240px; }
    .footer-col h4 { font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(237,232,223,0.5); margin-bottom: 22px; }
    .footer-col ul { list-style: none; display: flex; flex-direction: column; gap: 14px; }
    .footer-col ul a { font-size: 13px; font-weight: 300; color: var(--muted); text-decoration: none; transition: color 0.2s ease; }
    .footer-col ul a:hover { color: var(--cream-dim); }
    .footer-bottom { border-top: 1px solid var(--border); padding-top: 32px; display: flex; justify-content: space-between; align-items: center; }
    .footer-bottom p { font-size: 11.5px; font-weight: 300; color: var(--muted); }
    .footer-social { border-top: 1px solid var(--border); padding: 28px 0 32px; display: flex; align-items: center; gap: 28px; }
    .footer-social h4 { font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(237,232,223,0.5); margin: 0; }
    .footer-social-icons { display: flex; gap: 14px; align-items: center; }
    .social-icon { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; color: var(--muted); text-decoration: none; transition: color 0.2s, border-color 0.2s; }
    .social-icon:hover { color: var(--cream); border-color: rgba(237,232,223,0.3); }
    .social-icon svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }`;

// ─── FOOTER MOBILE CSS (appended into existing @media block) ─────────────────
const FOOTER_MOBILE_CSS = `
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
      .footer-bottom { flex-direction: column; gap: 8px; text-align: center; }`;

// ─── STANDARD FOOTER HTML ─────────────────────────────────────────────────────
const FOOTER_HTML = `  <footer>
  <div class="footer-grid">
    <div>
      <div class="footer-logo">
        <img src="brand assets/Altara Brand Logo.png" alt="Altara">
      </div>
      <p class="footer-tagline">Engineered comfort for modern movement. Premium seat covers built for the way you live.</p>
    </div>
    <div class="footer-col">
      <h4>Product</h4>
      <ul>
        <li><a href="collection.html">Seat Covers</a></li>
        <li><a href="collection.html">Collections</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Support</h4>
      <ul>
        <li><a href="faq.html">FAQ</a></li>
        <li><a href="shipping.html">Shipping</a></li>
        <li><a href="returns.html">Returns</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <ul>
        <li><a href="#">About</a></li>
        <li><a href="#">Privacy Policy</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-social">
    <h4>Follow Us</h4>
    <div class="footer-social-icons">
      <a href="https://instagram.com/altara.au" class="social-icon" aria-label="Instagram" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
      </a>
      <a href="https://facebook.com/altara" class="social-icon" aria-label="Facebook" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
      </a>
    </div>
  </div>
  <div class="footer-bottom">
    <p>© 2026 Altara. All rights reserved.</p>
    <p>Engineered comfort for modern movement.</p>
  </div>
</footer>`;

// ─── FOOTER ACCORDION JS ──────────────────────────────────────────────────────
const FOOTER_JS = `\n  // Footer accordion (mobile)\n  document.querySelectorAll('.footer-col h4').forEach(h4 => {\n    h4.addEventListener('click', () => { h4.parentElement.classList.toggle('open'); });\n  });\n`;

// ─── AUTO-HIDE NAV JS (replaces simple scroll handler) ───────────────────────
const AUTO_HIDE_JS = `(function() {
    let lastY = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y > lastY + 4 && y > 80) {
        nav.style.transform = 'translateY(-100%)';
      } else if (y < lastY - 4 || y <= 80) {
        nav.style.transform = 'translateY(0)';
      }
      nav.classList.toggle('scrolled', y > 50);
      lastY = y;
    }, { passive: true });
  })();`;

// ─── SIMPLE FOOTER OLD PATTERN (what cart/checkout/account/search/confirmation have) ─
const SIMPLE_FOOTER_REGEX = /<footer>[\s\S]*?<\/footer>/;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function read(f) { return readFileSync(`${dir}/${f}`, 'utf8'); }
function write(f, content) { writeFileSync(`${dir}/${f}`, content, 'utf8'); console.log(`✓ ${f}`); }

function addFooterCSS(html) {
  // Only add if footer-grid not already defined
  if (html.includes('.footer-grid')) {
    // Already has footer CSS - just ensure .social-icon is present
    if (!html.includes('.social-icon')) {
      html = html.replace('.footer-social-icons {', `.social-icon { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; color: var(--muted); text-decoration: none; transition: color 0.2s, border-color 0.2s; }\n    .social-icon:hover { color: var(--cream); border-color: rgba(237,232,223,0.3); }\n    .social-icon svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }\n    .footer-social-icons {`);
    }
    return html;
  }
  // Remove old footer CSS rules
  html = html.replace(/\n?\s*\/\* ─+ FOOTER ─+ \*\/[\s\S]*?(?=\n\s*\/\*|\n\s*<\/style>)/g, '');
  html = html.replace(/\n?\s*footer\s*\{[^}]*\}/g, '');
  html = html.replace(/\n?\s*\.footer-logo[^{]*\{[^}]*\}/g, '');
  html = html.replace(/\n?\s*\.footer-bottom[^{]*\{[^}]*\}/g, '');
  // Insert footer CSS before </style>
  html = html.replace('</style>', FOOTER_CSS + '\n  </style>');
  return html;
}

function addFooterMobileCSS(html, breakpoint = 768) {
  if (html.includes('.footer-col h4::after')) return html; // already has it
  // Find the @media block and inject before closing }
  const mediaRegex = new RegExp(`@media \\(max-width: ${breakpoint}px\\) \\{([\\s\\S]*?)\\n\\s*\\}(?=\\s*</style>)`);
  if (mediaRegex.test(html)) {
    html = html.replace(mediaRegex, (m, inner) => m.replace(inner, inner + FOOTER_MOBILE_CSS));
  }
  return html;
}

function replaceSimpleFooter(html) {
  if (html.includes('footer-grid')) return html; // already has full footer
  return html.replace(SIMPLE_FOOTER_REGEX, FOOTER_HTML);
}

function addFooterJS(html) {
  if (html.includes("footer-col h4")) {
    // Check if the JS handler exists (not just CSS)
    if (html.includes("footer-col h4').forEach")) return html;
  }
  // Insert footer accordion JS before </script> (last occurrence before mob-overlay)
  // Find a good insertion point - before the closing of the main script block
  html = html.replace(/(\/\/ Mobile hamburger menu|\/\/ Footer accordion|\}\)\(\);\s*<\/script>(?![\s\S]*<\/script>))/,
    (m) => FOOTER_JS + m
  );
  if (!html.includes("footer-col h4').forEach")) {
    // Fallback: add before last </script>
    const lastScript = html.lastIndexOf('</script>');
    if (lastScript !== -1) {
      html = html.slice(0, lastScript) + FOOTER_JS + html.slice(lastScript);
    }
  }
  return html;
}

function addAutoHideNav(html) {
  if (html.includes('lastY') || html.includes('lastScrollY')) return html; // already done
  // Replace simple scroll toggle with auto-hide version
  html = html.replace(
    /window\.addEventListener\('scroll',\s*\(\)\s*=>\s*\{\s*\n?\s*nav\.classList\.toggle\('scrolled',\s*(?:window\.)?scrollY\s*>\s*\d+\);\s*\n?\s*\},?\s*\{?\s*passive:\s*true\s*\}?\s*\);/g,
    AUTO_HIDE_JS
  );
  // Also handle variant without { passive: true }
  html = html.replace(
    /window\.addEventListener\('scroll',\s*\(\)\s*=>\s*\{\s*\n?\s*nav\.classList\.toggle\('scrolled',\s*(?:window\.)?scrollY\s*>\s*\d+\);\s*\n?\s*\}\);/g,
    AUTO_HIDE_JS
  );
  // Handle variant: scrollY > 30 or 50
  html = html.replace(
    /window\.addEventListener\('scroll',\s*\(\)\s*=>\s*nav\.classList\.toggle\('scrolled',\s*(?:window\.)?scrollY\s*>\s*\d+\),\s*\{\s*passive:\s*true\s*\}\);/g,
    AUTO_HIDE_JS
  );
  return html;
}

function addNavTransition(html) {
  if (html.includes('transform 0.35s')) return html;
  // Add transform to the nav transition property
  html = html.replace(
    /(nav\s*\{[^}]*transition:\s*)([^;]+)(;)/,
    (m, pre, val, semi) => {
      if (val.includes('transform')) return m;
      return pre + val.trim() + ', transform 0.35s ease' + semi;
    }
  );
  return html;
}

function fixMobileNav(html, breakpoint = 768) {
  // Ensure nav-center, search-btn, account link are hidden on mobile
  const mediaRegex = new RegExp(`(@media \\(max-width: ${breakpoint}px\\) \\{)([\\s\\S]*?)(\\n\\s*\\}(?=\\s*</style>))`, 'g');
  html = html.replace(mediaRegex, (m, open, inner, close) => {
    let fixed = inner;
    if (!fixed.includes('.nav-center { display: none')) {
      fixed += `\n      .nav-center { display: none !important; }`;
    }
    if (!fixed.includes('#search-open-btn')) {
      fixed += `\n      #search-open-btn { display: none; }`;
    }
    if (!fixed.includes('a[href="account.html"]')) {
      fixed += `\n      .nav-actions a[href="account.html"] { display: none; }`;
    }
    return open + fixed + close;
  });
  return html;
}

function fixStepsBarMobile(html) {
  // Replace old steps bar mobile CSS or add if missing
  if (html.includes('.step-line { width: 20px')) return html; // already compact
  const mediaMatch = html.match(/@media \(max-width: (\d+)px\)/);
  if (!mediaMatch) return html;
  const bp = mediaMatch[1];
  const compactSteps = `\n      .steps-bar { padding: 10px 16px; gap: 8px; }
      .back-btn { position: static; font-size: 9px; letter-spacing: 0.1em; }
      .checkout-steps { flex: 1; justify-content: flex-end; gap: 0; }
      .step { font-size: 8px; gap: 5px; letter-spacing: 0.1em; }
      .step-num { width: 16px; height: 16px; font-size: 7px; }
      .step-line { width: 16px; margin: 0 5px; }`;
  const mediaRegex = new RegExp(`(@media \\(max-width: ${bp}px\\) \\{)([\\s\\S]*?)(\\n\\s*\\}(?=\\s*</style>))`, 'g');
  html = html.replace(mediaRegex, (m, open, inner, close) => {
    if (!inner.includes('.steps-bar')) {
      return open + inner + compactSteps + close;
    }
    return m;
  });
  return html;
}

function normalizeOverlay(html) {
  // Fix overlays that have .mob-ol-actions wrapper inside .mob-ol-header-right
  // Convert to flat structure (direct children of mob-ol-header-right)
  html = html.replace(
    /(<div class="mob-ol-header-right">)\s*<div class="mob-ol-actions">([\s\S]*?)<\/div>\s*(<button class="mob-close")/g,
    (m, headerRight, actions, closeBtn) => headerRight + '\n        ' + actions.trim() + '\n        ' + closeBtn
  );
  return html;
}

function removeImageFade(html) {
  // Remove the fade class mechanism from thumbnail JS - just do instant swap
  html = html.replace(
    /btn\.classList\.add\('active'\);\s*\n?\s*mainImg\.classList\.add\('fade'\);\s*\n?\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\d+\);/g,
    `btn.classList.add('active');
      mainImg.src = btn.dataset.src;`
  );
  // Also remove the .ph-main-img.fade CSS rule (keep transition for smoothness)
  html = html.replace(/\s*\.ph-main-img\.fade\s*\{[^}]*\}/g, '');
  // Remove fade class from transition - just keep opacity transition for natural load
  html = html.replace(/(\.ph-main-img\s*\{[^}]*)transition:\s*opacity[^;]*;/, '$1');
  return html;
}

// ─── ALL PAGES ────────────────────────────────────────────────────────────────
const ALL_PAGES = [
  'index.html', 'collection.html',
  'product-midnight-black.html', 'product-contrast-white.html',
  'cart.html', 'checkout.html', 'confirmation.html',
  'account.html', 'search.html',
  'faq.html', 'shipping.html', 'returns.html', 'contact.html'
];

// Pages that need FULL footer replacement (currently have simple logo+copyright footer)
const NEEDS_FULL_FOOTER = ['cart.html', 'checkout.html', 'confirmation.html', 'account.html', 'search.html'];

// Pages with checkout steps bar
const HAS_STEPS_BAR = ['cart.html', 'checkout.html', 'confirmation.html'];

for (const page of ALL_PAGES) {
  try {
    let html = read(page);

    // 1. Auto-hide nav for ALL pages
    html = addAutoHideNav(html);
    html = addNavTransition(html);

    // 2. Footer fixes
    if (NEEDS_FULL_FOOTER.includes(page)) {
      html = replaceSimpleFooter(html);
      html = addFooterCSS(html);
    } else {
      // Ensure social-icon CSS exists
      html = addFooterCSS(html);
    }

    // 3. Mobile footer CSS
    const bp = html.includes('@media (max-width: 900px)') ? 900 : 768;
    html = addFooterMobileCSS(html, bp);

    // 4. Footer accordion JS
    html = addFooterJS(html);

    // 5. Mobile nav fixes (hide desktop links/icons on mobile)
    html = fixMobileNav(html, bp);

    // 6. Steps bar compact on mobile
    if (HAS_STEPS_BAR.includes(page)) {
      html = fixStepsBarMobile(html);
    }

    // 7. Normalize overlay HTML (remove .mob-ol-actions wrapper)
    html = normalizeOverlay(html);

    // 8. Remove image fade effect on product pages
    if (page.startsWith('product-')) {
      html = removeImageFade(html);
    }

    write(page, html);
  } catch (e) {
    console.error(`✗ ${page}: ${e.message}`);
  }
}
