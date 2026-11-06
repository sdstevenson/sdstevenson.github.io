import * as THREE from '../lib/three/build/three.module.min.js';
import { OrbitControls } from '../lib/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../lib/three/examples/jsm/loaders/GLTFLoader.js';
import { applyAircraftPose, createAircraftPlaceholder } from './HangarGeometry.js';
import { storedSamples } from './TowPlaybackCollisions.js';

import { COLLISION_ROUNDING_METERS, prepareRoundedCollisionZones, buildRoundedCollisionGeometry } from './RoundedCollisionZones.js';

const scenes = new Map();
const loader = new GLTFLoader();
const HIGH_COLLISION_AREA_COLOR = new THREE.Color(0xff2028);
const MEDIUM_COLLISION_AREA_COLOR = new THREE.Color(0xffdc00);

export function neutralize(root, material) {
    root.traverse(node => {
        if (!node.isMesh) return;
        node.material = material;
        node.castShadow = true;
        node.receiveShadow = true;
    });
}

export function ensureNormals(root) {
    root.traverse(node => {
        if (node.isMesh && node.geometry && !node.geometry.getAttribute('normal')) {
            node.geometry.computeVertexNormals();
        }
    });
}

function disposeMaterial(material) {
    for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
    }
    material.dispose();
}

function loadModel(state, url) {
    let cached = state.modelCache.get(url);
    if (!cached) {
        cached = loader.loadAsync(url).then(gltf => {
            const root = gltf.scene;
            ensureNormals(root);
            return { root };
        });
        state.modelCache.set(url, cached);
        cached.catch(() => state.modelCache.delete(url));
    }
    return cached;
}

function disposeObject(root, disposeShared = false) {
    root.traverse(node => {
        if (!node.geometry && !node.material) return;
        if (disposeShared) node.geometry?.dispose();
        if (!disposeShared) return;
        if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
        else if (node.material) disposeMaterial(node.material);
    });
}

function disposeChildren(group, disposeShared = true) {
    for (const child of [...group.children]) {
        group.remove(child);
        disposeObject(child, disposeShared);
    }
}

function disposePlaceholder(root) {
    root.traverse(node => {
        node.geometry?.dispose();
    });
}

function keyForGeometry(scene) {
    return JSON.stringify({
        width: scene.width,
        depth: scene.depth,
        ceilingHeight: scene.ceilingHeight,
        ceilingProfile: scene.ceilingProfile,
        originX: scene.originX,
        originY: scene.originY,
        floorMinX: scene.floorMinX,
        floorMinY: scene.floorMinY,
        showDoorsOpen: scene.showDoorsOpen === true,
        cameraMargin: scene.cameraMargin,
        wallColor: scene.wallColor,
        doorColor: scene.doorColor,
        unitLabel: scene.unitLabel,
        showOrigin: scene.showOrigin,
        walls: scene.walls,
        doors: scene.doors,
        obstacles: scene.obstacles
    });
}

const HATCH_VERTEX_DECL = 'varying vec3 vHatchWorld;\n';
const HATCH_FRAGMENT_DECL = 'varying vec3 vHatchWorld;\nuniform float uHatch;\n';
const HATCH_FRAGMENT_BODY = `
    if (uHatch > 0.5) {
        // World-space diagonal cross-hatch (~0.6 m spacing), independent of UVs.
        vec2 hp = vec2(vHatchWorld.x + vHatchWorld.z, vHatchWorld.x - vHatchWorld.z) * 1.6;
        vec2 hd = abs(fract(hp + 0.5) - 0.5);
        vec2 haa = fwidth(hp);
        vec2 hl = 1.0 - smoothstep(vec2(0.07), vec2(0.07) + haa, hd);
        diffuseColor.rgb *= 1.0 - 0.5 * max(hl.x, hl.y);
    }
`;

// Shadow lookups are offset along the stored normal, which points into the surface on a back face, so an
// inside-out part of a source model shadows itself and renders dark; turn that normal toward the camera first.
const SHADOW_NORMAL_LINE = 'shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );';
const CAMERA_FACING_SHADOWMAP_VERTEX = THREE.ShaderChunk.shadowmap_vertex.replace(SHADOW_NORMAL_LINE,
    `${SHADOW_NORMAL_LINE}\n\tif ( dot( shadowWorldNormal, cameraPosition - worldPosition.xyz ) < 0.0 ) shadowWorldNormal = -shadowWorldNormal;`);
if (CAMERA_FACING_SHADOWMAP_VERTEX === THREE.ShaderChunk.shadowmap_vertex) {
    console.warn('HangarScene3D: three.js shadowmap_vertex changed; inside-out aircraft parts may self-shadow.');
}

// Installs the (shared-program) hatch shader on a per-aircraft material; toggled via a uniform.
function installHatch(material) {
    const uniform = { value: 0 };
    material.userData.hatchUniform = uniform;
    material.onBeforeCompile = shader => {
        shader.uniforms.uHatch = uniform;
        shader.vertexShader = HATCH_VERTEX_DECL + shader.vertexShader
            .replace('#include <shadowmap_vertex>', CAMERA_FACING_SHADOWMAP_VERTEX)
            .replace(
                '#include <project_vertex>',
                '#include <project_vertex>\n    vHatchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = HATCH_FRAGMENT_DECL + shader.fragmentShader.replace(
            '#include <color_fragment>',
            '#include <color_fragment>\n' + HATCH_FRAGMENT_BODY);
    };
    material.customProgramCacheKey = () => 'aircraft-hatch';
    material.needsUpdate = true;
}

function applyFixedHatch(entry) {
    const uniform = entry.material?.userData?.hatchUniform;
    if (uniform) uniform.value = entry.fixed ? 1 : 0;
}

function createLabel(text, options = {}) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = options.fontSize || 42;
    const padding = options.padding || 14;
    context.font = `600 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    // Optional leading status dot (same proportions as the 2D tail number label).
    const dotColor = options.dotColor || null;
    const dotRadius = dotColor ? fontSize * 0.165 : 0;
    const dotSpace = dotColor ? dotRadius * 2 + fontSize * 0.38 : 0;
    const width = Math.ceil(context.measureText(text).width + dotSpace + (padding * 2));
    canvas.width = Math.max(2, width);
    canvas.height = fontSize + (padding * 2);
    context.font = `600 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = options.background || 'rgba(20, 22, 26, 0.86)';
    if (options.cornerRadius > 0) {
        context.beginPath();
        context.roundRect(0, 0, canvas.width, canvas.height, Math.min(options.cornerRadius, canvas.height / 2));
        context.fill();
    } else {
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (dotColor) {
        const dotCx = padding + dotRadius;
        context.fillStyle = dotColor;
        context.globalAlpha = 0.25;
        context.beginPath();
        context.arc(dotCx, canvas.height / 2, dotRadius + fontSize * 0.1, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.beginPath();
        context.arc(dotCx, canvas.height / 2, dotRadius, 0, Math.PI * 2);
        context.fill();
        context.textAlign = 'left';
        context.fillStyle = options.color || '#f8fafc';
        context.fillText(text, padding + dotSpace, canvas.height / 2);
    } else {
        context.fillStyle = options.color || '#f8fafc';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    const height = options.height || 0.55;
    sprite.scale.set(height * canvas.width / canvas.height, height, 1);
    return sprite;
}

function createAircraftLabel(tail, dotColor) {
    const group = new THREE.Group();
    const sprite = createLabel(tail || '', { height: 1, padding: 7, cornerRadius: 20, background: 'rgba(20, 22, 26, 0.68)', dotColor });
    sprite.material.sizeAttenuation = false;
    sprite.renderOrder = 31;
    const aspect = sprite.material.map.image.width / sprite.material.map.image.height;
    const leaderGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.7, 0)
    ]);
    const leaderMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false
    });
    const leader = new THREE.Line(leaderGeometry, leaderMaterial);
    leader.renderOrder = 30;
    group.add(leader, sprite);
    return { group, sprite, leader, aspect };
}

// The hovered aircraft's tail number label draws above every other label (render order only matters among transparent sprites).
const LABEL_ORDER = 31, LABEL_ACTIVE_ORDER = 32, LABEL_HOVER_ORDER = 50;

function applyLabelOrder(state, tail, entry, active) {
    const hovered = state.hoverTail != null && state.hoverTail === tail;
    entry.label.sprite.renderOrder = hovered ? LABEL_HOVER_ORDER : active ? LABEL_ACTIVE_ORDER : LABEL_ORDER;
    entry.label.leader.renderOrder = hovered ? LABEL_HOVER_ORDER - 1 : 30;
}

function setHoverTail(state, tail) {
    const next = tail ?? null;
    if (state.hoverTail === next) return;
    state.hoverTail = next;
    // Same active aircraft the highlight paths use: the playback leader while playing, otherwise the selection.
    const activeTail = state.data?.playback?.activeTail ?? state.data?.interaction?.selectedTail ?? state.data?.aircraft?.find(item => item.selected === true)?.tail ?? null;
    for (const [entryTail, entry] of state.aircraft) {
        const hovered = next !== null && entryTail === next;
        applyLabelOrder(state, entryTail, entry, activeTail != null && entryTail === activeTail);
        // Highlight the hovered label's leader line; the pill stays untinted so its status dot keeps its color.
        if (hovered) entry.label.leader.material.color.setHex(0xfacc15);
        else entry.label.leader.material.color.setHex(activeTail != null && entryTail === activeTail ? 0x22d3ee : 0xffffff);
    }
}

function setRaycasterFromEvent(state, event) {
    const rect = state.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    state.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    state.raycaster.setFromCamera(state.pointer, state.camera);
    return true;
}

function tailOfObject(node) {
    while (node && !node.userData?.sceneAircraftTail) node = node.parent;
    return node?.userData?.sceneAircraftTail ?? null;
}

function hoverTailAt(state, event) {
    if (!state.renderer || !setRaycasterFromEvent(state, event)) return null;
    // Scratch arrays reused across frames to avoid per-frame allocation.
    const labels = state.hoverLabels ??= [], bodies = state.hoverBodies ??= [];
    labels.length = 0;
    bodies.length = 0;
    for (const entry of state.aircraft.values()) {
        if (!entry.label.group.visible) continue;
        labels.push(entry.label.sprite);
        if (entry.root.visible) bodies.push(entry.root);
    }
    // Labels are drawn on top of everything, so a label under the pointer wins over an aircraft body behind it.
    // Overlapping labels: the one drawn last (highest render order) is the one on top.
    const labelHits = state.raycaster.intersectObjects(labels, false);
    if (labelHits.length > 0) {
        labelHits.sort((a, b) => b.object.renderOrder - a.object.renderOrder || a.distance - b.distance);
        const sprite = labelHits[0].object;
        for (const [tail, entry] of state.aircraft) if (entry.label.sprite === sprite) return tail;
        return null;
    }
    const bodyHit = state.raycaster.intersectObjects(bodies, true)[0];
    return bodyHit ? tailOfObject(bodyHit.object) : null;
}

function disposeAircraftLabel(label) {
    label.sprite.material.map?.dispose();
    label.sprite.material.dispose();
    label.leader.geometry.dispose();
    label.leader.material.dispose();
}

function updateAircraftLabelScale(state, entry) {
    const labelScale = Number.isFinite(state.data?.tailLabelScale) && state.data.tailLabelScale > 0
        ? state.data.tailLabelScale : 1;
    const fallbackHeight = 0.2625 * labelScale;
    const fallbackWidth = THREE.MathUtils.clamp(entry.label.aspect * 0.2625, 0.2625, 1.125) * labelScale;
    if (!Number.isFinite(state.renderHeight) || state.renderHeight <= 0) {
        entry.label.sprite.scale.set(fallbackWidth, fallbackHeight, 1);
        return;
    }
    const projectionY = state.camera.projectionMatrix.elements[5];
    const projectionScale = state.renderHeight * projectionY;
    if (!Number.isFinite(projectionScale) || projectionScale <= 1e-6) {
        entry.label.sprite.scale.set(fallbackWidth, fallbackHeight, 1);
        return;
    }
    const worldUnitsPerPixel = 2 / projectionScale;
    const heightPixels = 36;
    const widthPixels = THREE.MathUtils.clamp(heightPixels * entry.label.aspect, 40, 260);
    const height = Math.min(4, heightPixels * worldUnitsPerPixel) * labelScale;
    const width = Math.min(12, widthPixels * worldUnitsPerPixel) * labelScale;
    entry.label.sprite.scale.set(width, height, 1);
}

function updateAircraftLabelHeight(entry) {
    const bounds = new THREE.Box3().setFromObject(entry.root);
    entry.modelMaxY = Number.isFinite(bounds.max.y) ? bounds.max.y : 0;
    const anchorY = entry.modelMaxY + 0.7;
    entry.label.sprite.position.set(0, anchorY, 0);
    entry.label.leader.geometry.setFromPoints([
        new THREE.Vector3(0, entry.modelMaxY, 0),
        new THREE.Vector3(0, anchorY, 0)
    ]);
    entry.label.leader.geometry.computeBoundingSphere();
}

function disposeAircraftEntry(state, entry) {
    state.aircraftGroup.remove(entry.root);
    state.aircraftGroup.remove(entry.label.group);
    if (entry.placeholder) disposePlaceholder(entry.root);
    entry.material.dispose();
    disposeAircraftLabel(entry.label);
    for (const label of entry.labels?.values() ?? []) {
        if (label !== entry.label) disposeAircraftLabel(label);
    }
}

function addOpenDoorIndicator(state, gap, a, b, profile) {
    const start = { x: a.x + ((b.x - a.x) * gap.start), y: a.y + ((b.y - a.y) * gap.start) };
    const end = { x: a.x + ((b.x - a.x) * gap.end), y: a.y + ((b.y - a.y) * gap.end) };
    const sx = start.x - state.data.originX;
    const sz = start.y - state.data.originY;
    const ex = end.x - state.data.originX;
    const ez = end.y - state.data.originY;
    const startHeight = ceilingHeightAt(profile, start.x);
    const endHeight = ceilingHeightAt(profile, end.x);
    const linePoints = [
        new THREE.Vector3(sx, 0.025, sz), new THREE.Vector3(sx, startHeight, sz),
        new THREE.Vector3(ex, 0.025, ez), new THREE.Vector3(ex, endHeight, ez),
        new THREE.Vector3(sx, 0.025, sz), new THREE.Vector3(ex, 0.025, ez)
    ];
    const splitPoints = [0, 1];
    const dx = end.x - start.x;
    if (Math.abs(dx) > 1e-8) {
        for (const knot of profile) {
            const t = (knot.x - start.x) / dx;
            if (t > 1e-8 && t < 1 - 1e-8) splitPoints.push(t);
        }
    }
    splitPoints.sort((left, right) => left - right);
    const uniqueSplitPoints = splitPoints.filter((value, index) => index === 0 || Math.abs(value - splitPoints[index - 1]) > 1e-8);
    for (let index = 1; index < uniqueSplitPoints.length; index++) {
        const startT = uniqueSplitPoints[index - 1];
        const endT = uniqueSplitPoints[index];
        const headerStartX = start.x + (dx * startT);
        const headerStartY = start.y + ((end.y - start.y) * startT);
        const headerEndX = start.x + (dx * endT);
        const headerEndY = start.y + ((end.y - start.y) * endT);
        linePoints.push(
            new THREE.Vector3(headerStartX - state.data.originX, ceilingHeightAt(profile, headerStartX), headerStartY - state.data.originY),
            new THREE.Vector3(headerEndX - state.data.originX, ceilingHeightAt(profile, headerEndX), headerEndY - state.data.originY));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const doorEdge = window.HangarPalette.doorColor(state.data.doorColor);
    const lines = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial({ color: window.HangarPalette.toHex(doorEdge), dashSize: window.HangarPalette.door.openDash3D.dash, gapSize: window.HangarPalette.door.openDash3D.gap }));
    lines.computeLineDistances();
    state.staticGroup.add(lines);
}

function pointSegmentProjection(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-8) return null;
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2;
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    return { t, distance: Math.hypot(point.x - x, point.y - y) };
}

function normalizeCeilingProfile(data) {
    const fallback = Math.max(1, Number(data.ceilingHeight) || 5);
    const points = (data.ceilingProfile || [])
        .map(point => ({ x: Number(point.x), height: Number(point.height) }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.height))
        .sort((left, right) => left.x - right.x);
    return points.length >= 2 ? points : [{ x: 0, height: fallback }, { x: Number(data.width) || 1, height: fallback }];
}

function ceilingHeightAt(profile, x) {
    if (x <= profile[0].x) return Math.max(0.05, profile[0].height);
    const last = profile[profile.length - 1];
    if (x >= last.x) return Math.max(0.05, last.height);
    for (let index = 1; index < profile.length; index++) {
        const right = profile[index];
        if (x > right.x) continue;
        const left = profile[index - 1];
        const span = right.x - left.x;
        const ratio = span > 1e-8 ? (x - left.x) / span : 1;
        return Math.max(0.05, left.height + ((right.height - left.height) * ratio));
    }
    return Math.max(0.05, last.height);
}

function createWallPanel(state, a, b, heightA, heightB, material, edgeMaterial) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) return;
    const ax = a.x - state.data.originX;
    const az = a.y - state.data.originY;
    const bx = b.x - state.data.originX;
    const bz = b.y - state.data.originY;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        ax, 0, az, bx, 0, bz, bx, heightB, bz,
        ax, 0, az, bx, heightB, bz, ax, heightA, az
    ], 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    state.staticGroup.add(mesh);
    const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ax, heightA, az),
        new THREE.Vector3(bx, heightB, bz)
    ]);
    state.staticGroup.add(new THREE.Line(edgeGeometry, edgeMaterial));
}

function createProfiledWallSegment(state, a, b, profile, material, edgeMaterial) {
    const dx = b.x - a.x;
    const splitPoints = [0, 1];
    if (Math.abs(dx) > 1e-8) {
        for (const knot of profile) {
            const t = (knot.x - a.x) / dx;
            if (t > 1e-8 && t < 1 - 1e-8) splitPoints.push(t);
        }
    }
    splitPoints.sort((left, right) => left - right);
    const uniqueSplitPoints = splitPoints.filter((value, index) => index === 0 || Math.abs(value - splitPoints[index - 1]) > 1e-8);
    for (let index = 1; index < uniqueSplitPoints.length; index++) {
        const startT = uniqueSplitPoints[index - 1];
        const endT = uniqueSplitPoints[index];
        const start = { x: a.x + (dx * startT), y: a.y + ((b.y - a.y) * startT) };
        const end = { x: a.x + (dx * endT), y: a.y + ((b.y - a.y) * endT) };
        createWallPanel(state, start, end, ceilingHeightAt(profile, start.x), ceilingHeightAt(profile, end.x), material, edgeMaterial);
    }
}

/** Returns the footprint of an obstacle as a list of {x, y} points, in meters. */
function obstacleFootprint(obstacle) {
    if (obstacle.shape === 'circle') {
        const radius = Math.max(0.05, obstacle.radius);
        return Array.from({ length: 48 }, (_, index) => {
            const angle = Math.PI * 2 * index / 48;
            return { x: obstacle.x + radius + radius * Math.cos(angle), y: obstacle.y + radius + radius * Math.sin(angle) };
        });
    }
    if (obstacle.shape === 'polygon' && obstacle.points?.length >= 3) return obstacle.points;
    return [
        { x: obstacle.x, y: obstacle.y },
        { x: obstacle.x + obstacle.width, y: obstacle.y },
        { x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height },
        { x: obstacle.x, y: obstacle.y + obstacle.height }
    ];
}

/**
 * Builds the prism of a sloped obstacle, such as stairs or a ramp, in scene coordinates before the origin shift.
 * The bottom is flat at base. The top takes its height from the slope at each corner of the footprint.
 * Hollow stairs (slope.thickness above 0) have an underside that follows the top, never below base.
 */
function slopedObstacleGeometry(obstacle, base, top) {
    const footprint = obstacleFootprint(obstacle);
    const slope = obstacle.slope;
    const dx = slope.endX - slope.startX;
    const dy = slope.endY - slope.startY;
    const lengthSquared = dx * dx + dy * dy;
    if (footprint.length < 3 || lengthSquared < 1e-6) return null;
    const topAt = point => {
        const t = Math.min(1, Math.max(0, ((point.x - slope.startX) * dx + (point.y - slope.startY) * dy) / lengthSquared));
        return Math.max(base + 0.02, slope.startHeight + (top - slope.startHeight) * t);
    };
    const thickness = Math.max(0, Number(slope.thickness) || 0);
    const bottomAt = point => thickness > 0 ? Math.max(base, topAt(point) - thickness) : base;
    const center = footprint.reduce((sum, point) => ({ x: sum.x + point.x / footprint.length, y: sum.y + point.y / footprint.length }), { x: 0, y: 0 });
    const bottoms = footprint.map(point => new THREE.Vector3(point.x, bottomAt(point), point.y));
    const tops = footprint.map(point => new THREE.Vector3(point.x, topAt(point), point.y));
    const positions = [];
    // Adds a triangle whose normal points up, down or away from the center, as the facing says.
    const addTriangle = (a, b, c, facing) => {
        const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        const middle = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
        const wanted = facing === 'up' ? new THREE.Vector3(0, 1, 0)
            : facing === 'down' ? new THREE.Vector3(0, -1, 0)
            : new THREE.Vector3(middle.x - center.x, 0, middle.z - center.y);
        const triangle = normal.dot(wanted) >= 0 ? [a, b, c] : [a, c, b];
        triangle.forEach(vertex => positions.push(vertex.x, vertex.y, vertex.z));
    };
    const contour = footprint.map(point => new THREE.Vector2(point.x, point.y));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
        addTriangle(tops[a], tops[b], tops[c], 'up');
        addTriangle(bottoms[a], bottoms[b], bottoms[c], 'down');
    }
    for (let index = 0; index < footprint.length; index++) {
        const next = (index + 1) % footprint.length;
        addTriangle(bottoms[index], bottoms[next], tops[next], 'out');
        addTriangle(bottoms[index], tops[next], tops[index], 'out');
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return { geometry, centerX: center.x, centerZ: center.y, maxTop: Math.max(...tops.map(vertex => vertex.y)) };
}

function rebuildStatic(state, data) {
    disposeChildren(state.staticGroup);
    state.data = data;
    const wallHeight = Math.max(1, data.ceilingHeight || 5);
    const ceilingProfile = normalizeCeilingProfile(data);
    const palette = window.HangarPalette;
    const wallColor = palette.wallColor(data.wallColor);
    const doorColor = palette.doorColor(data.doorColor);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: palette.toHex(wallColor), roughness: 0.85, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide });
    const doorMaterial = new THREE.MeshStandardMaterial({ color: palette.toHex(doorColor), roughness: 0.65, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const wallEdgeMaterial = new THREE.LineBasicMaterial({ color: palette.toHex(wallColor) });
    const doorEdgeMaterial = new THREE.LineBasicMaterial({ color: palette.toHex(doorColor) });
    const obstacleMaterial = new THREE.MeshStandardMaterial({ color: palette.toHex(palette.scene3d.obstacleFill), roughness: 0.8 });
    const slopedMaterial = new THREE.MeshStandardMaterial({ color: palette.toHex(palette.scene3d.obstacleFill), roughness: 0.8, side: THREE.DoubleSide });
    const obstacleEdgeMaterial = new THREE.LineBasicMaterial({ color: palette.toHex(palette.scene3d.obstacleEdge) });
    const walls = data.walls || [];
    const doors = data.doors || [];

    for (let index = 0; index < walls.length; index++) {
        const a = walls[index];
        const b = walls[(index + 1) % walls.length];
        const gaps = [];
        for (const door of doors) {
            const p1 = pointSegmentProjection({ x: door.x1, y: door.y1 }, a, b);
            const p2 = pointSegmentProjection({ x: door.x2, y: door.y2 }, a, b);
            if (p1 && p2 && p1.distance < 0.05 && p2.distance < 0.05) {
                gaps.push({ start: Math.max(0, Math.min(p1.t, p2.t)), end: Math.min(1, Math.max(p1.t, p2.t)), door });
            }
        }
        gaps.sort((left, right) => left.start - right.start);
        let cursor = 0;
        for (const gap of gaps) {
            if (gap.start > cursor) createProfiledWallSegment(state,
                { x: a.x + (b.x - a.x) * cursor, y: a.y + (b.y - a.y) * cursor },
                { x: a.x + (b.x - a.x) * gap.start, y: a.y + (b.y - a.y) * gap.start }, ceilingProfile, wallMaterial, wallEdgeMaterial);
            const isOpen = data.showDoorsOpen === true || gap.door.isOpen === true;
            if (!isOpen) createProfiledWallSegment(state,
                { x: a.x + (b.x - a.x) * gap.start, y: a.y + (b.y - a.y) * gap.start },
                { x: a.x + (b.x - a.x) * gap.end, y: a.y + (b.y - a.y) * gap.end }, ceilingProfile, doorMaterial, doorEdgeMaterial);
            else addOpenDoorIndicator(state, gap, a, b, ceilingProfile);
            cursor = Math.max(cursor, gap.end);
        }
        if (cursor < 1) createProfiledWallSegment(state,
            { x: a.x + (b.x - a.x) * cursor, y: a.y + (b.y - a.y) * cursor }, b, ceilingProfile, wallMaterial, wallEdgeMaterial);
    }

    for (const obstacle of data.obstacles || []) {
        const top = obstacle.verticalHeight > 0 ? obstacle.verticalHeight : wallHeight;
        const base = Math.max(0, Math.min(obstacle.baseHeight || 0, top - 0.05));
        const height = top - base;
        const sloped = obstacle.slope && obstacle.verticalHeight > 0 ? slopedObstacleGeometry(obstacle, base, top) : null;
        let geometry;
        let x = obstacle.x;
        let z = obstacle.y;
        let labelX;
        let labelZ;
        if (sloped) {
            geometry = sloped.geometry;
            labelX = sloped.centerX;
            labelZ = sloped.centerZ;
            x = 0;
            z = 0;
        } else if (obstacle.shape === 'circle') {
            geometry = new THREE.CylinderGeometry(Math.max(0.05, obstacle.radius), Math.max(0.05, obstacle.radius), height, 32);
            x += obstacle.radius;
            z += obstacle.radius;
        } else if (obstacle.shape === 'polygon' && obstacle.points?.length >= 3) {
            const shape = new THREE.Shape();
            shape.moveTo(obstacle.points[0].x, obstacle.points[0].y);
            obstacle.points.slice(1).forEach(point => shape.lineTo(point.x, point.y));
            shape.closePath();
            geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
            geometry.rotateX(Math.PI / 2);
            labelX = obstacle.points.reduce((sum, point) => sum + point.x, 0) / obstacle.points.length;
            labelZ = obstacle.points.reduce((sum, point) => sum + point.y, 0) / obstacle.points.length;
            x = 0;
            z = 0;
        } else {
            geometry = new THREE.BoxGeometry(Math.max(0.05, obstacle.width), height, Math.max(0.05, obstacle.height));
            x += obstacle.width / 2;
            z += obstacle.height / 2;
        }
        const mesh = new THREE.Mesh(geometry, sloped ? slopedMaterial : obstacleMaterial);
        mesh.position.set(x - data.originX, sloped ? 0 : base + (obstacle.shape === 'polygon' ? height : height / 2), z - data.originY);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        state.staticGroup.add(mesh);
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), obstacleEdgeMaterial);
        outline.position.copy(mesh.position);
        state.staticGroup.add(outline);
        if (obstacle.name) {
            const label = createLabel(obstacle.name, { color: palette.obstacle.label, height: 0.75 });
            label.position.set((labelX ?? x) - data.originX, (sloped ? sloped.maxTop : top) + 0.25, (labelZ ?? z) - data.originY);
            state.staticGroup.add(label);
        }
    }

    const floorWidth = Math.max(1, data.width || 1);
    const floorDepth = Math.max(1, data.depth || 1);
    const floorCenterX = (data.floorMinX ?? 0) + floorWidth / 2 - data.originX;
    const floorCenterY = (data.floorMinY ?? 0) + floorDepth / 2 - data.originY;
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(floorWidth, floorDepth),
        new THREE.MeshStandardMaterial({ color: palette.toHex(palette.scene3d.floor), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(floorCenterX, -0.01, floorCenterY);
    floor.receiveShadow = true;
    state.staticGroup.add(floor);

    const gridSize = Math.max(floorWidth, floorDepth);
    const grid = new THREE.GridHelper(gridSize, Math.max(1, Math.round(gridSize)), 0x6b7280, 0x3f4652);
    grid.position.set(floorCenterX, 0, floorCenterY);
    state.staticGroup.add(grid);
    // The origin marker and axes are a setup aid; a presentation view turns them off with showOrigin: false.
    if (data.showOrigin === false) return;
    const originMarker = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide }));
    originMarker.rotation.x = -Math.PI / 2;
    originMarker.position.y = 0.025;
    state.staticGroup.add(originMarker);
    const arrowLength = Math.min(3, Math.max(1, gridSize / 5));
    const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.035, 0), arrowLength, 0xef4444, 0.28, 0.16);
    const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.035, 0), arrowLength, 0x38bdf8, 0.28, 0.16);
    state.staticGroup.add(xArrow, yArrow);
    const originLabel = createLabel(`(0,0) ${data.unitLabel ?? 'm'}`, { height: 1.0 });
    originLabel.position.set(0, 0.7, 0);
    const xLabel = createLabel('+X', { color: '#fecaca', height: 0.75 });
    xLabel.position.set(arrowLength + 0.25, 0.45, 0);
    const yLabel = createLabel('+Y', { color: '#bae6fd', height: 0.75 });
    yLabel.position.set(0, 0.45, arrowLength + 0.25);
    state.staticGroup.add(originLabel, xLabel, yLabel);

}

function playbackPathKey(data) {
    const playback = data.playback;
    return playback ? `${playback.pathKey ?? ''}:${data.originX}:${data.originY}` : '';
}

function rebuildPlaybackPath(state, data) {
    state.playbackAnimation = null;
    disposeChildren(state.playbackGroup);
    state.playbackRoute = null;
    state.playbackProgress = null;
    state.playbackMarker = null;
    state.tugRoot = null;
    state.tugProfileKey = '';
    const playback = data.playback;
    if (!playback) return;
    const points = (playback.centerPath || []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length > 0) {
        const positions = new Float32Array(points.length * 3);
        for (let index = 0; index < points.length; index++) {
            positions[index * 3] = points[index].x - data.originX;
            positions[(index * 3) + 1] = 0.075;
            positions[(index * 3) + 2] = points[index].y - data.originY;
        }
        const routeGeometry = new THREE.BufferGeometry();
        routeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const route = new THREE.Line(routeGeometry, new THREE.LineBasicMaterial({ color: 0xD98B1D, transparent: true, opacity: 0.85 }));
        const progress = new THREE.Line(routeGeometry.clone(), new THREE.LineBasicMaterial({ color: 0x627CF5 }));
        state.playbackGroup.add(route, progress);
        state.playbackRoute = route;
        state.playbackProgress = progress;
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
        state.playbackGroup.add(marker);
        state.playbackMarker = marker;
    }
}

function rebuildTug(state, profile) {
    if (state.tugRoot) {
        state.playbackGroup.remove(state.tugRoot);
        disposeObject(state.tugRoot, true);
        state.tugRoot = null;
    }
    if (profile && [profile.length, profile.width, profile.height, profile.fixedAxleToRearBody].every(Number.isFinite)) {
        const length = Math.max(0.1, profile.length);
        const width = Math.max(0.1, profile.width);
        const height = Math.max(0.1, profile.height);
        const root = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, length),
            new THREE.MeshStandardMaterial({ color: window.HangarPalette.toHex(window.HangarPalette.tug.stroke), roughness: 0.68 }));
        body.position.set(0, height / 2, (length / 2) - profile.fixedAxleToRearBody);
        body.castShadow = true;
        root.add(body);
        state.playbackGroup.add(root);
        state.tugRoot = root;
    }
}

function setAircraftHighlight(state, activeTail) {
    for (const [tail, entry] of state.aircraft) {
        const active = activeTail != null && tail === activeTail;
        // The site world tints aircraft that have no room red (state.tints: tail number -> { color, emissive }).
        const tint = active ? null : state.tints?.get(tail) ?? null;
        const nextColor = active ? 0x22d3ee : tint ? tint.color : (entry.placeholder ? 0x9ca3af : 0xb8bec8);
        if (entry.material.color?.getHex() !== nextColor) entry.material.color?.setHex(nextColor);
        if (entry.material.emissive) {
            entry.material.emissive.setHex(active ? 0x0e7490 : tint ? tint.emissive : 0x000000);
            entry.material.emissiveIntensity = active || tint ? 0.35 : 0;
        }
        const labelColor = active ? 0x22d3ee : 0xffffff;
        // Keep the pill untinted so its collision status dot keeps its color; the leader line shows the highlight.
        entry.label.sprite.material.color.setHex(0xffffff);
        entry.label.leader.material.color.setHex(labelColor);
        applyLabelOrder(state, tail, entry, active);
        if (state.hoverTail != null && state.hoverTail === tail) entry.label.leader.material.color.setHex(0xfacc15);
    }
}

function updatePlayback(state, data) {
    const key = playbackPathKey(data);
    if (key !== state.playbackKey) {
        state.playbackKey = key;
        rebuildPlaybackPath(state, data);
    }
    const playback = data.playback;
    if (!playback) {
        state.playbackAnimation = null;
        state.tugProfileKey = '';
        setAircraftHighlight(state, null);
        return;
    }
    const tugProfileKey = JSON.stringify(playback.tugProfile ?? null);
    if (tugProfileKey !== state.tugProfileKey) {
        state.tugProfileKey = tugProfileKey;
        rebuildTug(state, playback.tugProfile);
    }
    const centerPath = playback.centerPath || [];
    const sampleIndex = Number.isInteger(playback.sampleIndex) ? playback.sampleIndex : -1;
    const validCenterSample = sampleIndex >= 0 && sampleIndex < centerPath.length;
    const progressCount = playback.isComplete === true
        ? centerPath.length
        : (validCenterSample ? sampleIndex + 1 : 0);
    state.playbackProgress?.geometry.setDrawRange(0, progressCount);
    if (state.playbackMarker) {
        state.playbackMarker.visible = validCenterSample && playback.isComplete !== true;
        if (state.playbackMarker.visible) {
            const point = centerPath[sampleIndex];
            state.playbackMarker.position.set(point.x - data.originX, 0.12, point.y - data.originY);
        }
    }
    const tugPath = playback.tugPath || [];
    const tugSample = sampleIndex >= 0 && sampleIndex < tugPath.length ? tugPath[sampleIndex] : null;
    if (state.tugRoot) {
        state.tugRoot.visible = playback.isComplete !== true && tugSample != null &&
            Number.isFinite(tugSample.x) && Number.isFinite(tugSample.y) && Number.isFinite(tugSample.theta);
        if (state.tugRoot.visible) {
            state.tugRoot.position.set(tugSample.x - data.originX, 0, tugSample.y - data.originY);
            state.tugRoot.rotation.set(0, Math.PI + tugSample.theta, 0);
        }
    }
    const animationTimes = playback.sampleTimesSeconds;
    const animationCount = Math.min(centerPath.length, Array.isArray(animationTimes) ? animationTimes.length : 0);
    const animationCanRun = playback.isPlaying === true && playback.isComplete !== true &&
        Number.isFinite(playback.timeSeconds) && animationCount > 0;
    if (!animationCanRun) {
        state.playbackAnimation = null;
    } else {
        let animation = state.playbackAnimation;
        const revision = Number.isFinite(playback.clockRevision) ? playback.clockRevision : 0;
        if (!animation || animation.pathKey !== key || animation.clockRevision !== revision) {
            const times = new Array(animationCount);
            let valid = true;
            let previous = -Infinity;
            for (let index = 0; index < animationCount; index++) {
                const time = Number(animationTimes[index]);
                const point = centerPath[index];
                if (!Number.isFinite(time) || time < previous ||
                    !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(point?.theta)) {
                    valid = false;
                    break;
                }
                times[index] = time;
                previous = time;
            }
            if (!valid) {
                state.playbackAnimation = null;
            } else {
                const firstTime = times[0];
                for (let index = 0; index < animationCount; index++) times[index] -= firstTime;
                animation = {
                    pathKey: key, clockRevision: revision, anchorNow: performance.now(),
                    startSeconds: Number(playback.timeSeconds), times, sampleCount: animationCount,
                    centerPath, tugPath, entry: null,
                    pose: { x: 0, y: 0, theta: 0, visible: true },
                    tugPose: { x: 0, y: 0, theta: 0 },
                    duration: times[animationCount - 1]
                };
                state.playbackAnimation = animation;
            }
        }
        animation = state.playbackAnimation;
        if (animation) {
            animation.centerPath = centerPath;
            animation.tugPath = tugPath;
            animation.entry = state.aircraft.get(playback.activeTail) ?? null;
            const aircraft = (data.aircraft || []).find(item => item.tail === playback.activeTail);
            animation.pose.visible = aircraft?.visible !== false;
        }
    }
    setAircraftHighlight(state, playback.activeTail ?? null);
}

function upperBound(values, count, target) {
    let low = 0;
    let high = count;
    while (low < high) {
        const middle = low + ((high - low) >> 1);
        if (values[middle] <= target) low = middle + 1;
        else high = middle;
    }
    return low;
}

function interpolatePose(path, low, high, amount, target) {
    const first = path[low];
    const second = path[high];
    target.x = first.x + (second.x - first.x) * amount;
    target.y = first.y + (second.y - first.y) * amount;
    const delta = Math.atan2(Math.sin(second.theta - first.theta), Math.cos(second.theta - first.theta));
    target.theta = first.theta + delta * amount;
    return target;
}

function animatePlaybackFrame(state) {
    const animation = state.playbackAnimation;
    if (!animation) return;
    const elapsed = animation.startSeconds + (performance.now() - animation.anchorNow) / 1000;
    const time = Math.max(0, Math.min(animation.duration, elapsed));
    const upper = upperBound(animation.times, animation.sampleCount, time);
    const low = Math.max(0, Math.min(animation.sampleCount - 1, upper - 1));
    const high = Math.max(0, Math.min(animation.sampleCount - 1, upper));
    const firstTime = animation.times[low];
    const secondTime = animation.times[high];
    const amount = high === low || secondTime <= firstTime ? 0 : Math.max(0, Math.min(1, (time - firstTime) / (secondTime - firstTime)));
    const pose = interpolatePose(animation.centerPath, low, high, amount, animation.pose);
    if (state.playbackCollisionFrames && low !== animation.collisionIndex) {
        animation.collisionIndex = low;
        setCollisionAreas(state, playbackCollisionAreas(state, low));
        updateRegions(state, state.data, low);
        setPlaybackDots(state, low);
    }
    const entry = animation.entry;
    if (entry) {
        applyPose(entry.root, pose, state.data);
        applyLabelPose(entry, pose, state.data);
    }
    if (state.playbackProgress) state.playbackProgress.geometry.setDrawRange(0, Math.min(animation.sampleCount, low + 1));
    if (state.playbackMarker) {
        state.playbackMarker.visible = true;
        state.playbackMarker.position.set(pose.x - state.data.originX, 0.12, pose.y - state.data.originY);
    }
    const tugPath = animation.tugPath;
    const tugLow = low < tugPath.length ? low : -1;
    const tugHigh = high < tugPath.length ? high : -1;
    const tugA = tugLow >= 0 ? tugPath[tugLow] : null;
    const tugB = tugHigh >= 0 ? tugPath[tugHigh] : null;
    const tugValid = tugA && tugB && Number.isFinite(tugA.x) && Number.isFinite(tugA.y) && Number.isFinite(tugA.theta) &&
        Number.isFinite(tugB.x) && Number.isFinite(tugB.y) && Number.isFinite(tugB.theta);
    if (state.tugRoot) {
        state.tugRoot.visible = Boolean(tugValid);
        if (tugValid) {
            const tug = interpolatePose(tugPath, tugLow, tugHigh, amount, animation.tugPose);
            state.tugRoot.position.set(tug.x - state.data.originX, 0, tug.y - state.data.originY);
            state.tugRoot.rotation.set(0, Math.PI + tug.theta, 0);
        }
    }
}

function applyPose(root, aircraft, data) {
    applyAircraftPose(root, aircraft, data.originX, data.originY);
    root.visible = aircraft.visible !== false;
}

function tagAircraft(root, tail) {
    root.traverse(node => { node.userData.sceneAircraftTail = tail; });
}

function applyLabelPose(entry, aircraft, data) {
    entry.label.group.position.set(aircraft.x - data.originX, 0, aircraft.y - data.originY);
    entry.label.group.visible = aircraft.visible !== false && data.showTailNumbers !== false;
}

function applyOpacity(entry, aircraft) {
    const opacity = Math.max(0, Math.min(1, aircraft.opacity ?? 1));
    entry.label.sprite.material.opacity = opacity;
    entry.label.leader.material.opacity = opacity;
    const transparent = opacity < 0.999;
    if (entry.material.opacity === opacity && entry.material.transparent === transparent) return;
    entry.material.opacity = opacity;
    entry.material.transparent = transparent;
    entry.material.depthWrite = !transparent;
    entry.material.needsUpdate = true;
}

function updateAircraftLabelText(state, entry, aircraft) {
    const text = aircraft.tail;
    const dotColor = aircraft.statusDotColor || null;
    if (entry.labelText === text && (entry.labelDotColor ?? null) === dotColor) return;
    // Each text + color is drawn once and kept: a playback recolors the status dots every sample, and repainting
    // a label canvas each time stalls scrubbing.
    entry.labels ??= new Map([[`${entry.labelDotColor ?? ''}|${entry.labelText}`, entry.label]]);
    const key = `${dotColor ?? ''}|${text}`;
    let label = entry.labels.get(key);
    if (!label) entry.labels.set(key, label = createAircraftLabel(text, dotColor));
    const previous = entry.label;
    const parent = previous.group.parent;
    parent?.remove(previous.group);
    label.group.position.copy(previous.group.position);
    label.group.visible = previous.group.visible;
    label.sprite.material.opacity = previous.sprite.material.opacity;
    label.leader.material.opacity = previous.leader.material.opacity;
    label.leader.material.color.copy(previous.leader.material.color);
    entry.label = label;
    entry.labelText = text;
    entry.labelDotColor = dotColor;
    parent?.add(entry.label.group);
    applyLabelOrder(state, aircraft.tail, entry, false);
    updateAircraftLabelHeight(entry);
    updateAircraftLabelScale(state, entry);
}

function reportAircraftStatus(state) {
    let missing = 0;
    for (const entry of state.aircraft.values()) {
        if (entry.loadFailed) missing++;
    }
    const parts = [];
    if (missing > 0) parts.push(`${missing} aircraft ${missing === 1 ? 'model is' : 'models are'} unavailable; showing neutral placeholders.`);
    const status = parts.join(' ');
    if (status === state.lastStatus) return;
    state.lastStatus = status;
    state.dotNet?.invokeMethodAsync('SetRendererStatus', status, false).catch(() => {});
}

// A model that failed to load is tried again a few times: the API may not have had it yet (start-up, a model import).
const MODEL_RETRY_DELAY_MS = 15000;
const MODEL_MAX_ATTEMPTS = 4;

// One retry per model file, however many aircraft share it, so a fleet of one model doesn't use up the attempts at once.
function scheduleModelRetry(state, url) {
    const retry = state.modelAttempts.get(url) ?? { count: 0, timer: 0 };
    state.modelAttempts.set(url, retry);
    if (retry.timer || ++retry.count >= MODEL_MAX_ATTEMPTS) return;
    retry.timer = setTimeout(() => {
        retry.timer = 0;
        if (state.disposed || !state.renderer) return;
        // Forgetting the model name rebuilds the entry, which loads it again; an idle view gets no other update to do it.
        for (const entry of state.aircraft.values()) {
            if (entry.loadFailed && entry.modelUrl === url) entry.modelName = null;
        }
        updateAircraft(state, state.data);
        requestRender(state);
    }, MODEL_RETRY_DELAY_MS);
}

function updateAircraft(state, data) {
    const desired = new Set();
    for (const aircraft of data.aircraft || []) {
        desired.add(aircraft.tail);
        let entry = state.aircraft.get(aircraft.tail);
        if (entry && entry.modelName !== aircraft.modelName) {
            disposeAircraftEntry(state, entry);
            state.aircraft.delete(aircraft.tail);
            entry = null;
        }
        if (!entry) {
            const material = state.placeholderMaterial.clone();
            installHatch(material);
            const placeholder = createAircraftPlaceholder(aircraft, material);
            tagAircraft(placeholder, aircraft.tail);
            const labelText = aircraft.tail;
            const label = createAircraftLabel(labelText, aircraft.statusDotColor || null);
            entry = { root: placeholder, material, label, labelText, labelDotColor: aircraft.statusDotColor || null, modelName: aircraft.modelName, modelUrl: aircraft.modelUrl, placeholder: true };
            state.aircraft.set(aircraft.tail, entry);
            state.aircraftGroup.add(placeholder, label.group);
            updateAircraftLabelHeight(entry);
            updateAircraftLabelScale(state, entry);
            applyPose(placeholder, aircraft, data);
            applyLabelPose(entry, aircraft, data);
            loadModel(state, aircraft.modelUrl).then(template => {
                if (state.disposed || state.aircraft.get(aircraft.tail) !== entry) return;
                state.modelAttempts.delete(aircraft.modelUrl);
                const model = template.root.clone(true);
                const modelMaterial = state.aircraftMaterial.clone();
                installHatch(modelMaterial);
                neutralize(model, modelMaterial);
                state.aircraftGroup.remove(entry.root);
                disposePlaceholder(entry.root);
                entry.material.dispose();
                entry.root = model;
                tagAircraft(model, aircraft.tail);
                entry.material = modelMaterial;
                entry.placeholder = false;
                applyFixedHatch(entry);
                state.aircraftGroup.add(model);
                updateAircraftLabelHeight(entry);
                const latest = state.data.aircraft?.find(value => value.tail === aircraft.tail);
                if (latest) {
                    applyPose(model, latest, state.data);
                    applyLabelPose(entry, latest, state.data);
                    applyOpacity(entry, latest);
                }
                setAircraftHighlight(state, state.data.playback?.activeTail ?? null);
                reportAircraftStatus(state);
                requestRender(state);
            }).catch(() => {
                entry.placeholder = true;
                entry.loadFailed = true;
                reportAircraftStatus(state);
                scheduleModelRetry(state, aircraft.modelUrl);
            });
        }
        entry.fixed = aircraft.fixed === true;
        applyFixedHatch(entry);
        updateAircraftLabelText(state, entry, aircraft);
        applyPose(entry.root, aircraft, data);
        applyLabelPose(entry, aircraft, data);
        applyOpacity(entry, aircraft);
    }
    for (const [tail, entry] of state.aircraft) {
        if (desired.has(tail)) continue;
        // A playback only hides an aircraft its step towed out, so scrubbing back over the step does not rebuild it.
        if (data.playback) {
            entry.root.visible = false;
            entry.label.group.visible = false;
            continue;
        }
        disposeAircraftEntry(state, entry);
        state.aircraft.delete(tail);
    }
    reportAircraftStatus(state);
}

function actionPayload(action, tail, point, useNoseAnchor, isFinal, operationId) {
    return { action, tail, x: point?.x ?? 0, y: point?.y ?? 0, useNoseAnchor, isFinal, operationId };
}

function nativePose(aircraft) {
    return { x: aircraft.x, y: aircraft.y, theta: aircraft.theta };
}

function nosePoint(aircraft) {
    const distance = aircraft.noseAnchorDistance;
    if (!Number.isFinite(distance) || !Number.isFinite(aircraft.theta)) return null;
    return { x: aircraft.x - Math.sin(aircraft.theta) * distance, y: aircraft.y - Math.cos(aircraft.theta) * distance };
}

function tugHandlePoint(tug) {
    if (!Number.isFinite(tug?.wheelbase) || !Number.isFinite(tug.theta)) return null;
    return { x: tug.x - Math.sin(tug.theta) * tug.wheelbase, y: tug.y - Math.cos(tug.theta) * tug.wheelbase };
}

function updateHandles(state) {
    if (!state.handleGroup) return;
    state.handleTargets = state.selectedTugGrabBall ? [state.selectedTugGrabBall] : [];
    disposeChildren(state.handleGroup);
}

// During a playback the regions are the shown sample's overlaps, when the server checked them.
function updateRegions(state, data, sampleIndex = data.playback?.sampleIndex) {
    const regions = playbackCollisionFrame(state, sampleIndex)?.regions ?? data.regions ?? [];
    const key = JSON.stringify([regions, data.originX, data.originY, data.width, data.depth]);
    if (key === state.regionKey) return;
    state.regionKey = key;
    if (!regions.length) {
        disposeChildren(state.regionGroup);
        state.regionCanvas = null;
        state.regionContext = null;
        state.regionTexture = null;
        state.regionSizeKey = null;
        return;
    }
    const width = Math.max(1, Number(data.width) || 1);
    const depth = Math.max(1, Number(data.depth) || 1);
    const scale = Math.min(48, 2048 / Math.max(width, depth));
    const sizeKey = JSON.stringify([width, depth]);
    if (state.regionSizeKey !== sizeKey) {
        disposeChildren(state.regionGroup);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(width * scale));
        canvas.height = Math.max(1, Math.ceil(depth * scale));
        const texture = new THREE.CanvasTexture(canvas);
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 36;
        state.regionGroup.add(mesh);
        state.regionCanvas = canvas;
        state.regionContext = canvas.getContext('2d');
        state.regionTexture = texture;
        state.regionSizeKey = sizeKey;
    }
    const context = state.regionContext;
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, state.regionCanvas.width, state.regionCanvas.height);
    context.setTransform(scale, 0, 0, -scale, 0, state.regionCanvas.height);
    for (const region of regions) {
        if (typeof region.path !== 'string' || !region.path.trim()) continue;
        try {
            const path = new Path2D(region.path);
            const color = region.color || '#ff2028';
            context.globalAlpha = 0.5;
            context.fillStyle = color;
            context.fill(path, 'evenodd');
            context.globalAlpha = 0.90;
            context.lineWidth = 0.05;
            context.strokeStyle = color;
            context.stroke(path);
        } catch { }
    }
    context.globalAlpha = 1;
    state.regionTexture.needsUpdate = true;
    const mesh = state.regionGroup.children[0];
    mesh.position.set(width / 2 - data.originX, 0.06, depth / 2 - data.originY);
}

function createCollisionZoneMesh() {
    const geometry = new THREE.BufferGeometry();
    geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            zoneRadius: { value: COLLISION_ROUNDING_METERS },
            highColor: { value: HIGH_COLLISION_AREA_COLOR },
            mediumColor: { value: MEDIUM_COLLISION_AREA_COLOR }
        },
        vertexShader: `
            attribute vec3 roundOffset;
            attribute float zonePriority;
            uniform float zoneRadius;
            varying float vPriority;
            void main() {
                vec3 roundedPosition = position + roundOffset * zoneRadius;
                vPriority = zonePriority;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(roundedPosition, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 highColor;
            uniform vec3 mediumColor;
            varying float vPriority;
            void main() {
                gl_FragColor = vec4(vPriority > 0.5 ? highColor : mediumColor, 1.0);
                #include <colorspace_fragment>
            }`,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    // The batched collision surface has changing world-space bounds.
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
}

function updateCollisionAreas(state, data) {
    setCollisionAreas(state, playbackCollisionAreas(state, data.playback?.sampleIndex) ??
        (Array.isArray(data.collisionAreas) ? data.collisionAreas : []));
}

// A negative sample is the end of the tow.
function playbackCollisionFrame(state, sampleIndex) {
    const frames = state.playbackCollisionFrames;
    if (!state.data?.playback || !frames?.length) return null;
    return frames[Number.isInteger(sampleIndex) && sampleIndex >= 0 && sampleIndex < frames.length ? sampleIndex : frames.length - 1];
}

function playbackCollisionAreas(state, sampleIndex) {
    const frame = playbackCollisionFrame(state, sampleIndex);
    return frame ? frame.areas || [] : null;
}

// Recolors the labels that have a status dot to match the shown sample.
function setPlaybackDots(state, sampleIndex) {
    const colors = state.playbackDotColors;
    const frame = playbackCollisionFrame(state, sampleIndex);
    if (!colors || !frame) return;
    for (const [tail, entry] of state.aircraft) {
        if (entry.labelDotColor) updateAircraftLabelText(state, entry, { tail, statusDotColor: colors[frame.tails?.[tail] ?? 'None'] });
    }
}

function setCollisionAreas(state, areas) {
    const data = state.data;
    const key = JSON.stringify([areas, data.originX, data.originY]);
    if (key === state.collisionAreaKey) return;
    state.collisionAreaKey = key;
    const rounded = prepareRoundedCollisionZones(areas, data.originX, data.originY);
    const surface = buildRoundedCollisionGeometry(rounded.boxes, rounded.radius);
    const mesh = state.collisionAreaMesh;
    let geometry = mesh.geometry;
    const vertices = surface.priorities.length;
    const existingCapacity = geometry.getAttribute('position')?.count || 0;
    if (vertices > existingCapacity) {
        let capacity = Math.max(4096, existingCapacity);
        while (capacity < vertices) capacity *= 2;
        // Replacing the whole geometry releases the old GPU buffers on growth.
        geometry.dispose();
        geometry = mesh.geometry = new THREE.BufferGeometry();
        for (const name of ['position', 'roundOffset']) {
            geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
        }
        geometry.setAttribute('zonePriority', new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
    }
    for (const [name, values] of [['position', surface.positions], ['roundOffset', surface.offsets], ['zonePriority', surface.priorities]]) {
        const attribute = geometry.getAttribute(name);
        if (!attribute) continue;
        attribute.array.set(values);
        attribute.clearUpdateRanges();
        if (values.length) attribute.addUpdateRange(0, values.length);
        attribute.needsUpdate = true;
    }
    state.collisionBoxes = rounded.boxes;
    mesh.material.uniforms.zoneRadius.value = rounded.radius;
    geometry.setDrawRange(0, vertices);
    mesh.visible = vertices > 0;
}

function collisionScreenBounds(state, size) {
    const matrix = state.collisionViewProjection.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    const point = state.collisionProjectionPoint;
    const radius = state.collisionAreaMesh.material.uniforms.zoneRadius.value;
    let minX = 1, minY = 1, maxX = -1, maxY = -1;
    for (const box of state.collisionBoxes) {
        for (let corner = 0; corner < 8; corner++) {
            point.set(
                corner & 1 ? box.max[0] + radius : box.min[0] - radius,
                corner & 2 ? box.max[1] + radius : box.min[1] - radius,
                corner & 4 ? box.max[2] + radius : box.min[2] - radius, 1).applyMatrix4(matrix);
            // A box crossing the camera plane can project across the whole view.
            if (point.w <= 0) return { x: 0, y: 0, width: size.x, height: size.y };
            const x = point.x / point.w, y = point.y / point.w;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
    }
    if (minX >= 1 || maxX <= -1 || minY >= 1 || maxY <= -1) return null;
    const x = Math.max(0, Math.floor((minX + 1) * size.x / 2) - 2);
    const y = Math.max(0, Math.floor((1 - maxY) * size.y / 2) - 2);
    const right = Math.min(size.x, Math.ceil((maxX + 1) * size.x / 2) + 2);
    const bottom = Math.min(size.y, Math.ceil((1 - minY) * size.y / 2) + 2);
    // Pixel density is unchanged. Quantization avoids reallocating the target
    // for subpixel tow updates; extra pixels are clipped by the main viewport.
    return { x, y, width: Math.ceil((right - x) / 32) * 32, height: Math.ceil((bottom - y) / 32) * 32 };
}

// Paint the opaque union in ascending priority order, independent of depth:
// higher priorities show through lower ones from every camera angle. Apply
// transparency once so overlapping rounded surfaces cannot stack alpha.
function renderScene(state) {
    const renderer = state.renderer;
    renderer.render(state.scene, state.camera);
    if (!state.collisionAreaMesh.visible) return;
    const size = renderer.getDrawingBufferSize(state.collisionTargetSize);
    const bounds = collisionScreenBounds(state, size);
    if (!bounds) return;
    const target = state.collisionAreaTarget;
    if (target.width !== bounds.width || target.height !== bounds.height) target.setSize(bounds.width, bounds.height);
    if (!state.collisionAreaCamera || state.collisionAreaCamera.type !== state.camera.type) {
        state.collisionAreaCamera = state.camera.clone();
    } else state.collisionAreaCamera.copy(state.camera);
    state.collisionAreaCamera.setViewOffset(size.x, size.y, bounds.x, bounds.y, bounds.width, bounds.height);
    state.collisionAreaCamera.updateMatrixWorld();
    state.collisionCompositeMesh.material.uniforms.viewRect.value.set(
        bounds.x / size.x, 1 - (bounds.y + bounds.height) / size.y, bounds.width / size.x, bounds.height / size.y);
    const outlinePixels = 2 * renderer.getPixelRatio();
    state.collisionCompositeMesh.material.uniforms.outlineStep.value.set(outlinePixels / target.width, outlinePixels / target.height);
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(state.collisionClearColor);
    try {
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = false;
        renderer.clear();
        renderer.render(state.collisionAreaScene, state.collisionAreaCamera);
        renderer.setRenderTarget(previousTarget);
        renderer.render(state.collisionCompositeScene, state.collisionCompositeCamera);
    } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(state.collisionClearColor, previousAlpha);
        renderer.autoClear = previousAutoClear;
    }
}

function updatePlannedDestination(state, destination, data) {
    const key = JSON.stringify(destination || null);
    if (key === state.destinationKey) return;
    state.destinationKey = key;
    disposeChildren(state.destinationGroup);
    if (!destination || ![destination.x, destination.y, destination.theta, destination.width, destination.length].every(Number.isFinite)) return;
    const outline = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.1, destination.width), 0.035, Math.max(0.1, destination.length)),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.95, depthTest: false }));
    outline.position.set(destination.x - data.originX, 0.12, destination.y - data.originY);
    outline.rotation.set(0, Math.PI + destination.theta, 0);
    outline.renderOrder = 22;
    state.destinationGroup.add(outline);
    const label = createLabel(destination.label || `Planned tow destination · ${destination.tail || ''}`, { color: '#a5f3fc', height: 0.8 });
    label.position.set(destination.x - data.originX, 0.55, destination.y - data.originY);
    label.renderOrder = 23;
    state.destinationGroup.add(label);
}

/**
 * A spot's footprint outline in the page's colors, drawn by the 2D canvas code onto a square texture in the floor's own
 * axes (canvas x is floor x, canvas y floor y), so it lies flat without turning: the heading is drawn into the texture.
 */
function spotOutline(spot, asset, data) {
    const diagonal = Math.hypot(spot.width, spot.length);
    const ppm = Math.min(48, 1024 / diagonal);
    const size = Math.ceil(diagonal * ppm) + 8;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    window.drawLoadedAircraftBatch(canvas.getContext('2d'), [{
        asset, xPx: size / 2, yPx: size / 2, headingRadians: spot.theta, widthPx: spot.width * ppm, heightPx: spot.length * ppm,
        fillColor: spot.fillColor, fillOpacity: spot.fillOpacity, borderColor: spot.borderColor, borderThicknessPx: 3, borderDashPx: [10, 6]
    }], 1, false);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const meters = size / ppm;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(meters, meters),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: spot.opacity, depthTest: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(spot.x - data.originX, 0.1, spot.y - data.originY);
    plane.renderOrder = 21;
    return plane;
}

async function updateTemplateSpots(state, data) {
    const spots = data.templateSpots || [];
    const key = JSON.stringify(spots);
    if (key === state.spotKey) return;
    state.spotKey = key;
    const valid = spots.filter(spot => [spot.x, spot.y, spot.theta, spot.width, spot.length].every(Number.isFinite));
    const loaded = await (window.loadAircraftAssetBatch?.(valid) ?? Promise.resolve([]));
    if (key !== state.spotKey) return;
    disposeChildren(state.spotGroup);
    for (const spot of loaded) {
        if (!spot?.asset) continue;
        state.spotGroup.add(spotOutline(spot, spot.asset, data));
        const label = createLabel(String(spot.index + 1), { color: spot.fits ? '#a5f3fc' : '#e2e8f0', height: 0.7 });
        label.position.set(spot.x - data.originX, 0.5, spot.y - data.originY);
        label.renderOrder = 22;
        state.spotGroup.add(label);
    }
    // The outlines arrive after the frame that asked for them.
    requestRender(state);
}

function applyLocalPose(state) {
    const local = state.localPose;
    if (!local) return;
    const entry = state.aircraft.get(local.tail);
    if (!entry) return;
    const aircraft = state.data?.aircraft?.find(value => value.tail === local.tail);
    if (aircraft && Math.hypot(aircraft.x - local.x, aircraft.y - local.y) < 0.004 &&
        Math.abs(THREE.MathUtils.euclideanModulo(aircraft.theta - local.theta + Math.PI, Math.PI * 2) - Math.PI) < 0.004) {
        state.localPose = null;
        return;
    }
    entry.root.position.set(local.x - state.data.originX, 0, local.y - state.data.originY);
    entry.root.rotation.set(0, Math.PI + local.theta, 0);
    applyLabelPose(entry, { ...aircraft, x: local.x, y: local.y, theta: local.theta }, state.data);
    requestRender(state);
}

function groundPoint(state, event) {
    if (!setRaycasterFromEvent(state, event)) return null;
    const intersection = state.raycaster.ray.intersectPlane(state.groundPlane, state.groundHit);
    if (!intersection || !Number.isFinite(intersection.x) || !Number.isFinite(intersection.z)) return null;
    return { x: intersection.x + state.data.originX, y: intersection.z + state.data.originY };
}

function hitTarget(state, event) {
    if (!setRaycasterFromEvent(state, event)) return null;
    if (state.selectedTugRoot?.visible) {
        const grabTarget = state.raycaster.intersectObjects(state.handleTargets, false)[0]?.object;
        if (grabTarget) return { kind: 'tug' };
    }
    const aircraftIntersections = state.raycaster.intersectObjects(state.aircraftGroup.children, true);
    for (const hit of aircraftIntersections) {
        let node = hit.object;
        while (node && node !== state.aircraftGroup && !node.userData?.sceneTug && !node.userData?.sceneAircraftTail) node = node.parent;
        if (node?.userData?.sceneTug) return { kind: 'tug' };
        const tail = tailOfObject(hit.object);
        if (tail) {
            const aircraft = state.data?.aircraft?.find(value => value.tail === tail);
            const nose = aircraft ? nosePoint(aircraft) : null;
            const hitX = hit.point.x + state.data.originX;
            const hitY = hit.point.z + state.data.originY;
            const noseHitRadius = Math.max(0.75, Math.min(1.5, (aircraft?.width || 1) * 0.45));
            return {
                kind: 'aircraft',
                tail,
                useNoseAnchor: nose !== null && Math.hypot(hitX - nose.x, hitY - nose.y) <= noseHitRadius
            };
        }
    }
    return null;
}

function makeOperationId() {
    return `scene3d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function dispatch(state, action, tail, point, useNoseAnchor = false, isFinal = false, operationId = null) {
    if (state.disposed || (!state.interactive && action !== 6)) return { accepted: false };
    try {
        return await state.dotNet.invokeMethodAsync('DispatchInteraction', actionPayload(action, tail, point, useNoseAnchor, isFinal, operationId));
    } catch (error) {
        state.dotNet?.invokeMethodAsync('SetRendererStatus', `3D interaction failed: ${error.message || error}`, true).catch(() => {});
        return { accepted: false };
    }
}

function updateLocalFromAnchor(state, gesture, point) {
    if (gesture.route !== 'aircraft' || gesture.useNoseAnchor) return;
    const aircraft = state.data.aircraft?.find(value => value.tail === gesture.tail);
    if (!aircraft) return;
    state.localPose = { tail: gesture.tail, x: point.x, y: point.y, theta: aircraft.theta };
    applyLocalPose(state);
}

function requestRender(state) {
    if (state.disposed || !state.renderer || state.animationFrame !== null) return;
    state.animationFrame = requestAnimationFrame(() => {
        state.animationFrame = null;
        if (state.disposed || !state.renderer) return;
        animatePlaybackFrame(state);
        syncTugVisibility(state);
        const controlsMoving = state.cameraTransitionFrame === null && state.controls?.update() === true;
        renderScene(state);
        if (controlsMoving || state.playbackAnimation) requestRender(state);
    });
}

async function pumpMoves(state, gesture) {
    if (gesture.pumping || !gesture.pending || gesture.canceled) return;
    gesture.pumping = true;
    try {
        const begun = await gesture.beginPromise;
        if (begun !== true || gesture.canceled) {
            gesture.canceled = true;
            gesture.pending = null;
            if (state.gesture === gesture) {
                state.gesture = null;
                restoreControls(state);
            }
            state.localPose = null;
            requestRender(state);
            return;
        }
        while (gesture.pending && !gesture.canceled) {
            if (!gesture.pending.final && gesture.lastSentAt) {
                const delay = Math.max(0, (1000 / 15) - (performance.now() - gesture.lastSentAt));
                if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
            }
            if (gesture.canceled) return;
            const move = gesture.pending;
            gesture.pending = null;
            const action = gesture.route === 'tug' ? 5 : 3;
            gesture.lastSentAt = performance.now();
            const result = await dispatch(state, action, gesture.tail, move.point, gesture.useNoseAnchor, move.final, gesture.operationId);
            if (!result?.accepted) {
                gesture.canceled = true;
                state.localPose = null;
                if (state.gesture === gesture) {
                    state.gesture = null;
                    restoreControls(state);
                }
                requestRender(state);
                return;
            }
            if (move.final) {
                state.gesture = null;
                restoreControls(state);
                requestRender(state);
                return;
            }
        }
    } finally {
        gesture.pumping = false;
        if (gesture.pending && !gesture.canceled) queuePump(state, gesture);
    }
}

function queuePump(state, gesture) {
    if (gesture.pumping || gesture.canceled) return;
    gesture.pumpTask = pumpMoves(state, gesture);
}

async function cancelGesture(state) {
    const gesture = state.gesture;
    if (!gesture) return;
    state.gesture = null;
    restoreControls(state);
    gesture.canceled = true;
    gesture.pending = null;
    state.localPose = null;
    requestRender(state);
    try {
        const begun = await gesture.beginPromise;
        await gesture.pumpTask;
        if (begun === true) await dispatch(state, 6, gesture.tail, null, false, true, gesture.operationId);
    } catch { }
}

function installInteractions(state) {
    const canvas = state.renderer.domElement;
    const down = event => {
        if (event.button === 2) return;
        if (!event.isPrimary) {
            if (state.browsePointer) state.browsePointer.multiTouch = true;
            if (state.pointerGesture) state.pointerGesture.multiTouch = true;
            return;
        }
        if (state.pointerGesture) {
            state.pointerGesture.multiTouch = true;
            return;
        }
        if (state.browsePointer) {
            state.browsePointer.multiTouch = true;
            return;
        }
        const mode = state.data?.interaction || {};
        if (!state.interactive || (!mode.enabled && !mode.awaitingPlacement && !mode.awaitingDestination)) return;
        if (state.cameraTransitionFrame !== null) return;
        const locked = mode.awaitingPlacement === true || mode.awaitingDestination === true;
        const hit = hitTarget(state, event);
        const canMoveSelected = mode.canMoveSelected === true;
        const canTowSelected = mode.canTowSelected === undefined ? canMoveSelected : mode.canTowSelected === true;
        const selectedEditHit = !locked && isTopDownEditView(state) && mode.selectedTail &&
            ((canMoveSelected && hit?.kind === 'aircraft' && hit.tail === mode.selectedTail) ||
                (canTowSelected && hit?.kind === 'tug'));
        const canEditTug = selectedEditHit && hit?.kind === 'tug' && !!state.data?.selectedTug;
        const capturesEditPointer = selectedEditHit && (hit?.kind === 'aircraft' || canEditTug);
        if (!locked && !capturesEditPointer) {
            state.browsePointer = {
                pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
                moved: false, multiTouch: false, hit, planId: state.planId,
                selectedTail: mode.selectedTail ?? null
            };
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        canvas.tabIndex = 0;
        canvas.focus({ preventScroll: true });
        state.pointerGesture = {
            pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
            moved: false, multiTouch: false, hit, lastPoint: groundPoint(state, event)
        };
        if (state.controls) state.controls.enabled = controlsEnabled(state);
        try { canvas.setPointerCapture(event.pointerId); } catch { }
    };
    const move = event => {
        const browse = state.browsePointer;
        if (browse && browse.pointerId === event.pointerId &&
            Math.hypot(event.clientX - browse.startX, event.clientY - browse.startY) >= 5)
            browse.moved = true;
        const pointer = state.pointerGesture;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= 5) {
            pointer.moved = true;
            const target = pointer.hit?.kind === 'aircraft'
                ? { type: 'aircraft', tail: pointer.hit.tail, useNoseAnchor: pointer.hit.useNoseAnchor === true }
                : pointer.hit?.kind === 'tug'
                    ? { type: 'tug', tail: state.data?.interaction?.selectedTail, useNoseAnchor: false }
                : null;
            const selectedTail = state.data?.interaction?.selectedTail;
            const canMove = state.data?.interaction?.canMoveSelected === true;
            const canTow = state.data?.interaction?.canTowSelected === undefined
                ? canMove : state.data?.interaction?.canTowSelected === true;
            const canDragTarget = target && ((target.type === 'tug' && state.data?.selectedTug && canTow) ||
                (target.tail === selectedTail && canMove));
            if (canDragTarget && isTopDownEditView(state)) {
                const operationId = makeOperationId();
                const route = target.type === 'tug' ? 'tug' : 'aircraft';
                const aircraft = state.data.aircraft?.find(value => value.tail === target.tail);
                const tug = state.data.selectedTug;
                const anchor = route === 'tug'
                    ? tugHandlePoint(tug)
                    : target.useNoseAnchor && aircraft ? nosePoint(aircraft) : aircraft ? nativePose(aircraft) : null;
                const point = groundPoint(state, event);
                const gesture = {
                    route, tail: target.tail, useNoseAnchor: target.useNoseAnchor, operationId,
                    offset: route === 'tug' || !point || !anchor
                        ? { x: 0, y: 0 }
                        : { x: point.x - anchor.x, y: point.y - anchor.y },
                    pending: null, pumping: false, canceled: false,
                    beginPromise: dispatch(state, route === 'tug' ? 4 : 2, target.tail, anchor, target.useNoseAnchor, false, operationId)
                        .then(result => result?.accepted === true),
                    lastSentAt: 0, pumpTask: null
                };
                state.gesture = gesture;
            }
        }
        const gesture = state.gesture;
        if (gesture && pointer.moved) {
            const point = groundPoint(state, event);
            if (!point) return;
            const anchorPoint = { x: point.x - gesture.offset.x, y: point.y - gesture.offset.y };
            pointer.lastPoint = anchorPoint;
            if (gesture.route === 'aircraft' && !gesture.useNoseAnchor) updateLocalFromAnchor(state, gesture, anchorPoint);
            gesture.pending = { point: anchorPoint, final: false };
            queuePump(state, gesture);
            requestRender(state);
        }
    };
    const up = async event => {
        const browse = state.browsePointer;
        if (browse && browse.pointerId === event.pointerId) {
            state.browsePointer = null;
            const mode = state.data?.interaction || {};
            if (!browse.moved && !browse.multiTouch && browse.planId === state.planId &&
                browse.selectedTail === (mode.selectedTail ?? null) && state.cameraTransitionFrame === null) {
                if (browse.hit?.kind === 'aircraft') {
                    if (browse.hit.tail === mode.selectedTail) setView(state.host, 'top-down');
                    else await dispatch(state, 0, browse.hit.tail, null, false, true, makeOperationId());
                } else if (browse.hit?.kind !== 'tug' && mode.selectedTail) {
                    await dispatch(state, 1, null, null, false, true, makeOperationId());
                }
            }
            return;
        }
        const pointer = state.pointerGesture;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        state.pointerGesture = null;
        try { if (state.renderer.domElement.hasPointerCapture(event.pointerId)) state.renderer.domElement.releasePointerCapture(event.pointerId); } catch { }
        if (state.controls) state.controls.enabled = controlsEnabled(state);
        event.preventDefault();
        event.stopImmediatePropagation();
        if (pointer.moved && state.gesture) {
            const gesture = state.gesture;
            const point = groundPoint(state, event) || pointer.lastPoint;
            if (point) {
                const finalPoint = { x: point.x - gesture.offset.x, y: point.y - gesture.offset.y };
                if (gesture.route === 'aircraft' && !gesture.useNoseAnchor) updateLocalFromAnchor(state, gesture, finalPoint);
                gesture.pending = { point: finalPoint, final: true };
                queuePump(state, gesture);
                requestRender(state);
            }
            return;
        }
        if (pointer.moved || pointer.multiTouch) return;
        const mode = state.data?.interaction || {};
        if (mode.awaitingPlacement) {
            const point = groundPoint(state, event);
            if (point) await dispatch(state, 7, mode.pendingTail, point, false, true, makeOperationId());
            return;
        }
        if (mode.awaitingDestination) {
            const point = groundPoint(state, event);
            if (point) await dispatch(state, 8, mode.selectedTail, point, false, true, makeOperationId());
            return;
        }
        if (pointer.hit?.kind === 'aircraft' && pointer.hit.tail === state.data?.interaction?.selectedTail) {
            setView(state.host, 'top-down');
        }
    };
    const cancel = event => {
        if (state.pointerGesture && (!event || event.pointerId === state.pointerGesture.pointerId)) {
            const pointerId = state.pointerGesture.pointerId;
            state.pointerGesture = null;
            try { if (state.renderer.domElement.hasPointerCapture(pointerId)) state.renderer.domElement.releasePointerCapture(pointerId); } catch { }
            state.cancellationPromise = cancelGesture(state);
            if (state.controls) state.controls.enabled = controlsEnabled(state);
        }
        else if (!event && state.gesture) state.cancellationPromise = cancelGesture(state);
        if (state.browsePointer && (!event || event.pointerId === state.browsePointer.pointerId)) state.browsePointer = null;
    };
    const context = () => {};
    const key = async event => {
        if (event.key !== 'Escape') return;
        const target = event.target;
        if (!state.host.contains(document.activeElement) || target?.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || document.querySelector('.modal.show')) return;
        event.preventDefault();
        cancel();
        await state.cancellationPromise;
        const mode = state.data?.interaction;
        if (mode?.selectedTail || mode?.awaitingPlacement || mode?.awaitingDestination)
            await dispatch(state, 1, null, null, false, true, makeOperationId());
    };
    // Hover works in every mode (including the read-only Calendar view): raise the hovered aircraft's tail number label.
    let hoverFrame = null, hoverEvent = null, lastHoverX = NaN, lastHoverY = NaN;
    const hoverMove = event => {
        if (event.pointerType === 'touch' || state.pointerGesture) return;
        hoverEvent = event;
        if (hoverFrame !== null) return;
        hoverFrame = requestAnimationFrame(() => {
            hoverFrame = null;
            if (state.disposed || !hoverEvent) return;
            // Nothing to re-evaluate if the pointer has not moved since the last hover raycast.
            if (hoverEvent.clientX === lastHoverX && hoverEvent.clientY === lastHoverY) return;
            lastHoverX = hoverEvent.clientX;
            lastHoverY = hoverEvent.clientY;
            setHoverTail(state, hoverTailAt(state, hoverEvent));
        });
    };
    const hoverReset = () => {
        hoverEvent = null;
        lastHoverX = lastHoverY = NaN;
        if (hoverFrame !== null) { cancelAnimationFrame(hoverFrame); hoverFrame = null; }
    };
    const hoverLeave = () => {
        hoverReset();
        setHoverTail(state, null);
    };
    canvas.addEventListener('pointermove', hoverMove);
    canvas.addEventListener('pointerleave', hoverLeave);
    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true);
    canvas.addEventListener('pointercancel', cancel, true);
    canvas.addEventListener('lostpointercapture', cancel, true);
    canvas.addEventListener('contextmenu', context);
    window.addEventListener('keydown', key);
    const cancelOnBlur = () => cancel();
    const visibility = () => { if (document.visibilityState !== 'visible') cancel(); };
    window.addEventListener('blur', cancelOnBlur);
    window.addEventListener('pagehide', cancelOnBlur);
    document.addEventListener('visibilitychange', visibility);
    state.interactionListeners = { hoverMove, hoverLeave, hoverReset, down, move, up, cancel, context, key, cancelOnBlur, visibility };
}

function removeInteractions(state) {
    const canvas = state.renderer?.domElement;
    const listeners = state.interactionListeners;
    if (canvas && listeners) {
        canvas.removeEventListener('pointermove', listeners.hoverMove);
        canvas.removeEventListener('pointerleave', listeners.hoverLeave);
        canvas.removeEventListener('pointerdown', listeners.down, true);
        canvas.removeEventListener('pointermove', listeners.move, true);
        canvas.removeEventListener('pointerup', listeners.up, true);
        canvas.removeEventListener('pointercancel', listeners.cancel, true);
        canvas.removeEventListener('lostpointercapture', listeners.cancel, true);
        canvas.removeEventListener('contextmenu', listeners.context);
    }
    listeners?.hoverReset?.();
    state.hoverTail = null;
    if (listeners) window.removeEventListener('keydown', listeners.key);
    if (listeners) {
        window.removeEventListener('blur', listeners.cancelOnBlur);
        window.removeEventListener('pagehide', listeners.cancelOnBlur);
        document.removeEventListener('visibilitychange', listeners.visibility);
    }
    state.interactionListeners = null;
}

function buildSelectedTug(state, tug) {
    if (state.selectedTugRoot) {
        state.aircraftGroup.remove(state.selectedTugRoot);
        disposeObject(state.selectedTugRoot, true);
        state.selectedTugRoot = null;
    }
    if (!tug || ![tug.length, tug.width, tug.height].every(Number.isFinite)) return;
    const root = new THREE.Group();
    root.userData.sceneTug = true;
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.1, tug.width), Math.max(0.1, tug.height), Math.max(0.1, tug.length)),
        new THREE.MeshStandardMaterial({ color: window.HangarPalette.toHex(tug.valid === false ? window.HangarPalette.tug.invalidStroke : window.HangarPalette.tug.stroke), transparent: true, opacity: 0.86 }));
    const rearOffset = Number.isFinite(tug.fixedAxleToRearBody) ? tug.fixedAxleToRearBody : tug.length / 2;
    body.position.set(0, tug.height / 2, tug.length / 2 - rearOffset);
    body.castShadow = true;
    root.add(body);
    const grabBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 20, 14),
        new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            emissive: 0xfbbf24,
            emissiveIntensity: 0.65,
            roughness: 0.35,
            depthTest: false,
            depthWrite: false
        }));
    grabBall.position.set(0, Math.max(0.35, tug.height + 0.12), Number.isFinite(tug.wheelbase) ? tug.wheelbase : 0);
    grabBall.renderOrder = 40;
    root.add(grabBall);
    state.selectedTugGrabBall = grabBall;
    state.aircraftGroup.add(root);
    state.selectedTugRoot = root;
}

function updateSelectedTug(state, data) {
    const tug = data.selectedTug;
    if (!tug || ![tug.x, tug.y, tug.theta].every(Number.isFinite)) {
        if (state.selectedTugRoot) {
            state.aircraftGroup.remove(state.selectedTugRoot);
            disposeObject(state.selectedTugRoot, true);
            state.selectedTugRoot = null;
        }
        state.selectedTugKey = '';
        state.selectedTugGrabBall = null;
        state.handleTargets = [];
        return;
    }
    const key = JSON.stringify([tug.length, tug.width, tug.height, tug.fixedAxleToRearBody, tug.valid]);
    if (key !== state.selectedTugKey) {
        state.selectedTugKey = key;
        buildSelectedTug(state, tug);
    }
    if (state.selectedTugRoot) {
        state.selectedTugRoot.position.set(tug.x - data.originX, 0, tug.y - data.originY);
        state.selectedTugRoot.rotation.set(0, Math.PI + tug.theta, 0);
        syncTugVisibility(state);
    }
}

function syncTugVisibility(state) {
    if (!state.selectedTugRoot) return;
    const movingAircraft = state.pointerGesture?.hit?.kind === 'aircraft' || state.gesture?.route === 'aircraft';
    state.selectedTugRoot.visible = !movingAircraft;
}

function mountScene(state) {
    if (state.renderer || state.disposed) return;
    const { host, dotNet } = state;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(window.HangarPalette.toHex(window.HangarPalette.scene3d.background), 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene();
    const hemisphereFill = new THREE.HemisphereLight(0xf4f7ff, 0x252932, 1.05);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.00015;
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.radius = 4;
    scene.add(hemisphereFill, keyLight, keyLight.target);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.addEventListener('start', () => { state.cameraPreset = null; });
    controls.addEventListener('change', () => requestRender(state));
    const staticGroup = new THREE.Group();
    const aircraftGroup = new THREE.Group();
    const playbackGroup = new THREE.Group();
    const handleGroup = new THREE.Group();
    const regionGroup = new THREE.Group();
    const collisionAreaGroup = new THREE.Group();
    const collisionAreaMesh = createCollisionZoneMesh();
    collisionAreaGroup.add(collisionAreaMesh);
    const collisionAreaScene = new THREE.Scene();
    collisionAreaScene.add(collisionAreaGroup);
    const collisionAreaTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: false });
    const collisionCompositeScene = new THREE.Scene();
    const collisionCompositeCamera = new THREE.Camera();
    const collisionCompositeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { zoneTexture: { value: collisionAreaTarget.texture }, viewRect: { value: new THREE.Vector4(0, 0, 1, 1) }, outlineStep: { value: new THREE.Vector2() } },
        vertexShader: 'uniform vec4 viewRect; varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4((viewRect.xy + uv * viewRect.zw) * 2.0 - 1.0, 0.0, 1.0); }',
        fragmentShader: `
            uniform sampler2D zoneTexture;
            uniform vec2 outlineStep;
            varying vec2 vUv;
            void main() {
                vec4 zone = texture2D(zoneTexture, vUv);
                vec3 color = zone.rgb / max(zone.a, 0.00001);
                float neighborCoverage = 1.0;
                for (int x = -1; x <= 1; x++) {
                    for (int y = -1; y <= 1; y++) {
                        if (x == 0 && y == 0) continue;
                        vec2 uv = vUv + vec2(float(x), float(y)) * outlineStep;
                        float covered = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)
                            ? 0.0 : texture2D(zoneTexture, uv).a;
                        neighborCoverage = min(neighborCoverage, covered);
                    }
                }
                // An inward stroke follows the resolved union, without internal zone seams.
                float outline = 1.0 - smoothstep(0.1, 0.9, neighborCoverage);
                gl_FragColor = vec4(color, zone.a * mix(0.55, 1.0, outline));
                #include <colorspace_fragment>
            }`,
        transparent: true, depthTest: false, depthWrite: false, toneMapped: false
    }));
    collisionCompositeMesh.frustumCulled = false;
    collisionCompositeScene.add(collisionCompositeMesh);
    const destinationGroup = new THREE.Group();
    const spotGroup = new THREE.Group();
    scene.add(staticGroup, aircraftGroup, playbackGroup, handleGroup, regionGroup, destinationGroup, spotGroup);
    Object.assign(state, {
        frame: host.parentElement, renderer, scene, camera, controls, staticGroup, aircraftGroup, playbackGroup, handleGroup, regionGroup, collisionAreaGroup, collisionAreaMesh, collisionAreaScene, collisionAreaTarget, collisionCompositeScene, collisionCompositeCamera, collisionCompositeMesh, collisionBoxes: [], collisionAreaCamera: null, collisionViewProjection: new THREE.Matrix4(), collisionProjectionPoint: new THREE.Vector4(), collisionTargetSize: new THREE.Vector2(), collisionClearColor: new THREE.Color(), destinationGroup, spotGroup,
        keyLight, shadowGeometryKey: '',
        aircraft: new Map(), modelCache: new Map(), modelAttempts: new Map(), geometryKey: '', generation: 0, cameraPositioned: false, cameraPreset: null, cameraFitKey: null,
        playbackKey: null, playbackAnimation: null, tugProfileKey: '', playbackRoute: null, playbackProgress: null, playbackMarker: null, tugRoot: null, cameraTransitionFrame: null, cameraTransitionDamping: null,
        selectedTugRoot: null, selectedTugGrabBall: null, selectedTugKey: '', lastStatus: null, regionKey: '', collisionAreaKey: '', handleTargets: [], localPose: null,
        // Source meshes can carry a few inward-wound faces; the visual's normals follow each face's own winding.
        aircraftMaterial: new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.05, roughness: 0.72, side: THREE.DoubleSide }),
        placeholderMaterial: new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.8 }),
        data: state.data, pointer: new THREE.Vector2(), raycaster: new THREE.Raycaster(), animationFrame: null,
        groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit: new THREE.Vector3(), interactive: false
    });
    const observer = new ResizeObserver(() => resize(state));
    if (state.frame?.parentElement) observer.observe(state.frame.parentElement);
    observer.observe(document.documentElement);
    state.observer = observer;
    state.viewportResize = () => resize(state);
    window.addEventListener('resize', state.viewportResize);
    window.visualViewport?.addEventListener('resize', state.viewportResize);
    resize(state);
    installInteractions(state);
    if (state.data) renderData(state, state.data);
    requestRender(state);
}

function unmountScene(state) {
    if (!state.renderer) return;
    state.playbackAnimation = null;
    void cancelGesture(state);
    state.generation++;
    if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    if (state.cameraTransitionFrame !== null) cancelAnimationFrame(state.cameraTransitionFrame);
    state.cameraTransitionFrame = null;
    removeInteractions(state);
    state.observer?.disconnect();
    window.removeEventListener('resize', state.viewportResize);
    window.visualViewport?.removeEventListener('resize', state.viewportResize);
    state.controls.dispose();
    disposeChildren(state.staticGroup);
    disposeChildren(state.playbackGroup);
    disposeChildren(state.handleGroup);
    disposeChildren(state.regionGroup);
    disposeChildren(state.collisionAreaGroup);
    disposeChildren(state.collisionCompositeScene);
    state.collisionAreaTarget.dispose();
    disposeChildren(state.destinationGroup);
    for (const entry of state.aircraft.values()) disposeAircraftEntry(state, entry);
    state.aircraft.clear();
    if (state.selectedTugRoot) {
        state.aircraftGroup.remove(state.selectedTugRoot);
        disposeObject(state.selectedTugRoot, true);
    }
    state.aircraftMaterial.dispose();
    state.placeholderMaterial.dispose();
    state.scene.traverse(node => node.shadow?.dispose?.());
    state.renderer.dispose();
    state.renderer.forceContextLoss();
    state.renderer.domElement.remove();
    for (const promise of state.modelCache.values()) promise.then(value => disposeObject(value.root, true)).catch(() => {});
    state.modelCache.clear();
    Object.assign(state, { renderer: null, scene: null, camera: null, controls: null, staticGroup: null, aircraftGroup: null, playbackGroup: null, handleGroup: null, regionGroup: null, collisionAreaGroup: null, collisionAreaMesh: null, collisionAreaScene: null, collisionAreaTarget: null, collisionCompositeScene: null, collisionCompositeCamera: null, collisionCompositeMesh: null, collisionBoxes: [], collisionAreaCamera: null, collisionViewProjection: null, collisionProjectionPoint: null, collisionTargetSize: null, collisionClearColor: null, destinationGroup: null, keyLight: null, shadowGeometryKey: '', observer: null, aircraft: new Map(), modelCache: new Map(), modelAttempts: new Map(), selectedTugRoot: null, selectedTugGrabBall: null, geometryKey: '', playbackKey: null, playbackAnimation: null, regionKey: '', collisionAreaKey: '', regionSizeKey: null, regionCanvas: null, regionContext: null, regionTexture: null, destinationKey: '', selectedTail: undefined, cameraPositioned: false, localPose: null });
}

function updateKeyLightShadow(state, data) {
    const light = state.keyLight;
    if (!light || !data) return;
    const width = Math.max(1, Number(data.width) || 1);
    const depth = Math.max(1, Number(data.depth) || 1);
    const originX = Number(data.originX) || 0;
    const originY = Number(data.originY) || 0;
    const profile = normalizeCeilingProfile(data);
    const ceilingHeight = Math.max(1, Number(data.ceilingHeight) || 0, ...profile.map(point => point.height));
    const geometryKey = JSON.stringify([
        width, depth, originX, originY, data.floorMinX, data.floorMinY, ceilingHeight, profile
    ]);
    if (geometryKey === state.shadowGeometryKey) return;
    state.shadowGeometryKey = geometryKey;

    const centerX = (data.floorMinX ?? 0) + width / 2 - originX;
    const centerZ = (data.floorMinY ?? 0) + depth / 2 - originY;
    const target = light.target;
    target.position.set(centerX, 0, centerZ);

    // Keep the key oblique enough to reveal fuselage sides while illuminating
    // top-down scenes, and expand the footprint for ceiling-height cast shadows.
    const direction = new THREE.Vector3(0.48, 1, 0.36).normalize();
    const halfDiagonal = Math.hypot(width, depth) / 2;
    const horizontalShift = ceilingHeight * Math.hypot(direction.x, direction.z) / direction.y;
    const extent = halfDiagonal + horizontalShift + 2;
    const distance = extent + ceilingHeight + 10;
    light.position.set(centerX, 0, centerZ).addScaledVector(direction, distance);

    const shadowCamera = light.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = 0.1;
    shadowCamera.far = distance + ceilingHeight + halfDiagonal + 10;
    shadowCamera.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
}

function renderData(state, data) {
    state.data = data;
    updateKeyLightShadow(state, data);
    ensureCameraProjection(state, data.fixedTopDown === true);
    const sizingKey = `${data.fitToViewport === true}`;
    const sizingChanged = sizingKey !== state.sizingKey;
    state.sizingKey = sizingKey;
    const geometryKey = state.staticSceneKey ?? keyForGeometry(data);
    if (geometryKey !== state.geometryKey) {
        state.geometryKey = geometryKey;
        rebuildStatic(state, data);
    } else state.data = data;
    if (sizingChanged) resize(state);
    const cameraFitKey = JSON.stringify([
        data.width, data.depth, data.originX, data.originY,
        data.floorMinX, data.floorMinY, data.ceilingHeight, data.ceilingProfile
    ]);
    if (state.cameraTransitionFrame === null && !state.gesture &&
        (!state.cameraPositioned || (state.cameraPreset && state.cameraFitKey !== cameraFitKey))) {
        applyCameraPreset(state, data.fixedTopDown === true ? 'top-down' : state.cameraPreset ?? data.preferredView ?? 'top-down');
    }
    // The host's 3D | Top-down toggle: a different preferred view moves the camera there.
    const preferredView = data.fixedTopDown !== true && (data.preferredView === 'angled' || data.preferredView === 'top-down') ? data.preferredView : null;
    if (preferredView && state.preferredViewApplied !== preferredView && state.cameraPositioned) {
        state.preferredViewApplied = preferredView;
        setView(state.host, preferredView);
    }
    const fixedTopDownChanged = state.lastFixedTopDown !== (data.fixedTopDown === true);
    if (fixedTopDownChanged) {
        for (const entry of state.aircraft.values()) updateAircraftLabelScale(state, entry);
        state.lastFixedTopDown = data.fixedTopDown === true;
    }
    state.cameraFitKey = cameraFitKey;
    updateAircraft(state, data);
    updatePlayback(state, data);
    setAircraftHighlight(state, data.interaction?.selectedTail ?? data.aircraft?.find(item => item.selected === true)?.tail ?? data.playback?.activeTail ?? null);
    updateSelectedTug(state, data);
    updateRegions(state, data);
    updateCollisionAreas(state, data);
    updatePlannedDestination(state, data.plannedDestination, data);
    updateTemplateSpots(state, data);
    applyLocalPose(state);
    const selectedTail = data.interaction?.selectedTail ?? null;
    const locked = state.interactive && (data.interaction?.awaitingPlacement === true || data.interaction?.awaitingDestination === true);
    state.selectedTail = selectedTail;
    if (locked && !state.locked) setView(state.host, 'top-down');
    state.locked = locked;
    // A pannable top-down view keeps the operator's pan across re-renders; only entering the view resets it.
    if (data.fixedTopDown === true && (data.allowTopDownPan !== true || fixedTopDownChanged)) setView(state.host, 'top-down');
    if (state.controls) {
        state.controls.enabled = controlsEnabled(state);
        state.controls.enableRotate = data.fixedTopDown !== true;
        state.controls.mouseButtons.LEFT = data.fixedTopDown === true ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        state.controls.touches.ONE = data.fixedTopDown === true ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    }
    updateHandles(state);
    requestRender(state);
}

function resize(state) {
    const data = state.data;
    const frame = state.frame;
    if (frame) {
        const container = frame.parentElement;
        const availableWidth = container?.clientWidth || 0;
        if (availableWidth <= 0) return;
        const containerHeight = container?.clientHeight || 0;
        if (data?.fitToViewport !== true && containerHeight <= 0) return;
        const availableHeight = data?.fitToViewport === true
            ? Math.max(1, document.documentElement.clientHeight - frame.getBoundingClientRect().top)
            : containerHeight;
        const width = availableWidth;
        const height = availableHeight;
        if (state.frameWidth !== width || state.frameHeight !== height) {
            state.frameWidth = width;
            state.frameHeight = height;
            frame.style.width = `${width}px`;
            frame.style.height = `${height}px`;
        }
    }
    const width = state.host.clientWidth;
    const height = state.host.clientHeight;
    if (!width || !height) return;
    if (state.renderWidth === width && state.renderHeight === height) return;
    state.renderWidth = width;
    state.renderHeight = height;
    const orthographic = state.data?.fixedTopDown === true;
    if (orthographic) ensureCameraProjection(state, true);
    if (state.camera.isPerspectiveCamera) state.camera.aspect = width / height;
    else updateOrthographicFrustum(state.camera, width, height, state.data);
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height, false);
    if (state.cameraTransitionFrame === null) {
        if (data?.fixedTopDown === true) applyCameraPreset(state, 'top-down');
        else if (data && state.cameraPreset) applyCameraPreset(state, state.cameraPreset);
    }
    for (const entry of state.aircraft.values()) updateAircraftLabelScale(state, entry);
    if (state.data) updateHandles(state);
    requestRender(state);
}

export function create(host, dotNet, deferUntilVisible = false) {
    if (!host || scenes.has(host)) return;
    const state = { host, dotNet, disposed: false, visible: true, data: null, deferred: deferUntilVisible === true };
    scenes.set(host, state);
    if (state.deferred && 'IntersectionObserver' in window) {
        state.visibilityObserver = new IntersectionObserver(entries => {
            const visible = entries.some(entry => entry.isIntersecting);
            state.visible = visible;
            if (visible) mountScene(state);
            else unmountScene(state);
        }, { rootMargin: '120px' });
        state.visibilityObserver.observe(host);
    } else mountScene(state);
}

export function setView(host, preset) {
    const state = scenes.get(host);
    if (!state?.data || !state.camera || !['angled', 'top-down'].includes(preset)) return;
    if (state.pointerGesture || state.gesture) return;
    if (state.locked && preset !== 'top-down') return;
    if (state.data.fixedTopDown === true && preset !== 'top-down') return;
    if (state.cameraPreset === preset) return;
    resize(state);
    transitionCameraPreset(state, preset);
}

// Screen "up" and "right" projected onto the hangar floor, in plan coordinates (x, y), so
// keyboard and joystick slides move the way the camera is looking. Null when not mounted.
export function getGroundAxes(host) {
    const camera = scenes.get(host)?.camera;
    if (!camera) return null;
    const flat = vector => {
        const length = Math.hypot(vector.x, vector.z);
        return length < 1e-6 ? null : [vector.x / length, vector.z / length];
    };
    const up = flat(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion));
    const right = flat(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion));
    return up && right ? [up[0], up[1], right[0], right[1]] : null;
}

function controlsEnabled(state) {
    return !state.locked && !state.pointerGesture && !state.gesture && state.cameraTransitionFrame === null &&
        (state.data?.fixedTopDown !== true || state.data?.allowTopDownPan === true);
}
function restoreControls(state) {
    if (state.controls) state.controls.enabled = controlsEnabled(state);
}
function isTopDownEditView(state) {
    if (!state.camera || state.cameraTransitionFrame !== null) return false;
    const direction = state.camera.getWorldDirection(new THREE.Vector3());
    return direction.y < 0 && Math.hypot(direction.x, direction.z) <= 0.001;
}
function transitionCameraPreset(state, preset) {
    const { camera, controls } = state;
    if (state.cameraTransitionFrame !== null) {
        cancelAnimationFrame(state.cameraTransitionFrame);
        state.cameraTransitionFrame = null;
        controls.enableDamping = state.cameraTransitionDamping ?? true;
        controls.enabled = controlsEnabled(state);
    }

    controls.update();
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const startQuaternion = camera.quaternion.clone();
    state.cameraTransitionDamping = controls.enableDamping;
    controls.enabled = false;
    controls.enableDamping = false;

    applyCameraPreset(state, preset);
    const endPosition = camera.position.clone();
    const endTarget = controls.target.clone();
    const endQuaternion = camera.quaternion.clone();
    camera.position.copy(startPosition);
    controls.target.copy(startTarget);
    camera.quaternion.copy(startQuaternion);

    const durationMs = 420;
    let startedAt = null;
    const animate = timestamp => {
        if (state.disposed || !state.renderer) {
            state.cameraTransitionFrame = null;
            return;
        }
        if (startedAt === null) startedAt = timestamp;
        const progress = Math.min(1, (timestamp - startedAt) / durationMs);
        const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        camera.position.copy(startPosition).lerp(endPosition, eased);
        controls.target.copy(startTarget).lerp(endTarget, eased);
        controls.update();
        camera.quaternion.slerpQuaternions(startQuaternion, endQuaternion, eased);
        requestRender(state);

        if (progress < 1) {
            state.cameraTransitionFrame = requestAnimationFrame(animate);
            return;
        }
        camera.position.copy(endPosition);
        controls.target.copy(endTarget);
        controls.update();
        camera.quaternion.copy(endQuaternion);
        controls.enableDamping = state.cameraTransitionDamping;
        state.cameraTransitionDamping = null;
        state.cameraPreset = preset;
        state.cameraTransitionFrame = null;
        controls.enabled = controlsEnabled(state);
        requestRender(state);
    };
    state.cameraTransitionFrame = requestAnimationFrame(animate);
}

function applyCameraPreset(state, preset) {
    const { controls, data } = state;
    ensureCameraProjection(state, data.fixedTopDown === true);
    const camera = state.camera;
    const width = Math.max(1, Number(data.width) || 1);
    const depth = Math.max(1, Number(data.depth) || 1);
    const height = Math.max(1, ...normalizeCeilingProfile(data).map(point => point.height));
    const center = new THREE.Vector3(
        (data.floorMinX ?? 0) + width / 2 - data.originX, 0,
        (data.floorMinY ?? 0) + depth / 2 - data.originY);
    if (camera.isOrthographicCamera) {
        const viewportWidth = state.host.clientWidth || state.renderWidth || 1;
        const viewportHeight = state.host.clientHeight || state.renderHeight || 1;
        updateOrthographicFrustum(camera, viewportWidth, viewportHeight, data);
        const distance = Math.max(height + width + depth, 10);
        const damping = controls.enableDamping;
        controls.enableDamping = false;
        controls.update();
        controls.target.copy(center);
        const direction = new THREE.Vector3(0, 1, 0.000001).normalize();
        camera.position.copy(center).addScaledVector(direction, distance);
        camera.lookAt(controls.target);
        camera.near = 0.01;
        camera.far = Math.max(2000, distance + height + width + depth);
        camera.updateProjectionMatrix();
        controls.update();
        controls.enableDamping = damping;
        state.cameraPositioned = true;
        state.cameraPreset = preset;
        for (const entry of state.aircraft.values()) updateAircraftLabelScale(state, entry);
        return;
    }
    // Keep north at the top in the overhead view. The tiny offset avoids the
    // OrbitControls pole singularity while remaining visually straight down.
    const direction = preset === 'top-down'
        ? new THREE.Vector3(0, 1, 0.000001).normalize()
        : new THREE.Vector3(0.9, 0.8, 0.45).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanHorizontal = tanVertical * camera.aspect;
    let distance = 1;
    // Fit every corner, including the ceiling, for both wide and tall viewports.
    for (const x of [-width / 2, width / 2]) {
        for (const y of [0, height]) {
            for (const z of [-depth / 2, depth / 2]) {
                const corner = new THREE.Vector3(x, y, z);
                const forward = corner.dot(direction);
                distance = Math.max(distance,
                    forward + Math.abs(corner.dot(right)) / tanHorizontal,
                    forward + Math.abs(corner.dot(up)) / tanVertical);
            }
        }
    }
    // cameraMargin (default 1.18) lets a presentation view sit closer than the setup views do.
    distance *= data.fixedTopDown === true ? 1.0 : Number(data.cameraMargin) > 0 ? Number(data.cameraMargin) : 1.18;
    // Flush pending orbit/pan damping before applying a deterministic preset.
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.far = Math.max(2000, distance + width + depth + height);
    camera.updateProjectionMatrix();
    controls.update();
    controls.enableDamping = damping;
    state.cameraPositioned = true;
    state.cameraPreset = preset;
}

function ensureCameraProjection(state, fixedTopDown) {
    const camera = state.camera;
    if (!camera) return;
    const shouldBeOrthographic = fixedTopDown === true;
    if ((camera.isOrthographicCamera === true) === shouldBeOrthographic) return;
    const aspect = (state.host?.clientWidth || state.renderWidth || 1) / (state.host?.clientHeight || state.renderHeight || 1);
    const nextCamera = shouldBeOrthographic
        ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000)
        : new THREE.PerspectiveCamera(45, aspect, 0.05, 2000);
    nextCamera.position.copy(camera.position);
    nextCamera.quaternion.copy(camera.quaternion);
    nextCamera.up.set(0, 1, 0);
    nextCamera.zoom = camera.zoom;
    nextCamera.updateProjectionMatrix();
    state.camera = nextCamera;
    state.controls.object = nextCamera;
    state.controls.update();
    if (state.data) for (const entry of state.aircraft.values()) updateAircraftLabelScale(state, entry);
}

function updateOrthographicFrustum(camera, viewportWidth, viewportHeight, data) {
    const width = Math.max(1, Number(data?.width) || 1);
    const depth = Math.max(1, Number(data?.depth) || 1);
    const aspect = Math.max(0.001, viewportWidth / Math.max(1, viewportHeight));
    const footprintAspect = width / depth;
    let viewWidth = width;
    let viewHeight = depth;
    if (aspect > footprintAspect) viewWidth = depth * aspect;
    else viewHeight = width / aspect;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    const ceilingHeight = Math.max(1, ...normalizeCeilingProfile(data || {}).map(point => point.height));
    camera.near = 0.01;
    camera.far = Math.max(2000, ceilingHeight * 4 + width + depth);
}

export async function update(host, data, interactive = false) {
    const state = scenes.get(host);
    if (!state || !data) return;
    try {
        const incomingPlanId = data.interaction?.planId ?? null;
        const nextInteractive = interactive === true;
        const planChanged = state.planId !== undefined && state.planId !== incomingPlanId;
        const interactionDisabled = state.interactive && !nextInteractive;
        if (planChanged || interactionDisabled) {
            await cancelGesture(state);
            state.localPose = null;
        }
        state.planId = incomingPlanId;
        if (state.staticScene) Object.assign(data, state.staticScene);
        if (data.playback && state.playbackPath) Object.assign(data.playback, state.playbackPath);
        state.data = data;
        // Aircraft the host wants to stand out (the move in hand): amber, like the moving aircraft in the 2D plan.
        state.tints = new Map((data.highlightTails || []).map(tail => [tail, { color: 0x2ec4b6, emissive: 0x0b5a53 }]));
        state.interactive = nextInteractive;
        if (state.renderer) renderData(state, data);
    } catch (error) {
        state.dotNet?.invokeMethodAsync('SetRendererStatus', `3D renderer error: ${error.message || error}`, true).catch(() => {});
    }
}

export async function setInteractive(host, interactive) {
    const state = scenes.get(host);
    if (!state) return;
    state.interactive = interactive === true;
    if (!state.interactive) {
        await cancelGesture(state);
        state.localPose = null;
        if (state.controls) state.controls.enabled = controlsEnabled(state);
    }
    if (state.data && state.renderer) renderData(state, state.data);
}

export async function cancelInteraction(host) {
    const state = scenes.get(host);
    if (!state) return;
    const listeners = state.interactionListeners;
    if (listeners?.cancel) {
        listeners.cancel();
        await state.cancellationPromise;
    } else {
        await cancelGesture(state);
    }
}

// Each step's path and collision frames cross interop once, under an id; showing a step again sends only the id.
// A reset drops every payload the host no longer tracks.
function playbackPayload(state, id, payload, reset) {
    const cache = state.playbackPayloads ??= new Map();
    if (reset) cache.clear();
    if (id == null) return null;
    if (payload?.storedSamples != null) payload = storedCollisionFrames(payload);
    if (payload != null) cache.set(id, payload);
    return cache.get(id) ?? null;
}

// Collision samples the browser holds from the server's tow-playback response, shaped like the ones the host sends.
function storedCollisionFrames({ storedSamples: id, overlapColor }) {
    return (storedSamples(id) || []).map(sample => ({
        areas: sample.areas || [],
        tails: sample.tailPriorities ?? null,
        // Null keeps the scene's own regions: the sample was not checked for overlaps.
        regions: sample.overlaps ? sample.overlaps.map(shape => ({ path: shape.pathData, color: overlapColor })) : null
    }));
}

export function setPlaybackCollisions(host, id, frames, dotColors, reset = false) {
    const state = scenes.get(host);
    if (!state) return;
    frames = playbackPayload(state, id, frames, reset);
    state.playbackCollisionFrames = Array.isArray(frames) && frames.length ? frames : null;
    state.playbackDotColors = dotColors || null;
    if (state.playbackAnimation) state.playbackAnimation.collisionIndex = undefined;
    if (state.data && state.renderer) {
        updateRegions(state, state.data);
        updateCollisionAreas(state, state.data);
        requestRender(state);
    }
}

// The hangar's walls, doors, obstacles and ceiling arrive only when they change; update() merges them into each
// scene, and their geometry key is taken once here instead of on every update.
export function setStaticScene(host, staticScene) {
    const state = scenes.get(host);
    if (!state) return;
    state.staticScene = staticScene || null;
    state.staticSceneKey = staticScene ? keyForGeometry(staticScene) : null;
}

// The played path's samples arrive once per path; update() merges them into each scene's playback object.
export function setPlaybackPath(host, id, path, reset = false) {
    const state = scenes.get(host);
    if (state) state.playbackPath = playbackPayload(state, id, path, reset);
}

// Opening a tow sequence sends every step's path and collision frames under the ids its frames will name.
export function preloadPlayback(host, entries, reset = false) {
    const state = scenes.get(host);
    if (!state) return;
    if (reset) state.playbackPayloads?.clear();
    for (const entry of entries || []) playbackPayload(state, entry.id, entry.payload, false);
}

// Loads the models a playback will show, then compiles their shaders and uploads their geometry off screen, so
// its first play neither waits for a model nor stalls on the GPU. A failed load is retried when one is shown.
export async function preparePlayback(host, urls, requireAllModels = false) {
    const state = scenes.get(host);
    if (!state) {
        if (requireAllModels) throw new Error('The 3D scene is unavailable.');
        return;
    }
    const pendingLoads = Promise.allSettled((urls || []).map(url => loadModel(state, url)));
    let deadline;
    let loads;
    try {
        loads = requireAllModels
            ? await Promise.race([
                pendingLoads,
                new Promise((_, reject) => {
                    deadline = setTimeout(() => reject(new Error('Aircraft models did not load within 30 seconds.')),
                        30000);
                })
            ])
            : await pendingLoads;
    } finally {
        clearTimeout(deadline);
    }
    if (requireAllModels && loads.some(load => load.status === 'rejected')) {
        throw new Error('An aircraft model could not load. Check the installed model catalog and visual.glb asset.');
    }
    const renderer = state.renderer;
    if (state.disposed || !renderer || !state.camera) {
        if (requireAllModels) throw new Error('The 3D renderer is unavailable.');
        return;
    }
    const group = new THREE.Group();
    const materials = loads.filter(load => load.status === 'fulfilled').map(load => {
        const material = state.aircraftMaterial.clone();
        installHatch(material);
        const model = load.value.root.clone(true);
        neutralize(model, material);
        group.add(model);
        return material;
    });
    if (!materials.length) return;
    const target = new THREE.WebGLRenderTarget(1, 1);
    const previousTarget = renderer.getRenderTarget();
    state.scene.add(group);
    try {
        await renderer.compileAsync(state.scene, state.camera);
        renderer.setRenderTarget(target);
        renderer.render(state.scene, state.camera);
    } finally {
        renderer.setRenderTarget(previousTarget);
        state.scene.remove(group);
        materials.forEach(material => material.dispose());
        target.dispose();
        requestRender(state);
    }
}

export function dispose(host) {
    const state = scenes.get(host);
    if (!state) return;
    state.disposed = true;
    state.playbackAnimation = null;
    state.visibilityObserver?.disconnect();
    unmountScene(state);
    scenes.delete(host);
}
