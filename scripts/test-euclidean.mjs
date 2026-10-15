import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EUCLIDEAN_SLOT, euclideanPattern, euclideanOnsets } from '../src/Euclidean.mjs';
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from '../src/MotifBankFormat.mjs';
import { readATPanel } from '../src/PlayATUI.mjs';
import { SwingTiming } from '../src/SwingTiming.mjs';
import { readPlayCycle } from '../src/PlayCycleUI.mjs';

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
async function load(file, imports = {}) {
    let text = await source(file);
    imports['./ATTransaction.mjs'] = new URL('../src/ATTransaction.mjs', import.meta.url).href;
    for (const [key, value] of Object.entries(imports)) text = text.replace(JSON.stringify(key), JSON.stringify(value));
    return `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
}
const { LiRythmeState } = await import(await load('LiRythmeState.js', { './PadConfiguration.js': await load('PadConfiguration.js') }));
const { LiRythmeActions } = await import(await load('LiRythmeActions.js'));
const { LiRythmeClock } = await import(await load('LiRythmeClock.js'));
const imports = {};
for (const file of ['LaunchpadMapping.js', 'LaunchpadColors.js', 'GenesisLayout.js']) imports[`./${file}`] = await load(`hardware/launchpad/${file}`);
const { LaunchpadMini } = await import(await load('hardware/launchpad/LaunchpadMini.js', imports));
function setup() {
    const state = new LiRythmeState(), clock = new LiRythmeClock(state), actions = new LiRythmeActions(state, clock);
    return { state, clock, actions };
}
function configure(actions, voice, resolution, hits, mode = 0) {
    assert.equal(actions.at.select('instruments', voice), true);
    assert.equal(actions.at.setEuclideanStep(resolution - 1, { resolution: true }), true);
    if (hits) assert.equal(actions.at.setEuclideanStep(hits - 1), true);
    assert.equal(actions.at.apply(mode), true);
}

test('all Euclidean densities preserve hit count, first hit and balanced cyclic gaps', () => {
    for (let resolution = 1; resolution <= 32; resolution++) for (let hits = 0; hits <= resolution; hits++) {
        const pattern = euclideanPattern(resolution, hits), indices = pattern.flatMap((hit, i) => hit ? [i] : []);
        assert.equal(indices.length, hits);
        assert.equal(pattern.length, 32);
        if (!hits) continue;
        assert.equal(indices[0], 0);
        const gaps = indices.map((i, k) => (indices[k + 1] ?? resolution) - i);
        assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1);
    }
});

test('polyrythmic positions are exact fractions, with no duplicates or losses for all 1–32 resolutions and measures', () => {
    for (let resolution = 1; resolution <= 32; resolution++) for (let duration = 1; duration <= 32; duration++) {
        const motif = { euclidean: [{ resolution, hits: resolution, mode: 'POLYRHYTHMIC' }], voiceLengths: [resolution], events: [euclideanPattern(resolution, resolution)] };
        const positions = Array.from({ length: duration }, (_, step) => euclideanOnsets(motif, 0, step, duration)
            .map(onset => { assert.ok(onset.offset >= 0 && onset.offset < 1); return step + onset.offset; })).flat();
        assert.equal(positions.length, resolution);
        positions.forEach((value, i) => assert.ok(Math.abs(value - i * duration / resolution) < 1e-12));
    }
});

test('entry requires an empty Motif, supports reopening, rejects Modulation and Groove Morph', () => {
    const { state, actions } = setup();
    state.motif[0][0] = true;
    assert.equal(actions.at.begin(EUCLIDEAN_SLOT), false);
    state.motif[0][0] = false;
    state.motifs[0].grooveMorph = { level: 0 };
    assert.equal(actions.at.begin(EUCLIDEAN_SLOT), false);
    delete state.motifs[0].grooveMorph;
    assert.equal(actions.at.begin(EUCLIDEAN_SLOT), true);
    configure(actions, 0, 16, 5);
    actions.at.finish(true);
    assert.equal(actions.at.begin(EUCLIDEAN_SLOT), true);
    actions.at.finish(false);
    state.currentTimeline = 'MODULATION';
    assert.equal(actions.at.begin(EUCLIDEAN_SLOT), false);
});

test('per-voice settings, mode, H measure, CANCEL, COMMIT and persistence remain isolated', () => {
    const { state, actions } = setup();
    const original = snapshotMotifBank(state);
    let saves = 0; state.onBankChange = () => saves++;
    actions.at.begin(EUCLIDEAN_SLOT);
    configure(actions, 0, 16, 5);
    configure(actions, 1, 12, 3, 1);
    actions.at.setEuclideanStep(7, { duration: true });
    assert.equal(state.getMotifDuration(), 8);
    assert.deepEqual(state.motifs[0].euclidean.slice(0, 2), [
        { resolution: 16, hits: 5, mode: 'POLYMETRIC' }, { resolution: 12, hits: 3, mode: 'POLYRHYTHMIC' }]);
    assert.equal(readATPanel(state).selected, 1);
    assert.deepEqual(snapshotMotifBank(state), original);
    assert.equal(saves, 0);
    actions.at.finish(false);
    assert.deepEqual(snapshotMotifBank(state), original);
    actions.at.begin(EUCLIDEAN_SLOT); configure(actions, 0, 16, 5, 1);
    actions.at.setEuclideanStep(11, { duration: true }); actions.at.finish(true);
    assert.equal(saves, 1);
    const saved = snapshotMotifBank(state), target = setup().state;
    restoreMotifBank(target, saved);
    assert.deepEqual(snapshotMotifBank(target), saved);
    const invalid = structuredClone(saved); invalid.motifs[0].euclidean[0].hits = 17;
    assert.throws(() => validateMotifBank(invalid));
    assert.equal(state.motifs[1].euclidean, undefined);
});

test('Launchpad selection, resolution RED, hits GREEN, blinking B measure and held releases', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { state, actions } = setup();
    const controller = new LaunchpadMini({ send: () => {} }, state, actions, 'LP');
    t.after(() => controller.resetInputState());
    const press = (note, status = 0x90) => controller.handleMidiMessage([status, note, 127]);
    const release = (note, status = 0x90) => controller.handleMidiMessage([status, note, 0]);
    const tap = note => { press(note); release(note); };
    const { mapping: m, colors } = controller;
    const leds = new Map();
    controller.sendController = (_, message) => leds.set(`${message[0]}:${message[1]}`, message[2] & 0x33);
    const colorB = () => leds.get(`144:${m.AT_VALUE[1]}`);
    tap(m.BOOKS[EUCLIDEAN_SLOT]); assert.equal(state.atTransaction.kind, 'EUCLIDEAN');
    tap(m.INSTRUMENTS[0]);
    assert.equal(leds.get(`144:${m.INSTRUMENTS[0]}`), colors.YELLOW & 0x33);
    press(m.TOP_CONTROLS.SHIFT, 0xB0); tap(m.MOTIF[15]); release(m.TOP_CONTROLS.SHIFT, 0xB0);
    tap(m.MOTIF[4]);
    assert.equal(controller.getMotifStepColor(15), colors.RED);
    assert.equal(controller.getMotifStepColor(4), colors.GREEN);
    tap(m.AT_VALUE[1]); assert.equal(state.motifs[0].euclidean[0].mode, 'POLYRHYTHMIC');
    assert.equal(colorB(), colors.RED & 0x33);
    t.mock.timers.tick(160); assert.equal(colorB(), colors.OFF & 0x33);
    t.mock.timers.tick(160); assert.equal(colorB(), colors.RED & 0x33);
    press(m.AT_VALUE[1]); tap(m.MOTIF[11]); release(m.AT_VALUE[1]);
    assert.equal(state.motifLength, 12); assert.equal(controller.switchPressed, false);
    assert.equal(controller.euclideanDurationHeld, false);
    assert.equal(colorB(), colors.RED & 0x33);
    t.mock.timers.tick(160); assert.equal(colorB(), colors.RED & 0x33);
    press(m.AT_VALUE[1]); tap(m.MOTIF[7]); release(m.AT_VALUE[1]);
    assert.equal(state.motifLength, 8);
    tap(m.AT_VALUE[7]); assert.equal(state.motifLength, 8);
    assert.equal(leds.get(`144:${m.AT_VALUE[7]}`), colors.OFF & 0x33);
    tap(m.INSTRUMENTS[1]);
    assert.equal(leds.get(`144:${m.INSTRUMENTS[0]}`), colors.DIM_GREEN & 0x33);
    assert.equal(leds.get(`144:${m.INSTRUMENTS[1]}`), colors.YELLOW & 0x33);
    assert.equal(controller.getMotifStepColor(4), colors.OFF);
    press(m.BOOKS[EUCLIDEAN_SLOT]); t.mock.timers.tick(300); release(m.BOOKS[EUCLIDEAN_SLOT]);
    assert.equal(state.atTransaction, null); assert.equal(state.motifs[0].euclidean[0].hits, 5);
});

test('polymetric follows clock Steps; polyrythmic compresses each independent cycle into H measure', () => {
    const { state, actions } = setup();
    actions.at.begin(EUCLIDEAN_SLOT); configure(actions, 0, 16, 5); configure(actions, 1, 12, 3, 1);
    actions.at.setEuclideanStep(15, { duration: true }); actions.at.finish(true);
    const metric = [], rhythmic = [];
    for (let step = 0; step < 16; step++) {
        for (const onset of state.getVoiceOnsets(0, step)) if (state.getPlayingEvent(0, step, onset.step)) metric.push(step + onset.offset);
        for (const onset of state.getVoiceOnsets(1, step)) rhythmic.push(step + onset.offset);
    }
    assert.deepEqual(metric, [0, 4, 7, 10, 13]);
    assert.deepEqual(rhythmic, [0, 16 / 3, 32 / 3]);
    state.selectedInstrument = 1;
    state.playheadPosition = 5;
    assert.equal(readPlayCycle(state).voice.position, 5 * 12 / 16);
});

test('shrinking resolution clamps density; duration works before instrument selection; saved recipes cannot become Groove Morph', () => {
    const { state, actions } = setup();
    actions.at.begin(EUCLIDEAN_SLOT);
    assert.equal(actions.at.setEuclideanStep(5), false);
    assert.equal(actions.at.setEuclideanStep(11, { duration: true }), true);
    configure(actions, 0, 16, 12);
    actions.at.setEuclideanStep(7, { resolution: true });
    assert.equal(state.motifs[0].euclidean[0].hits, 8);
    assert.equal(state.motifs[0].events[0].filter(Boolean).length, 8);
    assert.equal(actions.at.apply(2), false);
    actions.at.finish(true);
    state.selectedInstrument = 0;
    state.setTargetLength(4);
    assert.equal(state.motifs[0].euclidean[0].resolution, 4);
    assert.equal(state.motifs[0].euclidean[0].hits, 4);
    actions.toggleInstrumentStep(1);
    assert.equal(state.motifs[0].euclidean[0].hits, 3);
    actions.clearMotifEvents(0);
    // Other Euclidean recipes remain mutually exclusive with a Groove Morph block.
    assert.equal(actions.at.beginGrooveMorph(), false);
});

test('COPY, Voice COPY, DELETE and DOUBLE preserve or clear Euclidean metadata', () => {
    const { state, actions } = setup();
    actions.at.begin(EUCLIDEAN_SLOT); configure(actions, 0, 8, 3, 1); actions.at.finish(true);
    assert.equal(actions.applyMotifCopy(actions.captureMotifCopy(0), 1), true);
    assert.deepEqual(state.motifs[1].euclidean, state.motifs[0].euclidean);
    const voice = actions.captureMusicalCopy('VOICE', 0);
    assert.equal(actions.applyVoiceCopy(voice, 2), true);
    assert.deepEqual(state.motifs[0].euclidean[2], state.motifs[0].euclidean[0]);
    state.selectedInstrument = 0;
    assert.equal(actions.doubleSelected(), true);
    assert.equal(state.motifs[0].euclidean[0].resolution, 16);
    assert.equal(state.motifs[0].euclidean[0].hits, 6);
    actions.clearMotifEvents(2); assert.equal(state.motifs[0].euclidean[2], null);
    actions.clearMotifEvents(); assert.equal(state.motifs[0].euclidean, undefined);
});

test('PLAY edits keep engaged geometry and recipe until boundary; CANCEL restores the recipe', () => {
    const { state, actions } = setup();
    actions.at.begin(EUCLIDEAN_SLOT); configure(actions, 0, 8, 3, 1);
    actions.at.setEuclideanStep(7, { duration: true }); actions.at.finish(true);
    actions.startPlayback(); state.playheadPosition = 2;
    const before = structuredClone(state.motifs[0]);
    actions.at.begin(EUCLIDEAN_SLOT); configure(actions, 0, 16, 5, 1);
    actions.at.setEuclideanStep(11, { duration: true });
    assert.deepEqual(state.getPlaybackMotifForVoice(0), before);
    assert.equal(state.liveLengthCycle.duration, 8);
    actions.at.finish(false);
    assert.deepEqual(state.motifs[0], before);
    while (state.playheadPosition) state.advanceLiveLengthCycle();
    assert.equal(state.liveLengthCycle, null);
    assert.deepEqual(state.getPlaybackMotifForVoice(0), before);
});

function timer() {
    let now = 0, next = 0; const jobs = new Map();
    const api = { now: () => now, later(fn, ms) { const id = ++next; jobs.set(id, { at: now + ms, fn }); return id; }, cancel: id => jobs.delete(id) };
    return { api, run(time) {
        while (true) {
            const entry = [...jobs].filter(([, job]) => job.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            const [id, job] = entry; jobs.delete(id); now = Math.max(now, job.at); job.fn();
        }
        now = time;
    } };
}
for (const type of ['MIDI DRUM', 'AUDIO']) for (const sourceName of ['INTERNAL', 'MIDI'])
test(`actual dispatch ${type}/${sourceName}: fractional and multiple onsets, feedback, STOP cancellation`, async () => {
    const { state, clock, actions } = setup();
    state.padConfiguration.voices[0] = { type, channel: 1, note: 36, output: { mode: 'DEFAULT' } };
    actions.at.begin(EUCLIDEAN_SLOT); configure(actions, 0, 3, 3, 1);
    actions.at.setEuclideanStep(0, { duration: true }); actions.at.finish(true);
    const time = timer(), starts = [], leds = [], messages = [];
    state.noteTiming = new SwingTiming(state, clock, time.api);
    clock.setSource(sourceName);
    if (sourceName === 'MIDI') { for (let pulse = 0; pulse < 7; pulse++) { time.run(pulse * 10); state.noteTiming.observeMidiPulse(); } }
    const app = await source('app.js');
    const body = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const trigger = new Function('state', 'audioPlayer', 'midiOutputSelector', 'midiManager', 'launchpad', 'setTimeout', body + ';return triggerMotifStep;')(
        state, { trigger: () => { starts.push(time.api.now()); return true; } }, { options: [{ textContent: 'Drums' }], selectedIndex: 0 },
        { send: (_, message) => { messages.push([time.api.now(), message]); if (message[2]) starts.push(time.api.now()); }, findOutput: () => ({}) },
        { pulseInstrument: voice => leds.push([time.api.now(), voice]) }, time.api.later);
    state.transportState = 'PLAY';
    const origin = time.api.now(); trigger(0);
    const duration = state.noteTiming.duration;
    time.run(origin + duration);
    assert.equal(starts.length, 3);
    starts.forEach((value, i) => assert.ok(Math.abs(value - origin - i * duration / 3) < 1e-9));
    assert.equal(leds.length, 3);
    if (type === 'MIDI DRUM') {
        const offTimes = messages.filter(([, msg]) => !msg[2]).map(([time]) => time);
        assert.equal(offTimes.length, 3);
        assert.ok(offTimes[0] < starts[1] && offTimes[1] < starts[2]);
    }
    trigger(0); state.transportState = 'STOP';
    time.run(origin + duration * 2);
    assert.equal(starts.length, 4);
});
