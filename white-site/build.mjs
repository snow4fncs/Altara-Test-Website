// Altara "Alpine" white edition: rebuilds every customer-facing page from the live dark source.
// Run from repo root: node white-site/build.mjs   ->  writes white-site/*.html (served by white-site/serve.mjs on :3001)
// Nothing here is deployed; the source pages are never modified.
import fs from 'fs';

// Adopted as the live site on 10 Nov 2026: the root pages ARE the white edition now. This script only knows how to
// convert the old dark pages, and running it on white pages would recolour them twice, so it refuses.
if (fs.readFileSync('index.html', 'utf8').includes('alpine.css')) {
  console.error('build.mjs: the root pages are already the white edition (adopted 10 Nov 2026). Edit them directly; nothing to build.');
  process.exit(1);
}

const PAGES = ['index', 'collection', 'product-midnight-black', 'product-contrast-white', 'cart', 'confirmation', 'account',
  'auth-callback', 'reviews', 'review', 'faq', 'about', 'contact', 'shipping', 'returns', 'terms', 'privacy', 'search',
  'gym-sweat-car-seat-protection', 'beach-sand-car-seats', 'cant-wash-a-car-seat'];

// Palette: brand guidelines (brand assets/Altara Brand Guidelines.png) on a white page base.
const C = {
  white: [255, 255, 255],
  stone: [244, 241, 234],      // Alpine Stone  #F4F1EA  bands and cards
  graphite: [21, 23, 25],      // Graphite Black #151719 text, buttons
  slate: '#5E6873',            // Slate Grey     secondary text
  taupeDeep: [122, 107, 87],   // Warm Taupe darkened for legible accents #7A6B57
  taupe: [185, 170, 152],      // Warm Taupe #B9AA98 decorative
};
const rgba = (c, a) => `rgba(${c.join(',')},${+(+a).toFixed(3)})`;
const hex = c => '#' + c.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();

// A rule painted with the action colour (old steel, now graphite) must carry light text.
function fixInverse(css) {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body) =>
    /background(-color)?\s*:\s*(var\(--brand(-lt)?\)|#4D6272|#607D8F|#1B1D20|#151719)/i.test(body)
      ? `${sel}{${body.replace(/(^|[;\s])color\s*:\s*(var\(--cream\)|#EDE8DF|#151719)/gi, '$1color: #FFFFFF')}}` : m);
}
// Faint white/cream fills on dark were "lifted" surfaces: on white they become stone tints.
function lift(css) {
  return css.replace(/(background(?:-color)?\s*:)([^;}]*)/g, (m, prop, v) => prop + v.replace(/rgba\(\s*(255\s*,\s*255\s*,\s*255|237\s*,\s*232\s*,\s*223)\s*,\s*([\d.]+)\s*\)/g, (mm, _, a) => +a < 0.2 ? `rgba(244,241,234,${Math.min(1, 0.5 + a * 4).toFixed(2)})` : mm));
}
// Type stays the site's own (Cormorant Garamond display, Outfit text). On white the hairline weight
// and the 9-10px labels read thin, so weights get one notch and sizes a floor.
function fonts(css) {
  return css
    .replace(/font-weight\s*:\s*300\b/g, 'font-weight: 400')
    .replace(/font-size\s*:\s*(8|8\.5|9|9\.5|10|10\.5)px/g, 'font-size: 11px')
    .replace(/font-size\s*:\s*(11|11\.5|12|12\.5)px/g, 'font-size: 12px')
    .replace(/font-size\s*:\s*(13|13\.5)px/g, 'font-size: 14px')
    .replace(/letter-spacing\s*:\s*0?\.(2[2-9]|[3-9]\d?)em/g, 'letter-spacing: 0.2em');
}
function recolour(css) {
  css = css.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, 'rgba($1,$2,$3,1)');
  css = fonts(lift(css));
  return fixInverse(css)
    .replace(/rgba\(\s*237\s*,\s*232\s*,\s*223\s*,\s*([\d.]+)\s*\)/g, (_, a) => rgba(C.graphite, +a <= 0.12 ? Math.min(1, a * 1.5) : Math.min(1, a * 1.1)))
    .replace(/rgba\(\s*154\s*,\s*149\s*,\s*144\s*,\s*([\d.]+)\s*\)/g, (_, a) => `rgba(94,104,115,${a})`)
    .replace(/rgba\(\s*196\s*,\s*169\s*,\s*122\s*,\s*([\d.]+)\s*\)/g, (_, a) => +a < 0.2 ? rgba(C.taupe, Math.min(1, a * 1.8)) : rgba(C.taupeDeep, Math.min(1, +a + 0.1)))
    .replace(/rgba\(\s*(12\s*,\s*13\s*,\s*16|11\s*,\s*12\s*,\s*15|10\s*,\s*11\s*,\s*13)\s*,\s*([\d.]+)\s*\)/g, (_, __, a) => rgba(C.white, +a))
    .replace(/rgba\(\s*17\s*,\s*19\s*,\s*22\s*,\s*([\d.]+)\s*\)/g, (_, a) => rgba(C.stone, +a))
    .replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g, (m, a) => +a < 0.3 ? rgba(C.graphite, Math.min(1, a * 1.6)) : m)
    .replace(/rgba\(\s*77\s*,\s*98\s*,\s*114\s*,\s*([\d.]+)\s*\)/g, (_, a) => +a < 0.2 ? rgba(C.taupe, Math.min(1, a * 1.2)) : `rgba(94,104,115,${a})`)
    .replace(/(box-shadow|filter|text-shadow)\s*:([^;]*)/g, (m, prop, v) => `${prop}:` + v.replace(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)/g, (_, a) => `rgba(52,44,34,${+(a * 0.32).toFixed(3)})`))
    .replace(/#0C0D10\b/gi, '#FFFFFF')
    .replace(/#(0B0C0F|0B0B0B)\b/gi, '#F4F1EA')
    .replace(/#(111317|111316|101114)\b/gi, '#F4F1EA')
    .replace(/#(181B1F|141518|17191D|131210|21252B)\b/gi, '#FAF9F6')
    .replace(/#EDE8DF\b/gi, hex(C.graphite))
    .replace(/#9A9590\b/gi, C.slate)
    .replace(/#(72787F|6B7078)\b/gi, '#5F6770')
    .replace(/#C4A97A\b/gi, hex(C.taupeDeep))
    .replace(/#(D98A8A|E07070|D08F8F|C97A7A)\b/gi, '#A3443D')
    .replace(/--brand:\s*#4D6272/gi, '--brand: #151719')
    .replace(/--brand-lt:\s*#607D8F/gi, '--brand-lt: #5E6873')
    .replace(/brightness\(0\)\s*invert\(1\)/g, 'brightness(0)')
    .replace(/-webkit-text-stroke:\s*1px\s*rgba\([^)]*\)/g, '-webkit-text-stroke: 1px rgba(21,23,25,0.05)');
}

// Product pages: the desktop gallery shows every photo of the colourway (two columns, three rows), and the long tail
// of the info column (quotes, fit note, video, description, accordions, ref) moves into a band under the grid, so the
// two columns end together instead of leaving a blank left column while the shopper scrolls the info.
// [key, large file for the phone viewer, alt]
const GALLERY = {
  'product-midnight-black': [
    ['img7', 'img7-wide.webp', 'Midnight Black cover, front view'],
    ['img9', 'img9-wide.webp', "Midnight Black cover fitted on a driver's seat"],
    ['twin-set-midnight-black', 'twin-set-midnight-black-1200.jpg', 'Midnight Black Twin Set, both covers'],
    ['img5', 'img5-wide.webp', 'Embroidered Altara script on the headrest'],
    ['img6', 'img6-1200.webp', 'Anti-slip base and clip detail'],
    ['img10', 'img10-1200.jpg', 'Midnight Black cover fitted, seen from the door'],
  ],
  'product-contrast-white': [
    ['img1', 'img1-wide.webp', 'Contrast White cover, front view'],
    ['img2', 'img2-wide.webp', "Contrast White cover fitted on a driver's seat"],
    ['twin-set-contrast-white', 'twin-set-contrast-white-1200.jpg', 'Contrast White Twin Set, both covers'],
    ['img3', 'img3-wide.webp', 'White piping along the seat edge'],
    ['img8', 'img8-wide.webp', "Contrast White cover from the driver's door"],
    ['img4', 'img4-1200.jpg', 'Altara bag with white piping in the footwell'],
  ],
};
function productPage(p, html) {
  const shots = GALLERY[p]; if (!shots) return html;
  const thumbs = shots.map(([k, full, alt], i) =>
    `      <button class="ph-thumb${i ? '' : ' active'}" data-src="Product Photos/opt/${full}"><img src="Product Photos/opt/${k}-320.jpg" alt="${alt}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async" width="320" height="240"></button>`).join('\n');
  html = html.replace(/<div class="ph-thumbs">[\s\S]*?<\/div>/, `<div class="ph-thumbs">\n${thumbs}\n    </div>`);
  const tail = html.match(/\n[ \t]*<div class="pi-quotes-wrap">[\s\S]*?<p class="pi-ref">[^\n]*<\/p>/);
  if (!tail) { console.warn(p, ': info tail not found, column left as is'); return html; }
  const cut = tail[0].indexOf('<div class="pi-sep"></div>');
  const media = tail[0].slice(0, cut), text = tail[0].slice(cut);
  html = html.replace(tail[0], '');
  return html.replace('<!-- WHY IT WINS -->',
    `<section class="ph-more">\n  <div class="ph-more-text">${text}\n  </div>\n  <div class="ph-more-media">${media}\n  </div>\n</section>\n\n<!-- WHY IT WINS -->`);
}

const HEAD = `
  <link rel="stylesheet" href="/white-site/alpine.css">`;

// One static line replaces the marquee on every page. The element keeps its class: a script measures its height.
const ANNOUNCE = `<div class="announce-bar"><p class="ab-line"><span class="ab-a">Free tracked shipping over $80</span><span class="ab-sep">·</span><span class="ab-b">60-day fit guarantee</span><span class="ab-sep ab-sep-c">·</span><span class="ab-c">Afterpay, Zip and Klarna</span></p></div>`;

for (const p of PAGES) {
  let html = productPage(p, fs.readFileSync(`${p}.html`, 'utf8'));
  html = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_, attrs, css) => `<style${attrs}>${recolour(css)}</style>`);
  html = html.replace(/style="([^"]*)"/g, (_, s) => `style="${recolour(s)}"`);
  html = html.replace(/<script(?![^>]*src)([^>]*)>([\s\S]*?)<\/script>/g, (_, a, js) => `<script${a}>${js.replace(/(['"])#0C0D10\1/gi, "'#FFFFFF'").replace(/rgba\(\s*237\s*,\s*232\s*,\s*223\s*,\s*([\d.]+)\s*\)/g, (_, al) => rgba(C.graphite, +al)).replace(/#C4A97A/gi, '#7A6B57').replace(/#EDE8DF/gi, '#151719')}</script>`);
  html = html.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#FFFFFF">')
    .replace(/<meta name="color-scheme" content="dark">/, '<meta name="color-scheme" content="light">')
    .replace(/<html([^>]*)style="background:[^"]*"/, '<html$1style="background:#FFFFFF"');
  html = html.replace(/<div class="announce-bar">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/, ANNOUNCE);
  // pages built without the bar get the same one, so the nav sits at the same height everywhere
  if (!html.includes('class="announce-bar"')) html = html.replace(/(<body[^>]*>)/, `$1\n  ${ANNOUNCE}`);
  // "Precision engineered": the 1600px wide studio crop fills the half-width column (the live page's 640px file was blurry on 2x screens)
  if (p === 'index') html = html.replace('src="Product Photos/opt/img5-640.jpg"', 'src="Product Photos/opt/img5-wide.webp"').replace(/(img5-wide\.webp"[^>]*?)width="1086" height="1448"/, '$1width="1600" height="1194"')
    // hero: the 1600px master for Retina screens (the half-width column is ~1400 device pixels on a 2x laptop), 1200 webp below that
    .replace('<img src="Product Photos/opt/hero-1200.webp"', '<img src="Product Photos/opt/hero-1600.jpg" srcset="Product Photos/opt/hero-1200.webp 1200w, Product Photos/opt/hero-1600.jpg 1600w" sizes="(max-width: 1100px) 100vw, 48vw"')
    // "Built with intention": the live page uses the 640px file; the half-width column on a 2x laptop is ~1440 device pixels wide
    .replace('<img src="Product Photos/opt/img6-640.jpg" alt="Altara seat cover detail"', '<img src="Product Photos/opt/img6-full.jpg" srcset="Product Photos/opt/img6-640.jpg 640w, Product Photos/opt/img6-1200.jpg 900w, Product Photos/opt/img6-full.jpg 1086w" sizes="(max-width: 1100px) 100vw, 50vw" alt="Altara seat cover detail"');
  html = html.replace('</head>', HEAD + '\n</head>');
  html = html.replace(/<\/body>/, '  <script src="/white-site/alpine.js" defer></script>\n</body>');
  html = html.replace(/<body([^>]*)>/, (m, a) => /class="/.test(a) ? m.replace(/class="/, `class="alpine page-${p} `) : `<body${a} class="alpine page-${p}">`);
  html = html.replace(/(src=")\/?transition\.js/g, '$1/white-site/transition.js');
  fs.writeFileSync(`white-site/${p}.html`, html);
}
fs.writeFileSync('white-site/transition.js', fs.readFileSync('transition.js', 'utf8').replace(/#0C0D10/gi, '#FFFFFF'));
console.log('built', PAGES.length, 'pages');
