// Shared hangar drawing palette. Classic script: exposes window.HangarPalette for the 2D canvas
// code (CanvasUtils.js) and the 3D viewer module (HangarScene3D.js) so both styles stay in sync.
// Profile WallColor / DoorColor settings override wall.color / door.color in both renderers.
(function () {
    const palette = {
        wall: Object.freeze({ color: '#F2EBDD', width: 3, halo: 'rgba(20, 22, 26, 0.55)', haloWidth: 7 }),
        door: Object.freeze({ color: '#627CF5', width: 6, halo: 'rgba(20, 22, 26, 0.55)', haloWidth: 11, openDash: [6, 12], openDash3D: Object.freeze({ dash: 0.35, gap: 0.65 }) }),
        obstacle: Object.freeze({
            fill: 'rgba(217, 139, 29, 0.30)', stroke: '#D98B1D', strokeWidth: 2,
            label: '#F2EBDD', labelFont: '600 12px Inter, ui-sans-serif, system-ui, sans-serif'
        }),
        label: Object.freeze({
            font: '600 13px Inter, ui-sans-serif, system-ui, sans-serif', text: '#FFFFFF',
            pill: 'rgba(32, 36, 44, 0.88)', ok: '#4CC38A', problem: '#E5485D'
        }),
        path: Object.freeze({ planned: 'rgba(217, 139, 29, 0.55)', plannedDash: [10, 6], active: '#627CF5', activeWidth: 4 }),
        tug: Object.freeze({
            fill: 'rgba(98, 124, 245, 0.8)', stroke: '#627CF5',
            invalidFill: 'rgba(229, 72, 93, 0.8)', invalidStroke: '#E5485D', radius: 3
        }),
        grid: 'rgba(203, 213, 225, 0.10)',
        // Setup editor chrome drawn on the 2D canvas (stage, guides, handles, length pills).
        editor: Object.freeze({
            stage: '#2A2F37', floor: '#30353E', pill: '#20242C', pillText: '#FFFFFF', pillMuted: '#C9CED6',
            select: '#8FA2FF', selectFill: 'rgba(98, 124, 245, 0.30)', guide: '#9AA1AB', snap: '#5CC8E0',
            handleFill: '#FFFFFF', handleStroke: '#627CF5', vertexStroke: '#20242C', vertexRadius: 4.5,
            font: '600 12px Inter, ui-sans-serif, system-ui, sans-serif',
            fontRegular: '500 12px Inter, ui-sans-serif, system-ui, sans-serif'
        }),
        // Unchanged by the restyle; listed for reference only.
        collision: Object.freeze({ overlap: '#ff4d4d', warning: '#f5c542' }),
        aircraft: Object.freeze({ noseHandle: '#005096' }),
        scene3d: Object.freeze({
            background: '#1E2228', floor: '#30353E',
            wallFill: 'rgba(242, 235, 221, 0.10)', wallEdge: '#F2EBDD',
            doorFill: 'rgba(98, 124, 245, 0.5)', doorEdge: '#627CF5',
            obstacleFill: '#E3A24A', obstacleEdge: '#D98B1D',
            ceilingEdge: '#F2EBDD'
        }),
        legend: Object.freeze({ pill: 'rgba(32, 36, 44, 0.88)', text: '#E1E5EA' })
    };
    // Profiles saved before the restyle carry the old default colors; treat those as "not customized".
    const legacy = new Set(["#2f3742", "#d7b982", "#111827", "#d1d5db"]);
    const resolve = (value, fallback) => {
        const text = typeof value === "string" ? value.trim() : "";
        return text && !legacy.has(text.toLowerCase()) ? text : fallback;
    };
    const helpers = {
        wallColor: value => resolve(value, palette.wall.color),
        doorColor: value => resolve(value, palette.door.color),
        toHex: value => Number.parseInt(String(value).replace("#", ""), 16)
    };
    window.HangarPalette = Object.freeze(Object.assign(palette, helpers));
})();
