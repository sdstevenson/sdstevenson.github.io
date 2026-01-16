// Shared site JS: year, demo form handling, ROI calculator init
function fmt(n){ return '$' + n.toLocaleString(undefined,{maximumFractionDigits:0}); }

document.addEventListener('DOMContentLoaded', () => {
  // year
  const yearEl = document.getElementById('year'); if(yearEl) yearEl.textContent = new Date().getFullYear();

  // ensure sticky visible to assistive tech
  const sticky = document.getElementById('stickyBrand'); if(sticky) sticky.removeAttribute('aria-hidden');

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

  function initROIDrawer(){
    const roiTab = document.getElementById('roiTab');
    const roiDrawer = document.getElementById('roiDrawer');
    const roiOverlay = document.getElementById('roiOverlay');
    if(!roiDrawer || !roiTab || !roiOverlay) return false;
    function openDrawer(){ roiDrawer.classList.add('open'); roiOverlay.hidden = false; roiTab.setAttribute('aria-expanded','true'); }
    function closeDrawer(){ roiDrawer.classList.remove('open'); roiOverlay.hidden = true; roiTab.setAttribute('aria-expanded','false'); }
    if(roiTab) roiTab.addEventListener('click', () => { const open = roiDrawer.classList.contains('open'); (open ? closeDrawer() : openDrawer()); });
    if(roiOverlay) roiOverlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeDrawer(); });
    const closeBtn = roiDrawer.querySelector('.roi-close'); if(closeBtn) closeBtn.addEventListener('click', closeDrawer);
    return true;
  }

  if(!initROIDrawer()){ setTimeout(initROIDrawer, 300); }
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
        title: 'Intelligent Auto-Stack',
        desc: 'Our algorithm finds optimal placements for maximum hangar utilization'
      },

      // TO DO: Path Planning

      // Collision Detection
      {
        src: './assets/collision_detection_demo_sim.mp4',
        title: 'Collision Detection',
        desc: 'Real-time hazard identification prevents costly hangar rash'
      },
    ];
    
    let currentVideoIndex = 0;
    let isTransitioning = false;
    const videoEl = document.getElementById('showcase-video');
    const videoContainer = videoShowcase.querySelector('.video-container');
    const videoTitle = videoShowcase.querySelector('.video-title');
    const videoDesc = videoShowcase.querySelector('.video-desc'); 
    const dotsContainer = videoShowcase.querySelector('.carousel-dots');
    const prevBtn = videoShowcase.querySelector('.carousel-prev');
    const nextBtn = videoShowcase.querySelector('.carousel-next');
    
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
      videoTitle.textContent = video.title;
      videoDesc.textContent = video.desc;
      
      // Update dots
      dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
    }
    
    function transitionToVideo(index, direction) {
      if (isTransitioning || index === currentVideoIndex) return;
      isTransitioning = true;
      
      // When going right/next: current slides out left, new slides in from right
      // When going left/prev: current slides out right, new slides in from left
      const slideOutClass = direction === 'right' ? 'slide-out-left' : 'slide-out-right';
      const slideInClass = direction === 'right' ? 'slide-in-right' : 'slide-in-left';
      
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
        }, 300);
      }, 200);
    }
    
    function goToVideo(index) {
      const direction = index > currentVideoIndex ? 'right' : 'left';
      transitionToVideo(index, direction);
    }
    
    function nextVideo() {
      const newIndex = (currentVideoIndex + 1) % videos.length;
      transitionToVideo(newIndex, 'right');
    }
    
    function prevVideo() {
      const newIndex = (currentVideoIndex - 1 + videos.length) % videos.length;
      transitionToVideo(newIndex, 'left');
    }
    
    // Arrow button handlers
    if (prevBtn) prevBtn.addEventListener('click', prevVideo);
    if (nextBtn) nextBtn.addEventListener('click', nextVideo);
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') prevVideo();
      if (e.key === 'ArrowRight') nextVideo();
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
