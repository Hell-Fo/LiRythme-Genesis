import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { AT_SLOTS, RATCHET_VALUES } from "../src/ATTransaction.mjs";
import { SwingTiming, readSwing, readRatchet, ratchetPlan } from "../src/SwingTiming.mjs";
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from "../src/MotifBankFormat.mjs";
import { readATPanel } from "../src/PlayATUI.mjs";

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
async function load(file, imports = {}) {
    let text = await source(file);
    imports["./ATTransaction.mjs"] = new URL("../src/ATTransaction.mjs", import.meta.url).href;
    for (const [key, value] of Object.entries(imports)) text = text.replace(JSON.stringify(key), JSON.stringify(value));
    return `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
}
const { LiRythmeState } = await import(await load("LiRythmeState.js", { "./PadConfiguration.js": await load("PadConfiguration.js") }));
const { LiRythmeActions } = await import(await load("LiRythmeActions.js"));
const { LiRythmeClock } = await import(await load("LiRythmeClock.js"));
const imports = {};
for (const file of ["LaunchpadMapping.js", "LaunchpadColors.js", "GenesisLayout.js"]) imports[`./${file}`] = await load(`hardware/launchpad/${file}`);
const { LaunchpadMini } = await import(await load("hardware/launchpad/LaunchpadMini.js", imports));
function setup() {
    const state = new LiRythmeState(), clock = new LiRythmeClock(state), actions = new LiRythmeActions(state, clock);
    return { state, clock, actions };
}
function apply(actions, instruments = [], steps = [], index = 0) {
    assert.equal(actions.at.begin(3), true);
    for (const v of instruments) actions.at.select("instruments", v, true);
    for (const s of steps) actions.at.select("steps", s, true);
    const result = actions.at.apply(index);
    actions.at.finish(true);
    return result;
}
function timer() {
    let now = 0, next = 0;
    const jobs = new Map();
    const api = { now: () => now, later(fn, ms) { const id = ++next; jobs.set(id, { at: now + ms, fn }); return id; }, cancel: id => jobs.delete(id) };
    return { api, jobs, jump: time => { now = time; }, run(time) {
        while (true) {
            const entry = [...jobs].filter(([, job]) => job.at <= time).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!entry) break;
            const [id, job] = entry; jobs.delete(id); now = Math.max(now, job.at); job.fn();
        }
        now = time;
    } };
}

test('RATCHET fourth Book pad, A–H scale, display and event-only VALUE feedback', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { state, actions } = setup(), leds = new Map();
    const c = new LaunchpadMini({ send: (_, [, note, color]) => leds.set(note, color) }, state, actions, 'LP');
    t.after(() => c.resetInputState());
    const tap = note => { c.handleMidiMessage([0x90, note, 127]); c.handleMidiMessage([0x90, note, 0]); };
    assert.equal(c.getATBookColor(3), 'RED');
    tap(c.mapping.BOOKS[3]); assert.equal(state.atTransaction.slot, 3);
    state.motif[0][0] = true;
    assert.deepEqual(RATCHET_VALUES, [8, 7, 6, 5, 4, 3, 2, 1]);
    for (let i = 0; i < 8; i++) {
        tap(c.mapping.AT_VALUE[i]);
        assert.equal(state.motifs[0].ratchets[0][0], 8 - i);
        assert.equal(state.motifs[0].ratchets[1][0], null);
        assert.equal(readATPanel(state).values[i], `${8 - i}×`);
    }
    for (let i = 0; i < 40; i++) t.mock.timers.tick(4);
    c.drawATValues(); assert.equal(leds.get(c.mapping.AT_VALUE[7]), (c.colors.RED & 0x33) | 4);
    state.playheadPosition = 1; c.drawATValues();
    assert.equal(leds.get(c.mapping.AT_VALUE[7]), (c.colors.DIM_AMBER & 0x33) | 4);
});

test('RATCHET empty/mixed targets, CANCEL, and provisional autosave do not create orphan values', () => {
    const { state, actions } = setup();
    assert.equal(apply(actions, [], [2]), false); assert.equal(state.motifs[0].ratchets, undefined);
    state.motif[0][2] = state.motif[1][3] = state.motif[2][2] = true;
    actions.at.begin(3); actions.at.select('instruments', 0); actions.at.select('instruments', 1, true);
    actions.at.select('steps', 2); actions.at.select('steps', 3, true); actions.at.apply(0);
    assert.equal(state.motifs[0].ratchets[0][2], 8); assert.equal(state.motifs[0].ratchets[1][3], 8);
    assert.equal(state.motifs[0].ratchets[0][3], null); assert.equal(state.motifs[0].ratchets[2][2], null);
    assert.equal(snapshotMotifBank(state).motifs[0].ratchets, undefined);
    actions.at.finish(false); assert.equal(state.motifs[0].ratchets, undefined);
});

test('RATCHET Modulation crosses Voice/Step cycles, explicit 1 overrides only RATCHET and DELETE clears it', () => {
    const { state, actions } = setup();
    state.motif[0].fill(true); state.motif[1].fill(true); apply(actions, [0], [], 0);
    const mod = state.modulation; mod.motifLength = 6;
    state.currentTimeline = 'MODULATION'; apply(actions, [0], [0, 2], 7);
    state.modulationActive = true;
    for (let i = 0; i < 24; i++) {
        state.playheadPosition = i % 8; mod.playheadPosition = i % 6;
        assert.equal(readRatchet(state, 0), [0, 2].includes(i % 6) ? 1 : 8);
        assert.equal(readRatchet(state, 1), 1);
        assert.deepEqual(state.getPlayingEvent(0), { velocity: 100, color: false });
    }
    assert.ok(mod.motif.every(row => row.every(v => !v)));
    state.selectedInstrument = 0; actions.deleteTarget('STEP', 2);
    assert.equal(mod.motifs[0].attributes.RATCHET[0][2], null);
    mod.playheadPosition = 2; assert.equal(readRatchet(state, 0), 8);
    state.motif[0].fill(false); assert.equal(state.getPlayingEvent(0), null);
});

for (const whole of [false, true]) test(`RATCHET edits and CANCEL are immediate for ${whole ? 'Motif' : 'Voice'}`, () => {
    const { state, actions } = setup();
    state.motif[0].fill(true); state.motifs[0].voiceLengths[0] = 3; state.motifLength = 8;
    state.transportState = 'PLAY'; state.playheadPosition = 1;
    actions.at.begin(3); if (!whole) actions.at.select('instruments', 0);
    actions.at.apply(0);
    assert.equal(state.motifs[0].ratchets[0][1], 8); assert.equal(readRatchet(state, 0), 8);
    assert.equal(state.playheadPosition, 1); assert.equal(state.liveLengthCycle, null);
    for (let i = 0; i < (whole ? 7 : 2); i++) actions.nextStep();
    assert.equal(readRatchet(state, 0), 8);
    actions.at.finish(false); assert.equal(state.motifs[0].ratchets, undefined);
    assert.equal(readRatchet(state, 0), 1);
    for (let i = 0; i < (whole ? 8 : 3); i++) actions.nextStep();
    assert.equal(readRatchet(state, 0), 1);
});

test('RATCHET persists, validates, copies, rotates, doubles and resets with its events', () => {
    const { state, actions } = setup();
    state.selectedInstrument = 0; state.voiceLengths[0] = 4; state.motif[0][1] = true;
    apply(actions, [0], [1], 2);
    const saved = snapshotMotifBank(state), fresh = setup().state;
    restoreMotifBank(fresh, saved); saved.motifs[0].ratchets[0][1] = 0;
    assert.equal(fresh.motifs[0].ratchets[0][1], 6); assert.throws(() => validateMotifBank(saved));
    actions.at.begin(8); actions.at.select('instruments', 0); actions.at.rotate(1); actions.at.finish(true);
    assert.equal(state.motifs[0].ratchets[0][1], null); assert.equal(state.motifs[0].ratchets[0][2], 6);
    assert.ok(actions.doubleSelected()); assert.equal(state.motifs[0].ratchets[0][6], 6);
    assert.ok(actions.applyVoiceCopy(actions.captureMusicalCopy('VOICE', 0), 1));
    assert.equal(state.motifs[0].ratchets[1][6], 6);
    assert.ok(actions.applyMotifCopy(actions.captureMotifCopy(0), 2)); assert.equal(state.motifs[2].ratchets[1][6], 6);
    actions.clearMotifEvents(1); assert.equal(state.motifs[0].ratchets[1][6], null);
    actions.toggleInstrumentStep(2); assert.equal(state.motifs[0].ratchets[0][2], null);
    actions.at.resetMotif(); assert.equal(state.motifs[0].ratchets, undefined);
});

async function dispatcher({ count = 4, swing = 50, tempo = 120, type = 'MIDI DRUM' } = {}) {
    const { state, actions, clock } = setup(), time = timer();
    state.tempo = tempo; state.motifLength = 2; state.motif[0][1] = true;
    state.padConfiguration.voices[0] = type === 'AUDIO' ? { type, source: 'kick.wav', output: 'LEFT' }
        : { type, note: 36, colorNote: 40, channel: 2, output: { mode: 'DEFAULT' } };
    apply(actions, [0], [1], 8 - count);
    state.motifs[0].swings = Array.from({ length: 16 }, () => Array(32).fill(null)); state.motifs[0].swings[0][1] = swing;
    state.motifs[0].colors = Array.from({ length: 16 }, () => Array(32).fill(false)); state.motifs[0].colors[0][1] = true;
    const timing = new SwingTiming(state, clock, time.api); Object.defineProperty(state, 'noteTiming', { value: timing });
    actions.onCancelDelayedNotes = () => timing.reset();
    const notes = [], audio = [], leds = [], app = await source('app.js');
    const body = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const trigger = new Function('state', 'audioPlayer', 'midiOutputSelector', 'midiManager', 'launchpad', 'setTimeout', body + ';return triggerMotifStep;')(
        state, { trigger: (voice, velocity) => { audio.push([time.api.now(), voice.source, velocity]); return true; } },
        { options: [{ textContent: 'Drums' }], selectedIndex: 0 },
        { send: (port, msg) => notes.push({ time: time.api.now(), port, msg }), findOutput: () => ({}) },
        { pulseInstrument: voice => leds.push([time.api.now(), voice]) }, time.api.later);
    state.transportState = 'PLAY'; state.playheadPosition = 1;
    return { state, actions, clock, time, timing, notes, audio, leds, trigger };
}

for (const type of ['MIDI DRUM', 'AUDIO']) test(`RATCHET actual ${type}: 1–8 strikes stay inside the Step after SWING at 120/300 BPM`, async () => {
    for (const tempo of [120, 300]) for (const swing of [50, 75]) for (let count = 1; count <= 8; count++) {
        const d = await dispatcher({ count, swing, tempo, type });
        const duration = d.state.getStepDurationMs(), delay = duration * (swing - 50) / 50;
        d.trigger(1); d.time.run(duration + 50);
        const starts = type === 'AUDIO' ? d.audio.map(([time]) => time) : d.notes.filter(n => n.msg[2]).map(n => n.time);
        const expected = ratchetPlan(duration, delay, count).offsets;
        assert.deepEqual(starts, expected); assert.ok(starts.every(time => time < duration));
        assert.deepEqual(d.leds.map(([time]) => time), expected);
        if (type === 'MIDI DRUM') {
            assert.equal(d.notes.length, count * 2);
            for (let i = 0; i < count; i++) {
                assert.deepEqual(d.notes[2 * i].msg, [0x91, 40, 100]); assert.deepEqual(d.notes[2 * i + 1].msg, [0x91, 40, 0]);
                assert.equal(d.notes[2 * i].port, 'Drums');
            }
        }
        assert.equal(d.state.playheadPosition, 1); assert.equal(d.clock.transportRevision, 0);
    }
});

test('RATCHET pending Note Off cannot cut a retrigger when its timer is delivered late', async () => {
    const d = await dispatcher(); d.trigger(1);
    const firstOff = [...d.time.jobs].find(([, job]) => job.at === 15.625);
    assert.ok(firstOff); d.time.jobs.delete(firstOff[0]);
    d.time.run(31.25);
    assert.deepEqual(d.notes.map(n => n.msg[2]), [100, 0, 100]);
    firstOff[1].fn(); assert.equal(d.notes.length, 3);
    d.actions.stop(); d.time.run(200); assert.deepEqual(d.notes.map(n => n.msg[2]), [100, 0, 100, 0]);
});

test('RATCHET STOP/PAUSE cancel remaining strikes, preserve Note Offs and do not replay on resume', async () => {
    for (const stop of ['stop', 'pausePlayback']) {
        const d = await dispatcher(); d.trigger(1); d.time.run(20); d.actions[stop]();
        d.actions.continuePlayback(); d.time.run(200);
        assert.deepEqual(d.notes.map(n => n.msg[2]), [100, 0]);
    }
});

test('RATCHET overdue strokes expire individually instead of catching up; next boundary cancels train', async () => {
    const d = await dispatcher({ count: 8 }); d.trigger(1);
    d.time.jump(90); d.time.run(90);
    const starts = d.notes.filter(n => n.msg[2]); assert.deepEqual(starts.map(n => n.time), [0, 90]);
    d.state.playheadPosition = 0; d.trigger(0); d.time.run(200);
    assert.equal(d.notes.filter(n => n.msg[2]).length, 2);
    assert.equal(d.notes.filter(n => !n.msg[2]).length, 2);
});

test('RATCHET STOP preview repeats immediately without SWING; next navigation discards remaining strikes', async () => {
    const d = await dispatcher({ swing: 75 }); d.actions.stop();
    d.trigger(1, 0, 'MOTIF'); d.time.run(31.25);
    assert.deepEqual(d.notes.filter(n => n.msg[2]).map(n => n.time), [0, 31.25]);
    d.trigger(0, 0, 'MOTIF'); d.time.run(200);
    assert.equal(d.notes.filter(n => n.msg[2]).length, 2);
});

test('RATCHET external MIDI duration and Modulation overlay use the same bounded scheduler', async () => {
    const d = await dispatcher({ count: 8 }); d.clock.source = 'MIDI';
    for (let i = 0; i < 25; i++) { d.time.jump(i * 10); d.timing.observeMidiPulse(); }
    d.state.modulation.motifs[0].attributes.RATCHET = Array.from({ length: 16 }, () => Array(32).fill(null));
    d.state.modulation.motifs[0].attributes.RATCHET[0][0] = 2; d.state.modulationActive = true;
    d.trigger(1); d.time.run(320);
    assert.deepEqual(d.notes.filter(n => n.msg[2]).map(n => n.time), [240, 270]);
    assert.equal(d.state.tempo, 120); assert.equal(d.clock.midiPulseCount, 0);
});


for (const system of ['MOTIF', 'MODULATION']) for (const slot of [0, 1, 2, 3]) {
    for (const transform of ['ROTATION', 'DOUBLE']) test(`${system} ${AT_SLOTS[slot].id} and CANCEL are immediate over pending ${transform}`, () => {
        const { state, actions, clock } = setup();
        state.colorEnabled = true; state.currentTimeline = system;
        const layer = state.forSystem(system); let motif = layer.getMotif(0);
        motif.motifLength = 8; motif.voiceLengths[0] = 4;
        if (system === 'MOTIF') motif.events[0][0] = motif.events[0][2] = true;
        else {
            motif.attributes.VELOCITY = Array.from({ length: 16 }, () => Array(32).fill(null));
            motif.attributes.VELOCITY[0][0] = motif.attributes.VELOCITY[0][2] = 77;
            state.motif[0].fill(true); state.modulationActive = true;
        }
        state.transportState = 'PLAY'; layer.playheadPosition = 1;
        if (transform === 'ROTATION') {
            actions.at.begin(8); actions.at.select('instruments', 0);
            assert.ok(actions.at.rotate(1)); actions.at.finish(true);
        } else {
            state.selectedInstrument = 0; assert.ok(actions.doubleSelected()); motif = layer.getMotif(0);
        }
        const cycle = layer.liveLengthCycle, temporal = layer.getPlaybackMotifForVoice(0);
        const original = structuredClone(temporal);
        const read = m => system === 'MODULATION' ? m.attributes[AT_SLOTS[slot].id]?.[0]?.[0]
            : m[['velocities', 'colors', 'swings', 'ratchets'][slot]]?.[0]?.[0];
        const revision = clock.transportRevision, untouched = layer.getPlaybackMotifForVoice(1);
        actions.at.begin(slot); actions.at.select('instruments', 0); assert.ok(actions.at.apply(0));
        assert.equal(read(temporal), AT_SLOTS[slot].values[0]);
        assert.deepEqual(temporal.events, original.events);
        if (system === 'MOTIF' && transform === 'ROTATION') {
            assert.equal(temporal.events[0][0], true); assert.equal(motif.events[0][0], false);
            assert.equal(temporal.events[0][1], false); assert.equal(motif.events[0][1], true);
        }
        assert.equal(layer.liveLengthCycle, cycle); assert.equal(layer.playheadPosition, 1);
        assert.equal(layer.getPlaybackMotifForVoice(1), untouched); assert.equal(clock.transportRevision, revision);
        actions.at.finish(false);
        assert.deepEqual(temporal, original);
        // A committed value survives the structural boundary without activating it early.
        actions.at.begin(slot); actions.at.select('instruments', 0); actions.at.apply(0); actions.at.finish(true);
        assert.equal(read(temporal), AT_SLOTS[slot].values[0]);
        layer.advanceLiveLengthCycle(); layer.advanceLiveLengthCycle();
        assert.equal(layer.getPlaybackMotifForVoice(0), temporal);
        layer.advanceLiveLengthCycle();
        assert.equal(layer.getPlaybackMotifForVoice(0), motif);
        const step = transform === 'ROTATION' ? 1 : 0;
        assert.equal(system === 'MODULATION' ? motif.attributes[AT_SLOTS[slot].id][0][step]
            : motif[['velocities', 'colors', 'swings', 'ratchets'][slot]][0][step], AT_SLOTS[slot].values[0]);
    });
}

for (const system of ['MOTIF', 'MODULATION']) test(`${system} live edits preserve an ongoing MIDI RATCHET train and affect the next event`, async () => {
    const d = await dispatcher({ count: 4 });
    d.trigger(1); d.time.run(5);
    d.state.currentTimeline = system; d.state.colorEnabled = true;
    if (system === 'MODULATION') d.state.modulationActive = true;
    for (const [slot, index] of [[0, 7], [1, 0], [1, 0], [2, 0], [3, 7]]) {
        // COLOR uses one transaction for ON then OFF.
        if (slot === 1 && d.state.atTransaction) { d.actions.at.apply(index); d.actions.at.finish(true); continue; }
        d.actions.at.begin(slot); d.actions.at.select('instruments', 0); d.actions.at.apply(index);
        if (slot !== 1) d.actions.at.finish(true);
    }
    d.time.run(125);
    assert.deepEqual(d.notes.filter(n => n.msg[2]).map(n => [n.time, n.msg[1], n.msg[2]]),
        [[0, 40, 100], [31.25, 40, 100], [62.5, 40, 100], [93.75, 40, 100]]);
    assert.equal(d.notes.filter(n => !n.msg[2]).length, 4);
    d.state.modulation.playheadPosition = 1;
    d.trigger(1); d.time.run(250);
    assert.deepEqual(d.notes.filter(n => n.msg[2]).at(-1), { time: 187.5, port: 'Drums', msg: [0x91, 36, 16] });
    assert.equal(d.notes.filter(n => n.msg[2]).length, 5);
    assert.equal(d.notes.filter(n => !n.msg[2]).length, 5);
});

for (const system of ['MOTIF', 'MODULATION']) test(`${system} whole SWING scope and CANCEL survive a pending local boundary`, () => {
    const { state, actions } = setup();
    state.currentTimeline = system; state.modulationActive = true;
    state.motif[0].fill(true); state.motif[1].fill(true);
    const layer = state.forSystem(system), motif = layer.getMotif(0);
    motif.motifLength = 8; motif.voiceLengths[0] = 3; motif.voiceLengths[1] = 5;
    state.transportState = 'PLAY'; layer.playheadPosition = 1;
    layer.deferDouble([0, 1], false);
    const snapshot = layer.getPlaybackMotifForVoice(0);
    actions.at.begin(2); actions.at.apply(0);
    assert.equal(snapshot.atDestinations.SWING[0][1], 'MOTIF');
    assert.equal(snapshot.atDestinations.SWING[1][1], 'MOTIF');
    assert.equal(readSwing(state, 0).value, 75);
    layer.advanceLiveLengthCycle(); layer.advanceLiveLengthCycle();
    assert.equal(layer.getPlaybackMotifForVoice(0), motif);
    assert.equal(layer.getPlaybackMotifForVoice(1), snapshot);
    actions.at.finish(false);
    assert.equal(readSwing(state, 0).value, 50); assert.equal(readSwing(state, 1).value, 50);
    assert.equal(layer.playheadPosition, 3); assert.equal(layer.getVoiceStep(1), 3);
});

for (const system of ['MOTIF', 'MODULATION']) test(`${system} reset clears temporal attributes without activating pending geometry`, () => {
    const { state, actions } = setup(); state.currentTimeline = system;
    const layer = state.forSystem(system), motif = layer.getMotif(0);
    motif.events[0][0] = system === 'MOTIF'; motif.motifLength = 8; motif.voiceLengths[0] = 4;
    apply(actions, [0], [], 0);
    state.transportState = 'PLAY'; layer.playheadPosition = 1;
    state.selectedInstrument = 0; actions.doubleSelected();
    const snapshot = layer.getPlaybackMotifForVoice(0), cycle = layer.liveLengthCycle;
    assert.ok(actions.at.resetMotif());
    assert.equal(snapshot.ratchets, undefined);
    if (system === 'MODULATION') assert.deepEqual(snapshot.attributes, {});
    assert.equal(snapshot.voiceLengths[0], 4); assert.equal(layer.getVoiceLength(0), 8);
    assert.equal(layer.liveLengthCycle, cycle); assert.equal(layer.playheadPosition, 1);
});

test('Modulation DELETE+Step removes temporal attributes while DOUBLE remains pending', () => {
    const { state, actions } = setup(); state.currentTimeline = 'MODULATION';
    const layer = state.modulation;
    layer.motifLength = 8; layer.voiceLengths[0] = 4; apply(actions, [0], [0]);
    state.transportState = 'PLAY'; layer.playheadPosition = 1; state.selectedInstrument = 0;
    actions.doubleSelected(); const snapshot = layer.getPlaybackMotifForVoice(0);
    assert.equal(snapshot.attributes.RATCHET[0][0], 8);
    assert.ok(actions.deleteModulationStep(0));
    assert.equal(snapshot.attributes.RATCHET[0][0], null);
    assert.equal(snapshot.voiceLengths[0], 4); assert.equal(layer.getVoiceLength(0), 8);
    assert.equal(layer.playheadPosition, 1);
});
