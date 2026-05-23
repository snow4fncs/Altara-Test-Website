(function () {
  // Use a solid overlay div — NOT html opacity.
  // opacity:0 on html makes the element transparent, exposing the browser's
  // white canvas behind it. A solid fixed div physically covers everything.
  var OL_BG = '#0C0D10';
  var ol = document.createElement('div');
  ol.style.cssText = 'position:fixed;inset:0;background:' + OL_BG + ';z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(ol);

  var navigating = false;
  var revealed = false;

  function forceInViewport() {
    try {
      var revEls = document.querySelectorAll('.rev:not(.in)');
      for (var i = 0; i < revEls.length; i++) {
        if (revEls[i].getBoundingClientRect().top < window.innerHeight + 1) {
          revEls[i].style.transition = 'none';
          revEls[i].classList.add('in');
        }
      }
      var preEls = document.querySelectorAll('.pre-reveal');
      for (var j = 0; j < preEls.length; j++) {
        preEls[j].style.transition = 'none';
        preEls[j].classList.remove('pre-reveal');
      }
    } catch (ignore) {}
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    forceInViewport();
    ol.style.transition = 'opacity 0.5s cubic-bezier(0.4,0,0.2,1)';
    ol.style.opacity = '0';
  }

  // Hard failsafe — page always reveals within 5s no matter what
  var globalFailsafe = setTimeout(reveal, 5000);

  function scheduleReveal() {
    // Wait for fonts, but cap at 1.5s so a slow CDN never stalls the page
    var fontTimeout = setTimeout(reveal, 1500);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        clearTimeout(fontTimeout);
        setTimeout(reveal, 80);
      });
    } else {
      clearTimeout(fontTimeout);
      setTimeout(reveal, 80);
    }
  }

  function go() {
    clearTimeout(globalFailsafe);
    globalFailsafe = setTimeout(reveal, 5000);

    // Wait for the hero image (above-fold only, not all images)
    var hero = document.querySelector('[fetchpriority="high"]') || document.querySelector('.ph-main-img');
    if (hero && !hero.complete) {
      var settled = false;
      function onSettled() {
        if (settled) return;
        settled = true;
        scheduleReveal();
      }
      hero.addEventListener('load', onSettled, { once: true });
      hero.addEventListener('error', onSettled, { once: true });
      setTimeout(onSettled, 2000); // never wait more than 2s for hero
    } else {
      scheduleReveal();
    }
  }

  if (document.readyState !== 'loading') {
    go();
  } else {
    document.addEventListener('DOMContentLoaded', go);
  }

  // bfcache: back/forward button restores a frozen page
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      navigating = false;
      revealed = false;
      ol.style.transition = 'none';
      ol.style.opacity = '1';
      requestAnimationFrame(function () { requestAnimationFrame(go); });
    }
  });

  // Exit: fade overlay to dark, navigate when transition ends
  document.addEventListener('click', function (e) {
    if (navigating) return;
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    if (href.startsWith('http') && !href.includes('altaradesign.com')) return;
    if (link.target === '_blank') return;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
    e.preventDefault();
    navigating = true;

    ol.style.transition = 'opacity 0.22s ease';
    ol.style.opacity = '1';

    var navFired = false;
    function doNav() {
      if (navFired) return;
      navFired = true;
      window.location.href = href;
    }
    ol.addEventListener('transitionend', doNav, { once: true });
    setTimeout(doNav, 350);
  });
})();
