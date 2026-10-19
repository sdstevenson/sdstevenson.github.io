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
  const digitalTwinLaborSaving = annualLabor * (5 / 100);

  return {
    annualLabor,
    annualRevenue,
    total: annualRevenue + annualLabor,
    planning: annualRevenue + digitalTwinLaborSaving,
    planningLabor: digitalTwinLaborSaving,
    planningLaborHours: digitalTwinLaborSaving / values.wagePerHour,
    collisionPrevention: annualLabor * (30 / 100),
    towPathPlanning: annualLabor * (20 / 100),
    autonomousTugs: annualLabor * (45 / 100),
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
  if (_plugins.length && typeof gsap !== 'undefined') gsap.registerPlugin(..._plugins);
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
  document.querySelectorAll('[data-roi-labor-hours]').forEach((element) => {
    const value = profitValues[element.dataset.roiLaborHours];
    if (value !== undefined) element.textContent = formatRoiNumber(value / defaults.wagePerHour, 0);
  });
  document.querySelectorAll('[data-roi-daily-hours]').forEach((element) => {
    const value = profitValues[element.dataset.roiDailyHours];
    if (value !== undefined) element.textContent = formatRoiNumber(value / defaults.wagePerHour / 365, 1);
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
   SHARED NAVIGATION
============================================================ */
function initSharedNavBehavior(navHeader) {
  if (!navHeader || navHeader.dataset.navInitialized === 'true') return;
  navHeader.dataset.navInitialized = 'true';
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

    // The Updates index and all article pages share one navigation section.
    if (document.body.dataset.navSection === 'updates') {
      document.querySelectorAll('.snav-updates-link').forEach(a => {
        a.classList.add('snav-active');
        a.setAttribute('aria-current', filename === 'updates.html' ? 'page' : 'true');
      });
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
}


/* ============================================================
   SHARED NAV BEHAVIOR + CONTACT MODAL
   -----------------------------------------------------------
   The shared nav and footer are generated into each HTML page.
   This initializes the nav and injects the contact modal when
   needed (idempotent — safe to call multiple times).
============================================================ */
function initSharedComponents() {
  const navHeader = document.getElementById('sttugs-nav-header');
  if (navHeader) initSharedNavBehavior(navHeader);

  /* ── Contact Modal HTML (inject once, only on pages that don't
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
  lb.setAttribute('aria-label', 'Enlarged product media');
  lb.innerHTML = `
    <button class="stage-lightbox-close" id="sttugs-stage-lightbox-close" aria-label="Close">&times;</button>
    <img id="sttugs-stage-lightbox-img" src="" alt="" />
    <video id="sttugs-stage-lightbox-video" muted loop playsinline></video>
  `;
  document.body.appendChild(lb);

  const img = document.getElementById('sttugs-stage-lightbox-img');
  const vid = document.getElementById('sttugs-stage-lightbox-video');
  const closeButton = document.getElementById('sttugs-stage-lightbox-close');
  let scrollY = 0;
  let bodyOverflow = '';
  let trigger = null;

  function showImage(src, alt) {
    vid.pause();
    vid.removeAttribute('src');
    vid.load();
    vid.style.display = 'none';
    img.style.display = 'block';
    img.src = src;
    img.alt = alt || '';
  }

  function showVideo(src) {
    img.style.display = 'none';
    img.removeAttribute('src');
    vid.style.display = 'block';
    vid.src = src;
    vid.currentTime = 0;
    vid.play().catch(() => {});
  }

  function open(src, alt, isVideo, sourceTrigger) {
    scrollY = window.scrollY;
    bodyOverflow = document.body.style.overflow;
    trigger = sourceTrigger;
    if (isVideo) showVideo(src); else showImage(src, alt);
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.dispatchEvent(new CustomEvent('sttugs:lightbox-open'));
    closeButton.focus();
  }

  function close() {
    if (!lb.classList.contains('open')) return;
    lb.classList.remove('open');
    document.body.style.overflow = bodyOverflow;
    vid.pause();
    vid.removeAttribute('src');
    vid.load();
    img.removeAttribute('src');
    document.dispatchEvent(new CustomEvent('sttugs:lightbox-close'));
    window.scrollTo(0, scrollY);
    if (trigger && trigger.isConnected) trigger.focus();
    trigger = null;
  }

  document.addEventListener('click', (e) => {
    const mediaTrigger = e.target.closest('[data-media-open], .stage-media-slot');
    if (!mediaTrigger || mediaTrigger.closest('a')) return;
    const video = mediaTrigger.querySelector('video');
    if (video && video.getAttribute('src')) {
      e.preventDefault();
      open(video.getAttribute('src'), '', true, mediaTrigger);
      return;
    }
    const image = mediaTrigger.querySelector('img');
    if (image && image.getAttribute('src')) {
      e.preventDefault();
      open(image.src, image.alt, false, mediaTrigger);
    }
  });

  closeButton.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      e.preventDefault();
      closeButton.focus();
    }
  });
}

/* ============================================================
   STAGE VIDEO MANAGER
   Only the video closest to the vertical center of the viewport
   plays; all other stage videos stay paused.
============================================================ */
function initStageVideoManager() {
  const videos = Array.from(document.querySelectorAll('.stage-media-slot video'));
  if (!videos.length) return;

  let active = null;
  let lightboxOpen = false;
  let ticking = false;
  let playRequest = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function pauseAll() {
    playRequest += 1;
    videos.forEach((video) => video.pause());
    active = null;
  }

  function playExclusively(video) {
    const request = ++playRequest;
    videos.forEach((candidate) => {
      if (candidate !== video) candidate.pause();
    });
    active = video;
    if (!video) return;
    const promise = video.play();
    if (promise) promise.then(() => {
      if (request !== playRequest || active !== video || lightboxOpen || document.hidden) video.pause();
    }).catch(() => {});
  }

  function refresh() {
    if (lightboxOpen || document.hidden || reducedMotion.matches) {
      pauseAll();
      return;
    }

    const viewportCenter = window.innerHeight / 2;
    let closest = null;
    let closestDistance = Infinity;

    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      // Ignore videos that are fully above or below the viewport.
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      const center = rect.top + rect.height / 2;
      const distance = Math.abs(center - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = video;
      }
    }

    if (closest !== active) {
      playExclusively(closest);
    }
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      refresh();
    });
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  document.addEventListener('sttugs:lightbox-open', () => {
    lightboxOpen = true;
    pauseAll();
  });
  document.addEventListener('sttugs:lightbox-close', () => {
    lightboxOpen = false;
    refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAll(); else refresh();
  });
  reducedMotion.addEventListener('change', refresh);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
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

  // Initialize shared components as early as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSharedComponents);
  } else {
    initSharedComponents();
  }

  initPlatformTiles();
  initStageLightbox();
  initStageVideoManager();

  // Wait for DOM + layout to be ready
  window.addEventListener("load", function () {
    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(true);
  });
})();
