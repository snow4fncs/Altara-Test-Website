/* Altara · Alpine edition runtime. Injected on every white-site page by build.mjs.
   1. Announcement carousel      2. Global cart drawer + quick-add    3. Sticky mobile buy bar (home)
   4. FAQ search                  5. Delivery date estimate (product pages)                          */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ───────────── 1. Announcement carousel ───────────── */
  (function () {
    var bar = $('.announce-bar'); if (!bar) return;
    var msgs = [
      { t: 'Free tracked shipping on orders over $80', s: 'Free shipping over $80', h: 'shipping.html' },
      { t: '60-day fit guarantee. Wrong fit, full refund', s: '60-day fit guarantee', h: 'returns.html' },
      { t: 'Pay in 4 with Afterpay, Zip or Klarna', s: 'Pay in 4 with Afterpay or Zip', h: 'collection.html' },
      { t: '200+ orders delivered across every state', s: '200+ orders, every state', h: 'reviews.html' }
    ];
    var narrow = window.matchMedia('(max-width: 768px)');
    var label = function (m) { return narrow.matches ? m.s : m.t; };
    var chev = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="' + (d < 0 ? '15 18 9 12 15 6' : '9 18 15 12 9 6') + '"/></svg>'; };
    bar.innerHTML =
      '<button type="button" class="ab-arrow ab-prev" aria-label="Previous message">' + chev(-1) + '</button>' +
      '<div class="ab-track" aria-live="polite">' + msgs.map(function (m, i) { return '<a class="ab-msg' + (i ? '' : ' is-on') + '" href="' + m.h + '"' + (i ? ' tabindex="-1" aria-hidden="true"' : '') + '>' + esc(label(m)) + '</a>'; }).join('') + '</div>' +
      '<button type="button" class="ab-arrow ab-next" aria-label="Next message">' + chev(1) + '</button>' +
      '<div class="ab-dots" role="tablist" aria-label="Announcements">' + msgs.map(function (m, i) { return '<button type="button" class="ab-dot' + (i ? '' : ' is-on') + '" role="tab" aria-label="Message ' + (i + 1) + '" aria-selected="' + (i ? 'false' : 'true') + '"></button>'; }).join('') + '</div>';
    bar.classList.add('ab-carousel');
    var items = $$('.ab-msg', bar), dots = $$('.ab-dot', bar), cur = 0, timer = null, paused = false;
    function go(n, dir) {
      if (n === cur) return;
      var out = items[cur], inn = items[n];
      out.classList.remove('is-on'); out.classList.add(dir > 0 ? 'is-out-up' : 'is-out-down'); out.setAttribute('aria-hidden', 'true'); out.tabIndex = -1;
      setTimeout(function () { out.classList.remove('is-out-up', 'is-out-down'); }, 520);
      inn.classList.remove('is-out-up', 'is-out-down'); inn.classList.add(dir > 0 ? 'is-in-up' : 'is-in-down');
      requestAnimationFrame(function () { requestAnimationFrame(function () { inn.classList.add('is-on'); inn.classList.remove('is-in-up', 'is-in-down'); }); });
      inn.removeAttribute('aria-hidden'); inn.tabIndex = 0;
      dots[cur].classList.remove('is-on'); dots[cur].setAttribute('aria-selected', 'false');
      dots[n].classList.add('is-on'); dots[n].setAttribute('aria-selected', 'true');
      cur = n;
    }
    function next() { go((cur + 1) % items.length, 1); }
    function prev() { go((cur - 1 + items.length) % items.length, -1); }
    function start() { stop(); if (reduceMotion) return; timer = setInterval(function () { if (!paused) next(); }, 4500); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    $('.ab-next', bar).addEventListener('click', function () { next(); start(); });
    $('.ab-prev', bar).addEventListener('click', function () { prev(); start(); });
    dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i, i > cur ? 1 : -1); start(); }); });
    bar.addEventListener('mouseenter', function () { paused = true; });
    bar.addEventListener('mouseleave', function () { paused = false; });
    bar.addEventListener('focusin', function () { paused = true; });
    bar.addEventListener('focusout', function () { paused = false; });
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    (narrow.addEventListener ? narrow.addEventListener('change', relabel) : narrow.addListener(relabel));
    function relabel() { items.forEach(function (el, i) { el.textContent = label(msgs[i]); }); }
    start();
    window.__abGo = go; window.__abIndex = function () { return cur; };
  })();

  /* ───────────── 2. Cart: storage, pricing, badge ───────────── */
  var CART_KEY = 'altara-cart', EMAIL_KEY = 'altara-email';
  var PAIR_SAVE = 49, TWINPAIR_SAVE = 19;                 // same rule as cart.html: two singles price as a Twin Set, two Twin Sets as a Full Car
  var PRODUCTS = {
    'midnight-black-twin': { name: 'Midnight Black Twin Set', price: 89, image: 'Product Photos/opt/twin-set-midnight-black-320.jpg', colour: 'midnight-black' },
    'contrast-white-twin': { name: 'Contrast White Twin Set', price: 89, image: 'Product Photos/opt/twin-set-contrast-white-320.jpg', colour: 'contrast-white' },
    'midnight-black': { name: 'Midnight Black', price: 69, image: 'Product Photos/opt/img7-320.jpg', colour: 'midnight-black' },
    'contrast-white': { name: 'Contrast White', price: 69, image: 'Product Photos/opt/img1-320.jpg', colour: 'contrast-white' }
  };
  var STOCK = {};                                           // filled from /api/stock-level
  function readCart() { try { var c = JSON.parse(localStorage.getItem(CART_KEY) || '{"items":[]}'); if (!c || !Array.isArray(c.items)) c = { items: [] }; return c; } catch (e) { return { items: [] }; } }
  function saveCart(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) {} paintBadge(); if (window.__alpinePaint) window.__alpinePaint(); }
  function count(c) { return c.items.reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0); }
  function subtotal(c) { return c.items.reduce(function (s, i) { return s + (Number(i.price) || 0) * (Number(i.qty) || 0); }, 0); }
  function bundle(c) {
    var singles = c.items.filter(function (i) { return !/-twin$/.test(i.id); }).reduce(function (n, i) { return n + i.qty; }, 0);
    var twins = c.items.filter(function (i) { return /-twin$/.test(i.id); }).reduce(function (n, i) { return n + i.qty; }, 0);
    var pairs = Math.floor(singles / 2), fullcars = Math.floor((pairs + twins) / 2);
    return { singles: singles, twins: twins, pairs: pairs, fullcars: fullcars, discount: pairs * PAIR_SAVE + fullcars * TWINPAIR_SAVE };
  }
  function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
  function paintBadge() {
    var b = $('#nav-cart-badge'); if (!b) return;
    var n = count(readCart()); b.textContent = n ? String(n) : ''; b.classList.toggle('visible', n > 0);
  }
  function isPreorder(colour) { var s = STOCK[colour]; return !!(s && s.status === 'preorder'); }
  function isOut(colour) { var s = STOCK[colour]; return !!(s && s.status === 'out'); }

  window.alpineAdd = function (id, qty, source) {
    var p = PRODUCTS[id]; if (!p) return;
    if (isOut(p.colour)) { window.location.href = 'product-' + p.colour + '.html'; return; }
    var c = readCart(), ex = c.items.filter(function (i) { return i.id === id; })[0];
    if (ex) ex.qty += (qty || 1); else c.items.push({ id: id, name: p.name, price: p.price, image: p.image, qty: qty || 1 });
    saveCart(c);
    if (typeof fbq === 'function') fbq('track', 'AddToCart', { content_ids: [id], content_name: p.name, value: p.price * (qty || 1), currency: 'AUD' });
    if (window.openAlpineCart) window.openAlpineCart(); else if (window.openCartDrawer) window.openCartDrawer();
    document.dispatchEvent(new CustomEvent('alpine:add', { detail: { id: id, source: source || '' } }));
  };

  /* ───────────── 2b. Global cart drawer (pages that have none of their own) ───────────── */
  (function () {
    if ($('#cd')) return;                                   // product pages keep their own drawer
    var root = document.createElement('div'); root.id = 'ald-root';
    root.innerHTML =
      '<div class="ald-overlay" id="ald-overlay" aria-hidden="true"></div>' +
      '<aside class="ald" id="ald" role="dialog" aria-modal="true" aria-label="Shopping cart" aria-hidden="true">' +
        '<div class="ald-head"><span class="ald-title">Your cart <span class="ald-count" id="ald-count"></span></span><button type="button" class="ald-close" id="ald-close" aria-label="Close cart">&times;</button></div>' +
        '<ol class="ald-steps" aria-label="Checkout progress"><li class="is-on"><span>1</span>Cart</li><li><span>2</span>Payment</li><li><span>3</span>Delivered</li></ol>' +
        '<div class="ald-body"><div id="ald-items"></div><div class="ald-rows" id="ald-rows"></div></div>' +
        '<div class="ald-foot">' +
          '<p class="ald-ship" id="ald-ship"></p>' +
          '<button type="button" class="ald-checkout" id="ald-checkout"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg><span id="ald-checkout-label">Checkout</span></button>' +
          '<p class="ald-pay-note">Apple Pay, Google Pay, Afterpay, Zip and Klarna on the next screen</p>' +
          '<span class="ald-pays" role="img" aria-label="Visa, Mastercard, American Express, Apple Pay, Google Pay, Afterpay, Zip, Klarna"><span class="pay pay-visa">VISA</span><span class="pay pay-mc" aria-hidden="true"><i></i><i></i></span><span class="pay pay-amex">AMEX</span><span class="pay pay-apple">&#63743; Pay</span><span class="pay pay-gpay">G Pay</span><span class="pay pay-zip">zip</span><span class="pay pay-afterpay">afterpay</span><span class="pay pay-klarna">Klarna.</span></span>' +
          '<ul class="ald-trust"><li>60-day fit guarantee, full refund if it isn\'t right</li><li>Same-day dispatch on weekdays, tracked with Australia Post</li></ul>' +
          '<a class="ald-view" href="cart.html">View full cart</a>' +
        '</div>' +
      '</aside>';
    document.body.appendChild(root);
    var drawer = $('#ald'), overlay = $('#ald-overlay');

    function paint() {
      var c = readCart(), b = bundle(c), sub = subtotal(c), total = sub - b.discount, n = count(c);
      $('#ald-count').textContent = n ? '(' + n + ')' : '';
      var items = $('#ald-items');
      if (!c.items.length) {
        items.innerHTML = '<div class="ald-empty"><p>Your cart is empty.</p><a class="btn-primary" href="collection.html">Shop the collection</a></div>';
        $('#ald-rows').innerHTML = ''; $('#ald-ship').textContent = ''; $('#ald-checkout').disabled = true; $('#ald-checkout-label').textContent = 'Checkout';
        return;
      }
      items.innerHTML = c.items.map(function (i) {
        var p = PRODUCTS[i.id] || {}; var pre = isPreorder(p.colour || '');
        return '<div class="ald-item" data-id="' + esc(i.id) + '"><img src="' + esc(i.image || p.image || '') + '" alt="" width="64" height="64">' +
          '<div class="ald-item-info"><p class="ald-item-name">' + esc(i.name) + '</p>' + (pre ? '<p class="ald-item-note">Pre-order · ships ' + esc(STOCK[p.colour].ships || 'mid November') + '</p>' : '<p class="ald-item-note">In stock · ships same day weekdays</p>') +
          '<div class="ald-qty"><button type="button" data-act="dec" aria-label="Decrease quantity">&minus;</button><span>' + i.qty + '</span><button type="button" data-act="inc" aria-label="Increase quantity">+</button><button type="button" class="ald-rm" data-act="rm">Remove</button></div></div>' +
          '<p class="ald-item-price">' + money(i.price * i.qty) + '</p></div>';
      }).join('');
      // The saving is measured against single covers at $69 each, so a Twin Set bought outright shows "You save $49"
      // just as the product page promised, and two singles paired into a Twin Set show the same figure.
      var single = (PRODUCTS['midnight-black'] && PRODUCTS['midnight-black'].price) || 69;
      var covers = c.items.reduce(function (s, i) { return s + i.qty * (/-twin$/.test(i.id) ? 2 : 1); }, 0);
      var saving = Math.max(0, covers * single - total);
      var rows = '<div class="ald-row"><span>Subtotal</span><span>' + money(sub) + '</span></div>';
      if (saving) rows += '<div class="ald-row ald-row-save"><span>You save' + (b.fullcars || covers >= 4 ? ' · Full Car pricing' : ' · Twin Set pricing') + '</span><span>' + money(saving) + '</span></div>';
      rows += '<div class="ald-row' + (total >= 80 ? ' ald-row-ship' : '') + '"><span>Shipping</span><span>' + (total >= 80 ? 'Free · Australia Post tracked' : '$9.95 · Australia Post tracked') + '</span></div>';
      rows += '<div class="ald-row ald-row-total"><span>Total</span><span>' + money(total) + ' <small>AUD</small></span></div>';
      $('#ald-rows').innerHTML = rows;
      var ship = $('#ald-ship');
      if (total >= 80) ship.innerHTML = '';
      else ship.innerHTML = 'Add <strong>' + money(80 - total) + '</strong> more for free tracked shipping.';
      $('#ald-checkout').disabled = false; $('#ald-checkout-label').textContent = 'Checkout · ' + money(total);
    }
    window.__alpinePaint = paint;
    function open() { paint(); drawer.classList.add('open'); overlay.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); overlay.setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden'; $('#ald-close').focus(); document.body.classList.add('ald-open'); }
    function close() { drawer.classList.remove('open'); overlay.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); overlay.setAttribute('aria-hidden', 'true'); document.documentElement.style.overflow = ''; document.body.classList.remove('ald-open'); }
    window.openAlpineCart = open; window.closeAlpineCart = close;
    $('#ald-close').addEventListener('click', close);
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) close(); });
    $('#ald-items').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]'); if (!btn) return;
      var id = btn.closest('.ald-item').getAttribute('data-id'), c = readCart(), it = c.items.filter(function (i) { return i.id === id; })[0]; if (!it) return;
      if (btn.dataset.act === 'inc') it.qty += 1;
      if (btn.dataset.act === 'dec') it.qty -= 1;
      if (btn.dataset.act === 'rm' || it.qty <= 0) c.items = c.items.filter(function (i) { return i.id !== id; });
      saveCart(c);
    });
    // The nav cart icon is a plain link to the cart page. (It used to open the drawer as well, and with the page
    // transition script also firing on the same click the drawer flashed open just before the page changed.)
    $('#ald-checkout').addEventListener('click', function () {
      var c = readCart(); if (!c.items.length) return;
      // No email asked for here: secure payment collects it, and nothing stands between the cart and paying.
      var btn = $('#ald-checkout'), label = $('#ald-checkout-label'), was = label.textContent; btn.disabled = true; label.textContent = 'Taking you to secure payment…';
      var readCookie = function (name) { var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'); return m ? decodeURIComponent(m[2]) : ''; };
      if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', { content_ids: c.items.map(function (i) { return i.id; }), num_items: count(c), value: subtotal(c) - bundle(c).discount, currency: 'AUD' });
      fetch('/api/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: c.items.map(function (i) { return { id: i.id, qty: i.qty }; }), fbp: readCookie('_fbp'), fbc: readCookie('_fbc') }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)); })
        .then(function (d) { if (d && d.url) window.location.href = d.url; else throw new Error(d && d.error || 'no url'); })
        .catch(function () { window.location.href = 'cart.html'; })   // the full cart page has the same checkout and its own error handling
        .then(function () { setTimeout(function () { btn.disabled = false; label.textContent = was; }, 4000); });
    });
    paint();
  })();

  /* ───────────── 2c. Quick-add buttons in every block ───────────── */
  function qaLabel(id) { var p = PRODUCTS[id]; var pre = isPreorder(p.colour); return (pre ? 'Pre-order' : 'Add') + ' ' + (/-twin$/.test(id) ? 'Twin Set' : 'single') + ' · $' + p.price; }
  function qaButton(id, cls) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'qa-btn ' + (cls || ''); b.setAttribute('data-add', id); b.textContent = qaLabel(id);
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); window.alpineAdd(id, 1, cls || 'qa'); });
    return b;
  }
  function relabelQa() { $$('.qa-btn[data-add]').forEach(function (b) { b.textContent = qaLabel(b.getAttribute('data-add')); }); }
  function injectQuickAdd() {
    // homepage and collection tiles
    $$('a.range-tile, a.product-tile').forEach(function (a) {
      var href = a.getAttribute('href') || ''; var id = /contrast-white/.test(href) ? 'contrast-white-twin' : /midnight-black/.test(href) ? 'midnight-black-twin' : null; if (!id) return;
      var body = $('.range-tile-body', a) || $('.product-tile-info', a); if (!body || $('.qa-btn', body)) return;
      // collection tiles: the caption is a name-left / link-right row, so the button joins the right-hand side
      var right = $('.product-tile-right', body);
      if (right) { right.insertBefore(qaButton(id, 'qa-tile'), right.firstChild); return; }
      var row = document.createElement('div'); row.className = 'qa-row'; row.appendChild(qaButton(id, 'qa-tile'));
      var link = $('.range-tile-link, .product-tile-explore', body); if (link) { row.appendChild(link); }
      body.appendChild(row);
    });
    // homepage showcase, features and craft blocks
    var sc = $('.showcase-copy'); if (sc && !$('.qa-inline', sc)) { var w = document.createElement('div'); w.className = 'qa-inline'; w.appendChild(qaButton('midnight-black-twin', 'qa-primary')); w.appendChild(qaButton('contrast-white-twin', 'qa-ghost')); sc.appendChild(w); }
    var fs = $('.features-sec'); if (fs && !$('.qa-strip', fs)) { var s = document.createElement('div'); s.className = 'qa-strip'; s.innerHTML = '<p><strong>Two covers, $89, delivered free.</strong> 60-day fit guarantee.</p>'; var btns = document.createElement('div'); btns.className = 'qa-strip-btns'; btns.appendChild(qaButton('midnight-black-twin', 'qa-primary')); btns.appendChild(qaButton('contrast-white-twin', 'qa-ghost')); s.appendChild(btns); fs.appendChild(s); }
    var cc = $('.craft-copy'); if (cc && !$('.qa-inline', cc)) { var w2 = document.createElement('div'); w2.className = 'qa-inline'; w2.appendChild(qaButton('midnight-black-twin', 'qa-primary')); cc.appendChild(w2); }
  }

  /* ───────────── 3. Sticky mobile buy bar (homepage) ───────────── */
  function injectStickyBar() {
    if (!document.body.classList.contains('page-index')) return;
    var bar = document.createElement('div'); bar.className = 'home-satc'; bar.id = 'home-satc'; bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<div class="home-satc-info"><span class="home-satc-k">Midnight Black · Twin Set</span><span class="home-satc-p">$89 <small>delivered free</small></span></div>';
    bar.appendChild(qaButton('midnight-black-twin', 'home-satc-btn'));
    document.body.appendChild(bar);
    var hero = $('.hero'), on = false;
    function tick() { var y = window.scrollY, h = hero ? hero.offsetTop + hero.offsetHeight - 120 : 600, want = y > h && !document.body.classList.contains('ald-open'); if (want !== on) { on = want; bar.classList.toggle('is-on', on); bar.setAttribute('aria-hidden', on ? 'false' : 'true'); } }
    window.addEventListener('scroll', tick, { passive: true }); document.addEventListener('alpine:add', function () { setTimeout(tick, 50); }); tick();
  }

  /* ───────────── 4. FAQ search ───────────── */
  function injectFaqSearch() {
    var wrap = $('.faq-wrap'); if (!wrap) return;
    var box = document.createElement('div'); box.className = 'faq-search';
    box.innerHTML = '<label for="faq-q" class="faq-search-label">Search the answers</label><div class="faq-search-row"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="search" id="faq-q" placeholder="Try “wash”, “fit” or “magnets”" autocomplete="off"></div><p class="faq-search-count" id="faq-count" aria-live="polite"></p>';
    wrap.insertBefore(box, wrap.firstChild);
    var items = $$('.faq-item', wrap), sections = $$('.faq-section', wrap), input = $('#faq-q', box), countEl = $('#faq-count', box);
    var none = document.createElement('p'); none.className = 'faq-none'; none.hidden = true; none.innerHTML = 'No answer matches that. <a href="contact.html">Ask us directly</a> and we reply within a business day.'; wrap.appendChild(none);
    function run() {
      var q = input.value.trim().toLowerCase(), shown = 0;
      items.forEach(function (it) { var t = it.textContent.toLowerCase(); var hit = !q || t.indexOf(q) !== -1; it.hidden = !hit; if (hit) shown++; if (hit && q && !it.classList.contains('open')) { it.classList.add('open'); var b = $('.faq-btn', it); if (b) b.setAttribute('aria-expanded', 'true'); } });
      sections.forEach(function (s) { s.hidden = $$('.faq-item', s).every(function (i) { return i.hidden; }); });
      none.hidden = shown > 0; countEl.textContent = q ? (shown ? shown + (shown === 1 ? ' answer' : ' answers') : '') : '';
    }
    input.addEventListener('input', run);
  }

  /* ───────────── 5. Delivery estimate on product pages ───────────── */
  function injectDelivery() {
    var steps = $$('.pi-step'); if (!steps.length) return;
    var delivered = steps.filter(function (s) { return /Delivered/i.test(($('.pi-step-k', s) || {}).textContent || ''); })[0]; if (!delivered) return;
    if (window.__preorderShip || $('.pre-ribbon-wrap')) return;      // pre-order keeps its ship date
    var now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
    function addBiz(d, n) { var x = new Date(d); while (n > 0) { x.setDate(x.getDate() + 1); if (x.getDay() !== 0 && x.getDay() !== 6) n--; } return x; }
    var dispatch = new Date(now); var isBiz = now.getDay() !== 0 && now.getDay() !== 6;
    if (!(isBiz && now.getHours() < 14)) dispatch = addBiz(now, 1);
    var from = addBiz(dispatch, 3), to = addBiz(dispatch, 7);
    var wd = function (d) { return d.toLocaleDateString('en-AU', { weekday: 'short' }) + ' ' + d.getDate(); };
    var mo = function (d) { return d.toLocaleDateString('en-AU', { month: 'short' }); };
    var sub = $('.pi-step-s', delivered);
    if (sub) sub.textContent = wd(from) + (mo(from) !== mo(to) ? ' ' + mo(from) : '') + ' – ' + wd(to) + ' ' + mo(to);
  }

  /* ───────────── 6. Desktop product gallery: full-resolution portrait photos in the grid, pre-order marks on the first cell ───────────── */
  (function () {
    var thumbs = $$('.ph-thumb'); if (!thumbs.length) return;
    var wide = window.matchMedia('(min-width: 1101px)');
    function upgrade() {
      if (!wide.matches) return;
      thumbs.forEach(function (t) {
        $$('source', t).forEach(function (src) { src.remove(); });
        var img = $('img', t); if (!img || img.dataset.full) return;
        var full = (img.getAttribute('src') || '').replace(/-320\.jpg$/, '-1200.jpg'); img.dataset.full = '1';
        if (full !== img.getAttribute('src')) { img.src = full; img.removeAttribute('srcset'); }
        img.loading = 'eager';
      });
    }
    function marks() {
      if (!wide.matches) return;   // the clones belong to the desktop grid only; on phones the first thumbnail is 72px tall
      var area = $('.ph-image-area'), first = thumbs[0]; if (!area || !first || $('.pre-ribbon-wrap', first)) return;
      var rw = $('.pre-ribbon-wrap', area), bd = $('.pre-band', area); if (!rw) return;
      var c1 = rw.cloneNode(true); c1.removeAttribute('style'); first.appendChild(c1);
      if (bd) { var c2 = bd.cloneNode(true); c2.removeAttribute('style'); first.appendChild(c2); }
    }
    upgrade(); marks();
    var onWide = function () { upgrade(); marks(); };
    (wide.addEventListener ? wide.addEventListener('change', onWide) : wide.addListener(onWide));
    var area = $('.ph-image-area'); if (area) new MutationObserver(marks).observe(area, { childList: true });
    // The grid is shorter than the buy column on laptops, so it rides along: once its last row reaches the bottom of
    // the window it stays there while the column keeps scrolling, and no blank space ever shows under the photos.
    var left = $('.ph-left');
    function ride() {
      if (!left) return;
      if (!wide.matches) { left.style.removeProperty('--gal-top'); return; }
      var navTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top')) || 104;
      left.style.setProperty('--gal-top', Math.min(navTop, window.innerHeight - left.offsetHeight) + 'px');
    }
    ride(); window.addEventListener('resize', ride);
    if (left && window.ResizeObserver) new ResizeObserver(ride).observe(left);
  })();

  /* ───────────── 6b. Product gallery viewer: click any photo to see it large, then arrow, swipe or scroll to the next ───────────── */
  (function () {
    var thumbs = $$('.ph-thumb'), main = $('.ph-main-img'); if (!thumbs.length) return;
    var items = thumbs.map(function (t) { var img = $('img', t); var src = (img && img.getAttribute('src')) || ''; return { src: src.replace(/-320\.jpg$/, '-1200.jpg'), alt: (img && img.alt) || 'Altara seat cover' }; });
    var root = document.createElement('div'); root.className = 'pgl'; root.id = 'pgl'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Product photos'); root.hidden = true;
    root.innerHTML = '<button type="button" class="pgl-x" aria-label="Close">&times;</button>' +
      '<button type="button" class="pgl-arrow pgl-prev" aria-label="Previous photo"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>' +
      '<figure class="pgl-fig"><img class="pgl-img" alt=""><figcaption class="pgl-cap"></figcaption></figure>' +
      '<button type="button" class="pgl-arrow pgl-next" aria-label="Next photo"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>' +
      '<div class="pgl-dots" role="tablist">' + items.map(function (_, i) { return '<button type="button" class="pgl-dot" role="tab" aria-label="Photo ' + (i + 1) + '"></button>'; }).join('') + '</div>' +
      '<div class="pgl-n" aria-live="polite"></div>';
    document.body.appendChild(root);
    var img = $('.pgl-img', root), cap = $('.pgl-cap', root), n = $('.pgl-n', root), dots = $$('.pgl-dot', root), cur = 0, opener = null, lock = 0;
    function show(i, dir) {
      cur = (i + items.length) % items.length;
      img.classList.remove('is-in-left', 'is-in-right'); void img.offsetWidth;
      img.src = items[cur].src; img.alt = items[cur].alt; cap.textContent = items[cur].alt; n.textContent = (cur + 1) + ' / ' + items.length;
      if (dir) img.classList.add(dir > 0 ? 'is-in-right' : 'is-in-left');
      dots.forEach(function (d, k) { d.classList.toggle('is-on', k === cur); d.setAttribute('aria-selected', k === cur ? 'true' : 'false'); });
      [cur + 1, cur - 1].forEach(function (k) { var pre = new Image(); pre.src = items[(k + items.length) % items.length].src; });
    }
    function open(i, from) { opener = from || null; show(i, 0); root.hidden = false; requestAnimationFrame(function () { root.classList.add('open'); }); document.documentElement.style.overflow = 'hidden'; root.tabIndex = -1; root.focus({ preventScroll: true }); }
    function close() { root.classList.remove('open'); document.documentElement.style.overflow = ''; setTimeout(function () { root.hidden = true; }, 260); if (opener && opener.focus) opener.focus(); }
    function step(d) { var t = Date.now(); if (t - lock < 350) return; lock = t; show(cur + d, d); }
    window.openGallery = open;
    $('.pgl-x', root).addEventListener('click', close);
    $('.pgl-prev', root).addEventListener('click', function () { step(-1); });
    $('.pgl-next', root).addEventListener('click', function () { step(1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k, k > cur ? 1 : -1); }); });
    root.addEventListener('click', function (e) { if (e.target === root || e.target.classList.contains('pgl-fig')) close(); });
    document.addEventListener('keydown', function (e) { if (root.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
    // scroll or trackpad swipe moves through the photos
    root.addEventListener('wheel', function (e) { e.preventDefault(); var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) > 18) step(d > 0 ? 1 : -1); }, { passive: false });
    var tx = null; root.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', function (e) { if (tx == null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); }, { passive: true });
    // triggers: grid cells on desktop, the large photo on phones (thumbs there keep switching the large photo)
    var wide = window.matchMedia('(min-width: 1101px)');
    thumbs.forEach(function (t, i) { t.addEventListener('click', function () { if (wide.matches) open(i, t); }); t.setAttribute('aria-label', 'View photo ' + (i + 1) + ' of ' + items.length); });
    if (main) { main.style.cursor = 'zoom-in'; main.addEventListener('click', function () { var act = thumbs.findIndex(function (t) { return t.classList.contains('active'); }); open(act < 0 ? 0 : act, main); }); }
  })();

  /* ───────────── 6c. Phones: a deliberate left/right swipe on the large photo moves to the next one ─────────────
     A swipe counts only when the finger travels a real distance mostly sideways (not a scroll, not a tap), so a
     thumb brushing the photo while scrolling never flips it. Ends do not wrap: the thumbnail strip shows where you are. */
  (function () {
    var area = $('.ph-image-area'), main = $('.ph-main-img'), thumbs = $$('.ph-thumb');
    if (!area || !main || thumbs.length < 2) return;
    var MIN_X = 64, MAX_SLOPE = 0.6;
    var sx = 0, sy = 0, mx = 0, my = 0, live = false, scrolling = false;
    function active() { return Math.max(0, thumbs.findIndex(function (t) { return t.classList.contains('active'); })); }
    function srcOf(k) { var t = thumbs[k]; return t && t.dataset && t.dataset.src ? t.dataset.src.replace('-wide.webp', '-1200.webp') : ''; }
    function warm(k) { var s = srcOf(k); if (s) { var im = new Image(); im.src = s; } }
    function go(d) {
      var i = active(), k = i + d;
      if (k < 0 || k >= thumbs.length) return;
      thumbs[k].click();
      var cls = d > 0 ? 'is-in-right' : 'is-in-left';
      main.classList.remove('is-in-left', 'is-in-right');
      var armed = false;
      var arm = function () { if (armed) return; armed = true; void main.offsetWidth; main.classList.add(cls); };
      main.addEventListener('load', arm, { once: true });
      if (main.complete) arm();
      warm(k - 1); warm(k + 1);
    }
    // the slide moves the photo, so anything pinned to its edges (pre-order marks) re-measures once it settles
    main.addEventListener('animationend', function () { main.classList.remove('is-in-left', 'is-in-right'); window.dispatchEvent(new Event('resize')); });
    area.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { live = false; return; }
      live = true; scrolling = false; sx = mx = e.touches[0].clientX; sy = my = e.touches[0].clientY;
    }, { passive: true });
    area.addEventListener('touchmove', function (e) {
      if (!live || e.touches.length !== 1) { live = false; return; }
      mx = e.touches[0].clientX; my = e.touches[0].clientY;
      if (!scrolling && Math.abs(my - sy) > 24 && Math.abs(my - sy) > Math.abs(mx - sx)) scrolling = true;
    }, { passive: true });
    area.addEventListener('touchend', function (e) {
      if (!live) return; live = false;
      var t = e.changedTouches && e.changedTouches[0]; if (t) { mx = t.clientX; my = t.clientY; }
      var dx = mx - sx, dy = my - sy;
      if (scrolling || Math.abs(dx) < MIN_X || Math.abs(dy) > Math.abs(dx) * MAX_SLOPE) return;
      go(dx < 0 ? 1 : -1);
    }, { passive: true });
    area.addEventListener('touchcancel', function () { live = false; }, { passive: true });
    warm(active() + 1);
  })();

  /* ───────────── 6d. Phones: one tap on the other colourway opens it ─────────────
     iPhone Safari can spend a first tap on a link without opening it: a tap while the page still glides after a swipe
     only stops the glide. The colourway tiles sit a screen below the photo, so the tap that reaches them usually comes
     straight after a swipe, and shoppers had to tap twice. A clean tap on a tile (one finger, down and up on the same
     tile, under 10px of travel and 600ms) now opens its page here, and the browser's own click is cancelled so the page
     never opens twice. A drag that starts on a tile still scrolls, a long press still gets Safari's link preview, and
     mouse, keyboard and VoiceOver use the plain link as before. white-site/probe-colourway-tap.mjs checks all of it. */
  (function () {
    $$('a.pi-var[href]').forEach(function (a) {
      var x = 0, y = 0, t0 = 0, live = false;
      a.addEventListener('touchstart', function (e) {
        live = e.touches.length === 1;
        if (live) { x = e.touches[0].clientX; y = e.touches[0].clientY; t0 = Date.now(); }
      }, { passive: true });
      a.addEventListener('touchmove', function (e) {
        var p = e.touches[0];
        if (live && (!p || Math.abs(p.clientX - x) > 10 || Math.abs(p.clientY - y) > 10)) live = false;
      }, { passive: true });
      a.addEventListener('touchcancel', function () { live = false; }, { passive: true });
      a.addEventListener('touchend', function (e) {
        if (!live) return;
        live = false;
        var p = e.changedTouches && e.changedTouches[0];
        if (!p || e.touches.length || Date.now() - t0 > 600 || Math.abs(p.clientX - x) > 10 || Math.abs(p.clientY - y) > 10) return;
        var r = a.getBoundingClientRect();
        if (p.clientX < r.left || p.clientX > r.right || p.clientY < r.top || p.clientY > r.bottom) return;
        if (e.cancelable) e.preventDefault();
        a.click();
      });
    });
  })();

  /* ───────────── 7. Announcement bar leaves on scroll; the nav stays ───────────── */
  (function () {
    var on = false;
    function tick() { var y = window.scrollY; var want = on ? y > 12 : y > 72; if (want !== on) { on = want; document.body.classList.toggle('ab-hidden', on); } }
    window.addEventListener('scroll', tick, { passive: true }); tick();
  })();

  /* ───────────── boot ───────────── */
  paintBadge();
  injectQuickAdd(); injectStickyBar(); injectFaqSearch();
  // product page pack cards: the saving and the free tracked shipping line carry the gold
  $$('.pack-opt-list li').forEach(function (li) { if (/^\s*Save \$|free Australia Post/i.test(li.textContent)) li.classList.add('is-save'); });
  // product-page drawer (live markup): its free-shipping row goes gold and names the carrier like the other carts
  var cdRows = $('#cd-rows');
  if (cdRows) {
    var markShip = function () {
      $$('.cd-row', cdRows).forEach(function (r) {
        var k = r.children[0], v = r.children[1];
        if (k && v && /^Shipping$/.test(k.textContent.trim()) && /^Free$/.test(v.textContent.trim())) { r.classList.add('save'); v.textContent = 'Free · Australia Post tracked'; }
      });
    };
    new MutationObserver(markShip).observe(cdRows, { childList: true }); markShip();
  }
  fetch('/api/stock-level').then(function (r) { return r.ok ? r.json() : {}; }).then(function (lv) { STOCK = lv || {}; relabelQa(); if (window.__alpinePaint) window.__alpinePaint(); setTimeout(injectDelivery, 400); }).catch(function () { setTimeout(injectDelivery, 400); });
  window.addEventListener('storage', function (e) { if (e.key === CART_KEY) { paintBadge(); if (window.__alpinePaint) window.__alpinePaint(); } });
})();
