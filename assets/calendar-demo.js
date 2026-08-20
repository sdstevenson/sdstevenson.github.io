/* ============================================================
   calendar-demo.js
   Interactive calendar + mini hangar prototype.
   Drag the red bar to step through the day; the mini hangar
   shows which aircraft are inside at that time.
============================================================ */
(function () {
  "use strict";

  const root = document.getElementById("interactive-cal");
  if (!root) return;

  // Each aircraft: segments of [startHour, endHour, state]
  // state is one of: 'hangar', 'ramp', 'away' (not arrived / departed)
  const schedule = [
    { tail: "N122CV", segments: [[0, 6, "away"], [6, 16, "ramp"], [16, 24, "hangar"]] },
    { tail: "N220SR", segments: [[0, 24, "hangar"]] },
    { tail: "N228L", segments: [[0, 4, "away"], [4, 10, "ramp"], [10, 20, "hangar"], [20, 24, "ramp"]] },
    { tail: "N4238C", segments: [[0, 24, "hangar"]] },
    { tail: "N512SP", segments: [[0, 8, "hangar"], [8, 24, "ramp"]] },
    { tail: "N608RP", segments: [[0, 12, "ramp"], [12, 24, "hangar"]] },
    { tail: "N6869R", segments: [[0, 18, "hangar"], [18, 24, "away"]] },
    { tail: "N818LL", segments: [[0, 24, "hangar"]] },
  ];

  const rowsEl = root.querySelector(".cal-rows");
  const cursor = root.querySelector(".cal-cursor");
  const cursorLabel = root.querySelector(".cal-cursor-label");
  const trackWrap = root.querySelector(".cal-track-wrap");
  const hangarSlots = Array.from(root.querySelectorAll(".hangar-slot"));
  const statusEl = root.querySelector(".mini-status");

  function stateAt(segments, hour) {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i][0], e = segments[i][1], state = segments[i][2];
      if (hour >= s && hour < e) return state;
    }
    return "away";
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function formatHour(hour) {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return pad(h) + ":" + pad(m);
  }

  // Build the timeline rows once.
  schedule.forEach(function (ac) {
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

  let hour = 12;

  function placeCursor() {
    const firstTrack = root.querySelector(".cal-track");
    const wrapRect = trackWrap.getBoundingClientRect();
    const trackRect = firstTrack.getBoundingClientRect();
    const left = (trackRect.left - wrapRect.left) + (hour / 24) * trackRect.width;
    cursor.style.left = left + "px";
    cursorLabel.textContent = formatHour(hour);
  }

  function render() {
    placeCursor();

    const inHangar = schedule.filter(function (a) { return stateAt(a.segments, hour) === "hangar"; });
    const onRamp = schedule.filter(function (a) { return stateAt(a.segments, hour) === "ramp"; });
    const away = schedule.filter(function (a) { return stateAt(a.segments, hour) === "away"; });

    hangarSlots.forEach(function (slot, i) {
      const ac = inHangar[i];
      const tailEl = slot.querySelector(".slot-tail");
      if (ac) {
        slot.classList.add("filled");
        tailEl.textContent = ac.tail;
      } else {
        slot.classList.remove("filled");
        tailEl.textContent = "";
      }
    });

    statusEl.innerHTML =
      "At <strong>" + formatHour(hour) + "</strong> — " +
      "<strong>" + inHangar.length + "</strong> in hangar, " +
      "<strong>" + onRamp.length + "</strong> on ramp, " +
      "<strong>" + away.length + "</strong> away.";
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
