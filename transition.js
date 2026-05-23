(function () {
  var de = document.documentElement;
  // Hide the page immediately — before any paint
  de.style.opacity = '0';

  var navigating = false;
  var revealed = false;

  // Instantly complete any scroll-reveal animations already in viewport,
  // so they don't appear as invisible content when the page fades in.
  function forceInViewport() {
    try {
      var revEls = de.querySelectorAll('.rev:not(.in)');
      for (var i = 0; i < revEls.length; i++) {
        if (revEls[i].getBoundingClientRect().top < window.innerHeight + 1) {
          revEls[i].style.transition = 'none';
          revEls[i].classList.add('in');
        }
      }
      var preEls = de.querySelectorAll('.pre-reveal');
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
    de.style.transition = 'opacity 0.5s cubic-bezier(0.4,0,0.2,1)';
    de.style.opacity = '1';
  }

  // Global hard failsafe — page ALWAYS reveals within 5 seconds no matter what
  var globalFailsafe = setTimeout(reveal, 5000);

  function scheduleReveal() {
    // Wait for fonts, but cap the wait at 1.5s so slow CDNs don't stall the page
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
    // Reset global failsafe to count from DOMContentLoaded, not script exec
    clearTimeout(globalFailsafe);
    globalFailsafe = setTimeout(reveal, 5000);

    // Wait for the above-fold hero image specifically (not all images)
    var hero = de.querySelector('[fetchpriority="high"]') || de.querySelector('.ph-main-img');
    if (hero && !hero.complete) {
      var imgSettled = false;
      function onImgSettled() {
        if (imgSettled) return;
        imgSettled = true;
        scheduleReveal();
      }
      hero.addEventListener('load', onImgSettled, { once: true });
      hero.addEventListener('error', onImgSettled, { once: true });
      // Never wait more than 2s for the hero image
      setTimeout(onImgSettled, 2000);
    } else {
      scheduleReveal();
    }
  }

  // Trigger on DOMContentLoaded — faster than window.load,
  // and we handle fonts + hero image ourselves above.
  if (document.readyState !== 'loading') {
    go();
  } else {
    document.addEventListener('DOMContentLoaded', go);
  }

  // bfcache: back/forward button restores a frozen page — re-run the reveal
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      navigating = false;
      revealed = false;
      de.style.transition = 'none';
      de.style.opacity = '0';
      requestAnimationFrame(function () { requestAnimationFrame(go); });
    }
  });

  // Exit transition: fade to transparent, then navigate exactly when fade ends
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

    de.style.transition = 'opacity 0.22s ease';
    de.style.opacity = '0';

    // Navigate as soon as the fade-out transition completes (not a fixed timeout)
    var navFired = false;
    function doNav() {
      if (navFired) return;
      navFired = true;
      window.location.href = href;
    }
    de.addEventListener('transitionend', doNav, { once: true });
    setTimeout(doNav, 350); // fallback if transitionend doesn't fire
  });
})();
