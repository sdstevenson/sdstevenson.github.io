// Plan-frame conventions of the hangar 3D scene (HangarScene3D.js).
// Plan coordinates are meters in the native top-left frame (x along the width, y along the depth). Subtracting the
// selected origin wall vertex and mapping plan (x, y) -> world (x, z) gives the scene frame. An aircraft's x/y is its
// model center; width is its wingspan (local X), length its fuselage (local Z); the nose points along
// (-sin(theta), -cos(theta)) in plan, so the model is turned by PI + theta about the vertical axis.
import * as THREE from '../lib/three/build/three.module.min.js';

export function planToWorld(x, y, originX = 0, originY = 0) {
    return { x: x - originX, z: y - originY };
}

export function aircraftRotationY(theta) {
    return Math.PI + (Number(theta) || 0);
}

export function applyAircraftPose(root, aircraft, originX = 0, originY = 0) {
    const at = planToWorld(aircraft.x, aircraft.y, originX, originY);
    root.position.set(at.x, 0, at.z);
    root.rotation.set(0, aircraftRotationY(aircraft.theta), 0);
}

const CROSS_BAR_SHARE = 0.03;
const CROSS_MIN_BAR = 0.12;

/** A neutral stand-in for an aircraft whose model is loading or missing: a flat cross as wide as the wingspan and as long as the fuselage. */
export function createAircraftPlaceholder(aircraft, material) {
    const width = Math.max(0.5, aircraft.width || 2);
    const length = Math.max(0.5, aircraft.length || 3);
    const bar = Math.max(CROSS_MIN_BAR, Math.min(width, length) * CROSS_BAR_SHARE);
    const group = new THREE.Group();
    for (const [x, z] of [[width, bar], [bar, length]]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, bar, z), material);
        mesh.position.y = bar / 2;
        group.add(mesh);
    }
    return group;
}
