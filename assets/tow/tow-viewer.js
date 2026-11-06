/* Interactive tow playback: the recorded tows of a real Auto-Stack plan, played in reverse as one continuous sequence that
   fills an empty hangar, in 3D beside a crew checklist.
   Usage:  import { mountTowViewer } from './assets/tow/tow-viewer.js';  mountTowViewer(document.querySelector('[data-tow-viewer]'));
   Importing the module on a page that has a [data-tow-viewer] element mounts it automatically. Set data-tow-src on the
   element to load a different export (see plans/tow-viewer-instructions.md).
   The element's existing contents (the fallback video) are replaced only once the viewer is ready; if data, three.js or
   WebGL fail, they are left untouched.
   mountTowViewer(root, { interactive: false }) mounts a compact, read-only preview (homepage showcase): same scene and styling, no
   controls, no pointer events. It loops the stack-in sequence while resumed; the controller's resume() / pause() start and stop it. */

import { loadStyles, webglAvailable } from '../hangar3d/js/hangar3d.js?v=20261106-7';
import { createTowScene } from './tow-scene.js?v=20261106-7';

const DEFAULT_DATA = new URL('./data/day.json', import.meta.url);
const CSS_URL = new URL('./tow-viewer.css', import.meta.url).href;

const ICONS = {
    in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8 8 16M14.5 16H8V9.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h2v14H7zM20 5.6v12.8a.8.8 0 0 1-1.25.66L9.4 12.66a.8.8 0 0 1 0-1.32l9.35-6.4A.8.8 0 0 1 20 5.6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5h2v14h-2zM4 5.6v12.8a.8.8 0 0 0 1.25.66l9.35-6.4a.8.8 0 0 0 0-1.32L5.25 4.94A.8.8 0 0 0 4 5.6z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Every tow in the viewer is a tow into the hangar: the plan's tows out, played backwards.
const VERB = 'tows in';

// the tug sits just ahead of the nose wheel: its axle is this far in front of the wheel (scene tug: 0.6 m rear overhang)
const TUG_REAR = 0.6, TUG_GAP = 0.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;
const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

function loadCss() {
    return new Promise(resolve => {
        const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.href.split('?')[0] === CSS_URL);
        if (existing) return resolve();
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${CSS_URL}?v=20261106-9`;
        link.onload = link.onerror = () => resolve();
        document.head.append(link);
    });
}

// ---- timeline model: moves (one tow each) in order; the state before each move is a pure fold over the earlier ones ----
function buildModel(data) {
    const state = { ...data.base };
    const before = [];
    const moves = data.moves.map((m, k) => {
        before.push({ ...state });
        const cum = [0];
        for (let i = 1; i < m.p.length; i++) cum.push(cum[i - 1] + Math.hypot(m.p[i][0] - m.p[i - 1][0], m.p[i][1] - m.p[i - 1][1]));
        const length = cum[cum.length - 1];
        const end = m.p[m.p.length - 1];
        // a tow in leaves the aircraft parked where it ended; a tow out (not used by the reversed export) removes it
        if (m.out) delete state[m.t]; else state[m.t] = end.slice();
        return { ...m, k, cum, length, seconds: clamp(length / 5, 3.5, 9), type: data.types[data.planes[m.t]],
            id: k, length, reach: data.types[data.planes[m.t]].g + TUG_REAR + TUG_GAP };
    });
    return { moves, before };
}

function samplePath(move, u) {
    const { p, cum, length } = move;
    const s = clamp(u, 0, 1) * length;
    let i = 1;
    while (i < p.length - 1 && cum[i] < s) i++;
    const span = cum[i] - cum[i - 1] || 1;
    const f = clamp((s - cum[i - 1]) / span, 0, 1);
    const a = p[i - 1], b = p[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, s];
}

function buildUi(model, interactive) {
    const root = el('div', interactive ? 'towv' : 'towv towv-preview');
    const N = model.moves.length;
    const listHtml = model.moves.map(m => {
        const text = `${m.t} ${VERB}`;
        if (!interactive) return `<li class="towv_row" data-k="${m.k}">
            <span class="towv_check"><span aria-hidden="true">${ICONS.check}</span></span>
            <div class="towv_item"><i aria-hidden="true">${ICONS.in}</i><span>${text}</span><em>${mmss(m.d)}</em></div>
          </li>`;
        return `<li class="towv_row" data-k="${m.k}">
            <label class="towv_check"><input type="checkbox" data-k="${m.k}" aria-label="${text}: done"><span aria-hidden="true">${ICONS.check}</span></label>
            <button type="button" class="towv_item" data-k="${m.k}" aria-label="Go to tow ${m.k + 1}: ${text}, planned tow time ${mmss(m.d)}"><i aria-hidden="true">${ICONS.in}</i><span>${text}</span><em title="Planned tow time">${mmss(m.d)}</em></button>
          </li>`;
    }).join('');
    const ticks = model.moves.map(m => `<span class="towv_tick" style="--i:${m.k / N}"></span>`).join('');
    root.innerHTML = `
      <div class="towv_main">
        <div class="towv_stage h3d-stage">
          <div class="towv_scene" aria-hidden="true"></div>
          <div class="towv_hud">
            <p class="towv_tail h3d-pill"><strong data-f="tail"></strong><span data-f="type"></span></p>
            <p class="towv_what h3d-pill" role="status" aria-live="polite"><span data-f="what"></span><small data-f="route"></small></p>
          </div>
          ${interactive ? `<button type="button" class="towv_start h3d-cta" data-f="start">${ICONS.play}<span>Play the stack-in</span></button>
          <p class="towv_hint h3d-hint">${window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'Drag to orbit · pinch to zoom' : 'Drag to orbit · right-drag to pan · scroll to zoom'}</p>` : ''}
        </div>
        <div class="towv_bar">
          <div class="towv_row1">
            ${interactive ? `<div class="towv_buttons">
              <button type="button" class="h3d-btn" data-f="prev" aria-label="Previous tow">${ICONS.prev}</button>
              <button type="button" class="h3d-btn h3d-btn-primary" data-f="play" aria-label="Play">${ICONS.play}</button>
              <button type="button" class="h3d-btn" data-f="next" aria-label="Next tow">${ICONS.next}</button>
              <button type="button" class="h3d-btn h3d-btn-pill" data-f="speed" aria-label="Playback speed">1&times;</button>
            </div>` : ''}
            <p class="towv_step"><strong data-f="step"></strong><span data-f="steptext"></span></p>
          </div>
          <div class="towv_scrub">
            <div class="towv_ticks" aria-hidden="true">${ticks}</div>
            ${interactive ? `<input type="range" class="h3d-range" min="0" max="${N * 1000}" value="0" data-f="day" aria-label="Playhead across all ${N} tows">`
                : '<div class="towv_track" data-f="day"></div>'}
          </div>
        </div>
      </div>
      <div class="towv_side">
        <h3 class="towv_head"><span>${interactive ? 'Stack-in checklist' : 'Checklist'}</span><b data-f="progress"></b></h3>
        <ul class="towv_list" aria-label="Tows into the hangar, in order">${listHtml}</ul>
      </div>`;
    return root;
}

async function mount(root, options) {
    const interactive = options.interactive !== false;
    const fallback = [...root.childNodes];
    const src = root.dataset.towSrc ? new URL(root.dataset.towSrc, document.baseURI) : DEFAULT_DATA;
    const [response] = await Promise.all([fetch(src), loadStyles(), loadCss()]);
    if (!response.ok) throw new Error('Tow data could not be loaded.');
    const data = await response.json();
    const model = buildModel(data);
    const N = model.moves.length;

    const ui = buildUi(model, interactive);
    const scene = await createTowScene(ui.querySelector('.towv_scene'), data);
    // keep the fallback in place while the aircraft models download (a few seconds at most), then show the finished viewer
    await Promise.race([scene.ready, new Promise(resolve => setTimeout(resolve, 6000))]);
    root.replaceChildren(ui);
    scene.resize();

    const f = name => ui.querySelector(`[data-f="${name}"]`);
    const list = ui.querySelector('.towv_list');
    const rows = [...ui.querySelectorAll('.towv_row')];
    const boxes = rows.map(row => row.querySelector('input') || { checked: false });
    const items = rows.map(row => row.querySelector('.towv_item'));
    const els = {
        tail: f('tail'), type: f('type'), what: f('what'), route: f('route'), start: f('start'),
        prev: f('prev'), play: f('play'), next: f('next'), speed: f('speed'), day: f('day'), step: f('step'), steptext: f('steptext'), progress: f('progress'),
    };
    const SPEEDS = [1, 2, 4];
    const S = { k: 0, t: 0, playing: false, speed: interactive ? 1 : (Number(options.speed) || 2.5), touched: false };
    const frozen = !interactive && reducedMotion();   // a preview for reduced motion shows the finished stack and never moves
    let holdUntil = 0;                                // a looping preview rests on the full stack before starting over
    const manual = new Map();      // checkboxes the user ticked or cleared by hand
    const autoSeen = new Array(N).fill(false);
    let raf = 0, last = 0, lastKey = -1, lastDone = -1;

    const autoDone = k => k < S.k || (k === S.k && S.t >= 1);
    function refreshChecks() {
        const doneCount = S.k + (S.t >= 1 ? 1 : 0);
        if (doneCount === lastDone) return;
        lastDone = doneCount;
        let total = 0;
        for (let k = 0; k < N; k++) {
            const auto = autoDone(k);
            if (auto !== autoSeen[k]) { autoSeen[k] = auto; manual.delete(k); } // playback passing a row resets a hand-made change
            const checked = manual.has(k) ? manual.get(k) : auto;
            boxes[k].checked = checked;
            rows[k].classList.toggle('is-done', checked);
            if (checked) total++;
        }
        els.progress.textContent = `${total} of ${N} done`;
    }

    function compose() {
        const m = model.moves[S.k];
        const poses = { ...model.before[S.k] };
        const pose = samplePath(m, S.t);
        poses[m.t] = pose;
        if (m.out && S.t >= 1) delete poses[m.t];
        scene.apply({ poses, active: m.t, route: m, s: pose[3], done: S.t >= 1 });
        els.day.value = Math.round((S.k + S.t) * 1000);
        els.day.style.setProperty('--p', ((S.k + S.t) / N * 100).toFixed(2) + '%');
        refreshChecks();
    }

    function describe() {
        const m = model.moves[S.k];
        els.tail.textContent = m.t;
        els.type.textContent = m.type.name;
        els.what.textContent = 'Towed into the hangar';
        els.route.textContent = 'Following the planned tow path';
        els.step.textContent = `Tow ${m.k + 1} of ${N}`;
        els.steptext.textContent = `${m.t} ${VERB}`;
        rows.forEach((row, i) => {
            const active = i === S.k;
            row.classList.toggle('is-active', active);
            if (active) items[i].setAttribute('aria-current', 'step'); else items[i].removeAttribute('aria-current');
        });
        const row = rows[S.k];
        const top = row.offsetTop, bottom = top + row.offsetHeight;
        if (top < list.scrollTop + 32) list.scrollTop = Math.max(0, top - 44);
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 12;
        if (els.prev) { els.prev.disabled = S.k === 0; els.next.disabled = S.k === N - 1; }
    }

    function select(k) {
        k = clamp(k, 0, N - 1);
        const changed = k !== S.k || lastKey === -1;
        S.k = k;
        if (changed) {
            describe();
            lastKey = k;
        }
    }

    function setPlaying(on) {
        S.playing = on;
        if (els.play) {
            els.play.innerHTML = on ? ICONS.pause : ICONS.play;
            els.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
            els.start.hidden = S.touched || on;
        }
        cancelAnimationFrame(raf);
        if (on) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    function tick(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (holdUntil) {
            if (now < holdUntil) { compose(); raf = requestAnimationFrame(tick); return; }
            holdUntil = 0; S.t = 0; select(0);
        }
        S.t += dt * S.speed / model.moves[S.k].seconds;
        while (S.t >= 1) {
            if (S.k < N - 1) { S.t -= 1; select(S.k + 1); }
            else if (interactive) { S.t = 1; setPlaying(false); break; }
            else { S.t = 1; holdUntil = now + 2600; break; }
        }
        compose();
        if (S.playing) raf = requestAnimationFrame(tick);
    }

    function userTouched() { S.touched = true; if (els.start) els.start.hidden = true; }
    function play() {
        userTouched();
        if (S.k === N - 1 && S.t >= 1) { S.t = 0; select(0); }
        setPlaying(true);
    }
    const jump = (k, t = 0) => { S.t = t; select(k); lastDone = -1; compose(); };

    if (interactive) {
        els.play.addEventListener('click', () => (S.playing ? (userTouched(), setPlaying(false)) : play()));
        els.start.addEventListener('click', play);
        els.prev.addEventListener('click', () => { userTouched(); jump(S.k - (S.t > 0.02 ? 0 : 1)); });
        els.next.addEventListener('click', () => { userTouched(); jump(S.k + 1); });
        els.speed.addEventListener('click', () => {
            S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length];
            els.speed.innerHTML = S.speed + '&times;';
        });
        els.day.addEventListener('input', () => {
            userTouched(); setPlaying(false);
            const v = els.day.value / 1000;
            const k = Math.min(N - 1, Math.floor(v));
            jump(k, v - k);
        });
        items.forEach((item, k) => item.addEventListener('click', () => {
            userTouched();
            jump(k);
            if (!reducedMotion()) setPlaying(true);
        }));
        boxes.forEach((box, k) => box.addEventListener('change', () => {
            manual.set(k, box.checked);
            rows[k].classList.toggle('is-done', box.checked);
            els.progress.textContent = `${boxes.filter(b => b.checked).length} of ${N} done`;
        }));
        list.addEventListener('keydown', event => {
            if (event.target.type === 'checkbox' || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
            const next = clamp(S.k + (event.key === 'ArrowDown' ? 1 : -1), 0, N - 1);
            if (next === S.k) return;
            event.preventDefault();
            userTouched(); jump(next);
            items[next].focus();
        });
    }

    select(0);
    compose();
    setPlaying(false);
    if (frozen) jump(N - 1, 1);

    return {
        select: (k, t = 0) => jump(k, t),
        play, pause: () => setPlaying(false),
        resume: () => { if (!frozen) setPlaying(true); },
        destroy() { cancelAnimationFrame(raf); scene.dispose(); root.replaceChildren(...fallback); },
    };
}

export function mountTowViewer(root, options = {}) {
    if (!root) return Promise.resolve(null);
    if (!root.__towViewer) {
        root.__towViewer = (webglAvailable() ? mount(root, options) : Promise.resolve(null)).catch(error => {
            console.warn('Tow viewer unavailable:', error);
            root.__towViewer = null;
            return null;
        });
    }
    return root.__towViewer;
}

export default mountTowViewer;

const auto = document.querySelector('[data-tow-viewer]');
if (auto) mountTowViewer(auto);
