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
   POSITION LINES (fan-out calculation — identical to original)
============================================================ */
function calculatePosition(index, total, height, baseSpacing, factor) {
  const center = height / 2;
  const half = Math.floor(total / 2);
  const offset = index - half;
  const dist = Math.abs(offset);
  let pos = center;
  if (dist === 0) {
    pos = center;
  } else {
    let accumulated = 0;
    for (let i = 1; i <= dist; i++) {
      accumulated += baseSpacing * Math.pow(factor, i - 1);
    }
    pos = offset > 0 ? center + accumulated : center - accumulated;
  }
  return pos;
}

function positionLines() {
  const lines = document.querySelectorAll(".svg_line");
  const total = lines.length;
  const height = window.innerHeight;
  const baseSpacing = 3.4;
  const factor = 1.08;

  lines.forEach((line, i) => {
    const y = calculatePosition(i, total, height, baseSpacing, factor);
    gsap.set(line, { y: y - height / 2, top: "50%" });
  });
}

/* ============================================================
   NAV: DESKTOP COLOUR UPDATES
============================================================ */
function handleDesktopNavUpdate(progress) {
  const fixedNav = document.querySelector(".nav_wrap.home.fixed");
  const absNav = document.querySelector(".nav_wrap.home.absolute");
  if (!fixedNav || !absNav) return;

  if (progress >= NAV_TRIGGER_POINTS.hide) {
    // Past the mission section — show fixed nav, hide absolute
    gsap.to(fixedNav, { duration: 0.35, opacity: 1, pointerEvents: "auto", ease: "power2.out" });
    gsap.to(absNav, { duration: 0.2, opacity: 0, pointerEvents: "none", ease: "power2.out" });
  } else if (progress >= NAV_TRIGGER_POINTS.show) {
    // In the hero transition — hide both (dark region)
    gsap.to(fixedNav, { duration: 0.2, opacity: 0, pointerEvents: "none", ease: "power2.out" });
    gsap.to(absNav, { duration: 0.2, opacity: 0, pointerEvents: "none", ease: "power2.out" });
  } else {
    // Top of page — absolute nav visible
    gsap.to(fixedNav, { duration: 0.25, opacity: 0, pointerEvents: "none", ease: "power2.out" });
    gsap.to(absNav, { duration: 0.25, opacity: 1, pointerEvents: "auto", ease: "power2.out" });
  }
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
  const svgLines = document.querySelectorAll(".svg_line");
  const heroSubtitleWrap = document.querySelector(".hero_subtitle_wrap");
  const heroSubtitle = document.querySelector(".hero_subtitle");
  const missionWrap = document.querySelector(".mission_wrap-a");
  const bgCircle = document.querySelector(".bg_circle path");
  const bgCircleSmall = document.querySelector(".bg_circle_small path");

  if (!heroWrap) return;

  // Initial states
  gsap.set(svgLines, { y: (i) => calculatePosition(i, svgLines.length, window.innerHeight, 3.4, 1.08) - window.innerHeight / 2 + "px" });
  gsap.set(heroSubtitleWrap, { y: "80%" });
  gsap.set(heroSubtitle, { opacity: 0.6 });
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
          updateCircleGradient(p);
          handleDesktopNavUpdate(p);
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

  // 2. Lines fan-out → collapse to y:0 (converge to center)
  mainTimeline.to(
    svgLines,
    {
      y: 0,
      stagger: { amount: 0.15, from: "center" },
      ease: "power2.inOut",
    },
    0
  );

  // 3. Subtitle slides up and becomes fully visible
  mainTimeline.to(
    heroSubtitleWrap,
    {
      y: "0%",
      ease: "power2.inOut",
    },
    0.1
  );
  mainTimeline.to(
    heroSubtitle,
    {
      opacity: 1,
      ease: "power2.inOut",
    },
    0.15
  );

  // 4a. Logo crossfade: inner icon (no hangar) → full logo (with hangar outer bounds)
  //     Starts at 35% through the scroll — when the logo is ~70% of the way up
  if (logoBase && logoFull) {
    mainTimeline.to(logoBase, { opacity: 0, ease: "power2.inOut" }, 0.35);
    mainTimeline.to(logoFull, { opacity: 1, ease: "power2.inOut" }, 0.35);
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

  // 5. Mission section slides up over hero
  mainTimeline.to(
    missionWrap,
    {
      y: "0%",
      ease: "power2.inOut",
    },
    0.45
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
      positionLines();
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
   INITIAL NAV STATE (hide fixed nav on page load)
============================================================ */
function initNavStates() {
  const fixedNav = document.querySelector(".nav_wrap.home.fixed");
  if (fixedNav) {
    gsap.set(fixedNav, { opacity: 0, pointerEvents: "none" });
  }
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
    positionLines();

    const smoother = initSmoother();

    // Restore scroll position if navigating back
    restoreScrollPos(smoother);

    // Build hero animation
    createAnimation(smoother);

    // UI interactions
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
