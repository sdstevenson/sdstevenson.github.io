/* ============================================================
   calendar-data.js
   Simplified from plans/5c1ae32888fd45a0979d43a5b0709df9.json
   (Operations Plan 2026-08-18). Keeps only what the demo needs:
   the roster schedule and per-event position snapshots.
============================================================ */
window.CALENDAR_DATA = (function () {
  "use strict";

  // In-hangar position snapshots at each distinct layout.
  // Each entry: [x, y, heading-degrees]
  var P7 = { // 00:00–15:00 (7 in hangar, N608RP on ramp)
    N220SR: [6, 4.4, 202], N6869R: [15.7, 4.4, 202], N5262Y: [26.1, 4.7, 225],
    N4238C: [33, 7, 180], N818LL: [19.9, 10, 180], N512SP: [5, 11.4, 225],
    N552SP: [28.4, 13, 180]
  };
  var P6 = { // 17:00 (N818LL departed)
    N220SR: [6, 4.4, 202], N6869R: [15.7, 4.4, 202], N5262Y: [26.1, 4.7, 225],
    N4238C: [33, 7, 180], N512SP: [5, 11.4, 225], N552SP: [28.4, 13, 180]
  };
  var P9 = { // 18:00 restack (9 packed in hangar)
    N228L: [8.7, 11, 23], N220SR: [23, 4.7, 225], N6869R: [28.7, 7.7, 180],
    N693TF: [21, 13.7, 0], N5262Y: [32, 13.7, 0], N4238C: [13.7, 16.7, 180],
    N745CD: [27, 19.7, 158], N512SP: [6.7, 20.7, 202], N552SP: [19, 22, 23]
  };
  var P8 = { // 20:00 (N228L departed)
    N220SR: [23, 4.7, 225], N6869R: [28.7, 7.7, 180], N693TF: [21, 13.7, 0],
    N5262Y: [32, 13.7, 0], N4238C: [13.7, 16.7, 180], N745CD: [27, 19.7, 158],
    N512SP: [6.7, 20.7, 202], N552SP: [19, 22, 23]
  };
  var P7b = { // 21:00–22:00 (N552SP departed)
    N220SR: [23, 4.7, 225], N6869R: [28.7, 7.7, 180], N693TF: [21, 13.7, 0],
    N5262Y: [32, 13.7, 0], N4238C: [13.7, 16.7, 180], N745CD: [27, 19.7, 158],
    N512SP: [6.7, 20.7, 202]
  };
  var P6b = { // 23:00 (N693TF departed)
    N220SR: [23, 4.7, 225], N6869R: [28.7, 7.7, 180], N5262Y: [32, 13.7, 0],
    N4238C: [13.7, 16.7, 180], N745CD: [27, 19.7, 158], N512SP: [6.7, 20.7, 202]
  };

  return {
    title: "Operations Plan · Aug 18, 2026",
    horizon: [0, 24],          // hours since Aug 18 00:00
    viewBox: [38, 27],         // SVG viewBox for the map
    floor: { x: 2.5, y: 2.5, w: 33, h: 21 },

    // Each aircraft: presence segments [startHour, endHour, state]
    // state: 'hangar' | 'ramp' | 'away'
    aircraft: [
      { tail: "N608RP", segments: [[0, 11, "ramp"], [11, 24, "away"]] },
      { tail: "N4238C", segments: [[0, 24, "hangar"]] },
      { tail: "N512SP", segments: [[0, 24, "hangar"]] },
      { tail: "N5262Y", segments: [[0, 24, "hangar"]] },
      { tail: "N552SP", segments: [[0, 21, "hangar"], [21, 24, "away"]] },
      { tail: "N818LL", segments: [[0, 17, "hangar"], [17, 24, "away"]] },
      { tail: "N220SR", segments: [[0, 24, "hangar"]] },
      { tail: "N6869R", segments: [[0, 24, "hangar"]] },
      { tail: "N228L", segments: [[0, 10, "away"], [10, 18, "ramp"], [18, 20, "hangar"], [20, 24, "away"]] },
      { tail: "N6242F", segments: [[0, 12.5, "away"], [12.5, 15, "ramp"], [15, 24, "away"]] },
      { tail: "N693TF", segments: [[0, 14, "away"], [14, 18, "ramp"], [18, 23, "hangar"], [23, 24, "away"]] },
      { tail: "N745CD", segments: [[0, 18, "away"], [18, 24, "hangar"]] },
      { tail: "N122CV", segments: [[0, 22, "away"], [22, 24, "ramp"]] }
    ],

    // Event keyframes (the "After" state of each checkpoint).
    events: [
      { t: 0,    outside: ["N608RP"], positions: P7 },
      { t: 6,    outside: ["N608RP"], positions: P7 },
      { t: 10,   outside: ["N608RP", "N228L"], positions: P7 },
      { t: 11,   outside: ["N228L"], positions: P7 },
      { t: 12.5, outside: ["N228L", "N6242F"], positions: P7 },
      { t: 14,   outside: ["N228L", "N6242F", "N693TF"], positions: P7 },
      { t: 15,   outside: ["N228L", "N693TF"], positions: P7 },
      { t: 17,   outside: ["N228L", "N693TF"], positions: P6 },
      { t: 18,   outside: [], positions: P9 },
      { t: 20,   outside: [], positions: P8 },
      { t: 21,   outside: [], positions: P7b },
      { t: 22,   outside: ["N122CV"], positions: P7b },
      { t: 23,   outside: ["N122CV"], positions: P6b }
    ]
  };
})();
