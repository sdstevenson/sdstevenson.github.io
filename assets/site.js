// Shared site JS: year, demo form handling, ROI calculator init
function fmt(n){ return '$' + n.toLocaleString(undefined,{maximumFractionDigits:0}); }

document.addEventListener('DOMContentLoaded', () => {
  // Inject shared nav
  const page = location.pathname.split('/').pop() || 'index.html';
  const isHome = !page || page === 'index.html';
  const isAbout = page === 'about.html';
  const isSolutions = /^level[123]\.html$/.test(page) || page === 'audit.html';
  const isROI = page === 'roi.html';
  const stickyEl = document.getElementById('stickyBrand');
  if(stickyEl) stickyEl.innerHTML = `<div class="sticky-inner">
    <div class="left"><a href="index.html" class="brand-link"><div class="logo"></div></a></div>
    <button class="hamburger" aria-label="Toggle menu" aria-expanded="false">☰</button>
    <nav class="sticky-nav" aria-label="Primary">
      <a href="index.html"${isHome?' class="active"':''}>Home</a>
      <a href="about.html"${isAbout?' class="active"':''}>About</a>
      <div class="dropdown">
        <button class="dropdown-btn${isSolutions?' active':''}" aria-expanded="false">Solutions<svg class="dropdown-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
        <div class="dropdown-content">
          <a href="level1.html">Level 1 - Collision Detection</a>
          <a href="level2.html">Level 2 - Guided Auto Stack</a>
          <a href="level3.html">Level 3 - Full Autonomy</a>
          <a href="audit.html">Verifiable Audit Trail</a>
        </div>
      </div>
      <a href="roi.html"${isROI?' class="active"':''}>ROI Calculator</a>
    </nav>
    <a href="contact.html" class="cta-button">Get Started</a>
  </div>`;

  // Inject shared footer
  const footerEl = document.querySelector('footer.site-footer');
  if(footerEl) footerEl.innerHTML = `<div class="footer-content">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-logo-section">
          <div class="logo footer-logo-img"></div>
          <span class="footer-brand-name">STTUGS</span>
        </div>
        <p class="footer-tagline">Autonomous Aircraft Hangar Management</p>
      </div>
      <div class="footer-column">
        <h3>Product Levels</h3>
        <ul>
          <li><a href="level1.html">Level 1: Collision Detection</a></li>
          <li><a href="level2.html">Level 2: Auto-Stacking &amp; Path Planning</a></li>
          <li><a href="level3.html">Level 3: Autonomous Tugs</a></li>
        </ul>
      </div>
      <div class="footer-column">
        <h3>Company</h3>
        <ul>
          <li><a href="about.html">About Us</a></li>
          <li><a href="roi.html">ROI Calculator</a></li>
        </ul>
      </div>
      <div class="footer-column">
        <h3>Contact</h3>
        <ul>
          <li class="footer-contact">info@sttugs.com</li>
          <li class="footer-contact">+1-781-975-1300</li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© <span id="year"></span> STTUGS • Built with FBOs, for FBOs</p>
      <p style="margin-top:0.4rem;font-size:0.75rem;color:rgba(255,255,255,0.3)">Patent Pending — Autonomous hangar management system including collision detection, auto-stacking, path planning, tug retrofit, and overhead camera/sensor array.</p>
    </div>
  </div>`;

  // Inject shared contact CTA
  const ctaEl = document.getElementById('contact-cta');
  if(ctaEl && !ctaEl.children.length){
    const title = ctaEl.dataset.ctaTitle || 'Want to Learn More?';
    const desc  = ctaEl.dataset.ctaDesc  || 'Reach out to discuss how STTUGS can work for your operation.';
    ctaEl.innerHTML = `<div class="card" style="max-width:760px;margin:0 auto;text-align:center;">
      <h2>${title}</h2>
      <p class="small">${desc}</p>
      <a href="contact.html" class="form-link">Get in Touch</a>
    </div>`;
  }

  // year
  const yearEl = document.getElementById('year'); if(yearEl) yearEl.textContent = new Date().getFullYear();

  // demo form handling
  const demoForm = document.getElementById('demoForm');
  if(demoForm){
    demoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;
      ['demo-name','demo-company','demo-contact'].forEach(id => {
        const el = document.getElementById(id);
        const err = document.querySelector(`.error[data-for="${id}"]`);
        if(!el || !err) return;
        if(!el.value.trim()){ err.style.display = 'block'; valid = false; } else { err.style.display = 'none'; }
      });
      if(valid){
        const gformUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeESQcxH3hDUXmJm-tc7mCYc3_EB9Ef9Iv3A_ha_a9wWfpoYg/formResponse';
        const fd = new FormData();
        fd.append('entry.191654158', document.getElementById('demo-name').value.trim());
        fd.append('entry.1925679811', document.getElementById('demo-company').value.trim());
        fd.append('entry.878160977', document.getElementById('demo-contact').value.trim());
        fetch(gformUrl, { method: 'POST', mode: 'no-cors', body: fd })
          .finally(() => {
            const inline = document.getElementById('demoSuccessInline'); if(inline) inline.style.display = 'block';
            const btn = demoForm.querySelector('button[type=submit]'); if(btn) btn.disabled = true;
          });
      }
    });
  }

  // ROI download form handling
  const roiDownloadForm = document.getElementById('roiDownloadForm');
  if(roiDownloadForm){
    roiDownloadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;
      const emailEl = document.getElementById('roi-email');
      const err = document.querySelector('.error[data-for="roi-email"]');
      if(emailEl && err){
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if(!emailEl.value.trim() || !emailRegex.test(emailEl.value.trim())){
          err.style.display = 'block';
          valid = false;
        } else {
          err.style.display = 'none';
        }
      }
      if(valid){
        // Get current ROI values
        const roiValue = document.getElementById('roi-value')?.textContent || '$0';
        const laborSaving = document.getElementById('laborSaving')?.textContent || '$0';
        const revenueGain = document.getElementById('revenueGain')?.textContent || '$0';
        
        // Get input values
        const hangarSqft = document.getElementById('hangarSqftInput')?.value || '0';
        const utilBoost = document.getElementById('utilBoostInput')?.value || '0';
        const tenantRate = document.getElementById('tenantRateInput')?.value || '0';
        const people = document.getElementById('peopleInput')?.value || '0';
        const wage = document.getElementById('wageInput')?.value || '0';
        const hours = document.getElementById('timeInput')?.value || '0';
        
        const gformUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeESQcxH3hDUXmJm-tc7mCYc3_EB9Ef9Iv3A_ha_a9wWfpoYg/formResponse';
        const fd = new FormData();
        fd.append('entry.191654158', 'ROI Download Request');
        fd.append('entry.1925679811', `ROI: ${roiValue}, Labor: ${laborSaving}, Revenue: ${revenueGain}`);
        fd.append('entry.878160977', emailEl.value.trim() + ` | Inputs: ${hangarSqft}sqft, ${utilBoost}% boost, $${tenantRate}/sqft, ${people}ppl, $${wage}/hr, ${hours}hrs/day`);
        fetch(gformUrl, { method: 'POST', mode: 'no-cors', body: fd })
          .finally(() => {
            const inline = document.getElementById('roiDownloadSuccess'); if(inline) inline.style.display = 'block';
            const btn = roiDownloadForm.querySelector('button[type=submit]'); if(btn) btn.disabled = true;
          });
      }
    });
  }

  // Hamburger menu toggle
  const hamburger = document.querySelector('.hamburger');
  const stickyNav = document.querySelector('.sticky-nav');
  if(hamburger && stickyNav){
    hamburger.addEventListener('click', () => {
      stickyNav.classList.toggle('open');
      const isOpen = stickyNav.classList.contains('open');
      hamburger.setAttribute('aria-expanded', isOpen);
      hamburger.textContent = isOpen ? '✕' : '☰';
    });
    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
      if(window.innerWidth <= 900 && !hamburger.contains(e.target) && !stickyNav.contains(e.target)){
        stickyNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.textContent = '☰';
      }
    });
    // Close mobile menu when clicking a nav link (but not the dropdown button)
    const navLinks = stickyNav.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if(window.innerWidth <= 900){
          stickyNav.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
          hamburger.textContent = '☰';
        }
      });
    });
  }

  // Solutions dropdown
  const dropdownBtn = document.querySelector('.dropdown-btn');
  const dropdownContent = document.querySelector('.dropdown-content');
  if(dropdownBtn && dropdownContent){
    dropdownBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = dropdownContent.classList.contains('open');
      if(isOpen){
        dropdownContent.classList.remove('open');
        dropdownBtn.setAttribute('aria-expanded', 'false');
      } else {
        dropdownContent.classList.add('open');
        dropdownBtn.setAttribute('aria-expanded', 'true');
      }
    });
    // Close dropdown when clicking outside (desktop only)
    document.addEventListener('click', (e) => {
      if(window.innerWidth > 900 && !dropdownBtn.contains(e.target) && !dropdownContent.contains(e.target)){
        dropdownContent.classList.remove('open');
        dropdownBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ROI calculator functions and init
  let elems = {};
  const pairs = [
    ['hangarSqft','hangarSqftInput'],
    ['utilBoost','utilBoostInput'],
    ['tenantRate','tenantRateInput'],
    ['peoplePerStack','peopleInput'],
    ['wagePerHour','wageInput'],
    ['timePerStack','timeInput']
  ];

  function update(){
    if(!elems || !elems.hangarSqft) return;
    const sqft = Number(elems.hangarSqft.value);
    const boost = Number(elems.utilBoost.value);
    const tenant = Number(elems.tenantRate.value);
    const people = Number(elems.peoplePerStack.value);
    const wage = Number(elems.wagePerHour.value);
    const hoursPerDay = Number(elems.timePerStack.value);
    const days = 365;
    if(elems.hangarSqftInput) elems.hangarSqftInput.value = sqft;
    if(elems.utilBoostInput) elems.utilBoostInput.value = boost;
    if(elems.tenantRateInput) elems.tenantRateInput.value = Number(tenant).toFixed(2);
    if(elems.peopleInput) elems.peopleInput.value = people;
    if(elems.wageInput) elems.wageInput.value = wage;
    if(elems.timeInput) elems.timeInput.value = Number(hoursPerDay).toFixed(1);
    const annualLabor = people * wage * hoursPerDay * days;
    const utilIncrease = Math.max(0, boost) / 100;
    const annualRevenue = sqft * utilIncrease * tenant * 12;
    const total = Math.round(annualLabor + annualRevenue);
    const laborEl = document.getElementById('laborSaving'); if(laborEl) laborEl.textContent = fmt(Math.round(annualLabor));
    const revEl = document.getElementById('revenueGain'); if(revEl) revEl.textContent = fmt(Math.round(annualRevenue));
    const roiEl = document.getElementById('roi-value'); if(roiEl) roiEl.textContent = fmt(total);
  }

  function initROIControls(){
    elems = {
      hangarSqft: document.getElementById('hangarSqft'),
      hangarSqftInput: document.getElementById('hangarSqftInput'),
      utilBoost: document.getElementById('utilBoost'),
      utilBoostInput: document.getElementById('utilBoostInput'),
      tenantRate: document.getElementById('tenantRate'),
      tenantRateInput: document.getElementById('tenantRateInput'),
      peoplePerStack: document.getElementById('peoplePerStack'),
      peopleInput: document.getElementById('peopleInput'),
      wagePerHour: document.getElementById('wagePerHour'),
      wageInput: document.getElementById('wageInput'),
      timePerStack: document.getElementById('timePerStack'),
      timeInput: document.getElementById('timeInput')
    };
    if(!elems.hangarSqft) return false;
    pairs.forEach(([s,i]) => {
      const slider = document.getElementById(s);
      const input = document.getElementById(i);
      if(!slider || !input) return;
      if(s === 'timePerStack'){
        slider.addEventListener('input', () => { input.value = Number(slider.value).toFixed(1); update(); });
      } else {
        slider.addEventListener('input', () => { input.value = slider.value; update(); });
      }
      input.addEventListener('change', () => {
        let v = Number(input.value); if(isNaN(v)) return;
        const min = Number(slider.min || -Infinity); const max = Number(slider.max || Infinity);
        if(v < min) v = min; if(v > max) v = max;
        if(s === 'timePerStack'){ v = Math.round(v * 2) / 2; slider.value = v; input.value = Number(v).toFixed(1); } else { slider.value = v; input.value = v; }
        update();
      });
      if(s === 'timePerStack') input.value = Number(slider.value).toFixed(1); else input.value = slider.value;
    });
    update();
    return true;
  }

  if(!initROIControls()){ setTimeout(initROIControls, 300); }

  // FAQ dropdown
  const faqDropdownBtn = document.querySelector('.faq-dropdown-btn');
  const faqDropdownContent = document.querySelector('.faq-dropdown-content');
  const faqDropdownIcon = document.querySelector('.faq-dropdown-icon');
  if(faqDropdownBtn && faqDropdownContent && faqDropdownIcon){
    faqDropdownBtn.addEventListener('click', () => {
      const isOpen = faqDropdownContent.classList.contains('open');
      if(isOpen){
        faqDropdownContent.classList.remove('open');
        faqDropdownBtn.setAttribute('aria-expanded', 'false');
        faqDropdownIcon.textContent = '+';
      } else {
        faqDropdownContent.classList.add('open');
        faqDropdownBtn.setAttribute('aria-expanded', 'true');
        faqDropdownIcon.textContent = '-';
      }
    });
  }

  // =====================================================
  // Video Showcase Carousel
  // =====================================================
  
  const videoShowcase = document.getElementById('video-showcase');
  
  if (videoShowcase) {
    // Video data for the carousel
    const videos = [
      // TO DO: Automated Tug

      // Auto Stacking
      {
        src: './assets/auto_stack_demo.mp4',
        heroTitle: 'Maximize Hangar Efficiency',
        heroDesc: 'Our algorithm intelligently positions each aircraft to fit more planes in less space—automatically and safely.'
      },

      // TO DO: Path Planning

      // Collision Detection
      {
        src: './assets/collision_detection_demo_sim.mp4',
        heroTitle: 'Protect Every Aircraft',
        heroDesc: 'Real-time collision detection monitors every movement, preventing costly hangar rash and protecting valuable aircraft assets.'
      },
    ];
    
    let currentVideoIndex = 0;
    let isTransitioning = false;
    const videoEl = document.getElementById('showcase-video');
    const videoContainer = videoShowcase.querySelector('.video-container');
    const videoPanelTitle = videoShowcase.querySelector('.video-panel-title');
    const videoPanelDesc = videoShowcase.querySelector('.video-panel-desc');
    const dotsContainer = videoShowcase.querySelector('.carousel-dots');
    
    // Create dots
    videos.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Go to video ${index + 1}`);
      dot.addEventListener('click', () => goToVideo(index));
      dotsContainer.appendChild(dot);
    });
    
    function updateVideo(index, direction = 'right') {
      const video = videos[index];
      videoEl.src = video.src;
      videoEl.load();
      videoEl.play().catch(() => {}); // Autoplay may be blocked
      if (videoPanelTitle) videoPanelTitle.textContent = video.heroTitle;
      if (videoPanelDesc) videoPanelDesc.textContent = video.heroDesc;

      // Update dots
      dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
    }
    
    function transitionToVideo(index, direction) {
      if (isTransitioning || index === currentVideoIndex) return;
      isTransitioning = true;
      
      // When going down/next: current slides out up, new slides in from down
      // When going up/prev: current slides out down, new slides in from up
      const slideOutClass = direction === 'down' ? 'slide-out-up' : 'slide-out-down';
      const slideInClass = direction === 'down' ? 'slide-in-up' : 'slide-in-down';
      
      videoContainer.classList.add(slideOutClass);
      
      setTimeout(() => {
        // Update video content while hidden
        currentVideoIndex = index;
        updateVideo(currentVideoIndex, direction);
        
        // Disable transition, position off-screen
        videoContainer.style.transition = 'none';
        videoContainer.classList.remove(slideOutClass);
        videoContainer.classList.add(slideInClass);
        
        // Force reflow to apply the position instantly
        void videoContainer.offsetWidth;
        
        // Re-enable transition and slide in
        videoContainer.style.transition = '';
        videoContainer.classList.remove(slideInClass);
        
        setTimeout(() => {
          isTransitioning = false;
        }, 600);
      }, 400);
    }
    
    function goToVideo(index) {
      const direction = index > currentVideoIndex ? 'down' : 'up';
      transitionToVideo(index, direction);
    }
    
    function nextVideo() {
      const newIndex = (currentVideoIndex + 1) % videos.length;
      transitionToVideo(newIndex, 'down');
    }
    
    function prevVideo() {
      const newIndex = (currentVideoIndex - 1 + videos.length) % videos.length;
      transitionToVideo(newIndex, 'up');
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') prevVideo();
      if (e.key === 'ArrowDown') nextVideo();
    });
    
    // Track if user manually paused the video
    let userPaused = false;
    
    // Detect user pause/play actions
    if (videoEl) {
      videoEl.addEventListener('pause', () => {
        // Only set userPaused if video didn't end naturally
        if (videoEl.currentTime < videoEl.duration) {
          userPaused = true;
        }
      });
      
      videoEl.addEventListener('play', () => {
        userPaused = false;
      });
    }
    
    // Auto-advance to next video when current one ends (with pause)
    // Only auto-advance if user hasn't paused
    if (videoEl) {
      videoEl.addEventListener('ended', () => {
        if (!userPaused) {
          setTimeout(() => {
            nextVideo();
          }, 1500); // 1.5 second pause before advancing
        }
      });
    }
    
    // Start playing the first video
    if (videoEl) {
      videoEl.play().catch(() => {});
    }
  }

  // Custom video controls
  const customVideos = document.querySelectorAll('.custom-video');
  customVideos.forEach(video => {
    const container = video.parentElement;
    const playOverlay = container.querySelector('.video-play-overlay');
    
    if (playOverlay) {
      // Click on overlay or video to toggle play/pause
      const togglePlayPause = () => {
        if (video.paused) {
          video.play();
          playOverlay.classList.add('hidden');
        } else {
          video.pause();
          playOverlay.classList.remove('hidden');
        }
      };
      
      playOverlay.addEventListener('click', togglePlayPause);
      video.addEventListener('click', togglePlayPause);
      
      // Show overlay when video ends
      video.addEventListener('ended', () => {
        playOverlay.classList.remove('hidden');
      });
    }
  });
});
