(function () {
  var overlay = document.createElement('div');
  // translateZ(0) forces a GPU compositing layer — eliminates iOS repaint flicker
  overlay.style.cssText = 'position:fixed;inset:0;background:#0C0D10;z-index:99999;pointer-events:none;opacity:1;transition:opacity 0.28s cubic-bezier(0.4,0,0.2,1);-webkit-transform:translateZ(0);transform:translateZ(0);will-change:opacity;';
  document.documentElement.appendChild(overlay);

  var navigating = false;

  function fadeOut() {
    overlay.style.opacity = '0';
  }

  // Fade in on page load
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      fadeOut();
    });
  });

  // bfcache restore (back/forward button): page is frozen mid-transition with opacity:1
  // reset and fade out so the screen doesn't stay black
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      navigating = false;
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          overlay.style.transition = 'opacity 0.28s cubic-bezier(0.4,0,0.2,1)';
          fadeOut();
        });
      });
    }
  });

  // Fade out on internal link click
  document.addEventListener('click', function (e) {
    if (navigating) return; // block double-tap / rapid clicks causing flicker
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('http') && !href.includes('altaradesign.com')) return;
    if (link.target === '_blank') return;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
    e.preventDefault();
    navigating = true;
    overlay.style.opacity = '1';
    setTimeout(function () {
      window.location.href = href;
    }, 260);
  });
})();
