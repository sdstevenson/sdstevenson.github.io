const players = new Map();
const mediaTimeoutMilliseconds = 30000;

export function getFrameIndex(time, framesPerSecond, frameCount) {
    return Math.min(frameCount - 1, Math.max(0, Math.floor(time * framesPerSecond + 1e-7)));
}

export function samplePoses(demo, time) {
    const frameIndex = getFrameIndex(time, demo.framesPerSecond, demo.frameCount);
    const frame = demo.frames[frameIndex];
    const next = demo.frames[frameIndex + 1];
    const current = frame?.frameIndex === frameIndex ? frame : null;
    return demo.aircraft.map(aircraft => {
        const pose = current?.poses.find(value => value.aircraftId === aircraft.id);
        const visible = Boolean(pose && frameIndex >= aircraft.startFrame && frameIndex <= aircraft.endFrame);
        const result = {
            aircraftId: aircraft.id, x: pose?.x ?? 0, y: pose?.y ?? 0,
            heading: pose?.heading ?? 0, status: pose?.status ?? 'Unavailable', visible
        };
        const following = next?.frameIndex === frameIndex + 1
            ? next.poses.find(value => value.aircraftId === aircraft.id) : null;
        if (!visible || !following || frameIndex + 1 > aircraft.endFrame
            || pose.status !== 'Tracked' || following.status !== 'Tracked') return result;
        const interval = next.timestampSeconds - current.timestampSeconds;
        const alpha = interval > 0 ? Math.min(1, Math.max(0, (time - current.timestampSeconds) / interval)) : 0;
        const delta = Math.atan2(Math.sin(following.heading - pose.heading), Math.cos(following.heading - pose.heading));
        result.x += alpha * (following.x - pose.x);
        result.y += alpha * (following.y - pose.y);
        result.heading += alpha * delta;
        return result;
    });
}

function isCurrent(state, operation) {
    return !state.disposed && state.operation === operation;
}

function stopMedia(state) {
    for (const video of state.videos) video.pause();
    for (const [video, handle] of state.frameCallbacks) video.cancelVideoFrameCallback(handle);
    state.frameCallbacks.clear();
    if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
}

function cancelOperation(state) {
    state.operation++;
    state.starting = false;
    for (const cancel of [...state.cancelWaits]) cancel();
    stopMedia(state);
    return state.operation;
}

function publish(state) {
    if (state.disposed) return;
    state.pendingNotification = {
        generation: state.generation, time: state.time,
        frame: getFrameIndex(state.time, state.demo.framesPerSecond, state.demo.frameCount),
        playing: state.playing, buffering: state.buffering, error: state.error,
        poses: samplePoses(state.demo, state.time)
    };
    if (state.notifying) return;
    state.notifying = true;
    void (async () => {
        try {
            while (!state.disposed && state.pendingNotification) {
                const notification = state.pendingNotification;
                state.pendingNotification = null;
                await state.dotNet.invokeMethodAsync('OnPlaybackState', notification);
            }
        } catch {
            // A disconnected page cannot receive state; its videos must not keep playing.
            stopMedia(state);
            state.playing = false;
        } finally {
            state.notifying = false;
        }
    })();
}

function fail(state, message) {
    if (state.disposed) return;
    cancelOperation(state);
    state.busy = false;
    state.playing = false;
    state.buffering = false;
    state.resumeAfterSync = false;
    state.error = message;
    publish(state);
}

function cameraName(video) {
    return video.dataset.cameraNumber ? `Camera ${video.dataset.cameraNumber}` : 'The camera video';
}

function waitForMedia(state, video, predicate, operation) {
    return new Promise((resolve, reject) => {
        let timer;
        let finished = false;
        const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked', 'timeupdate', 'error'];
        const finish = error => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            for (const event of events) video.removeEventListener(event, check);
            state.cancelWaits.delete(cancel);
            if (error) reject(error); else resolve();
        };
        const cancel = () => finish(new Error('Playback operation canceled.'));
        const check = () => {
            if (!isCurrent(state, operation)) cancel();
            else if (video.error) finish(new Error(`${cameraName(video)} could not load or decode its video.`));
            else if (predicate()) finish();
        };
        state.cancelWaits.add(cancel);
        for (const event of events) video.addEventListener(event, check);
        timer = setTimeout(() => finish(new Error(`${cameraName(video)} did not become ready within 30 seconds.`)),
            mediaTimeoutMilliseconds);
        check();
    });
}

async function alignMedia(state, operation, resume = false) {
    const target = Math.min(state.time, (state.demo.frameCount - 1) / state.demo.framesPerSecond);
    for (const video of state.videos) {
        if (Math.abs(video.currentTime - target) > 1e-7) video.currentTime = target;
    }
    await Promise.all(state.videos.map(video => waitForMedia(state, video,
        () => !video.seeking && video.readyState >= (resume ? 3 : 2)
            && Math.abs(video.currentTime - target) < 1e-4, operation)));
}

function scheduleFrame(state) {
    if (!state.playing || state.disposed || state.busy) return;
    const master = state.videos[0];
    if (typeof master.requestVideoFrameCallback === 'function') {
        const handle = master.requestVideoFrameCallback((_now, metadata) => {
            state.frameCallbacks.delete(master);
            tick(state, metadata.mediaTime);
        });
        state.frameCallbacks.set(master, handle);
    } else {
        state.animationFrame = requestAnimationFrame(() => {
            state.animationFrame = null;
            tick(state, master.currentTime);
        });
    }
}

function tick(state, time) {
    if (!state.playing || state.disposed || state.busy) return;
    state.time = Math.min(state.demo.durationSeconds, Math.max(0, time));
    publish(state);
    // More than one source frame of drift requires the whole group to realign.
    const frameSeconds = 1 / state.demo.framesPerSecond;
    if (state.videos.slice(1).some(video => !video.seeking
        && Math.abs(video.currentTime - state.videos[0].currentTime) > frameSeconds + 1e-7)) {
        void synchronize(state, state.time, true);
        return;
    }
    scheduleFrame(state);
}

async function startMedia(state, operation) {
    state.starting = true;
    // A play promise can remain pending during buffering, so cancellation and a deadline cover startup too.
    await new Promise((resolve, reject) => {
        const cancel = () => finish(new Error('Playback operation canceled.'));
        const timer = setTimeout(() => finish(new Error('The camera videos did not start within 30 seconds.')),
            mediaTimeoutMilliseconds);
        const finish = error => {
            clearTimeout(timer);
            state.cancelWaits.delete(cancel);
            if (error) reject(error); else resolve();
        };
        state.cancelWaits.add(cancel);
        try {
            Promise.all(state.videos.map(video => video.play())).then(() => finish(), finish);
        } catch (error) {
            finish(error);
        }
    });
    if (!isCurrent(state, operation)) return;
    state.starting = false;
    state.busy = false;
    state.buffering = false;
    state.playing = true;
    state.resumeAfterSync = false;
    publish(state);
    scheduleFrame(state);
}

async function synchronize(state, time, resume) {
    const operation = cancelOperation(state);
    state.time = Math.min(state.demo.durationSeconds, Math.max(0, Number(time) || 0));
    state.playing = false;
    state.busy = true;
    state.buffering = true;
    state.resumeAfterSync = resume;
    publish(state);
    try {
        await alignMedia(state, operation, resume);
        if (!isCurrent(state, operation)) return;
        if (resume) await startMedia(state, operation);
        else {
            state.busy = false;
            state.buffering = false;
            state.resumeAfterSync = false;
            publish(state);
        }
    } catch (error) {
        if (isCurrent(state, operation)) fail(state, error.message);
    }
}

export async function create(host, dotNet, demo, generation) {
    dispose(host);
    const elements = [...host.querySelectorAll('video[data-camera-number]')];
    // The website packs all six cameras into one video, which a single element plays.
    const mosaic = host.querySelector('video[data-camera-mosaic]');
    const videos = mosaic ? [mosaic] : [...demo.cameras].sort((a, b) => a.number - b.number)
        .map(camera => elements.find(video => Number(video.dataset.cameraNumber) === camera.number));
    if (!mosaic && (videos.length !== 6 || videos.some((video, index) => !video
        || Number(video.dataset.cameraNumber) !== index + 1))) {
        throw new Error('The demo requires six mapped camera video elements, including Camera 1.');
    }
    const state = {
        host, dotNet, demo, generation, videos, disposed: false, operation: 0,
        time: 0, playing: false, buffering: true, busy: true, starting: false, resumeAfterSync: false, error: null,
        frameCallbacks: new Map(), animationFrame: null, cancelWaits: new Set(), listeners: [],
        pendingNotification: null, notifying: false
    };
    players.set(host, state);
    for (const video of videos) {
        video.muted = true;
        video.playsInline = true;
        video.controls = false;
        const onError = () => fail(state, `${cameraName(video)} could not load or decode its video.`);
        const onWaiting = () => {
            if ((state.playing && !state.busy) || state.starting) void synchronize(state, state.time, true);
        };
        const onEnded = () => {
            if (!state.playing || state.busy) return;
            if (video === videos[0] || state.time >= (demo.frameCount - 2) / demo.framesPerSecond) {
                void synchronize(state, demo.durationSeconds, false);
            } else fail(state, `${cameraName(video)} ended before the shared timeline.`);
        };
        for (const [event, listener] of [['error', onError], ['waiting', onWaiting], ['ended', onEnded]]) {
            video.addEventListener(event, listener);
            state.listeners.push([video, event, listener]);
        }
    }
    publish(state);
    const operation = state.operation;
    try {
        await Promise.all(videos.map(video => waitForMedia(state, video, () => video.readyState >= 2, operation)));
        if (!isCurrent(state, operation)) throw new Error(state.error || 'Playback load canceled.');
        for (const video of videos) {
            if (!Number.isFinite(video.duration)
                || Math.abs(video.duration - demo.durationSeconds) > 1 / demo.framesPerSecond) {
                throw new Error(`${cameraName(video)} has a different duration from the tracking timeline.`);
            }
        }
        await alignMedia(state, operation);
        if (!isCurrent(state, operation)) throw new Error(state.error || 'Playback load canceled.');
        state.busy = false;
        state.buffering = false;
        publish(state);
    } catch (error) {
        if (isCurrent(state, operation)) fail(state, error.message);
        throw error;
    }
}

export async function play(host) {
    const state = players.get(host);
    if (!state || state.error || state.disposed || state.busy || state.playing) return;
    const time = state.time >= state.demo.durationSeconds ? 0 : state.time;
    await synchronize(state, time, true);
}

export async function pause(host) {
    const state = players.get(host);
    if (!state || state.disposed) return;
    await synchronize(state, state.time, false);
}

export async function seek(host, time) {
    const state = players.get(host);
    if (!state || state.disposed || state.error) return;
    await synchronize(state, time, state.playing || state.resumeAfterSync);
}

export async function restart(host) {
    const state = players.get(host);
    if (!state || state.disposed || state.error) return;
    await synchronize(state, 0, false);
}

export function dispose(host) {
    const state = players.get(host);
    if (!state) return;
    state.disposed = true;
    cancelOperation(state);
    for (const [video, event, listener] of state.listeners) video.removeEventListener(event, listener);
    for (const video of state.videos) {
        video.removeAttribute('src');
        video.load();
    }
    state.pendingNotification = null;
    players.delete(host);
}
