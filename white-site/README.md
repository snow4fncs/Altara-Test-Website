# Altara · Alpine edition (white theme)

**Adopted as the live site on 10 Nov 2026.** The root pages (`index.html`, `product-*.html`, `cart.html` and the rest) *are* the white edition now, with `alpine.css`, `alpine.js` and `transition.js` at the repo root. Edit those files directly; `node serve.mjs` serves the site at http://localhost:3000 exactly as production does (clean URLs, Range requests, `/api/create-checkout` forwarded to production so Checkout opens Stripe).

This folder keeps the tooling that built and tested the edition. `build.mjs` (dark pages → white pages) and `adopt.mjs` (white pages → root) have done their job and now refuse to run against white root pages; they stay for the record of how the conversion worked. Generated `white-site/*.html` copies are git-ignored.

## What the edition is

The live site's own design — Cormorant Garamond headings, Outfit text, italic second lines, photography that bleeds into the page — on a white base, every image box capped so each section fits one laptop screen. Palette from `brand assets/Altara Brand Guidelines.png`: white page, Alpine Stone #F4F1EA, Graphite #151719, Slate #5E6873, Warm Taupe accents, and `--alp-gold` #8E6D2D for savings and free shipping. Text passes WCAG AA.

- `alpine.css` carries the layout: hero `calc(100svh - 40px)` max 820px with the photo at full strength (narrow eased edge fade, `center top` crop, 1600px srcset asset); collection tiles max 470px; showcase and craft sections ≤ ~715px with full-bleed photos from the sharpest files (`img5-wide.webp`, `img6-full.jpg`); stone bands and cards; square tracked buttons; solid sticky bars on phones; hero, showcase and craft stack on tablets and phones.
- Product pages (desktop ≥1101px): six photos per colourway in a two-column grid of uncropped 4:5 cells (Midnight Black: img7, img9, twin set, img5, img6, img10; Contrast White: img1, img2, twin set, img3, img8, img4), the long tail of the buy column (description, accordions, ref, fitting video, quotes, fit note) in a `.ph-more` band under the grid, and the grid pinned by its bottom edge (`--gal-top`) so it rides with the buy column on laptops. Click any photo for the viewer (arrows, keys, scroll, swipe). Phones keep the single large photo with thumbnails; a deliberate sideways swipe on the large photo (64px, mostly horizontal, no wrap at the ends) moves to the next one, and a tap still opens the viewer. `probe-swipe.mjs` drives real touch gestures to check the thresholds. On phones the other colourway tile opens on one tap: a clean tap (under 10px of travel and 600ms) opens it from the touch itself, because iPhone Safari spends a tap that lands while the page still glides after a swipe on stopping the glide. Drags, long presses, mouse, keyboard and VoiceOver use the plain link. `probe-colourway-tap.mjs` checks it.
- Checkout never asks for an email: Stripe collects it on the payment page and the abandoned-checkout email keys off that. The nav cart icon is a plain link to the cart page.

## Runtime (alpine.js)

Loaded on every page. Adds: a rotating announcement carousel (four messages, arrows, dots, pauses on hover, static under reduced motion), which leaves on scroll while the nav stays; quick-add buttons in every block on the homepage and collection; a cart drawer on pages without one, with quantity controls, a gold "You save" row measured against single covers, a gold free-tracked-shipping row and a one-click Checkout straight to Stripe (falls back to the cart page only if the API is unreachable); a sticky buy bar on the homepage on phones; a FAQ search box; a delivery-date window on in-stock product pages; the desktop product gallery, its ride-along pinning and the photo viewer; gold on the product-page pack-card savings and the product drawer's shipping row.

## Tools (run from the repo root)

- `shot.mjs <path-or-url> <label> [desktop|laptop|mac|mobile] [clipY clipH | view]` screenshots into `temporary screenshots/`. `mac` is a 1470px 2x MacBook. Paths default to :3001 (the old preview server); pass a full URL such as `http://localhost:3000/` for the live build. `CART='{...}'` preloads a cart, `CLICK='.selector'` clicks first, `SCROLL=y` with `view` scrolls first.
- `sim.mjs` drives 17 shopper scenarios with Stripe stubbed and prints a pass/fail table. `BASE=http://localhost:3000 node white-site/sim.mjs` for the local site, `BASE=https://www.altaradesign.com` for production.
- `probe.mjs`, `probe-gap.mjs`, `probe-quotes.mjs`, `probe-video.mjs`, `debug-cart.mjs`: layout, gallery, quote-strip, video-seek and cart-click diagnostics.
- `serve.mjs` (this folder) is the old :3001 preview server for `white-site/*.html`; not needed now that the root is white.
