/* Shared entry point to the Starlight hangar 3D scene.
   Both site viewers (the tracking replay on collision-prevention.html and the tow playback on auto-stack.html) load the
   scene through this file, so the scene, its palette, the aircraft models and the three.js build exist exactly once.
   Styling lives beside it in ../hangar3d.css. See plans/tow-viewer-instructions.md, "Shared hangar3d module". */

const here = import.meta.url;
// Cache-buster for everything this file loads; bump it with the ?v= on the pages' links whenever a shared file changes.
const V = '20261106-7';

/** URL of a lean aircraft model, by SDK model id (assets/hangar3d/models/<id>.glb). */
export const modelUrl = id => new URL(`../models/${id}.glb?v=${V}`, here).href;

/** Loads the shared stylesheet (colour tokens, scene stage, controls) once. */
export function loadStyles() {
    const href = new URL('../hangar3d.css', here).href;   // a page may link it itself (with ?v=); compared without the query
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(link => link.href.split('?')[0] === href);
    if (existing) return Promise.resolve();
    return new Promise(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${href}?v=${V}`;
        link.onload = link.onerror = () => resolve();
        document.head.append(link);
    });
}

// The scene reads its colours from a classic script that publishes window.HangarPalette.
function loadPalette() {
    if (window.HangarPalette) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(`./HangarPalette.js?v=${V}`, here).href;
        script.onload = resolve;
        script.onerror = () => reject(new Error('The viewer palette could not be loaded.'));
        document.head.append(script);
    });
}

let scenePromise = null;

/** The palette, then the scene module (create / setStaticScene / update / preparePlayback / dispose ...). */
export function loadScene() {
    scenePromise ??= loadPalette().then(() => import(`./HangarScene3D.js?v=${V}`));
    scenePromise.catch(() => { scenePromise = null; });
    return scenePromise;
}

/** The scene sizes its host's parent to fill that parent's own parent, so the host sits in a frame of its own. */
export function createSceneHost(container) {
    const host = document.createElement('div');
    host.className = 'h3d-scene';
    const frame = document.createElement('div');
    frame.className = 'h3d-scene-frame';
    frame.append(host);
    container.append(frame);
    return host;
}

export function webglAvailable() {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch { return false; }
}

/** Plan-frame aircraft entry for scene.update(): x/y is the model centre, theta the heading (see HangarGeometry.js). */
export function aircraftEntry({ tail, model, width, length, x, y, theta, visible = true, opacity = 1, dot = null }) {
    return { tail, modelName: model, modelUrl: modelUrl(model), width, length, x, y, theta, visible, opacity, statusDotColor: dot };
}
