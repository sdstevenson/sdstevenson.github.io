/* The tow viewer's 3D scene: an adapter between the tow playback and the shared Starlight hangar scene
   (assets/hangar3d/js/HangarScene3D.js), the same module the tracking viewer uses. Nothing is drawn here; this file turns
   the exported hangar, aircraft and the current playhead into the scene module's inputs (setStaticScene / update).

   createTowScene(container, data) -> Promise of { ready, apply(frame), resize(), dispose() }
   frame = { poses: {tail: [x, y, theta]}, active: tail, route: {id, p: [[x, y, theta]...], length, reach}, s, done }
   Plan frame: meters, x along the width, y along the depth; poses are model centres (see HangarGeometry.js). */
import { loadScene, createSceneHost, modelUrl, aircraftEntry } from '../hangar3d/js/hangar3d.js?v=20261106-7';

const STEP = 0.05;           // meters between samples of a tow's centre path; the scene indexes the path by sample
const MAX_SAMPLES = 4000;
// Walls drawn at the hangar's full height would push the camera back until the aircraft are small; the view caps them.
const VIEW_CEILING = 7;
const TUG = { length: 2.4, width: 1.3, height: 1.0, fixedAxleToRearBody: 0.6 };

function staticScene(data) {
    const { site } = data;
    const hangar = data.hangars[0];
    const bottom = hangar.y + hangar.h;
    return {
        width: site.x1 - site.x0, depth: site.y1 - site.y0, floorMinX: site.x0, floorMinY: site.y0,
        originX: 0, originY: 0, unitLabel: 'm', preferredView: 'angled', showTailNumbers: true, showOrigin: false,
        ceilingHeight: Math.min(hangar.c, VIEW_CEILING), showDoorsOpen: true, tailLabelScale: 0.55, cameraMargin: 0.95,
        walls: [{ x: hangar.x, y: hangar.y }, { x: hangar.x + hangar.w, y: hangar.y }, { x: hangar.x + hangar.w, y: bottom }, { x: hangar.x, y: bottom }],
        doors: hangar.doors.map(([x1, x2]) => ({ x1, y1: bottom, x2, y2: bottom, isOpen: true })),
        obstacles: hangar.obs.map(([x, y, width, height, top, name]) => ({ shape: 'rect', x, y, width, height, verticalHeight: top, baseHeight: 0, name }))
    };
}

// A tow's path resampled evenly along its length, with the tug riding in front of the nose wheel.
function densify(route) {
    const { p, length, reach } = route;
    const n = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(length / STEP) + 1));
    const center = new Array(n), tug = new Array(n);
    const cum = [0];
    for (let j = 1; j < p.length; j++) cum.push(cum[j - 1] + Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]));
    let i = 1;
    for (let j = 0; j < n; j++) {
        const travelled = length * j / (n - 1);
        while (i < p.length - 1 && cum[i] < travelled) i++;
        const span = cum[i] - cum[i - 1] || 1;
        const f = Math.min(1, Math.max(0, (travelled - cum[i - 1]) / span));
        const a = p[i - 1], b = p[i];
        const theta = a[2] + Math.atan2(Math.sin(b[2] - a[2]), Math.cos(b[2] - a[2])) * f;
        const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
        center[j] = { x, y, theta };
        tug[j] = { x: x - Math.sin(theta) * reach, y: y - Math.cos(theta) * reach, theta };
    }
    return { center, tug };
}

export async function createTowScene(container, data) {
    const scene3d = await loadScene();
    const host = createSceneHost(container);
    scene3d.create(host, { invokeMethodAsync: () => Promise.resolve() }, false);
    scene3d.setStaticScene(host, staticScene(data));

    const { types, planes } = data;
    const assetOf = tail => types[planes[tail]].model || planes[tail];
    const tails = Object.keys(planes);
    // A missing model leaves the scene's neutral aircraft shape in place, so it must not block playback.
    const ready = scene3d.preparePlayback(host, [...new Set(tails.map(assetOf))].map(modelUrl), false).catch(() => {});
    const paths = new Map();

    function apply(frame) {
        const { route } = frame;
        if (!paths.has(route.id)) paths.set(route.id, densify(route));
        const { center, tug } = paths.get(route.id);
        const aircraft = tails.map(tail => {
            const type = types[planes[tail]];
            const pose = frame.poses[tail];
            const [x, y, theta] = pose || [0, 0, 0];
            return aircraftEntry({ tail, model: assetOf(tail), width: type.w, length: type.l, x, y, theta, visible: !!pose });
        });
        scene3d.update(host, {
            aircraft,
            playback: {
                pathKey: `tow-${route.id}`, centerPath: center, tugPath: tug,
                sampleIndex: Math.round(Math.min(1, Math.max(0, frame.s / route.length)) * (center.length - 1)),
                isComplete: frame.done, isPlaying: false, activeTail: frame.active, tugProfile: TUG
            }
        }, false);
    }

    return {
        ready,
        apply,
        resize: () => window.dispatchEvent(new Event('resize')),
        dispose: () => scene3d.dispose(host)
    };
}
