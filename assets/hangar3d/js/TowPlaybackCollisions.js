// Tow playback collision responses, parsed here because the browser reads JSON far faster than .NET does.
// A 3D scene takes each tow's samples by id; .NET gets back only what it reads itself: never the areas, and the
// 2D outlines only while a 2D view draws them.
const responses = new Map();
const RESPONSE_LIMIT = 64;
let lastId = 0;

// Each sample gets back the areas the response lists once and the sample names by index.
export function store(bytes, withShapes) {
    const response = JSON.parse(new TextDecoder().decode(bytes));
    const samples = response.samples || [];
    if (response.sampleAreas) samples.forEach((sample, index) =>
        sample.areas = (response.sampleAreas[index] || []).map(area => response.areas[area]).filter(Boolean));
    const id = ++lastId;
    responses.set(id, samples);
    if (responses.size > RESPONSE_LIMIT) responses.delete(responses.keys().next().value);
    return forDotNet(id, withShapes);
}

// Null once the response has been dropped, so the caller keeps what it has.
export function forDotNet(id, withShapes) {
    const samples = responses.get(id);
    if (!samples) return null;
    return new TextEncoder().encode(JSON.stringify({
        id,
        samples: samples.map(sample => ({
            highestPriority: sample.highestPriority,
            tailPriorities: sample.tailPriorities,
            shapes: withShapes ? sample.shapes : [],
            overlaps: withShapes ? sample.overlaps : null
        }))
    }));
}

export function storedSamples(id) {
    return responses.get(id) ?? null;
}
