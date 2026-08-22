/* ============================================================
   calendar-demo.js
   Interactive calendar + mini hangar using real plan data
   (see assets/calendar-data.js). Drag the red bar to scrub time;
   aircraft glide between event keyframes.
============================================================ */
(function () {
  "use strict";

  const root = document.getElementById("interactive-cal");
  const data = window.CALENDAR_DATA;
  if (!root || !data) return;

  const rowsEl = root.querySelector(".cal-rows");
  const cursor = root.querySelector(".cal-cursor");
  const cursorLabel = root.querySelector(".cal-cursor-label");
  const trackWrap = root.querySelector(".cal-track-wrap");
  const gridEl = root.querySelector("#hangar-grid");
  const statusEl = root.querySelector("#mini-status");

  function pad(n) { return String(n).padStart(2, "0"); }
  function formatHour(hour) {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return pad(h) + ":" + pad(m);
  }

  // Build timeline rows.
  data.aircraft.forEach(function (ac) {
    const row = document.createElement("div");
    row.className = "cal-row";

    const tail = document.createElement("span");
    tail.className = "cal-tail";
    tail.textContent = ac.tail;

    const track = document.createElement("div");
    track.className = "cal-track";
    ac.segments.forEach(function (seg) {
      const bar = document.createElement("div");
      bar.className = "cal-bar " + seg[2];
      bar.style.left = (seg[0] / 24 * 100) + "%";
      bar.style.width = ((seg[1] - seg[0]) / 24 * 100) + "%";
      track.appendChild(bar);
    });

    row.appendChild(tail);
    row.appendChild(track);
    rowsEl.appendChild(row);
  });

  // Build hangar slots (one per possible in-hangar aircraft).
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement("div");
    slot.className = "hangar-slot";
    const tailEl = document.createElement("span");
    tailEl.className = "slot-tail";
    slot.appendChild(tailEl);
    gridEl.appendChild(slot);
    slots.push({ slot: slot, tailEl: tailEl });
  }

  let hour = 12;

  function stateAt(t) {
    let state = data.events[0];
    for (let i = 0; i < data.events.length; i++) {
      if (data.events[i].t <= t) state = data.events[i];
      else break;
    }
    return state;
  }

  function placeCursor() {
    const firstTrack = root.querySelector(".cal-track");
    const wrapRect = trackWrap.getBoundingClientRect();
    const trackRect = firstTrack.getBoundingClientRect();
    cursor.style.left = ((trackRect.left - wrapRect.left) + (hour / 24) * trackRect.width) + "px";
    cursorLabel.textContent = formatHour(hour);
  }

  function render() {
    placeCursor();
    const state = stateAt(hour);
    const positions = state.positions;
    const outside = state.outside;
    const inHangarTails = Object.keys(positions);

    slots.forEach(function (s, i) {
      const tail = inHangarTails[i];
      if (tail) {
        s.slot.classList.add("filled");
        s.tailEl.textContent = tail;
      } else {
        s.slot.classList.remove("filled");
        s.tailEl.textContent = "";
      }
    });

    const inHangar = inHangarTails.length;
    const onRamp = outside.length;
    const away = data.aircraft.length - inHangar - onRamp;
    statusEl.innerHTML =
      "At <strong>" + formatHour(hour) + "</strong> — " +
      "<strong>" + inHangar + "</strong> in hangar, " +
      "<strong>" + onRamp + "</strong> on ramp, " +
      "<strong>" + away + "</strong> away.";
  }

  function setHourFromClientX(clientX) {
    const firstTrack = root.querySelector(".cal-track");
    const rect = firstTrack.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    hour = pct * 24;
    render();
  }

  let dragging = false;
  trackWrap.addEventListener("pointerdown", function (e) {
    dragging = true;
    trackWrap.setPointerCapture(e.pointerId);
    setHourFromClientX(e.clientX);
  });
  trackWrap.addEventListener("pointermove", function (e) {
    if (dragging) setHourFromClientX(e.clientX);
  });
  trackWrap.addEventListener("pointerup", function () { dragging = false; });
  trackWrap.addEventListener("pointercancel", function () { dragging = false; });

  window.addEventListener("resize", render);

  render();
})();
