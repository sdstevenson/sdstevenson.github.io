/**
 * site.js
 * Sttugs animated landing page — adapted from Sunrise Robotics.
 * Uses GSAP 3.14.2 (ScrollSmoother, ScrollTrigger, DrawSVGPlugin).
 */

"use strict";

/* Register GSAP plugins — guard against Club plugins not being loaded on detail pages */
{
  const _plugins = [];
  if (typeof ScrollTrigger  !== 'undefined') _plugins.push(ScrollTrigger);
  if (typeof DrawSVGPlugin  !== 'undefined') _plugins.push(DrawSVGPlugin);
  if (typeof ScrollSmoother !== 'undefined') _plugins.push(ScrollSmoother);
  if (_plugins.length) gsap.registerPlugin(..._plugins);
}

/* ============================================================
   CONSTANTS
============================================================ */
const COLORS = { base: "#FFFFFF", accent: "#2563EB" };

const GRADIENT_STAGES = { start: 0, topComplete: 0.25, bothComplete: 0.5 };
const NAV_TRIGGER_POINTS = { show: 0.35, hide: 0.55 };

/** Session-storage key for scroll position persistence (Sttugs-namespaced) */
const KEY = "__sttugs_y";

/* ============================================================
   VIEWPORT HEIGHT (CSS custom property --vh)
============================================================ */
function setupViewportHeight() {
  function set() {
    document.documentElement.style.setProperty("--vh", window.innerHeight * 0.01 + "px");
  }
  set();
  window.addEventListener("resize", debounce(set, 100));
}

/* ============================================================
   SCROLL SMOOTHER INIT
============================================================ */
function initSmoother() {
  // Only create ScrollSmoother on pages that have the required wrapper elements
  if (!document.getElementById('smooth-wrapper') || !document.getElementById('smooth-content')) {
    return null;
  }
  // On mobile, skip ScrollSmoother entirely — native browser scroll is
  // compositor-accelerated (off the main thread). normalizeScroll:true would
  // replace that with JS-driven scroll, causing severe jank on mobile devices.
  if (window.matchMedia('(max-width: 768px)').matches) {
    return null;
  }
  return ScrollSmoother.create({
    wrapper: "#smooth-wrapper",
    content: "#smooth-content",
    smooth: 0,
    normalizeScroll: true,
    ignoreMobileResize: true,
  });
}

/* ============================================================
   DEBOUNCE
============================================================ */
function debounce(fn, delay) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ============================================================
   RUNWAY CANVAS — draws horizontal black lines + white center
   dashes that scroll downward as progress advances (0→1),
   simulating forward motion along a runway / road.
============================================================ */

/** Resize canvas pixel buffer to match its CSS size. */
function initRunwayCanvas() {
  const canvas = document.getElementById("hero-lines-canvas");
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || window.innerWidth;
  canvas.height = canvas.offsetHeight || window.innerHeight;
  const logoEl = document.querySelector(".svg_circle");
  let logoCenterY;
  if (logoEl) {
    const r = logoEl.getBoundingClientRect();
    logoCenterY = (r.top + r.bottom) / 2;
  }
  drawRunwayLines(canvas, 0, logoCenterY);
}

/**
 * Draw the animated runway lines onto the canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number} progress   0 = scroll start, 1 = scroll end
 * @param {number} [dashTopY] Y coordinate where dashes begin (logo center). Defaults to H*0.65.
 */
function drawRunwayLines(canvas, progress, dashTopY) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const startY = H * 0.25;     // lines begin at ~25% from top
  const zoneH  = H - startY;   // visible zone: lower 75% of screen

  // Horizontal line spacing: 4 px at start → 15 px at end
  const spacing = 4 + 11 * progress;

  // How far lines have scrolled downward (wraps so new lines feed in from top)
  const scrollOffset = progress * 520;
  const wrappedOffset = scrollOffset % zoneH;

  // Draw enough lines to always fill the zone at current spacing
  const numLines = Math.ceil(zoneH / spacing) + 4;
  ctx.lineWidth = 1;
  for (let i = 0; i < numLines; i++) {
    const y = startY + ((i * spacing + wrappedOffset) % zoneH);
    if (y < startY || y > H) continue;
    const alpha = Math.max(0.1, 0.75 - progress * 0.35);
    ctx.strokeStyle = `rgba(15,23,42,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // White center dashes (runway / road lane markings)
  // dashTopY tracks the live logo center so dashes never overlap the logo.
  const dashStartY = (dashTopY !== undefined) ? dashTopY : H * 0.65;
  const dashZoneH  = H - dashStartY;
  const dashLen    = 22;
  const dashGap    = 16;
  const dashPeriod = dashLen + dashGap;
  const dashOffset = (progress * 650) % dashZoneH;
  const numDashes  = Math.ceil(dashZoneH / dashPeriod) + 4;
  const cx = W / 2;
  ctx.save();
  ctx.rect(0, dashStartY, W, dashZoneH);  // clip so dashes can never draw above dashStartY
  ctx.clip();
  ctx.lineWidth = 2.5;
  for (let i = 0; i < numDashes; i++) {
    const dy    = dashStartY + ((i * dashPeriod + dashOffset) % dashZoneH);
    const dyEnd = dy + dashLen;
    if (dy > H || dyEnd < dashStartY) continue;
    const alpha = Math.max(0.05, 0.65 - progress * 0.40);
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(cx, Math.max(dy, dashStartY));
    ctx.lineTo(cx, Math.min(dyEnd, H));
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   NAV THEME  (dark = navy bg / white text,  light = white bg / navy text)
============================================================ */
function setNavTheme(theme) {
  // Legacy home nav (kept for safety — no longer present after snav migration)
  const fixedNav = document.querySelector(".nav_wrap.home.fixed");
  if (fixedNav) {
    if (theme === "light") fixedNav.classList.add("nav--light");
    else fixedNav.classList.remove("nav--light");
  }
  // Shared snav header (injected by injectSharedNav on all pages including index)
  const snavHeader = document.getElementById("sttugs-nav-header");
  if (snavHeader) {
    if (theme === "light") snavHeader.classList.add("snav--light");
    else snavHeader.classList.remove("snav--light");
  }
}

/* Set up ScrollTriggers for sections after the hero */
function initPostHeroNavTheme() {
  document.querySelectorAll("[data-bg-type]").forEach((section) => {
    const theme = section.dataset.bgType; // "light" or "dark"
    ScrollTrigger.create({
      trigger: section,
      start: "top top+=1",
      end: "bottom top+=1",
      onEnter: ()      => setNavTheme(theme),
      onEnterBack: ()  => setNavTheme(theme),
    });
  });
}

/* ============================================================
   LOGO GLOW UPDATE (replaces gradient circle animation)
   Drives the drop-shadow filter on #logo-sun-wrap:
   starts as a bright white sun-glow, fades to nothing
   as the logo settles into its final position.
============================================================ */
function updateCircleGradient(progress) {
  const wrap = document.getElementById("logo-sun-wrap");
  if (!wrap) return;

  // Glow fades from full (progress=0) to gone (progress≥0.4)
  const brightness = Math.max(0, 1 - progress * 2.5);

  if (brightness < 0.005) {
    wrap.style.filter = "none";
    return;
  }

  const r1 = Math.round(20 + brightness * 80);
  const r2 = Math.round(10 + brightness * 150);
  const a1 = (0.1 + brightness * 0.85).toFixed(2);
  const a2 = (0.05 + brightness * 0.45).toFixed(2);
  wrap.style.filter =
    `drop-shadow(0 0 ${r1}px rgba(255,255,255,${a1})) ` +
    `drop-shadow(0 0 ${r2}px rgba(255,255,255,${a2}))`;
}

/* ============================================================
   MAIN ANIMATION CREATION
============================================================ */
function createAnimation(smoother) {
  const heroWrap = document.querySelector(".hero_wrap");
  const overlay = document.querySelector(".overlay");
  const heroLinesWrap = document.querySelector(".hero_lines_wrap");
  const svgCircle = document.querySelector(".svg_circle");
  const logoBase = document.querySelector(".logo-sun-base");
  const logoFull = document.querySelector(".logo-sun-full");
  const heroTitle = document.querySelector(".hero_title");
  const linesCanvas = document.getElementById("hero-lines-canvas");
  const heroSubtitleWrap = document.querySelector(".hero_subtitle_wrap");
  const heroSubtitle = document.querySelector(".hero_subtitle");
  const bgCircle = document.querySelector(".bg_circle path");
  const bgCircleSmall = document.querySelector(".bg_circle_small path");

  if (!heroWrap) return;

  // Initial states
  initRunwayCanvas();                         // size canvas and draw progress=0 frame
  gsap.set(heroSubtitleWrap, { y: 40, opacity: 0 });
  gsap.set(svgCircle, { y: window.innerHeight * 0.4 });
  if (heroTitle) gsap.set(heroTitle, { opacity: 1 });

  // Draw the background circles with DrawSVGPlugin
  if (bgCircle) {
    gsap.set(bgCircle, { drawSVG: "0% 0%" });
    gsap.to(bgCircle, { drawSVG: "0% 100%", duration: 3, ease: "power2.inOut", delay: 0.5 });
  }
  if (bgCircleSmall) {
    gsap.set(bgCircleSmall, { drawSVG: "0% 0%" });
    gsap.to(bgCircleSmall, { drawSVG: "0% 100%", duration: 2.5, ease: "power2.inOut", delay: 1 });
  }

  const vh = window.innerHeight;
  let lastProgress = -1;

  // Pin the hero section and run the scroll-driven timeline
  const mainTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: heroWrap,
      start: "top top",
      end: () => "+=" + vh * 4,
      pin: true,
      scrub: 1,
      anticipatePin: 1,
      onUpdate: (self) => {
        const p = self.progress;
        if (Math.abs(p - lastProgress) > 0.001) {
          lastProgress = p;
          // Compute logo center in viewport coords so dashes always end exactly there.
          const logoEl = document.querySelector(".svg_circle");
          let logoCenterY;
          if (logoEl) {
            const r = logoEl.getBoundingClientRect();
            logoCenterY = (r.top + r.bottom) / 2;
          }
          drawRunwayLines(linesCanvas, p, logoCenterY);
          updateCircleGradient(p);
          // Lines canvas fades out 0.25-0.40 (white bg), white background visible
          setNavTheme(p >= 0.30 && p < 0.55 ? "light" : "dark");
        }
      },
    },
  });

  // 0. Hero title fades out as the logo rises past it.
  //    duration: 0.25 means it finishes at the 25% mark of the total timeline.
  if (heroTitle) {
    mainTimeline.to(heroTitle, { opacity: 0, duration: 0.25, ease: "power2.in" }, 0);
  }

  // 1. Circle: move up and in from the bottom
  //    Final y is positive so the logo lands clearly below the sticky nav bar.
  //    Logo element sits naturally at top:0 of hero; logo height ~340px so center = 170px.
  //    y:90 → logo top = 90px, center = 260px — comfortably below the ~70px nav.
  mainTimeline.to(
    svgCircle,
    {
      y: 90,
      ease: "power2.inOut",
    },
    0
  );

  // (Lines are drawn directly on canvas via onUpdate — no GSAP tween needed)

  // 3. Subtitle fades + slides up after lines are gone (starts at 0.3, done by 0.5)
  mainTimeline.to(
    heroSubtitleWrap,
    {
      y: 0,
      opacity: 1,
      duration: 0.2,
      ease: "power2.out",
    },
    0.3
  );

  // 4a. Fade out the gradient lines-wrap → reveals white hero_wrap background
  //     Starts at 0.25 (once lines are largely done), completes by 0.4
  mainTimeline.to(
    heroLinesWrap,
    {
      opacity: 0,
      duration: 0.15,
      ease: "power2.inOut",
    },
    0.25
  );

  // 4b. Logo crossfade: inner icon (no hangar) → full logo (with hangar outer bounds)
  //     duration: 0.08 = snappy crossfade over a small scroll window
  if (logoBase && logoFull) {
    mainTimeline.to(logoBase, { opacity: 0, duration: 0.08, ease: "power2.in" }, 0.35);
    mainTimeline.to(logoFull, { opacity: 1, duration: 0.08, ease: "power2.out" }, 0.35);
  }

  // 4b. Overlay fades out
  mainTimeline.to(
    overlay,
    {
      opacity: 0,
      ease: "power2.inOut",
    },
    0
  );

  return mainTimeline;
}

/* ============================================================
   PRODUCT ACCORDION
============================================================ */
function initProductAccordion() {
  const items = document.querySelectorAll(".accordion_item");
  const visuals = document.querySelectorAll(".tab-visual");
  if (!items.length) return;

  function openItem(item) {
    // Close all others
    items.forEach((el) => {
      if (el !== item) el.classList.remove("active");
    });
    // Hide all visuals
    visuals.forEach((v) => v.classList.remove("active"));

    // Toggle clicked item
    item.classList.toggle("active");

    // Show matching visual only when opening
    if (item.classList.contains("active")) {
      const visualId = item.getAttribute("data-visual");
      if (visualId) {
        const panel = document.getElementById(visualId);
        if (panel) panel.classList.add("active");
      }
    } else {
      // If collapsed, show the first visual as fallback
      if (visuals.length) visuals[0].classList.add("active");
    }
  }

  // Open first item by default
  items[0].classList.add("active");
  if (visuals.length) visuals[0].classList.add("active");

  items.forEach((item) => {
    const title = item.querySelector(".tab_title");
    if (title) {
      title.addEventListener("click", () => openItem(item));
    }
  });
}

/* ============================================================
   PRODUCT CARDS: SCROLL-TRIGGERED REVEAL
============================================================ */
function initProductCards() {
  const cards = document.querySelectorAll(".product_card");
  if (!cards.length) return;

  gsap.from(cards, {
    scrollTrigger: {
      trigger: "#w-product-grid",
      start: "top 80%",
    },
    y: 50,
    opacity: 0,
    duration: 0.7,
    stagger: 0.15,
    ease: "power2.out",
  });
}

/* ============================================================
   MOBILE MENU
============================================================ */
function initMobileMenu() {
  const toggleBtn = document.querySelector("[data-menu-toggle]");
  const mobileNav = document.querySelector(".nav_mobile");
  const hamburger = document.querySelector(".hamburger_6_wrap");
  if (!toggleBtn || !mobileNav) return;

  let open = false;

  function openMenu() {
    open = true;
    mobileNav.setAttribute("data-nav", "open");
    hamburger && hamburger.classList.add("open");
    gsap.to(mobileNav, { x: "0%", duration: 0.4, ease: "power3.out" });
    document.body.classList.add("scroll-locked");
    gsap.set(mobileNav, { display: "block" });
  }

  function closeMenu() {
    open = false;
    mobileNav.setAttribute("data-nav", "closed");
    hamburger && hamburger.classList.remove("open");
    gsap.to(mobileNav, {
      x: "100%",
      duration: 0.35,
      ease: "power3.in",
      onComplete: () => gsap.set(mobileNav, { display: "none" }),
    });
    document.body.classList.remove("scroll-locked");
  }

  gsap.set(mobileNav, { x: "100%", display: "none" });

  toggleBtn.addEventListener("click", () => (open ? closeMenu() : openMenu()));

  // Close on backdrop click (outside the nav)
  document.addEventListener("click", (e) => {
    if (open && !mobileNav.contains(e.target) && !toggleBtn.contains(e.target)) {
      closeMenu();
    }
  });

  // Close mobile contact CTAs
  mobileNav.querySelectorAll("[data-open-contact]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); closeMenu(); })
  );
}

/* ============================================================
   CONTACT MODAL
============================================================ */
function initContactModal() {
  const overlay = document.querySelector(".modal_overlay-contact");
  const modal = document.querySelector(".modal_wrap-contact");
  const closeBtn = document.querySelector(".modal_close-contact");
  const openers = document.querySelectorAll("[data-open-contact]");

  if (!overlay || !modal) return;

  function openModal() {
    overlay.classList.add("active");
    modal.classList.add("active");
    document.body.classList.add("scroll-locked");
    // Reset form state
    const form = document.getElementById("contact-form");
    const success = document.getElementById("contact-success");
    if (form) form.style.display = "";
    if (success) success.style.display = "none";
  }

  function closeModal() {
    overlay.classList.remove("active");
    modal.classList.remove("active");
    document.body.classList.remove("scroll-locked");
  }

  openers.forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); openModal(); }));
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

/* ============================================================
   SCROLL POSITION RESTORE (session storage)
============================================================ */
function saveScrollPos(smoother) {
  if (smoother) {
    sessionStorage.setItem(KEY, smoother.scrollTop());
  }
}

function restoreScrollPos(smoother) {
  const saved = sessionStorage.getItem(KEY);
  if (saved && smoother) {
    smoother.scrollTo(parseFloat(saved), false);
  }
  sessionStorage.removeItem(KEY);
}

/* ============================================================
   YEAR AUTO-UPDATE
============================================================ */
function initYear() {
  const els = document.querySelectorAll("[data-current-year]");
  const year = new Date().getFullYear();
  els.forEach((el) => (el.textContent = year));
}

/* ============================================================
   RESIZE: RE-POSITION LINES
============================================================ */
function initResize() {
  window.addEventListener(
    "resize",
    debounce(() => {
      initRunwayCanvas();
      ScrollTrigger.refresh(true);
    }, 200)
  );
}

/* ============================================================
   GENERAL SECTION SCROLL REVEALS
============================================================ */
function initScrollReveals() {
  // Mission section (already animated as part of hero)
  // Autonomous + Careers sections fade-in
  const reveals = document.querySelectorAll(
    ".autonomous_wrap, .carrers_wrap, .section-headline, .autonomous_paragraph"
  );
  reveals.forEach((el) => {
    gsap.from(el, {
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        once: true,
      },
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: "power2.out",
    });
  });
}

/* ============================================================
   INITIAL NAV STATE — fixed nav always visible, starts dark
============================================================ */
function initNavStates() {
  // Nav is always on — nothing to hide. CSS handles the default dark theme.
}

/* ============================================================
   PAGE VISIBILITY / HISTORY HANDLERS
============================================================ */
function initPageHandlers(smoother) {
  // Intercept same-origin link clicks to save position
  document.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (href && !href.startsWith("#") && !href.startsWith("http") && !href.startsWith("mailto")) {
      a.addEventListener("click", () => saveScrollPos(smoother));
    }
  });

  window.addEventListener("pagehide", () => saveScrollPos(smoother));

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      restoreScrollPos(smoother);
      ScrollTrigger.refresh(true);
    }
  });
}

/* ============================================================
   SHARED NAV INJECTION
============================================================ */
function initSharedNavBehavior(navHeader) {
  const platformItem  = document.getElementById('sttugs-platform-item');
  const dropTrigger   = platformItem && platformItem.querySelector('.snav-dropdown-trigger');
  const hamburger     = document.getElementById('sttugs-nav-hamburger');
  const mobile        = document.getElementById('sttugs-nav-mobile');
  const mobileOverlay = document.getElementById('sttugs-nav-overlay');
  const closeBtn      = document.getElementById('sttugs-nav-mobile-close');
  const mobPlatToggle = document.getElementById('sttugs-mobile-platform-toggle');
  const mobPlatSub    = document.getElementById('sttugs-mobile-platform-sub');

  // ── Desktop: click Platform to open/close dropdown ──
  if (dropTrigger && platformItem) {
    dropTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = platformItem.classList.toggle('open');
      dropTrigger.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', () => {
      platformItem.classList.remove('open');
      if (dropTrigger) dropTrigger.setAttribute('aria-expanded', 'false');
    });
    platformItem.addEventListener('click', (e) => e.stopPropagation());
  }

  // ── Mobile menu open / close ──
  function openMobileMenu() {
    if (!mobile) return;
    mobile.classList.add('open');
    if (mobileOverlay) mobileOverlay.classList.add('open');
    document.body.classList.add('scroll-locked');
  }
  function closeMobileMenu() {
    if (!mobile) return;
    mobile.classList.remove('open');
    if (mobileOverlay) mobileOverlay.classList.remove('open');
    document.body.classList.remove('scroll-locked');
  }
  if (hamburger)     hamburger.addEventListener('click', openMobileMenu);
  if (closeBtn)      closeBtn.addEventListener('click', closeMobileMenu);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

  // ── Mobile: Platform sub-menu accordion ──
  if (mobPlatToggle && mobPlatSub) {
    mobPlatToggle.addEventListener('click', () => mobPlatSub.classList.toggle('open'));
  }

  // Close mobile menu when a contact CTA is clicked
  if (mobile) {
    mobile.querySelectorAll('[data-open-contact]').forEach(el =>
      el.addEventListener('click', (e) => { e.preventDefault(); closeMobileMenu(); })
    );
  }

  // Escape key closes both
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileMenu();
      if (platformItem) platformItem.classList.remove('open');
    }
  });

  // ── Color-switch: go light-mode when a light section is under the nav ──
  // Uses a scroll listener (not ScrollTrigger) so the state correctly reverts
  // when scrolling back into a dark section from any direction.
  function setupNavColorSwitch() {
    const LIGHT_SELECTOR = '[data-bg-type="light"], .section-light, .section-white, .faq-section';
    const NAV_H = navHeader.offsetHeight || 72;

    let rafPending = false;
    function checkTheme() {
      rafPending = false;
      const midY = NAV_H / 2;
      let isLight = false;
      document.querySelectorAll(LIGHT_SELECTOR).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top <= midY && r.bottom > midY) isLight = true;
      });
      navHeader.classList.toggle('snav--light', isLight);
    }

    function onScroll() {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(checkTheme);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // Run immediately and after full load (fonts/images may shift layout)
    checkTheme();
    window.addEventListener('load', checkTheme);
  }

  // ── Highlight active page in nav ──
  function highlightCurrentPage() {
    const filename = window.location.pathname.split('/').pop() || 'index.html';
    let isOnPlatformPage = false;

    // Desktop: dropdown items
    document.querySelectorAll('.snav-dropdown-item').forEach(a => {
      if (a.getAttribute('href') === filename) {
        a.classList.add('snav-active');
        isOnPlatformPage = true;
      }
    });
    // Desktop: highlight Platform trigger if on a platform page
    if (isOnPlatformPage) {
      const trigger = document.querySelector('.snav-dropdown-trigger');
      if (trigger) trigger.classList.add('snav-active--parent');
    }

    // Mobile: platform sub-links
    document.querySelectorAll('.snav-mobile-sub a').forEach(a => {
      if (a.getAttribute('href') === filename) a.classList.add('snav-active');
    });

    // About page
    if (filename === 'about.html') {
      document.querySelectorAll('.snav-about-link').forEach(a => a.classList.add('snav-active'));
    }

    // ROI page
    if (filename === 'roi.html') {
      document.querySelectorAll('.snav-roi-link').forEach(a => a.classList.add('snav-active'));
    }

    // Home link (detail pages showing Home)
    if (filename === '' || filename === 'index.html') {
      document.querySelectorAll('.snav-home-link').forEach(a => a.classList.add('snav-active'));
    }
  }

  highlightCurrentPage();
  setupNavColorSwitch();
}

function injectSharedNav() {
  const header = document.querySelector('header');
  if (!header) return;
  // Skip index.html — it manages its own animated nav
  if (header.classList.contains('home')) return;
  // Idempotent guard
  if (document.getElementById('sttugs-nav-header')) return;

  header.id        = 'sttugs-nav-header';
  header.className = '';
  header.innerHTML = `
    <nav class="snav">
      <div class="snav-inner">
        <div class="snav-logo">
          <a href="index.html" class="snav-logo-link" aria-label="STTUGS home">
            <img src="../assets/logo.svg" class="snav-logo-img" alt="STTUGS"/>
            <span class="snav-logo-text">STTUGS</span>
          </a>
        </div>
        <ul class="snav-links" role="list">
          <li class="snav-item"><a href="index.html" class="snav-link snav-home-link">Home</a></li>
          <li class="snav-item snav-item--dropdown" id="sttugs-platform-item">
            <button class="snav-link snav-dropdown-trigger" aria-expanded="false" aria-haspopup="true">
              Platform
              <svg class="snav-chevron" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="snav-dropdown">
              <div class="snav-dropdown-section-label">Safety</div>
              <a href="collision-prevention.html" class="snav-dropdown-item">Collision Prevention</a>
              
              <div class="snav-dropdown-section-label">Planning &amp; Optimization</div>
              <a href="planning.html" class="snav-dropdown-item">Digital Twin Planning</a>
              <a href="path-planning.html" class="snav-dropdown-item">Tow-Path Planning</a>
              
              <div class="snav-dropdown-section-label">Execution</div>
              <a href="retrofit.html" class="snav-dropdown-item">Retrofit Kit</a>
              <!-- Autonomous Tugs link intentionally removed -->
              
              <div class="snav-dropdown-section-label">Infrastructure</div>
              <a href="hardware-and-infrastructure.html" class="snav-dropdown-item">Hardware &amp; Infrastructure</a>
              
              <div class="snav-dropdown-section-label">Compliance</div>
              <a href="verifiable-audit-trail.html" class="snav-dropdown-item">Verifiable Audit Trail</a>
            </div>
          </li>
          <li class="snav-item"><a href="about.html" class="snav-link snav-about-link">About</a></li>
          <li class="snav-item"><a href="roi.html" class="snav-link snav-roi-link">ROI Calculator</a></li>
          <li class="snav-item"><a href="#" data-open-contact class="snav-link snav-cta">Contact Us</a></li>
        </ul>
        <button class="snav-hamburger" id="sttugs-nav-hamburger" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>
    <div class="snav-mobile-overlay" id="sttugs-nav-overlay"></div>
    <div class="snav-mobile" id="sttugs-nav-mobile">
      <button class="snav-mobile-close" id="sttugs-nav-mobile-close" aria-label="Close menu">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <ul class="snav-mobile-links">
        <li><a href="index.html" class="snav-mobile-link snav-home-link">Home</a></li>
        <li>
          <div class="snav-mobile-platform-label">Platform</div>
          <div class="snav-mobile-sub open">
            <div class="snav-mobile-section-label">Safety</div>
            <a href="collision-prevention.html">Collision Prevention</a>
            
            <div class="snav-mobile-section-label">Planning &amp; Optimization</div>
            <a href="planning.html">Digital Twin Planning</a>
            <a href="path-planning.html">Tow-Path Planning</a>
            
            <!-- Autonomous Tugs link intentionally removed -->
            <div class="snav-mobile-section-label">Execution</div>
            <a href="retrofit.html">Retrofit Kit</a>
            
            <div class="snav-mobile-section-label">Infrastructure</div>
            <a href="hardware-and-infrastructure.html">Hardware &amp; Infrastructure</a>
            
            <div class="snav-mobile-section-label">Compliance</div>
            <a href="verifiable-audit-trail.html">Verifiable Audit Trail</a>
          </div>
        </li>
        <li><a href="about.html" class="snav-mobile-link snav-about-link">About</a></li>
        <li><a href="roi.html" class="snav-mobile-link snav-roi-link">ROI Calculator</a></li>
      </ul>
      <a href="#" data-open-contact class="snav-mobile-cta">Contact Us</a>
    </div>
  `;
  initSharedNavBehavior(header);
}

/* ============================================================
   SHARED FOOTER + CONTACT MODAL INJECTION
   -----------------------------------------------------------
   Called on every page that loads this script.  Finds the
   <footer> element and populates it, then injects the shared
   contact modal and the minimal CSS both need (idempotent —
   safe to call multiple times).
============================================================ */
function injectSharedComponents() {
  /* ── 1. Shared CSS (inject once) ── */
  if (!document.getElementById('sttugs-shared-styles')) {
    const style = document.createElement('style');
    style.id = 'sttugs-shared-styles';
    style.textContent = `
      /* Shared footer */
      .sttugs-footer {
        background: #0F172A;
        padding: 3rem 0;
        position: relative;
      }
      .sttugs-footer_container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 2rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 2rem;
        flex-wrap: wrap;
      }
      .sttugs-footer_left { display: flex; flex-direction: column; gap: 0.5rem; }
      .sttugs-site_name {
        font-size: 1.25rem;
        font-weight: 800;
        color: #FFFFFF;
        letter-spacing: -0.02em;
        text-decoration: none;
      }
      .sttugs-copyright { font-size: 0.8125rem; color: rgba(255,255,255,0.4); }
      .sttugs-footer_nav { display: flex; gap: 1.25rem; flex-wrap: wrap; align-items: center; }
      .sttugs-footer_link {
        font-size: 0.875rem;
        font-weight: 500;
        color: rgba(255,255,255,0.55);
        text-decoration: none;
        transition: color 0.2s;
      }
      .sttugs-footer_link:hover { color: #FFFFFF; }
      @media (max-width: 600px) {
        .sttugs-footer_container { flex-direction: column; align-items: flex-start; }
      }

      /* Shared contact modal */
      .sttugs-modal-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(15,23,42,0.7);
        z-index: 9000;
        backdrop-filter: blur(4px);
      }
      .sttugs-modal-overlay.active { display: block; }
      .sttugs-modal-wrap {
        display: none;
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: min(520px, 92vw);
        background: #FFFFFF;
        border-radius: 16px;
        z-index: 9001;
        overflow: hidden;
        box-shadow: 0 24px 80px rgba(15,23,42,0.3);
      }
      .sttugs-modal-wrap.active { display: block; }
      .sttugs-modal-inner { padding: 2.25rem 2.5rem 2.5rem; }
      .sttugs-modal-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: #0F172A;
        margin-bottom: 1.25rem;
      }
      .sttugs-modal-divider { height: 1px; background: rgba(15,23,42,0.1); margin: 0 0 1.25rem; }
      .sttugs-modal-form { display: flex; flex-direction: column; gap: 1.1rem; }
      .sttugs-field-label {
        display: block;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #64748B;
        margin-bottom: 0.35rem;
      }
      .sttugs-text-field, .sttugs-textarea {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border: 1.5px solid #CBD5E1;
        border-radius: 8px;
        font-family: inherit;
        font-size: 0.9375rem;
        color: #0F172A;
        background: #F8FAFC;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      .sttugs-text-field:focus, .sttugs-textarea:focus {
        outline: none;
        border-color: #2563EB;
        background: #FFFFFF;
      }
      .sttugs-textarea { min-height: 110px; resize: vertical; }
      .sttugs-submit {
        padding: 0.8rem 1.5rem;
        background: #2563EB;
        color: #FFFFFF;
        border: none;
        border-radius: 8px;
        font-size: 0.9375rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
        align-self: flex-start;
      }
      .sttugs-submit:hover { background: #1d4ed8; }
      .sttugs-modal-success { display: none; padding: 2rem; text-align: center; }
      .sttugs-modal-success.visible { display: block; }
      .sttugs-success-big { font-size: 1.5rem; font-weight: 700; color: #0F172A; margin-bottom: 0.5rem; }
      .sttugs-success-small { font-size: 0.9375rem; color: #64748B; }
      .sttugs-modal-close {
        position: absolute;
        top: 1rem; right: 1rem;
        width: 32px; height: 32px;
        border-radius: 50%;
        background: transparent;
        border: none;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        color: #64748B;
        transition: background 0.2s, color 0.2s;
      }
      .sttugs-modal-close:hover { background: rgba(15,23,42,0.08); color: #0F172A; }

      /* ═══ SHARED NAV ═══ */
      .snav {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 2000;
        background: rgba(15,23,42,0.96);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        transition: background 0.35s ease, border-color 0.35s ease;
      }
      .snav--light .snav {
        background: rgba(255,255,255,0.97);
        border-bottom-color: rgba(15,23,42,0.1);
      }
      .snav-inner {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1.25rem 2.5rem;
        max-width: 1440px; margin: 0 auto;
      }
      .snav-logo-link {
        display: flex; align-items: center; gap: 0.5rem; text-decoration: none;
      }
      .snav-logo-img {
        height: 36px;
        filter: brightness(0) invert(1);
        transition: filter 0.35s ease;
      }
      .snav--light .snav-logo-img { filter: none; }
      .snav-logo-text {
        font-size: 1.1rem; font-weight: 800; letter-spacing: -0.02em;
        color: #fff; transition: color 0.35s ease;
      }
      .snav--light .snav-logo-text { color: #0F172A; }
      .snav-links {
        display: flex; align-items: center; gap: 1.5rem;
        list-style: none; margin: 0; padding: 0;
      }
      .snav-item { position: relative; }
      .snav-link {
        display: flex; align-items: center; gap: 0.3rem;
        font-size: 0.9375rem; font-weight: 600;
        color: rgba(255,255,255,0.75);
        background: none; border: none; cursor: pointer;
        padding: 0.4rem 0.75rem; border-radius: 6px;
        text-decoration: none;
        transition: color 0.35s ease;
        font-family: inherit;
      }
      .snav-link:hover { color: #fff; }
      .snav--light .snav-link { color: rgba(15,23,42,0.65); }
      .snav--light .snav-link:hover { color: #0F172A; }
      .snav-link.snav-active, .snav-dropdown-trigger.snav-active--parent { color: #fff; }
      .snav--light .snav-link.snav-active, .snav--light .snav-dropdown-trigger.snav-active--parent { color: #0F172A; }
      .snav-cta {
        background: #F5A623 !important; color: #0F172A !important;
        padding: 0.45rem 1.1rem !important; border-radius: 7px; font-weight: 700;
      }
      .snav-cta:hover { background: #d4891e !important; color: #fff !important; }
      .snav-roi-link {
        border: 1.5px solid rgba(37,99,235,0.5) !important;
        padding: 0.4rem 1rem !important; border-radius: 7px;
        color: rgba(147,197,253,0.9) !important;
      }
      .snav-roi-link:hover { border-color: #3B82F6 !important; color: #fff !important; background: rgba(37,99,235,0.12) !important; }
      .snav--light .snav-roi-link { border-color: rgba(37,99,235,0.4) !important; color: #1d4ed8 !important; }
      .snav--light .snav-roi-link:hover { border-color: var(--blue) !important; background: rgba(37,99,235,0.08) !important; }
      .snav-chevron {
        width: 12px; height: 12px;
        transition: transform 0.25s; flex-shrink: 0;
      }
      .snav-item--dropdown.open .snav-chevron { transform: rotate(180deg); }
      .snav-dropdown {
        position: absolute;
        top: calc(100% + 0.625rem); left: 50%;
        transform: translateX(-50%) translateY(-8px);
        background: #1E293B;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 0.5rem;
        min-width: 270px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.4);
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s, transform 0.2s;
        z-index: 100;
      }
      .snav--light .snav-dropdown {
        background: #fff;
        border-color: rgba(15,23,42,0.1);
        box-shadow: 0 16px 48px rgba(15,23,42,0.15);
      }
      .snav-item--dropdown.open .snav-dropdown {
        opacity: 1; pointer-events: auto;
        transform: translateX(-50%) translateY(0);
      }
      .snav-dropdown-item {
        display: block; padding: 0.6rem 0.9rem;
        font-size: 0.875rem; font-weight: 500;
        color: rgba(255,255,255,0.75);
        text-decoration: none; border-radius: 8px;
        transition: background 0.15s, color 0.15s;
      }
      .snav-dropdown-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
      .snav-dropdown-item.snav-active { background: rgba(37,99,235,0.2); color: #93C5FD; font-weight: 600; }
      .snav--light .snav-dropdown-item { color: rgba(15,23,42,0.7); }
      .snav--light .snav-dropdown-item:hover { background: #F1F5F9; color: #0F172A; }
      .snav--light .snav-dropdown-item.snav-active { background: rgba(37,99,235,0.1); color: #1d4ed8; }
      .snav-dropdown-section-label {
        display: block; padding: 0.6rem 0.9rem 0.4rem;
        font-size: 0.75rem; font-weight: 700;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: rgba(255,255,255,0.45);
        margin-top: 0.5rem;
      }
      .snav--light .snav-dropdown-section-label { color: rgba(15,23,42,0.4); }
      .snav-dropdown-item--disabled {
        display: block; padding: 0.6rem 0.9rem;
        font-size: 0.875rem; font-weight: 500;
        color: rgba(255,255,255,0.45);
        cursor: not-allowed; border-radius: 8px;
      }
      .snav--light .snav-dropdown-item--disabled { color: rgba(15,23,42,0.4); }
      .snav-hamburger {
        display: none; flex-direction: column; gap: 5px;
        width: 40px; height: 40px;
        align-items: center; justify-content: center;
        background: none; border: none; cursor: pointer; border-radius: 8px;
      }
      .snav-hamburger span {
        display: block; width: 22px; height: 2px;
        background: rgba(255,255,255,0.8); border-radius: 2px;
        transition: background 0.3s;
      }
      .snav--light .snav-hamburger span { background: rgba(15,23,42,0.8); }
      .snav-mobile-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,0.45); z-index: 2050; backdrop-filter: blur(2px);
      }
      .snav-mobile-overlay.open { display: block; }
      .snav-mobile {
        position: fixed; top: 0; right: 0; bottom: 0;
        width: min(320px, 90vw);
        background: #1E293B; z-index: 2100;
        padding: 4.5rem 1.5rem 2rem;
        box-shadow: -8px 0 40px rgba(0,0,0,0.4);
        overflow-y: auto;
        transform: translateX(100%);
        transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
      }
      .snav-mobile.open { transform: translateX(0); }
      .snav-mobile-links {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 0.125rem;
      }
      .snav-mobile-link {
        display: block; padding: 0.85rem 1rem;
        font-size: 1rem; font-weight: 600;
        color: rgba(255,255,255,0.8); text-decoration: none;
        border-radius: 8px; transition: background 0.15s, color 0.15s;
        background: none; border: none; cursor: pointer;
        text-align: left; font-family: inherit; width: 100%;
      }
      .snav-mobile-link:hover { background: rgba(255,255,255,0.07); color: #fff; }
      .snav-mobile-sub {
        max-height: 0; overflow: hidden;
        transition: max-height 0.32s ease;
        padding-left: 0.75rem;
        border-left: 2px solid rgba(37,99,235,0.4);
        margin: 0.125rem 0 0.375rem 1rem;
      }
      .snav-mobile-sub.open { max-height: 500px; }
      .snav-mobile-sub a {
        display: block; padding: 0.55rem 0.75rem;
        font-size: 0.875rem; font-weight: 500;
        color: rgba(255,255,255,0.6); text-decoration: none;
        border-radius: 6px; transition: background 0.15s, color 0.15s;
      }
      .snav-mobile-sub a:hover { background: rgba(255,255,255,0.07); color: #fff; }
      .snav-mobile-sub a.snav-active { color: #93C5FD; font-weight: 600; background: rgba(37,99,235,0.15); }
      .snav-mobile-section-label {
        display: block; padding: 0.6rem 0.75rem 0.3rem;
        font-size: 0.7rem; font-weight: 700;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: rgba(255,255,255,0.35);
        margin-top: 0.4rem;
      }
      .snav-mobile-item-disabled {
        display: block; padding: 0.55rem 0.75rem;
        font-size: 0.875rem; font-weight: 500;
        color: rgba(255,255,255,0.35);
        cursor: not-allowed; border-radius: 6px;
      }
      .snav-mobile-link.snav-active { color: #fff; background: rgba(255,255,255,0.07); }
      .snav-mobile-cta {
        display: block; margin-top: 1.5rem;
        padding: 0.85rem 1rem; text-align: center;
        background: #2563EB; color: #fff;
        border-radius: 8px; font-weight: 700;
        text-decoration: none; transition: background 0.2s;
      }
      .snav-mobile-cta:hover { background: #1d4ed8; }
      .snav-mobile-close {
        position: absolute; top: 1rem; right: 1rem;
        width: 36px; height: 36px; border-radius: 8px;
        background: rgba(255,255,255,0.07);
        border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: rgba(255,255,255,0.7);
        transition: background 0.15s, color 0.15s;
      }
      .snav-mobile-close:hover { background: rgba(255,255,255,0.14); color: #fff; }
      .snav-mobile-platform-label {
        padding: 0.85rem 1rem 0.4rem;
        font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.1em;
        text-transform: uppercase; color: rgba(255,255,255,0.35);
      }
      @media (max-width: 768px) {
        .snav-links { display: none; }
        .snav-hamburger { display: flex; }
        .snav-inner { padding: 1rem 1.25rem; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── 2. Shared Nav ── */
  injectSharedNav();

  /* ── 3. Footer HTML ── */
  const footer = document.querySelector('footer');
  if (footer) {
    footer.setAttribute('data-bg-type', 'dark');
    footer.className = 'sttugs-footer';
    footer.innerHTML = `
      <div class="sttugs-footer_container">
        <div class="sttugs-footer_left">
          <a href="../index.html" class="sttugs-site_name">STTUGS</a>
          <div class="sttugs-copyright">
            © <span data-current-year></span> Sttugs. Patent Pending.
          </div>
        </div>
        <div class="sttugs-footer_right">
          <nav class="sttugs-footer_nav">
            <a href="#" data-open-contact class="sttugs-footer_link">Contact</a>
            <a href="about.html" class="sttugs-footer_link">About</a>
            <a href="collision-prevention.html" class="sttugs-footer_link">Collision Prevention</a>
            <a href="planning.html" class="sttugs-footer_link">Digital Twin Planning</a>
            <a href="path-planning.html" class="sttugs-footer_link">Tow-Path Planning</a>
            <a href="hardware-and-infrastructure.html" class="sttugs-footer_link">Hardware &amp; Infrastructure</a>
            <!-- Autonomous Tugs link intentionally removed -->
            <a href="retrofit.html" class="sttugs-footer_link">Retrofit Kit</a>
            <a href="verifiable-audit-trail.html" class="sttugs-footer_link">Audit Trail</a>
          </nav>
        </div>
      </div>
    `;
  }

  /* ── 3. Contact Modal HTML (inject once, only on pages that don't
            have their own Webflow-style .modal_wrap-contact) ── */
  const hasLegacyModal = !!document.querySelector('.modal_wrap-contact');
  if (!hasLegacyModal && !document.getElementById('sttugs-shared-modal')) {
    const modalWrap = document.createElement('div');
    modalWrap.id = 'sttugs-shared-modal';
    modalWrap.innerHTML = `
      <div class="sttugs-modal-overlay" id="sttugs-modal-overlay"></div>
      <div class="sttugs-modal-wrap" id="sttugs-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="sttugs-modal-title">
        <button class="sttugs-modal-close" id="sttugs-modal-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="sttugs-modal-inner">
          <div class="sttugs-modal-title" id="sttugs-modal-title">Contact Sttugs</div>
          <div class="sttugs-modal-divider"></div>
          <form id="sttugs-contact-form" class="sttugs-modal-form">
            <div>
              <label class="sttugs-field-label" for="sttugs-email">Your email</label>
              <input class="sttugs-text-field" type="email" id="sttugs-email" name="email" placeholder="you@example.com" required/>
            </div>
            <div>
              <label class="sttugs-field-label" for="sttugs-message">Message</label>
              <textarea class="sttugs-textarea" id="sttugs-message" name="message" placeholder="Tell us about your operation..." required></textarea>
            </div>
            <button type="submit" class="sttugs-submit">Send Message</button>
          </form>
          <div class="sttugs-modal-success" id="sttugs-modal-success">
            <div class="sttugs-success-big">Thank you!</div>
            <div class="sttugs-success-small">We'll be in touch shortly.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalWrap);
  }

  /* ── 4. Wire up the shared modal ── */
  initSharedContactModal();
}

function initSharedContactModal() {
  const overlay  = document.getElementById('sttugs-modal-overlay');
  const modal    = document.getElementById('sttugs-modal-wrap');
  const closeBtn = document.getElementById('sttugs-modal-close');
  const form     = document.getElementById('sttugs-contact-form');
  const success  = document.getElementById('sttugs-modal-success');
  if (!overlay || !modal) return;

  function openModal() {
    overlay.classList.add('active');
    modal.classList.add('active');
    document.body.classList.add('scroll-locked');
    if (form)    form.style.display = '';
    if (success) success.classList.remove('visible');
  }
  function closeModal() {
    overlay.classList.remove('active');
    modal.classList.remove('active');
    document.body.classList.remove('scroll-locked');
  }

  // All [data-open-contact] triggers — re-query so newly injected footer links are found
  document.querySelectorAll('[data-open-contact]').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); openModal(); })
  );
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('sttugs-email')?.value.trim() || '';
      const message = document.getElementById('sttugs-message')?.value.trim() || '';
      // Google Form endpoint (matches other form handlers)
      const gformUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeESQcxH3hDUXmJm-tc7mCYc3_EB9Ef9Iv3A_ha_a9wWfpoYg/formResponse';
      const fd = new FormData();
      // Map modal fields to the Google Form entry IDs used elsewhere in the site
      fd.append('entry.191654158', 'Contact Form Submission');
      fd.append('entry.1925679811', message);
      fd.append('entry.878160977', email);
      // Hide form immediately for UX, show success when request completes
      form.style.display = 'none';
      fetch(gformUrl, { method: 'POST', mode: 'no-cors', body: fd })
        .finally(() => {
          if (success) success.classList.add('visible');
          const btn = form.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
        });
    });
  }

  // Re-run year stamp on freshly injected footer
  document.querySelectorAll('[data-current-year]').forEach(el =>
    el.textContent = new Date().getFullYear()
  );
}

/* ============================================================
   HOME PAGE: PLATFORM DROPDOWN (fixed nav on index.html)
============================================================ */
function initHomeNavDropdowns() {
  const platformItem    = document.getElementById('home-platform-item');
  const platformTrigger = document.getElementById('home-platform-trigger');
  if (!platformItem || !platformTrigger) return;

  // Toggle on click
  platformTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = platformItem.classList.toggle('open');
    platformTrigger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close on outside click
  document.addEventListener('click', () => {
    platformItem.classList.remove('open');
    platformTrigger.setAttribute('aria-expanded', 'false');
  });

  // Prevent the item's own clicks from bubbling to document
  platformItem.addEventListener('click', (e) => e.stopPropagation());
}

/* ============================================================
   MOBILE HERO RESET
   On mobile we skip createAnimation entirely, so elements that
   start off-screen via CSS transforms (hero_subtitle_wrap, overlay)
   need to be reset to their visible/natural state.
============================================================ */
function resetHeroForMobile() {
  const subtitleWrap  = document.querySelector(".hero_subtitle_wrap");
  const overlay       = document.querySelector(".overlay");
  const linesWrap     = document.querySelector(".hero_lines_wrap");

  // Subtitle: CSS has translateY(80%) — show it
  if (subtitleWrap) subtitleWrap.style.transform = "none";
  // Overlay: darken but don't hide the hero entirely
  if (overlay)    overlay.style.opacity = "0";
  // Lines canvas background: hide it so white hero_wrap shows instead
  if (linesWrap)  linesWrap.style.opacity = "0";
}

/* ============================================================
   MAIN ENTRY POINT
============================================================ */
(function main() {
  // Global handler to prevent default for all data-open-contact clicks (capture phase)
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-open-contact]");
    if (target) {
      e.preventDefault();
    }
  }, true); // true = capture phase, fires before other handlers

  // Set CSS --vh immediately
  setupViewportHeight();
  initYear();
  initNavStates();

  // Inject shared footer + modal as early as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSharedComponents);
  } else {
    injectSharedComponents();
  }

  // Detect mobile once — used to skip heavy desktop-only animation work
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  // Wait for DOM + layout to be ready
  window.addEventListener("load", function () {
    const smoother = initSmoother();

    if (!isMobile) {
      // Desktop only: runway canvas + pinned hero scroll animation
      initRunwayCanvas();
      restoreScrollPos(smoother);
      createAnimation(smoother);
      initPageHandlers(smoother);
      initResize();
    } else {
      // Mobile: reset elements that start off-screen (normally driven by animation)
      resetHeroForMobile();
    }

    // Nav theme for sections below the hero
    initPostHeroNavTheme();
    initProductAccordion();
    initProductCards();
    initMobileMenu();
    initContactModal();
    initScrollReveals();
    initHomeNavDropdowns();

    // Only refresh ScrollTrigger on desktop — on mobile this forces a layout
    // recalculation that blocks the main thread unnecessarily
    if (!isMobile) {
      ScrollTrigger.refresh(true);
    }
  });
})();
