export const COLLISION_ROUNDING_METERS = 0.04;
const PROFILE_SEGMENTS = 4;
const SIN_22_5 = Math.sqrt(2 - Math.SQRT2) / 2;
const COS_22_5 = Math.sqrt(2 + Math.SQRT2) / 2;
const BOTTOM_PROFILE_SIN = [-1, -COS_22_5, -Math.SQRT1_2, -SIN_22_5, 0];
const BOTTOM_PROFILE_COS = [0, SIN_22_5, Math.SQRT1_2, COS_22_5, 1];
const TOP_PROFILE_SIN = [0, SIN_22_5, Math.SQRT1_2, COS_22_5, 1];
const TOP_PROFILE_COS = [1, COS_22_5, Math.SQRT1_2, SIN_22_5, 0];

function validConvexFootprint(footprint) {
    if (!Array.isArray(footprint) || footprint.length < 3 ||
        !footprint.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) return false;
    for (let index = 0; index < footprint.length; index++) {
        const point = footprint[index];
        const next = footprint[(index + 1) % footprint.length];
        if (Math.hypot(next[0] - point[0], next[1] - point[1]) <= 1e-10) return false;
    }
    let direction = 0;
    for (let index = 0; index < footprint.length; index++) {
        const a = footprint[index];
        const b = footprint[(index + 1) % footprint.length];
        const c = footprint[(index + 2) % footprint.length];
        const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(turn) <= 1e-10) continue;
        const sign = Math.sign(turn);
        if (direction && sign !== direction) return false;
        direction = sign;
    }
    if (!direction) return false;
    return footprint.every((point, index) => {
        const a = footprint[index], b = footprint[(index + 1) % footprint.length];
        return footprint.every(candidate => {
            const side = (b[0] - a[0]) * (candidate[1] - a[1]) -
                (b[1] - a[1]) * (candidate[0] - a[0]);
            return side === 0 || Math.sign(side) === direction;
        });
    });
}

function simplifyConvexFootprint(footprint) {
    if (!validConvexFootprint(footprint)) return null;
    const points = footprint.slice();
    let removed = true;
    while (removed && points.length > 3) {
        removed = false;
        for (let index = 0; index < points.length; index++) {
            const previous = points[(index + points.length - 1) % points.length];
            const current = points[index];
            const next = points[(index + 1) % points.length];
            const turn = (current[0] - previous[0]) * (next[1] - current[1])
                - (current[1] - previous[1]) * (next[0] - current[0]);
            if (Math.abs(turn) <= 1e-10) {
                points.splice(index, 1);
                removed = true;
                break;
            }
        }
    }
    return points.length >= 3 ? points : null;
}

function isValidArea(area) {
    return Number.isFinite(area?.xLocationMeters) &&
        Number.isFinite(area?.yLocationMeters) &&
        Number.isFinite(area?.zLocationMeters) &&
        Number.isFinite(area?.widthMeters) && area.widthMeters > 0 &&
        Number.isFinite(area?.depthMeters) && area.depthMeters > 0 &&
        Number.isFinite(area?.heightMeters) && area.heightMeters > 0 &&
        (area.priority === 'High' || area.priority === 'Medium');
}

function compareBoxes(a, b) {
    // Paint lower priorities first so High wins wherever projected zones overlap.
    const left = [a.priority, ...a.min, ...a.max];
    const right = [b.priority, ...b.min, ...b.max];
    for (let i = 0; i < left.length; i++) {
        if (left[i] < right[i]) return -1;
        if (left[i] > right[i]) return 1;
    }
    return 0;
}

export function prepareRoundedCollisionZones(areas, originX = 0, originY = 0) {
    const safeOriginX = Number.isFinite(originX) ? originX : 0;
    const safeOriginY = Number.isFinite(originY) ? originY : 0;
    const boxes = (Array.isArray(areas) ? areas : [])
        .filter(isValidArea)
        .map(area => {
            const footprint = Array.isArray(area.footprint) ? area.footprint.map(point => [
                point?.xLocationMeters - safeOriginX,
                point?.yLocationMeters - safeOriginY
            ]) : null;
            return {
                min: [area.xLocationMeters - safeOriginX, area.zLocationMeters, area.yLocationMeters - safeOriginY],
                max: [area.xLocationMeters + area.widthMeters - safeOriginX,
                    area.zLocationMeters + area.heightMeters,
                    area.yLocationMeters + area.depthMeters - safeOriginY],
                priority: area.priority === 'High' ? 1 : 0,
                ...(validConvexFootprint(footprint) ? { footprint } : {})
            };
        })
        .filter(box => [...box.min, ...box.max].every(Number.isFinite))
        .sort(compareBoxes);
    return { boxes, radius: COLLISION_ROUNDING_METERS };
}

/**
 * Builds a non-indexed rounded-prism surface for the supplied collision boxes.
 * Positions are core vertices; each vertex's unit offset is scaled by radius
 * by the renderer. Priorities are repeated per vertex for a flat shader attribute.
 */
export function buildRoundedCollisionGeometry(boxes, radius = COLLISION_ROUNDING_METERS) {
    const roundRadius = Number.isFinite(radius) ? Math.max(0, radius) : COLLISION_ROUNDING_METERS;
    const zones = Array.isArray(boxes) ? boxes : [];
    let triangleCapacity = 0;
    for (const box of zones) {
        if (!box || !Array.isArray(box.min) || !Array.isArray(box.max) ||
            !Number.isFinite(box.min[0]) || !Number.isFinite(box.min[1]) || !Number.isFinite(box.min[2]) ||
            !Number.isFinite(box.max[0]) || !Number.isFinite(box.max[1]) || !Number.isFinite(box.max[2]) ||
            box.max[0] <= box.min[0] || box.max[1] <= box.min[1] || box.max[2] <= box.min[2]) continue;
        const pointCount = simplifyConvexFootprint(box.footprint)?.length ?? 4;
        // A convex corner turns by less than 180 degrees, so four profile steps
        // require at most eight arc segments per corner.
        triangleCapacity += 164 * pointCount - 4;
    }
    const positions = new Float32Array(triangleCapacity * 9);
    const offsets = new Float32Array(triangleCapacity * 9);
    const priorities = new Float32Array(triangleCapacity * 3);
    let positionIndex = 0;
    let offsetIndex = 0;
    let priorityIndex = 0;

    function makeVertex(x, z, y, normalX, normalZ, sinLatitude, cosLatitude) {
        const offsetX = normalX * cosLatitude;
        const offsetZ = normalZ * cosLatitude;
        const offsetY = sinLatitude;
        return {
            x, y, z,
            offsetX, offsetY, offsetZ,
            surfaceX: x + offsetX * roundRadius,
            surfaceY: y + offsetY * roundRadius,
            surfaceZ: z + offsetZ * roundRadius
        };
    }

    function addTriangle(a, b, c, priority) {
        const abX = b.surfaceX - a.surfaceX;
        const abY = b.surfaceY - a.surfaceY;
        const abZ = b.surfaceZ - a.surfaceZ;
        const acX = c.surfaceX - a.surfaceX;
        const acY = c.surfaceY - a.surfaceY;
        const acZ = c.surfaceZ - a.surfaceZ;
        const normalX = abY * acZ - abZ * acY;
        const normalY = abZ * acX - abX * acZ;
        const normalZ = abX * acY - abY * acX;
        if (normalX * normalX + normalY * normalY + normalZ * normalZ <= 1e-20) return;
        const winding = normalX * (a.offsetX + b.offsetX + c.offsetX)
            + normalY * (a.offsetY + b.offsetY + c.offsetY)
            + normalZ * (a.offsetZ + b.offsetZ + c.offsetZ);
        if (winding < 0) [b, c] = [c, b];
        positions[positionIndex++] = a.x; positions[positionIndex++] = a.y; positions[positionIndex++] = a.z;
        positions[positionIndex++] = b.x; positions[positionIndex++] = b.y; positions[positionIndex++] = b.z;
        positions[positionIndex++] = c.x; positions[positionIndex++] = c.y; positions[positionIndex++] = c.z;
        offsets[offsetIndex++] = a.offsetX; offsets[offsetIndex++] = a.offsetY; offsets[offsetIndex++] = a.offsetZ;
        offsets[offsetIndex++] = b.offsetX; offsets[offsetIndex++] = b.offsetY; offsets[offsetIndex++] = b.offsetZ;
        offsets[offsetIndex++] = c.offsetX; offsets[offsetIndex++] = c.offsetY; offsets[offsetIndex++] = c.offsetZ;
        priorities[priorityIndex++] = priority;
        priorities[priorityIndex++] = priority;
        priorities[priorityIndex++] = priority;
    }

    function addQuad(a, b, c, d, priority) {
        addTriangle(a, b, c, priority);
        addTriangle(a, c, d, priority);
    }

    for (const box of zones) {
        if (!box || !Array.isArray(box.min) || !Array.isArray(box.max) ||
            !Number.isFinite(box.min[0]) || !Number.isFinite(box.min[1]) || !Number.isFinite(box.min[2]) ||
            !Number.isFinite(box.max[0]) || !Number.isFinite(box.max[1]) || !Number.isFinite(box.max[2]) ||
            box.max[0] <= box.min[0] || box.max[1] <= box.min[1] || box.max[2] <= box.min[2]) continue;

        const polygon = simplifyConvexFootprint(box.footprint)
            ?? [[box.min[0], box.min[2]], [box.max[0], box.min[2]],
                [box.max[0], box.max[2]], [box.min[0], box.max[2]]];
        const polygonLength = polygon.length;
        let area = 0;
        for (let index = 0; index < polygonLength; index++) {
            const point = polygon[index];
            const next = polygon[(index + 1) % polygonLength];
            area += point[0] * next[1] - next[0] * point[1];
        }
        if (Math.abs(area) <= 1e-10) continue;
        const pointAt = area > 0
            ? index => polygon[index]
            : index => polygon[polygonLength - index - 1];

        const minY = box.min[1], maxY = box.max[1];
        const priority = Number.isFinite(box.priority) ? box.priority : 0;
        const edgeNormals = new Array(polygonLength);
        for (let index = 0; index < polygonLength; index++) {
            const point = pointAt(index);
            const next = pointAt((index + 1) % polygonLength);
            const dx = next[0] - point[0], dz = next[1] - point[1];
            const length = Math.hypot(dx, dz);
            edgeNormals[index] = { x: dz / length, z: -dx / length };
        }
        const bottomCap = new Array(polygonLength);
        const topCap = new Array(polygonLength);
        for (let index = 0; index < polygonLength; index++) {
            const point = pointAt(index);
            bottomCap[index] = makeVertex(point[0], point[1], minY, 0, 0, -1, 0);
            topCap[index] = makeVertex(point[0], point[1], maxY, 0, 0, 1, 0);
        }

        // Flat caps keep the original convex footprint intact at the core bounds.
        for (let index = 1; index < polygonLength - 1; index++) {
            addTriangle(bottomCap[0], bottomCap[index], bottomCap[index + 1], priority);
            addTriangle(topCap[0], topCap[index], topCap[index + 1], priority);
        }

        for (let edge = 0; edge < polygonLength; edge++) {
            const next = (edge + 1) % polygonLength;
            const a = pointAt(edge), b = pointAt(next), normal = edgeNormals[edge];
            const lowA = new Array(PROFILE_SEGMENTS + 1), lowB = new Array(PROFILE_SEGMENTS + 1);
            const highA = new Array(PROFILE_SEGMENTS + 1), highB = new Array(PROFILE_SEGMENTS + 1);
            for (let step = 0; step <= PROFILE_SEGMENTS; step++) {
                lowA[step] = makeVertex(a[0], a[1], minY, normal.x, normal.z,
                    BOTTOM_PROFILE_SIN[step], BOTTOM_PROFILE_COS[step]);
                lowB[step] = makeVertex(b[0], b[1], minY, normal.x, normal.z,
                    BOTTOM_PROFILE_SIN[step], BOTTOM_PROFILE_COS[step]);
                highA[step] = makeVertex(a[0], a[1], maxY, normal.x, normal.z,
                    TOP_PROFILE_SIN[step], TOP_PROFILE_COS[step]);
                highB[step] = makeVertex(b[0], b[1], maxY, normal.x, normal.z,
                    TOP_PROFILE_SIN[step], TOP_PROFILE_COS[step]);
            }
            // Rounded bottom and top edge bands, each with four latitude steps.
            for (let step = 0; step < PROFILE_SEGMENTS; step++) {
                addQuad(lowA[step], lowB[step], lowB[step + 1], lowA[step + 1], priority);
                addQuad(highA[step], highB[step], highB[step + 1], highA[step + 1], priority);
            }
            // Original vertical side face from minY through maxY.
            addQuad(lowA[PROFILE_SEGMENTS], lowB[PROFILE_SEGMENTS], highB[0], highA[0], priority);
        }

        for (let corner = 0; corner < polygonLength; corner++) {
            const point = pointAt(corner);
            const previous = edgeNormals[(corner + polygonLength - 1) % polygonLength];
            const next = edgeNormals[corner];
            let start = Math.atan2(previous.z, previous.x);
            let finish = Math.atan2(next.z, next.x);
            while (finish <= start) finish += Math.PI * 2;
            const arcSteps = Math.max(1, Math.ceil((finish - start) / (Math.PI / 2) * PROFILE_SEGMENTS));
            const arcNormals = new Array(arcSteps + 1);
            arcNormals[0] = previous;
            arcNormals[arcSteps] = next;
            for (let arc = 1; arc < arcSteps; arc++) {
                const angle = start + (finish - start) * arc / arcSteps;
                arcNormals[arc] = { x: Math.cos(angle), z: Math.sin(angle) };
            }
            const cornerBottom = new Array(arcSteps + 1);
            const cornerTop = new Array(arcSteps + 1);
            for (let arc = 0; arc <= arcSteps; arc++) {
                const normal = arcNormals[arc];
                cornerBottom[arc] = new Array(PROFILE_SEGMENTS + 1);
                cornerTop[arc] = new Array(PROFILE_SEGMENTS + 1);
                for (let step = 0; step <= PROFILE_SEGMENTS; step++) {
                    cornerBottom[arc][step] = makeVertex(point[0], point[1], minY,
                        normal.x, normal.z, BOTTOM_PROFILE_SIN[step], BOTTOM_PROFILE_COS[step]);
                    cornerTop[arc][step] = makeVertex(point[0], point[1], maxY,
                        normal.x, normal.z, TOP_PROFILE_SIN[step], TOP_PROFILE_COS[step]);
                }
            }

            // Rounded corner patches meet the edge bands and flat side faces exactly.
            for (let arc = 0; arc < arcSteps; arc++) {
                const bottom0 = cornerBottom[arc], bottom1 = cornerBottom[arc + 1];
                const top0 = cornerTop[arc], top1 = cornerTop[arc + 1];
                addQuad(bottom0[PROFILE_SEGMENTS], bottom1[PROFILE_SEGMENTS], top1[0], top0[0], priority);
                for (let step = 0; step < PROFILE_SEGMENTS; step++) {
                    addQuad(bottom0[step], bottom1[step], bottom1[step + 1], bottom0[step + 1], priority);
                    addQuad(top0[step], top1[step], top1[step + 1], top0[step + 1], priority);
                }
            }
        }
    }

    return {
        positions: positions.subarray(0, positionIndex),
        offsets: offsets.subarray(0, offsetIndex),
        priorities: priorities.subarray(0, priorityIndex)
    };
}
