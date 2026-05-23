(function () {
  // Create overlay
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#0C0D10;z-index:99999;pointer-events:none;opacity:1;transition:opacity 0.35s cubic-bezier(0.4,0,0.2,1);';
  document.documentElement.appendChild(overlay);

  // Fade in on page load
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      overlay.style.opacity = '0';
    });
  });

  // Fade out on internal link click
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('http') && !href.includes('altaradesign.com')) return;
    if (link.target === '_blank') return;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
    e.preventDefault();
    overlay.style.opacity = '1';
    setTimeout(function () {
      window.location.href = href;
    }, 320);
  });
})();
