/* Standalone "play it yourself" tracking viewer.
   Six synchronized camera videos beside the 3D floor view, driven by the recorded poses and the clearance zones
   exported from the Starlight tracking demo. The playback controller and 3D scene are the app's own modules;
   this file only supplies the data, the controls, and the stand-in for the app's host callbacks. */
import { loadScene, loadStyles, createSceneHost, modelUrl } from '../../hangar3d/js/hangar3d.js?v=20261106-7';
import * as playback from './TrackingDemoPlayback.js?v=20261106-8';

const DOT = { High: '#E5485D', Medium: '#f5c542', Low: '#f5c542', None: '#4CC38A' };
const UNKNOWN_DOT = '#c8ccd0';
const MODEL_URL = modelUrl('cirrus_sr22');

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

const seconds = value => value.toFixed(1);

export async function mountTrackingViewer(root, { dataUrl, autoplay = true } = {}) {
    root.classList.add('is-loading', 'h3d-on-dark');
    root.replaceChildren(el('p', 'h3d-status', 'Loading the recording…'));
    await loadStyles();

    const response = await fetch(dataUrl || new URL('../data/demo-01.json', import.meta.url));
    if (!response.ok) throw new Error('The recording data could not be loaded.');
    const { demo, collisions } = await response.json();

    // ---- markup ------------------------------------------------------------------------------------------------
    // One video holds the six cameras in a 2 x 3 grid, so a single decoder and request serve all of them.
    const cameras = el('div', 'tv-cameras');
    const video = el('video');
    video.dataset.cameraMosaic = '';
    video.src = new URL('../video/cameras.mp4', import.meta.url).href;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-label', 'The six hangar cameras with tracking overlays');
    cameras.append(video);
    const status = el('p', 'h3d-status h3d-status-overlay');
    status.hidden = true;
    const sceneWrap = el('div', 'tv-scene-wrap h3d-stage');
    const sceneHost = createSceneHost(sceneWrap);
    sceneWrap.append(status, el('p', 'h3d-hint', 'Drag to orbit · right-drag to pan · scroll to zoom'));

    const toggle = el('button', 'tv-play h3d-btn h3d-btn-primary', PLAY);
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Play');
    toggle.disabled = true;
    const restart = el('button', 'tv-restart h3d-btn h3d-btn-pill', 'Restart');
    restart.type = 'button';
    restart.disabled = true;
    const range = el('input', 'tv-range h3d-range');
    range.type = 'range';
    range.min = '0';
    range.max = String(demo.durationSeconds);
    range.step = String(1 / demo.framesPerSecond);
    range.value = '0';
    range.disabled = true;
    range.setAttribute('aria-label', 'Playback time');
    const clock = el('output', 'tv-clock', `0.0 / ${seconds(demo.durationSeconds)} s`);
    const controls = el('div', 'tv-controls');
    controls.append(toggle, restart, range, clock);

    const legend = el('p', 'tv-legend',
        '<span><span class="tv-key tv-key-medium"></span>Aircraft within ' + collisions.mediumClearance + ' m</span>' +
        '<span><span class="tv-key tv-key-high"></span>Within ' + collisions.highClearance + ' m</span>');

    const panels = el('div', 'tv-panels');
    panels.append(cameras, sceneWrap);
    root.classList.remove('is-loading');
    root.classList.add('is-ready');
    root.replaceChildren(panels, controls, legend);

    // ---- state shared with the app's modules ---------------------------------------------------------------------
    let frame = -1;
    let dragging = false;
    let playing = false;
    let ready = false;
    let failed = false;

    const setRange = time => {
        range.value = String(time);
        range.style.setProperty('--p', `${(time / demo.durationSeconds * 100).toFixed(2)}%`);
    };

    const showStatus = (message, isError) => {
        status.textContent = message || '';
        status.hidden = !message;
        status.classList.toggle('is-error', Boolean(isError));
    };

    const fail = message => {
        failed = true;
        showStatus(message, true);
        toggle.disabled = restart.disabled = range.disabled = true;
    };

    const sceneFor = notification => {
        const index = notification.frame;
        const priorities = collisions.framePriorities[index] || {};
        const areas = collisions.frameAreas[index] || [];
        return {
            aircraft: demo.aircraft.map(aircraft => {
                const pose = notification.poses.find(value => value.aircraftId === aircraft.id);
                const priority = priorities[aircraft.id];
                return {
                    tail: aircraft.id,
                    modelName: aircraft.modelName,
                    modelUrl: MODEL_URL,
                    width: aircraft.width,
                    length: aircraft.length,
                    x: pose.x,
                    y: pose.y,
                    theta: pose.heading,
                    visible: pose.visible,
                    opacity: pose.status === 'Unobserved' ? 0.5 : 1,
                    statusDotColor: priority ? DOT[priority] : pose.status === 'Tracked' ? DOT.None : UNKNOWN_DOT
                };
            }),
            collisionAreas: areas.map(area => collisions.areas[area])
        };
    };

    // The app's playback controller reports through a host callback; this stands in for it.
    const host = {
        invokeMethodAsync(name, ...args) {
            if (name === 'OnPlaybackState') {
                const notification = args[0];
                if (notification.error) fail(notification.error);
                playing = notification.playing || notification.buffering;
                toggle.innerHTML = playing ? PAUSE : PLAY;
                toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
                toggle.disabled = !ready || failed || (!playing && notification.buffering);
                if (!dragging) setRange(notification.time);
                clock.textContent = `${seconds(notification.time)} / ${seconds(demo.durationSeconds)} s`;
                if (notification.frame !== frame) {
                    frame = notification.frame;
                    scene3d.update(sceneHost, sceneFor(notification), false);
                }
            } else if (name === 'SetRendererStatus') {
                const [message, isError] = args;
                if (isError) {
                    playback.pause(root);
                    fail(message);
                }
                // Non-error notices (such as the app's "models unavailable" note) are for the app's own users.
            }
            return Promise.resolve();
        }
    };

    // ---- start-up ------------------------------------------------------------------------------------------------
    let scene3d;
    try {
        scene3d = await loadScene();
        scene3d.create(sceneHost, host, false);
        scene3d.setStaticScene(sceneHost, {
            width: demo.bounds.width, depth: demo.bounds.depth,
            floorMinX: demo.bounds.minX, floorMinY: demo.bounds.minY,
            originX: 0, originY: 0, unitLabel: 'm', preferredView: 'angled', showTailNumbers: false
        });
        // A missing aircraft model leaves the app's plain aircraft shapes in place, so it must not block playback.
        await scene3d.preparePlayback(sceneHost, [MODEL_URL], false);
        await playback.create(root, host, demo, 0);
        ready = true;
        toggle.disabled = restart.disabled = range.disabled = false;
    } catch (error) {
        fail(`The recording could not start: ${error.message || error}`);
        throw error;
    }

    toggle.addEventListener('click', () => (playing ? playback.pause(root) : playback.play(root)));
    restart.addEventListener('click', () => playback.restart(root));
    range.addEventListener('input', () => {
        dragging = true;
        setRange(Number(range.value));
        playback.seek(root, Number(range.value));
    });
    range.addEventListener('change', () => { dragging = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && playing) playback.pause(root); });
    // Six videos decode at once, so the recording only runs while it is on screen.
    let pausedOffscreen = autoplay;
    const watcher = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
            if (pausedOffscreen && !playing) playback.play(root);
            pausedOffscreen = false;
        } else if (playing) {
            pausedOffscreen = true;
            playback.pause(root);
        }
    }, { threshold: 0.25 }) : null;
    if (watcher) watcher.observe(root);
    else if (autoplay) playback.play(root);

    return () => {
        watcher?.disconnect();
        playback.dispose(root);
        scene3d.dispose(sceneHost);
    };
}
