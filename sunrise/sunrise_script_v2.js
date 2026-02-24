/**
 * sunrise_script_v2.js
 * Sttugs animated landing page — adapted from Sunrise Robotics.
 * Uses GSAP 3.14.2 (ScrollSmoother, ScrollTrigger, DrawSVGPlugin).
 */

"use strict";

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
  const fixedNav = document.querySelector(".nav_wrap.home.fixed");
  if (!fixedNav) return;
  if (theme === "light") {
    fixedNav.classList.add("nav--light");
  } else {
    fixedNav.classList.remove("nav--light");
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
  const missionWrap = document.querySelector(".mission_wrap-a");
  const bgCircle = document.querySelector(".bg_circle path");
  const bgCircleSmall = document.querySelector(".bg_circle_small path");

  if (!heroWrap) return;

  // Initial states
  initRunwayCanvas();                         // size canvas and draw progress=0 frame
  gsap.set(heroSubtitleWrap, { y: 40, opacity: 0 });
  gsap.set(missionWrap, { y: "100%" });
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
          // Lines canvas fades out 0.25-0.40 (white bg), mission starts at 0.58 (dark).
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

  // 5. Mission section slides up over hero — delayed so user scrolls more first
  mainTimeline.to(
    missionWrap,
    {
      y: "0%",
      ease: "power2.inOut",
    },
    0.58
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
    // Close all
    items.forEach((el) => {
      el.classList.remove("active");
      const content = el.querySelector(".accordion_content");
      if (content) gsap.to(content, { height: 0, opacity: 0, duration: 0.3, ease: "power2.inOut" });
    });
    // Hide all visuals
    visuals.forEach((v) => v.classList.remove("active"));

    // Open selected
    item.classList.add("active");
    const content = item.querySelector(".accordion_content");
    if (content) {
      gsap.set(content, { height: "auto", opacity: 1 });
      gsap.from(content, { height: 0, opacity: 0, duration: 0.35, ease: "power2.out" });
    }

    // Show matching visual
    const visualId = item.getAttribute("data-visual");
    if (visualId) {
      const panel = document.getElementById(visualId);
      if (panel) panel.classList.add("active");
    }
  }

  // Open first item by default
  openItem(items[0]);

  items.forEach((item) => {
    const title = item.querySelector(".tab_title");
    if (title) {
      title.addEventListener("click", () => {
        if (!item.classList.contains("active")) openItem(item);
      });
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
    el.addEventListener("click", closeMenu)
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
   MAIN ENTRY POINT
============================================================ */
(function main() {
  // Set CSS --vh immediately
  setupViewportHeight();
  initYear();
  initNavStates();

  // Wait for DOM + layout to be ready
  window.addEventListener("load", function () {
    initRunwayCanvas();

    const smoother = initSmoother();

    // Restore scroll position if navigating back
    restoreScrollPos(smoother);

    // Build hero animation
    createAnimation(smoother);

    // Nav theme for sections below the hero
    initPostHeroNavTheme();
    initProductAccordion();
    initProductCards();
    initMobileMenu();
    initContactModal();
    initScrollReveals();
    initPageHandlers(smoother);
    initResize();

    // Refresh scroll triggers after everything is set
    ScrollTrigger.refresh(true);
  });
})();
