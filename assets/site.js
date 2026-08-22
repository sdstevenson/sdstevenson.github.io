/**
 * site.js
 * Starlight Hangars landing page interactions.
 * Uses GSAP 3.14.2 with ScrollTrigger.
 */

"use strict";

/* ============================================================
   SHARED ROI DEFAULTS
   Update these values to keep the calculator and ROI claims in sync.
============================================================ */
const STTUGS_ROI_DEFAULTS = Object.freeze({
  hangarSqft: 40000,
  utilizationBoost: 5,
  tenantRate: 3.5,
  peoplePerStack: 3,
  wagePerHour: 35,
  hoursPerDay: 4,
});

function calculateSttugsRoi(values = STTUGS_ROI_DEFAULTS) {
  const annualLabor =
    values.peoplePerStack * values.wagePerHour * values.hoursPerDay * 365;
  const annualRevenue =
    values.hangarSqft * (Math.max(0, values.utilizationBoost) / 100) *
    values.tenantRate * 12;
  const digitalTwinLaborSaving = annualLabor * (0.5 / 12);

  return {
    annualLabor,
    annualRevenue,
    total: annualRevenue + annualLabor,
    planning: annualRevenue + digitalTwinLaborSaving,
    planningLabor: digitalTwinLaborSaving,
    planningLaborHours: digitalTwinLaborSaving / values.wagePerHour,
    collisionPrevention: annualLabor * (4 / 12),
    towPathPlanning: annualLabor * (2 / 12),
    autonomousTugs: annualLabor * (5.5 / 12),
  };
}

window.STTUGS_ROI = Object.freeze({
  defaults: STTUGS_ROI_DEFAULTS,
  calculate: calculateSttugsRoi,
});

/* Register GSAP plugins */
{
  const _plugins = [];
  if (typeof ScrollTrigger  !== 'undefined') _plugins.push(ScrollTrigger);
  if (_plugins.length) gsap.registerPlugin(..._plugins);
}

/* ============================================================
   NAV THEME  (dark = navy bg / white text,  light = white bg / navy text)
============================================================ */
function setNavTheme(theme) {
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
   PLATFORM TILES
============================================================ */
function initPlatformTiles() {
  const items = document.querySelectorAll(".accordion_item");
  if (!items.length) return;

  items.forEach((item) => {
    const visualId = item.getAttribute("data-visual");
    const visual = visualId && document.getElementById(visualId);
    if (visual) item.prepend(visual);

    item.classList.remove("active");
    item.removeAttribute("data-visual");
  });
}

function formatRoiDollars(value) {
  return '$' + Math.round(value).toLocaleString('en-US');
}

function formatRoiRate(value) {
  return '$' + value.toFixed(2);
}

function formatRoiNumber(value, maximumFractionDigits = 1) {
  return value.toLocaleString('en-US', { maximumFractionDigits });
}

function initRoiDefaults() {
  const defaults = STTUGS_ROI_DEFAULTS;
  const results = calculateSttugsRoi(defaults);
  const inputDefaults = {
    hangarSqft: defaults.hangarSqft,
    hangarSqftInput: defaults.hangarSqft,
    utilBoost: defaults.utilizationBoost,
    utilBoostInput: defaults.utilizationBoost,
    tenantRate: defaults.tenantRate,
    tenantRateInput: defaults.tenantRate,
    peoplePerStack: defaults.peoplePerStack,
    peopleInput: defaults.peoplePerStack,
    wagePerHour: defaults.wagePerHour,
    wageInput: defaults.wagePerHour,
    timePerStack: defaults.hoursPerDay,
    timeInput: defaults.hoursPerDay,
  };

  Object.entries(inputDefaults).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value;
  });

  const profitValues = {
    planning: results.planning,
    collision: results.collisionPrevention,
    path: results.towPathPlanning,
    retrofit: results.autonomousTugs,
  };
  document.querySelectorAll('[data-roi-profit]').forEach((element) => {
    const value = profitValues[element.dataset.roiProfit];
    if (value !== undefined) element.textContent = formatRoiDollars(value);
  });

  document.querySelectorAll('[data-roi-revenue]').forEach((element) => {
    element.textContent = formatRoiDollars(results.annualRevenue);
  });
  document.querySelectorAll('[data-roi-planning-labor]').forEach((element) => {
    element.textContent = formatRoiDollars(results.planningLabor);
  });
  document.querySelectorAll('[data-roi-planning-hours]').forEach((element) => {
    element.textContent = formatRoiNumber(results.planningLaborHours, 0);
  });
  document.querySelectorAll('[data-roi-assumptions]').forEach((element) => {
    element.textContent =
      `Estimated ROI using a ${formatRoiNumber(defaults.hangarSqft, 0)} sq. ft. hangar, ` +
      `${formatRoiNumber(defaults.utilizationBoost)}% utilization boost, ` +
      `${formatRoiRate(defaults.tenantRate)}/sq. ft. monthly tenant rate, ` +
      `${formatRoiNumber(defaults.hoursPerDay)} hours spent stacking per day, ` +
      `${formatRoiDollars(defaults.wagePerHour)} per labor hour, and ` +
      `${formatRoiNumber(defaults.peoplePerStack, 0)} crew members.`;
  });
}

/* ============================================================
   GENERAL SECTION SCROLL REVEALS
============================================================ */
function initScrollReveals() {
  const reveals = document.querySelectorAll(
    ".autonomous_wrap, .carrers_wrap, .section-headline, .autonomous_paragraph, .step_item"
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

    // System & Installation page
    if (filename === 'hardware-and-infrastructure.html') {
      document.querySelectorAll('.snav-system-link').forEach(a => a.classList.add('snav-active'));
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
          <a href="index.html" class="snav-logo-link" aria-label="Starlight Hangars home">
            <img class="snav-logo-mark" src="assets/starlight_logo_notext.svg" alt="" aria-hidden="true"/>
            <span class="snav-logo-text">Starlight Hangars</span>
          </a>
        </div>
        <ul class="snav-links" role="list">
          <li class="snav-item"><a href="index.html" class="snav-link snav-home-link">Home</a></li>
          <li class="snav-item snav-item--dropdown" id="sttugs-platform-item">
            <button class="snav-link snav-dropdown-trigger" aria-expanded="false" aria-haspopup="true">
              How it works
              <svg class="snav-chevron" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="snav-dropdown">
              <a href="index.html#how-it-works" class="snav-dropdown-item">Overview</a>

              <div class="snav-dropdown-section-label">Plan</div>
              <a href="calendar.html" class="snav-dropdown-item">Calendar View</a>
              <a href="auto-stack.html" class="snav-dropdown-item">Auto-Stack</a>

              <div class="snav-dropdown-section-label">Verify</div>
              <a href="path-planning.html" class="snav-dropdown-item">Paths</a>
              <a href="collision-prevention.html" class="snav-dropdown-item">Collision Prevention</a>

              <div class="snav-dropdown-section-label">Execute</div>
              <a href="tug-integration.html" class="snav-dropdown-item">Tug Integration</a>

              <div class="snav-dropdown-section-label">Record</div>
              <a href="audit-log.html" class="snav-dropdown-item">Audit Log</a>
            </div>
          </li>
          <li class="snav-item"><a href="hardware-and-infrastructure.html" class="snav-link snav-system-link">System &amp; Installation</a></li>
          <li class="snav-item"><a href="about.html" class="snav-link snav-about-link">About</a></li>
          <li class="snav-item"><a href="roi.html" class="snav-link snav-roi-link">ROI Calculator</a></li>
          <li class="snav-item"><a href="#" data-open-contact class="snav-link snav-cta">Schedule a Demo</a></li>
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
          <div class="snav-mobile-platform-label">How it works</div>
          <div class="snav-mobile-sub open">
            <a href="index.html#how-it-works">Overview</a>

            <div class="snav-mobile-section-label">Plan</div>
            <a href="calendar.html">Calendar View</a>
            <a href="auto-stack.html">Auto-Stack</a>

            <div class="snav-mobile-section-label">Verify</div>
            <a href="path-planning.html">Paths</a>
            <a href="collision-prevention.html">Collision Prevention</a>

            <div class="snav-mobile-section-label">Execute</div>
            <a href="tug-integration.html">Tug Integration</a>

            <div class="snav-mobile-section-label">Record</div>
            <a href="audit-log.html">Audit Log</a>
          </div>
        </li>
        <li><a href="hardware-and-infrastructure.html" class="snav-mobile-link snav-system-link">System &amp; Installation</a></li>
        <li><a href="about.html" class="snav-mobile-link snav-about-link">About</a></li>
        <li><a href="roi.html" class="snav-mobile-link snav-roi-link">ROI Calculator</a></li>
      </ul>
      <a href="#" data-open-contact class="snav-mobile-cta">Schedule a Demo</a>
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
        background: #071424;
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
      .sttugs-footer_brand {
        display: inline-flex; align-items: center; gap: 0.5rem;
        text-decoration: none; color: #FFFFFF;
      }
      .sttugs-footer-logo { width: 34px; height: 34px; filter: invert(1); }
      .sttugs-site_name {
        font-size: 1.25rem;
        font-weight: 800;
        color: #FFFFFF;
        letter-spacing: 0;
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
        background: rgba(7,20,36,0.7);
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
        box-shadow: 0 24px 80px rgba(7,20,36,0.3);
      }
      .sttugs-modal-wrap.active { display: block; }
      .sttugs-modal-inner { padding: 2.25rem 2.5rem 2.5rem; }
      .sttugs-modal-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: #071424;
        margin-bottom: 1.25rem;
      }
      .sttugs-modal-divider { height: 1px; background: rgba(7,20,36,0.1); margin: 0 0 1.25rem; }
      .sttugs-modal-form { display: flex; flex-direction: column; gap: 1.1rem; }
      .sttugs-field-label {
        display: block;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #657586;
        margin-bottom: 0.35rem;
      }
      .sttugs-text-field, .sttugs-textarea {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border: 1.5px solid #B8C2CB;
        border-radius: 8px;
        font-family: inherit;
        font-size: 0.9375rem;
        color: #071424;
        background: #F6F8FA;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      .sttugs-text-field:focus, .sttugs-textarea:focus {
        outline: none;
        border-color: #4F7186;
        background: #FFFFFF;
      }
      .sttugs-textarea { min-height: 110px; resize: vertical; }
      .sttugs-submit {
        padding: 0.8rem 1.5rem;
        background: #4F7186;
        color: #FFFFFF;
        border: none;
        border-radius: 8px;
        font-size: 0.9375rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
        align-self: flex-start;
      }
      .sttugs-submit:hover { background: #3B5A6D; }
      .sttugs-modal-success { display: none; padding: 2rem; text-align: center; }
      .sttugs-modal-success.visible { display: block; }
      .sttugs-success-big { font-size: 1.5rem; font-weight: 700; color: #071424; margin-bottom: 0.5rem; }
      .sttugs-success-small { font-size: 0.9375rem; color: #657586; }
      .sttugs-modal-close {
        position: absolute;
        top: 1rem; right: 1rem;
        width: 32px; height: 32px;
        border-radius: 50%;
        background: transparent;
        border: none;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        color: #657586;
        transition: background 0.2s, color 0.2s;
      }
      .sttugs-modal-close:hover { background: rgba(7,20,36,0.08); color: #071424; }

      /* ═══ STAGE IMAGE LIGHTBOX ═══ */
      .stage-media-slot { cursor: zoom-in; }
      .stage-media-slot img { cursor: zoom-in; }
      .stage-lightbox {
        display: none;
        position: fixed; inset: 0;
        z-index: 9500;
        background: rgba(7,20,36,0.92);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        align-items: center; justify-content: center;
        padding: 2rem;
      }
      .stage-lightbox.open { display: flex; }
      .stage-lightbox img {
        max-width: 100%; max-height: 100%;
        object-fit: contain;
        border-radius: 10px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.5);
      }
      .stage-lightbox-close {
        position: absolute; top: 1.25rem; right: 1.5rem;
        width: 42px; height: 42px; border-radius: 50%;
        background: rgba(255,255,255,0.12); border: none; cursor: pointer;
        color: #fff; font-size: 1.6rem; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
      }
      .stage-lightbox-close:hover { background: rgba(255,255,255,0.28); }

      /* ═══ SHARED NAV ═══ */
      .snav {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 2000;
        background: rgba(7,20,36,0.96);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        transition: background 0.35s ease, border-color 0.35s ease;
      }
      .snav--light .snav {
        background: rgba(255,255,255,0.97);
        border-bottom-color: rgba(7,20,36,0.1);
      }
      .snav-inner {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1.25rem 2.5rem;
        max-width: 1440px; margin: 0 auto;
      }
      .snav-logo-link {
        display: flex; align-items: center; gap: 0.5rem; text-decoration: none;
      }
      .snav-logo-mark {
        width: 44px; height: 44px; flex-shrink: 0;
        filter: invert(1);
        transition: filter 0.35s ease;
      }
      .snav--light .snav-logo-mark { filter: none; }
      .snav-logo-text {
        font-size: 1rem; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap;
        color: #fff; transition: color 0.35s ease;
      }
      .snav--light .snav-logo-text { color: #071424; }
      .snav-links {
        display: flex; align-items: center; gap: 1.1rem;
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
      .snav--light .snav-link { color: rgba(7,20,36,0.65); }
      .snav--light .snav-link:hover { color: #071424; }
      .snav-link.snav-active, .snav-dropdown-trigger.snav-active--parent { color: #fff; }
      .snav--light .snav-link.snav-active, .snav--light .snav-dropdown-trigger.snav-active--parent { color: #071424; }
      .snav-cta {
        background: #B8C2CB !important; color: #071424 !important;
        padding: 0.45rem 1.1rem !important; border-radius: 7px; font-weight: 700;
      }
      .snav-cta:hover { background: #7D93A2 !important; color: #fff !important; }
      .snav-roi-link {
        border: 1.5px solid rgba(79,113,134,0.5) !important;
        padding: 0.4rem 1rem !important; border-radius: 7px;
        color: rgba(183,202,214,0.9) !important;
      }
      .snav-roi-link:hover { border-color: #5F8399 !important; color: #fff !important; background: rgba(79,113,134,0.12) !important; }
      .snav--light .snav-roi-link { border-color: rgba(79,113,134,0.4) !important; color: #3B5A6D !important; }
      .snav--light .snav-roi-link:hover { border-color: var(--blue) !important; background: rgba(79,113,134,0.08) !important; }
      .snav-chevron {
        width: 12px; height: 12px;
        transition: transform 0.25s; flex-shrink: 0;
      }
      .snav-item--dropdown.open .snav-chevron { transform: rotate(180deg); }
      .snav-dropdown {
        position: absolute;
        top: calc(100% + 0.625rem); left: 50%;
        transform: translateX(-50%) translateY(-8px);
        background: #0E2336;
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
        border-color: rgba(7,20,36,0.1);
        box-shadow: 0 16px 48px rgba(7,20,36,0.15);
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
      .snav-dropdown-item.snav-active { background: rgba(79,113,134,0.2); color: #B7CAD6; font-weight: 600; }
      .snav--light .snav-dropdown-item { color: rgba(7,20,36,0.7); }
      .snav--light .snav-dropdown-item:hover { background: #EEF3F6; color: #071424; }
      .snav--light .snav-dropdown-item.snav-active { background: rgba(79,113,134,0.1); color: #3B5A6D; }
      .snav-dropdown-section-label {
        display: block; padding: 0.6rem 0.9rem 0.4rem;
        font-size: 0.75rem; font-weight: 700;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: rgba(255,255,255,0.45);
        margin-top: 0.5rem;
      }
      .snav--light .snav-dropdown-section-label { color: rgba(7,20,36,0.4); }
      .snav-dropdown-item--disabled {
        display: block; padding: 0.6rem 0.9rem;
        font-size: 0.875rem; font-weight: 500;
        color: rgba(255,255,255,0.45);
        cursor: not-allowed; border-radius: 8px;
      }
      .snav--light .snav-dropdown-item--disabled { color: rgba(7,20,36,0.4); }
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
      .snav--light .snav-hamburger span { background: rgba(7,20,36,0.8); }
      .snav-mobile-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,0.45); z-index: 2050; backdrop-filter: blur(2px);
      }
      .snav-mobile-overlay.open { display: block; }
      .snav-mobile {
        position: fixed; top: 0; right: 0; bottom: 0;
        width: min(320px, 90vw);
        background: #0E2336; z-index: 2100;
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
        border-left: 2px solid rgba(79,113,134,0.4);
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
      .snav-mobile-sub a.snav-active { color: #B7CAD6; font-weight: 600; background: rgba(79,113,134,0.15); }
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
        background: #4F7186; color: #fff;
        border-radius: 8px; font-weight: 700;
        text-decoration: none; transition: background 0.2s;
      }
      .snav-mobile-cta:hover { background: #3B5A6D; }
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
          <a href="index.html" class="sttugs-footer_brand">
            <img class="sttugs-footer-logo" src="assets/starlight_logo_notext.svg" alt="" aria-hidden="true"/>
            <span class="sttugs-site_name">Starlight Hangars</span>
          </a>
          <div class="sttugs-copyright">
            © Starlight Hangars. Patent Pending.
          </div>
        </div>
        <div class="sttugs-footer_right">
          <nav class="sttugs-footer_nav">
            <a href="index.html#how-it-works" class="sttugs-footer_link">How it works</a>
            <a href="calendar.html" class="sttugs-footer_link">Calendar View</a>
            <a href="auto-stack.html" class="sttugs-footer_link">Auto-Stack</a>
            <a href="path-planning.html" class="sttugs-footer_link">Paths</a>
            <a href="collision-prevention.html" class="sttugs-footer_link">Collision Prevention</a>
            <a href="tug-integration.html" class="sttugs-footer_link">Tug Integration</a>
            <a href="audit-log.html" class="sttugs-footer_link">Audit Log</a>
            <a href="hardware-and-infrastructure.html" class="sttugs-footer_link">System &amp; Installation</a>
            <a href="roi.html" class="sttugs-footer_link">ROI Calculator</a>
            <a href="about.html" class="sttugs-footer_link">About</a>
            <a href="#" data-open-contact class="sttugs-footer_link">Contact</a>
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
          <div class="sttugs-modal-title" id="sttugs-modal-title">Schedule a Demo</div>
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

}

/* ============================================================
   STAGE IMAGE LIGHTBOX
   Clicking a screenshot opens it full-size in an overlay.
============================================================ */
function initStageLightbox() {
  if (document.getElementById('sttugs-stage-lightbox')) return;

  const lb = document.createElement('div');
  lb.id = 'sttugs-stage-lightbox';
  lb.className = 'stage-lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = `
    <button class="stage-lightbox-close" id="sttugs-stage-lightbox-close" aria-label="Close image">&times;</button>
    <img id="sttugs-stage-lightbox-img" src="" alt="" />
  `;
  document.body.appendChild(lb);

  const img = document.getElementById('sttugs-stage-lightbox-img');
  let scrollY = 0;
  function open(src, alt) {
    img.src = src;
    img.alt = alt || '';
    scrollY = window.scrollY;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    img.removeAttribute('src');
    window.scrollTo(0, scrollY);
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('.stage-media-slot img');
    if (target && target.getAttribute('src')) {
      e.preventDefault();
      open(target.src, target.alt);
    }
  });

  document.getElementById('sttugs-stage-lightbox-close').addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
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

  initRoiDefaults();

  // Inject shared footer + modal as early as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSharedComponents);
  } else {
    injectSharedComponents();
  }

  initPlatformTiles();
  initStageLightbox();

  // Wait for DOM + layout to be ready
  window.addEventListener("load", function () {
    initPostHeroNavTheme();
    initScrollReveals();
    ScrollTrigger.refresh(true);
  });
})();
