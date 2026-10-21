import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { loadEngine, source as sourceFile } from './load-engine.mjs';
import { SwingTiming } from '../src/SwingTiming.mjs';

// Execute the complete worker; hold its output turn while IPC messages arrive.
async function worker() {
    const code = await sourceFile('hardware/midi/MidiClockWorker.cjs');
    const turns = [], sent = [], active = new Set(), errors = [];
    let receive, now = 0n, stopAt = null;
    runInNewContext(code, {
        __dirname: 'mock', setImmediate: fn => turns.push(fn), Date,
        process: { versions: {}, hrtime: { bigint: () => { now += 10000n; return now; } }, exit() {} },
        require(name) {
            if (name === 'node:path') return { join: (...parts) => parts.join('/') };
            if (name === 'node:worker_threads') return { parentPort: {
                on: (_, fn) => { receive = fn; }, postMessage: message => { if (message.type === 'ERROR') errors.push(message); }
            }, receiveMessageOnPort() {
                if (stopAt !== null && now >= stopAt) { stopAt = null; return { message: { type: 'SET_ENABLED', enabled: false } }; }
            } };
            if (name === '@julusian/midi') return { Output: class {
                getPortCount() { return 1; } getPortName() { return 'Synth'; } openPort() {} closePort() {}
                sendMessage(message) {
                    const m = Array.from(message); sent.push(m);
                    const key = `${m[0] & 15}:${m[1]}`;
                    if ((m[0] & 0xf0) === 0x90 && m[2] > 0) active.add(key);
                    if ((m[0] & 0xf0) === 0x80 || (m[0] & 0xf0) === 0x90 && m[2] === 0) active.delete(key);
                }
            } };
            return { prepareTimingThread() {}, preciseSleep(ms) { now += BigInt(Math.round(ms * 1e6)); } };
        }
    }, { timeout: 1000 });
    receive({ type: 'SET_DESTINATION', name: 'Synth' });
    return { sent, active, errors, command: command => receive(command),
        send: (message, extra = {}) => receive({ type: 'SEND_MIDI', message, ...extra }),
        startClock() {
            stopAt = now + 60000000n;
            receive({ type: 'SET_CLOCK_OUTPUT_SELECTED', selected: true });
            receive({ type: 'SET_ENABLED', enabled: true });
        },
        flush() { let count = 0; while (turns.length) { assert.ok(count++ < 10000); turns.shift()(); } } };
}

for (const clockRunning of [false, true]) test(`a queued Note Off must not overtake its own unsent Note On; clock=${clockRunning}`, async () => {
    const midi = await worker();
    if (clockRunning) midi.startClock();
    midi.send([0x90, 60, 100]); midi.send([0x90, 60, 0]);
    midi.flush();
    assert.deepEqual(midi.sent.filter(m => m.length === 3), [[0x90, 60, 100], [0x90, 60, 0]]);
    assert.equal(midi.active.size, 0);
    if (clockRunning) assert.ok(midi.sent.some(m => m[0] === 0xf8));
});

test('pending chord keeps Voice order and releases every channel, including true 0x80 Note Off', async () => {
    const midi = await worker();
    for (let i = 0; i < 16; i++) midi.send([0x90 | i, 60, 100]);
    for (let i = 15; i >= 0; i--) midi.send([0x80 | i, 60, 0]);
    midi.flush();
    assert.deepEqual(midi.sent.filter(m => (m[0] & 0xf0) === 0x90).map(m => m[0] & 15), Array.from({ length: 16 }, (_, i) => i));
    assert.equal(midi.active.size, 0);
    assert.equal(midi.sent.length, 32);
});

test('a full bounded queue preserves every queued onset/release pair without a hanging note', async () => {
    const midi = await worker();
    for (let i = 0; i < 128; i++) {
        const status = 0x90 | (i % 16), note = 60 + Math.floor(i / 16);
        midi.send([status, note, 100]); midi.send([status, note, 0]);
    }
    midi.flush();
    assert.equal(midi.sent.length, 256);
    assert.equal(midi.active.size, 0);
    assert.equal(midi.errors.length, 0);
});

test('an already-sent note is released before a later retrigger; invalidated previews do not block releases', async () => {
    const midi = await worker();
    midi.send([0x90, 60, 100]); midi.flush();
    midi.send([0x90, 60, 0]); midi.send([0x90, 60, 111]); midi.flush();
    assert.deepEqual(midi.sent, [[0x90, 60, 100], [0x90, 60, 0], [0x90, 60, 111]]);
    midi.send([0x90, 60, 0]);
    midi.send([0x90, 64, 100], { previewEpoch: 0, previewExpiresAt: Date.now() + 10000 });
    midi.send([0x90, 64, 0]);
    midi.command({ type: 'INVALIDATE_PREVIEWS', epoch: 1 }); midi.flush();
    assert.equal(midi.active.size, 0);
    assert.ok(!midi.sent.some(m => m[1] === 64 && m[2] > 0));
});

test('retrigger keeps On/Off/On order; an unrelated Note Off retains priority', async () => {
    const midi = await worker();
    midi.send([0x90, 60, 100]); midi.send([0x90, 60, 0]); midi.send([0x90, 60, 111]);
    midi.send([0x80, 35, 0]); midi.flush();
    assert.deepEqual(midi.sent.filter(m => m[1] === 60), [[0x90, 60, 100], [0x90, 60, 0], [0x90, 60, 111]]);
    midi.send([0x90, 60, 0]); midi.flush();
    assert.equal(midi.active.size, 0);
    const priority = await worker();
    priority.send([0x90, 60, 100]); priority.send([0x80, 35, 0]); priority.flush();
    assert.deepEqual(priority.sent[0], [0x80, 35, 0]);
});

const { LiRythmeState, LiRythmeClock, LiRythmeActions } = await loadEngine();
for (const source of ['INTERNAL', 'MIDI']) for (const modulation of [false, true])
test(`Chain transitions leave no sustained note after a delayed worker turn; source=${source}, modulation=${modulation}`, async () => {
    const midi = await worker(), state = new LiRythmeState(), clock = new LiRythmeClock(state), actions = new LiRythmeActions(state, clock);
    state.padConfiguration.voices[0] = { id: 0, type: 'KEY GROUP', gate: 100, channel: 1, output: { mode: 'DEFAULT' } };
    for (const id of [0, 1]) {
        state.getMotif(id).motifLength = 2;
        state.getMotif(id).events[0][0] = state.getMotif(id).events[0][1] = true;
        if (id === 1) {
            state.getMotif(id).keyGroups = Array.from({ length: 16 }, () => Array(32).fill(null));
            state.getMotif(id).keyGroups[0][0] = state.getMotif(id).keyGroups[0][1] = { degree: 4 };
        }
    }
    state.chainEnabled = true; state.chain = [0, 1, 0];
    state.modulationRequested = modulation;
    const overlay = state.forSystem('MODULATION').getMotif(0);
    overlay.motifLength = 2;
    overlay.attributes.KEY_GROUP = Array.from({ length: 16 }, () => Array(32).fill(null));
    overlay.attributes.KEY_GROUP[0][1] = { degree: 2 };
    overlay.attributes.RATCHET = Array.from({ length: 16 }, () => Array(32).fill(null));
    overlay.attributes.RATCHET[0][1] = 2;
    let now = 0;
    const jobs = [];
    const later = (fn, delay) => { const job = { fn, at: now + delay }; jobs.push(job); return job; };
    const timing = new SwingTiming(state, clock, { now: () => now, later,
        cancel: job => { job.cancelled = true; } });
    Object.defineProperty(state, 'noteTiming', { value: timing });
    actions.onCancelDelayedNotes = () => timing.reset();
    const app = await sourceFile('app.js');
    const body = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const trigger = new Function('state', 'midiOutputSelector', 'midiManager', 'launchpad', 'setTimeout', body + '; return triggerMotifStep;')(
        state, { options: [{ textContent: 'Synth' }], selectedIndex: 0 },
        { send: (_, message) => midi.send(message), findOutput: () => ({}) }, { pulseInstrument() {} }, later);
    actions.setClockStepHandler(() => trigger(state.playheadPosition));
    clock.setSource(source); actions.startPlayback(); trigger(0);
    const visited = new Set([state.chainPlayingIndex]);
    const finishTimers = () => {
        while (jobs.length) {
            jobs.sort((a, b) => a.at - b.at);
            const job = jobs.shift(); now = job.at; if (!job.cancelled) job.fn();
        }
    };
    for (let step = 0; step < 8; step++) {
        finishTimers();
        if (source === 'MIDI') for (let pulse = 0; pulse < 6; pulse++) clock.receiveMidiClockPulse();
        else clock.advanceStepPipeline();
        visited.add(state.chainPlayingIndex);
        // A slow output turn can receive both a note and its release together.
        if (step % 2) midi.flush();
    }
    finishTimers(); midi.flush(); actions.stop();
    assert.equal(visited.size, 3);
    assert.equal(midi.errors.length, 0);
    assert.equal(midi.active.size, 0);
    if (modulation) assert.ok(midi.sent.some(m => m[1] === 64 && m[2] > 0));
});
