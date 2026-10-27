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
const STARLIGHT_ROI_DEFAULTS = Object.freeze({
  hangarSqft: 40000,
  utilizationBoost: 5,
  tenantRate: 3.5,
  peoplePerStack: 3,
  wagePerHour: 35,
  hoursPerDay: 4,
});

function calculateStarlightRoi(values = STARLIGHT_ROI_DEFAULTS) {
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

window.STARLIGHT_ROI = Object.freeze({
  defaults: STARLIGHT_ROI_DEFAULTS,
  calculate: calculateStarlightRoi,
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
  const defaults = STARLIGHT_ROI_DEFAULTS;
  const results = calculateStarlightRoi(defaults);
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
  const platformItem  = document.getElementById('starlight-platform-item');
  const dropTrigger   = platformItem && platformItem.querySelector('.snav-dropdown-trigger');
  const hamburger     = document.getElementById('starlight-nav-hamburger');
  const mobile        = document.getElementById('starlight-nav-mobile');
  const mobileOverlay = document.getElementById('starlight-nav-overlay');
  const closeBtn      = document.getElementById('starlight-nav-mobile-close');
  const mobPlatToggle = document.getElementById('starlight-mobile-platform-toggle');
  const mobPlatSub    = document.getElementById('starlight-mobile-platform-sub');

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
   LEAD SUBMISSION
   -----------------------------------------------------------
   The "Schedule a Demo" modal and the ROI report form both send
   leads through submitStarlightLead().

   endpoint: the Google Apps Script web app URL (/exec) from
   scripts/apps-script/leads.gs, bound to the "06 Website Leads"
   sheet in Drive (02 Outreach). It answers with JSON, so the
   forms can show a real success or error message.
   While it is empty, leads go to the legacy Google Form. That
   request uses no-cors, so only network failures are visible.
============================================================ */
const STARLIGHT_LEAD_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/AKfycbzSEcFErRWW_2QhX6dk4BJoszFCDYV-rr04mYynaqVpjOcL32vyET8I8i3ZIvtc4-Evgg/exec',
  legacyFormUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeESQcxH3hDUXmJm-tc7mCYc3_EB9Ef9Iv3A_ha_a9wWfpoYg/formResponse',
  fallbackEmail: '',   // offered as a mailto link when sending fails
  minFillMs: 3000,     // faster submissions are treated as bots
  timeoutMs: 20000,
};

const STARLIGHT_LEAD_LABELS = {
  name: 'Name',
  company: 'Company / FBO',
  airport: 'Airport',
  role: 'Role',
  phone: 'Phone',
  hangar: 'Hangar size / aircraft',
  message: 'Message',
  plan: 'Interest',
  page: 'Page',
};

function submitStarlightLead(lead) {
  const config = STARLIGHT_LEAD_CONFIG;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let request;

  if (config.endpoint) {
    // A URL-encoded body keeps this a "simple" CORS request (no preflight),
    // which Apps Script web apps can answer.
    const body = new URLSearchParams();
    Object.entries(lead).forEach(([key, value]) => body.append(key, value == null ? '' : String(value)));
    request = fetch(config.endpoint, { method: 'POST', body, signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!data || data.ok !== true) throw new Error((data && data.error) || 'rejected');
        return data;
      });
  } else {
    const details = Object.keys(STARLIGHT_LEAD_LABELS)
      .filter(key => lead[key])
      .map(key => `${STARLIGHT_LEAD_LABELS[key]}: ${lead[key]}`)
      .join('\n');
    const fd = new FormData();
    fd.append('entry.191654158', lead.type || 'Website lead');
    fd.append('entry.1925679811', details);
    fd.append('entry.878160977', lead.email || '');
    request = fetch(config.legacyFormUrl, { method: 'POST', mode: 'no-cors', body: fd, signal: controller.signal });
  }

  return request.finally(() => clearTimeout(timer));
}

function starlightLeadErrorMessage(err) {
  if (err && err.name === 'AbortError') {
    return 'The request timed out. Please check your connection and try again.';
  }
  if (err instanceof TypeError) {
    return 'We couldn’t reach our server. Please check your connection and try again.';
  }
  return 'We couldn’t send your request. Please try again in a moment.';
}

function appendStarlightFallbackEmail(el, subject) {
  const email = STARLIGHT_LEAD_CONFIG.fallbackEmail;
  if (!email) return;
  const link = document.createElement('a');
  link.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
  link.textContent = email;
  el.append(' You can also email us at ', link, '.');
}

window.STARLIGHT_LEADS = Object.freeze({
  config: STARLIGHT_LEAD_CONFIG,
  submit: submitStarlightLead,
  errorMessage: starlightLeadErrorMessage,
  appendFallbackEmail: appendStarlightFallbackEmail,
});


/* ============================================================
   SHARED NAV BEHAVIOR + CONTACT MODAL
   -----------------------------------------------------------
   The shared nav and footer are generated into each HTML page.
   This initializes the nav and injects the contact modal
   (idempotent — safe to call multiple times).
============================================================ */
const STARLIGHT_ROLE_OPTIONS = [
  'FBO / line service',
  'Hangar or facilities manager',
  'Owner / executive',
  'Airport authority',
  'Flight department / aircraft operator',
  'Other',
];

function starlightContactField({ name, label, type = 'text', required = false, attrs = '', full = false }) {
  const id = `starlight-${name}`;
  const optional = required ? '' : ' <span class="starlight-field-optional">(optional)</span>';
  const common = `id="${id}" name="${name}" ${attrs}${required ? ' required' : ''}`;
  let control;
  if (type === 'textarea') {
    control = `<textarea class="starlight-textarea" ${common}></textarea>`;
  } else if (type === 'select') {
    const options = STARLIGHT_ROLE_OPTIONS.map(o => `<option>${o}</option>`).join('');
    control = `<select class="starlight-text-field starlight-select" ${common}><option value="">Select your role</option>${options}</select>`;
  } else {
    control = `<input class="starlight-text-field" type="${type}" ${common}/>`;
  }
  return `
              <div class="starlight-field${full ? ' starlight-field-full' : ''}">
                <label class="starlight-field-label" for="${id}">${label}${optional}</label>
                ${control}
                <p class="starlight-field-error" id="${id}-error" hidden></p>
              </div>`;
}

function initSharedComponents() {
  const navHeader = document.getElementById('starlight-nav-header');
  if (navHeader) initSharedNavBehavior(navHeader);

  if (!document.getElementById('starlight-shared-modal')) {
    const modalWrap = document.createElement('div');
    modalWrap.id = 'starlight-shared-modal';
    modalWrap.innerHTML = `
      <div class="starlight-modal-overlay" id="starlight-modal-overlay"></div>
      <div class="starlight-modal-wrap" id="starlight-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="starlight-modal-title" aria-describedby="starlight-modal-intro">
        <button type="button" class="starlight-modal-close" id="starlight-modal-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="starlight-modal-inner">
          <h2 class="starlight-modal-title" id="starlight-modal-title">Schedule a Demo</h2>
          <p class="starlight-modal-intro" id="starlight-modal-intro">Tell us a little about your operation and we’ll follow up to set up a walkthrough.</p>
          <div class="starlight-modal-divider"></div>
          <form id="starlight-contact-form" class="starlight-modal-form" novalidate>
            <div class="starlight-field-grid">${[
              starlightContactField({ name: 'name', label: 'Full name', required: true, attrs: 'autocomplete="name" maxlength="100"' }),
              starlightContactField({ name: 'email', label: 'Work email', type: 'email', required: true, attrs: 'autocomplete="email" maxlength="150" placeholder="you@company.com"' }),
              starlightContactField({ name: 'company', label: 'Company / FBO', required: true, attrs: 'autocomplete="organization" maxlength="120"' }),
              starlightContactField({ name: 'airport', label: 'Airport code', attrs: 'maxlength="4" autocapitalize="characters" spellcheck="false" placeholder="e.g. KBDL"' }),
              starlightContactField({ name: 'role', label: 'Your role', type: 'select', required: true }),
              starlightContactField({ name: 'phone', label: 'Phone', type: 'tel', attrs: 'autocomplete="tel" maxlength="30"' }),
              starlightContactField({ name: 'hangar', label: 'Hangar size or aircraft count', full: true, attrs: 'maxlength="120" placeholder="e.g. 40,000 sq ft, 25 based aircraft"' }),
              starlightContactField({ name: 'message', label: 'What would you like to see?', type: 'textarea', full: true, attrs: 'maxlength="2000" placeholder="Current stacking process, timeline, questions…"' }),
            ].join('')}
            </div>
            <div class="starlight-hp" aria-hidden="true">
              <label for="starlight-website">Website</label>
              <input type="text" id="starlight-website" name="website" tabindex="-1" autocomplete="off"/>
            </div>
            <input type="hidden" name="plan" id="starlight-plan"/>
            <input type="hidden" name="page" id="starlight-page"/>
            <div class="starlight-form-status" id="starlight-form-status" role="status" aria-live="polite"></div>
            <button type="submit" class="starlight-submit">Send Request</button>
          </form>
          <div class="starlight-modal-success" id="starlight-modal-success" hidden>
            <h2 class="starlight-success-big" id="starlight-success-title" tabindex="-1">Thank you!</h2>
            <p class="starlight-success-small" id="starlight-success-text">We’ll be in touch shortly.</p>
            <button type="button" class="starlight-submit starlight-success-close" id="starlight-success-close">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalWrap);
  }

  initSharedContactModal();
}


function initSharedContactModal() {
  const overlay  = document.getElementById('starlight-modal-overlay');
  const modal    = document.getElementById('starlight-modal-wrap');
  const closeBtn = document.getElementById('starlight-modal-close');
  const form     = document.getElementById('starlight-contact-form');
  const success  = document.getElementById('starlight-modal-success');
  if (!overlay || !modal || !form || modal.dataset.ready) return;
  modal.dataset.ready = 'true';

  const status     = document.getElementById('starlight-form-status');
  const submitBtn  = form.querySelector('button[type=submit]');
  const honeypot   = document.getElementById('starlight-website');
  const successTitle = document.getElementById('starlight-success-title');
  const successText  = document.getElementById('starlight-success-text');
  let returnFocus = null;
  let startedAt = 0;
  let sending = false;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validators = {
    name:    v => v ? '' : 'Enter your name.',
    email:   v => !v ? 'Enter your email address.' : EMAIL_RE.test(v) ? '' : 'Enter a valid email address, like you@company.com.',
    company: v => v ? '' : 'Enter your company or FBO name.',
    airport: v => !v || /^[A-Z0-9]{3,4}$/i.test(v) ? '' : 'Enter a 3–4 character airport code, like KBDL or BDL.',
    role:    v => v ? '' : 'Select your role.',
    phone:   v => !v || v.replace(/\D/g, '').length >= 7 ? '' : 'Enter a phone number with at least 7 digits, or leave it blank.',
  };

  function setFieldError(field, message) {
    const error = document.getElementById(`${field.id}-error`);
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (message) field.setAttribute('aria-describedby', error.id);
    else field.removeAttribute('aria-describedby');
    error.textContent = message;
    error.hidden = !message;
  }

  function validateField(field) {
    const check = validators[field.name];
    const message = check ? check(field.value.trim()) : '';
    setFieldError(field, message);
    return !message;
  }

  function setStatus(state, message) {
    status.dataset.state = state || '';
    status.textContent = message || '';
  }

  function showForm() {
    form.hidden = false;
    success.hidden = true;
  }

  function contextFor(trigger) {
    const params = new URLSearchParams(window.location.search);
    const plan = (trigger && trigger.dataset.plan) || params.get('plan') || '';
    const where = !trigger ? '' :
      trigger.closest('footer') ? 'footer' :
      trigger.closest('#starlight-nav-header') ? 'nav' : 'page';
    const path = window.location.pathname.replace(/^.*\//, '') || 'index.html';
    return { plan: plan.slice(0, 100), page: where ? `${path} (${where})` : path };
  }

  function focusables() {
    return Array.from(modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type=hidden]):not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
  }

  function openModal(trigger) {
    if (modal.classList.contains('active')) return;
    returnFocus = trigger || document.activeElement;
    // After a successful send, start fresh. Otherwise keep what the visitor typed.
    if (!success.hidden) {
      form.reset();
      form.querySelectorAll('[aria-invalid]').forEach(el => setFieldError(el, ''));
      setStatus('', '');
      showForm();
      startedAt = 0;
    }
    const context = contextFor(trigger);
    document.getElementById('starlight-plan').value = context.plan;
    document.getElementById('starlight-page').value = context.page;
    if (!startedAt) startedAt = Date.now();

    overlay.classList.add('active');
    modal.classList.add('active');
    document.body.classList.add('scroll-locked');
    modal.scrollTop = 0;
    const first = form.hidden ? successTitle : document.getElementById('starlight-name');
    if (first) first.focus();
  }

  function closeModal() {
    if (!modal.classList.contains('active')) return;
    overlay.classList.remove('active');
    modal.classList.remove('active');
    document.body.classList.remove('scroll-locked');
    // The mobile menu closes when its CTA is used, so return focus to the menu button.
    let target = returnFocus;
    if (target && target.closest && target.closest('#starlight-nav-mobile')) {
      target = document.getElementById('starlight-nav-hamburger') || target;
    }
    if (target && typeof target.focus === 'function') target.focus();
    returnFocus = null;
  }

  function showSuccess(name, email) {
    const first = name.split(/\s+/)[0];
    successTitle.textContent = first ? `Thank you, ${first}!` : 'Thank you!';
    successText.textContent = `We received your request and will follow up at ${email} shortly.`;
    setStatus('', '');
    form.hidden = true;
    success.hidden = false;
    successTitle.focus();
  }

  showForm();

  // Delegated so links added after load (e.g. by other scripts) also open the modal.
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-open-contact]');
    if (!trigger) return;
    e.preventDefault();
    openModal(trigger);
  });
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  document.getElementById('starlight-success-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  // Keep Tab / Shift+Tab inside the dialog while it is open.
  modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  form.addEventListener('input', e => {
    if (e.target.getAttribute('aria-invalid') === 'true') validateField(e.target);
  });
  form.addEventListener('focusout', e => {
    const field = e.target;
    if (field.name === 'airport') field.value = field.value.trim().toUpperCase();
    if (field.value && validators[field.name]) validateField(field);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (sending) return;

    const invalid = Object.keys(validators)
      .map(name => form.elements[name])
      .filter(field => !validateField(field));
    if (invalid.length) {
      setStatus('error', invalid.length === 1
        ? 'Please fix the highlighted field.'
        : `Please fix the ${invalid.length} highlighted fields.`);
      invalid[0].focus();
      return;
    }

    const data = Object.fromEntries(
      Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value).trim()])
    );

    // Hidden honeypot: only bots fill it. Pretend success and send nothing.
    if (honeypot.value) {
      showSuccess(data.name, data.email);
      return;
    }
    delete data.website;
    const elapsed = Date.now() - startedAt;
    if (elapsed < STARLIGHT_LEAD_CONFIG.minFillMs) {
      setStatus('error', 'That was quick! Please check your details, then send again.');
      return;
    }

    sending = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    setStatus('pending', 'Sending your request…');
    try {
      await submitStarlightLead({ type: 'Demo request', ...data, elapsed });
      showSuccess(data.name, data.email);
    } catch (err) {
      setStatus('error', starlightLeadErrorMessage(err));
      appendStarlightFallbackEmail(status, 'Starlight Hangars demo request');
    } finally {
      sending = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Request';
      form.removeAttribute('aria-busy');
    }
  });
}

/* ============================================================
   STAGE IMAGE LIGHTBOX
   Clicking a screenshot opens it full-size in an overlay.
============================================================ */
function initStageLightbox() {
  if (document.getElementById('starlight-stage-lightbox')) return;

  const lb = document.createElement('div');
  lb.id = 'starlight-stage-lightbox';
  lb.className = 'stage-lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Enlarged product media');
  lb.innerHTML = `
    <button class="stage-lightbox-close" id="starlight-stage-lightbox-close" aria-label="Close">&times;</button>
    <img id="starlight-stage-lightbox-img" src="" alt="" />
    <video id="starlight-stage-lightbox-video" muted loop playsinline></video>
  `;
  document.body.appendChild(lb);

  const img = document.getElementById('starlight-stage-lightbox-img');
  const vid = document.getElementById('starlight-stage-lightbox-video');
  const closeButton = document.getElementById('starlight-stage-lightbox-close');
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
    document.dispatchEvent(new CustomEvent('starlight:lightbox-open'));
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
    document.dispatchEvent(new CustomEvent('starlight:lightbox-close'));
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

  document.addEventListener('starlight:lightbox-open', () => {
    lightboxOpen = true;
    pauseAll();
  });
  document.addEventListener('starlight:lightbox-close', () => {
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
