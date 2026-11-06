/* Homepage "Your day" showcase: tabs, auto-advance, and video playback for the active slide only. */
(function () {
  var root = document.querySelector('[data-showcase]');
  if (!root) return;
  var tabs = [].slice.call(root.querySelectorAll('[role="tab"]'));
  var panels = [].slice.call(root.querySelectorAll('[role="tabpanel"]'));
  var slides = [].slice.call(root.querySelectorAll('[data-slide]'));
  var frameTitle = root.querySelector('[data-frame-title]');
  var tablist = root.querySelector('[role="tablist"]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = 0, visible = false, hovering = false;
  if (reduce) root.classList.add('is-static');

  // Slide 2 is a live, non-interactive copy of the auto-stack tow viewer. Its module is only imported once the slide is first shown,
  // and it plays only while that slide is active and on screen (one WebGL context, paused the rest of the time).
  var towHost = root.querySelector('[data-tow-preview]');
  var towSlide = towHost && towHost.closest('[data-slide]');
  var tow = null, towLoading = false;
  function loadTow() {
    if (towLoading) return;
    towLoading = true;
    import(new URL('assets/tow/tow-viewer.js?v=20261106-9', document.baseURI).href)
      .then(function (m) { return m.mountTowViewer(towHost, { interactive: false }); })
      .then(function (c) { tow = c; syncMotion(); })
      .catch(function () {});
  }

  function syncMotion() {
    root.classList.toggle('is-paused', !visible || hovering || document.hidden);
    if (towSlide) {
      var towOn = slides[current] === towSlide && visible && !document.hidden;
      if (towOn && !tow) loadTow();
      if (tow) { if (towOn) tow.resume(); else tow.pause(); }
    }
    slides.forEach(function (slide, i) {
      var video = slide.querySelector('video');
      if (!video) return;
      if (i === current && visible && !document.hidden && !reduce) {
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        video.pause();
      }
    });
  }

  function select(i, opts) {
    opts = opts || {};
    current = (i + tabs.length) % tabs.length;
    tabs.forEach(function (tab, n) {
      tab.setAttribute('aria-selected', n === current ? 'true' : 'false');
      tab.tabIndex = n === current ? 0 : -1;
    });
    panels.forEach(function (panel, n) { panel.hidden = n !== current; });
    slides.forEach(function (slide, n) { slide.classList.toggle('is-active', n === current); });
    frameTitle.textContent = tabs[current].getAttribute('data-frame');
    if (opts.manual) root.classList.add('is-manual');
    if (tablist.scrollWidth > tablist.clientWidth) {
      var t = tabs[current];
      tablist.scrollTo({ left: t.offsetLeft - (tablist.clientWidth - t.offsetWidth) / 2, behavior: 'smooth' });
    }
    if (opts.focus) tabs[current].focus();
    syncMotion();
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { select(i, { manual: true }); });
    tab.addEventListener('keydown', function (e) {
      var next = { ArrowDown: current + 1, ArrowRight: current + 1, ArrowUp: current - 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(next, { manual: true, focus: true });
    });
  });

  // The progress bar's animation drives the auto-advance, so the bar and the swap never drift apart.
  root.addEventListener('animationend', function (e) {
    if (e.animationName === 'showcase_fill' && !root.classList.contains('is-manual')) select(current + 1);
  });
  // Using a slide's own controls means the visitor is exploring, so stop auto-advancing.
  root.addEventListener('click', function (e) { if (e.target.closest('.moves_item')) root.classList.add('is-manual'); });
  root.addEventListener('mouseenter', function () { hovering = true; syncMotion(); });
  root.addEventListener('mouseleave', function () { hovering = false; syncMotion(); });
  document.addEventListener('visibilitychange', syncMotion);

  // Only run while at least 40% of the showcase is on screen (same scroll-based approach as site.js).
  var ticking = false;
  function checkVisible() {
    ticking = false;
    var r = root.getBoundingClientRect();
    var overlap = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    var next = overlap >= Math.min(r.height, window.innerHeight) * 0.4;
    if (next !== visible) { visible = next; syncMotion(); }
  }
  function queueCheck() { if (!ticking) { ticking = true; requestAnimationFrame(checkVisible); } }
  window.addEventListener('scroll', queueCheck, { passive: true });
  window.addEventListener('resize', queueCheck);
  checkVisible();
})();
