import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { SWING_VALUES } from "../src/ATTransaction.mjs";
import { SwingTiming, readSwing } from "../src/SwingTiming.mjs";
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from "../src/MotifBankFormat.mjs";
import { readATPanel } from "../src/PlayATUI.mjs";

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
async function load(file, imports = {}) {
    let text = await source(file);
    text = text.replace('"./LaunchpadATInput.mjs"', JSON.stringify(new URL("../src/hardware/launchpad/LaunchpadATInput.mjs", import.meta.url).href));
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
    assert.equal(actions.at.begin(2), true);
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

test("SWING hardware: third Book pad, all A–H values, percentage display and event-only LEDs", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions } = setup(), leds = new Map();
    const c = new LaunchpadMini({ send: (_, [, note, color]) => leds.set(note, color) }, state, actions, "LP");
    t.after(() => c.resetInputState());
    const tap = note => { c.handleMidiMessage([0x90, note, 127]); c.handleMidiMessage([0x90, note, 0]); };
    assert.equal(c.getATBookColor(2), "RED");
    tap(c.mapping.BOOKS[2]); assert.equal(state.atTransaction.slot, 2);
    state.motif[0][0] = true;
    assert.deepEqual(SWING_VALUES, [75, 72, 69, 66, 63, 58, 54, 50]);
    for (let index = 0; index < 8; index++) {
        tap(c.mapping.AT_VALUE[index]);
        assert.equal(state.motifs[0].swings[0][0], SWING_VALUES[index]);
        assert.equal(state.motifs[0].swings[1][0], null);
        assert.equal(readATPanel(state).values[index], `${SWING_VALUES[index]} %`);
    }
    for (let i = 0; i < 40; i++) t.mock.timers.tick(4);
    c.drawATValues();
    assert.equal(leds.get(c.mapping.AT_VALUE[7]), (c.colors.RED & 0x33) | 4);
    state.playheadPosition = 1; c.drawATValues();
    assert.equal(leds.get(c.mapping.AT_VALUE[7]), (c.colors.DIM_AMBER & 0x33) | 4);
});

test("SWING rejects empty targets, edits mixed Voice/Step selection without orphans, CANCEL and autosave", () => {
    const { state, actions } = setup();
    assert.equal(apply(actions, [], [3]), false);
    assert.equal(state.motifs[0].swings, undefined);
    state.motif[0][3] = state.motif[2][4] = true;
    assert.ok(actions.at.begin(2));
    actions.at.select("instruments", 0); actions.at.select("instruments", 1, true);
    actions.at.select("steps", 3); actions.at.select("steps", 4, true);
    assert.ok(actions.at.apply(3));
    assert.equal(state.motifs[0].swings[0][3], 66);
    assert.equal(state.motifs[0].swings[0][4], null);
    assert.equal(state.motifs[0].swings[1][3], null);
    assert.equal(state.motifs[0].swings[2][4], null);
    assert.equal(snapshotMotifBank(state).motifs[0].swings, undefined);
    actions.at.finish(false); assert.equal(state.motifs[0].swings, undefined);
});

test("SWING Motif parity and Voice parity diverge in odd local cycles; explicit Steps have no parity filter", () => {
    for (const [voices, steps, target, expected] of [
        [[], [], "MOTIF", [0, .5, 0, .5, 0, .5]],
        [[0], [], "INSTRUMENT", [0, .5, 0, 0, .5, 0]],
        [[0], [0, 2], "STEP", [.5, 0, .5, .5, 0, .5]]
    ]) {
        const { state, actions } = setup();
        state.motif[0].fill(true); state.motifs[0].voiceLengths[0] = 3; state.motifs[0].motifLength = 6;
        apply(actions, voices, steps);
        for (let step = 0; step < 6; step++) {
            state.playheadPosition = step;
            assert.equal(readSwing(state, 0).fraction, expected[step], `${target} step ${step}`);
        }
        state.playheadPosition = 0; assert.equal(readSwing(state, 0).fraction, expected[0]);
    }
});

test("SWING Modulation A/T-only overrides timing family including explicit 50%, without replacing velocity or COLOR", () => {
    const { state, actions } = setup();
    state.motif[0][1] = true; apply(actions, [], [1]);
    const base = state.motifs[0]; base.velocities = Array.from({ length: 16 }, () => Array(32).fill(81));
    base.colors = Array.from({ length: 16 }, () => Array(32).fill(true));
    state.playheadPosition = 1;
    state.currentTimeline = "MODULATION"; state.modulation.playheadPosition = 4;
    apply(actions, [], [4], 7); state.modulationActive = true;
    assert.equal(readSwing(state, 0).fraction, 0);
    assert.deepEqual(state.getPlayingEvent(0), { velocity: 81, color: true });
    assert.equal(state.modulation.motif[0][4], false);
    state.modulationActive = false; assert.equal(readSwing(state, 0).fraction, .5);
});

test("SWING edit is immediate without changing local or Motif phase; FOCUS edits VIEW without affecting PLAYING", () => {
    for (const whole of [false, true]) {
        const { state, actions } = setup();
        state.motif[0].fill(true); state.motifs[0].voiceLengths[0] = 3; state.motifs[0].motifLength = 8;
        state.transportState = "PLAY"; state.playheadPosition = 1;
        apply(actions, whole ? [] : [0]);
        assert.equal(state.motifs[0].swings[0][1], 75);
        assert.equal(readSwing(state, 0).value, 75);
        assert.equal(state.liveLengthCycle, null);
        assert.equal(state.playheadPosition, 1);
        for (let i = 0; i < (whole ? 7 : 2); i++) actions.nextStep();
        assert.equal(readSwing(state, 0).value, 75);
    }
    const { state, actions } = setup();
    state.chainFocus = true; state.viewMotifId = 1; state.motifs[1].events[0][0] = true;
    state.transportState = "PLAY"; apply(actions);
    assert.equal(state.motifs[0].swings, undefined); assert.equal(state.motifs[1].swings[0][0], 75);
    assert.equal(state.liveLengthCycle, null);
});

test("SWING persistence accepts legacy, isolates new rows and rejects invalid values", () => {
    const { state, actions } = setup();
    const legacy = snapshotMotifBank(state); restoreMotifBank(state, legacy);
    state.motif[0][0] = true; apply(actions, [0], [0], 4);
    const saved = snapshotMotifBank(state), restored = setup().state;
    restoreMotifBank(restored, saved); saved.motifs[0].swings[0][0] = 58;
    assert.equal(restored.motifs[0].swings[0][0], 63);
    saved.motifs[0].swings[0][0] = 76;
    assert.throws(() => validateMotifBank(saved));
});

test("SWING rotates and doubles with events, COPY retains scope, deletion and reset clear it", () => {
    const { state, actions } = setup();
    state.selectedInstrument = 0; state.motifs[0].voiceLengths[0] = 4;
    state.motif[0][1] = true; apply(actions, [0], [1], 4);
    actions.at.begin(8); actions.at.select("instruments", 0); actions.at.rotate(1); actions.at.finish(true);
    assert.equal(state.motifs[0].swings[0][1], null); assert.equal(state.motifs[0].swings[0][2], 63);
    assert.equal(actions.doubleSelected(), true); assert.equal(state.motifs[0].swings[0][6], 63);
    assert.equal(actions.applyVoiceCopy(actions.captureMusicalCopy("VOICE", 0), 1), true);
    assert.equal(state.motifs[0].swings[1][6], 63);
    assert.equal(state.motifs[0].atDestinations.SWING[1][6], "STEP");
    actions.clearMotifEvents(1); assert.equal(state.motifs[0].swings[1][6], null);
    actions.at.resetMotif(); assert.equal(state.motifs[0].swings, undefined);
});

test("SWING scheduler: fraction timing, cancellation, stale deadlines and external MIDI rate without clock mutation", () => {
    const { state, clock } = setup(), time = timer(), timing = new SwingTiming(state, clock, time.api);
    state.transportState = "PLAY";
    const played = [];
    timing.beginStep(); timing.schedule(62.5, () => played.push(time.api.now()));
    time.run(62); assert.deepEqual(played, []); time.run(62.5); assert.deepEqual(played, [62.5]);
    timing.beginStep(); timing.schedule(50, () => played.push("stale")); timing.reset(); time.run(200);
    timing.beginStep(); timing.schedule(50, () => played.push("blocked")); time.jump(400); time.run(400);
    assert.deepEqual(played, [62.5]);
    clock.source = "MIDI";
    for (let i = 0; i < 25; i++) { time.jump(500 + i * 10); timing.observeMidiPulse(); }
    timing.beginStep(); assert.equal(timing.duration, 60);
    assert.equal(state.tempo, 120); assert.equal(clock.midiPulseCount, 0); assert.equal(state.playheadPosition, 0);
    timing.schedule(30, () => played.push("old revision")); clock.advanceTransportRevision(); time.run(800);
    assert.deepEqual(played, [62.5]);
});

test("SWING real dispatch: composed MIDI delayed, Note Off follows onset, STOP cancels pending onset only, preview immediate", async () => {
    const { state, actions, clock } = setup(), time = timer();
    Object.defineProperty(state, "noteTiming", { value: new SwingTiming(state, clock, time.api) });
    actions.onCancelDelayedNotes = () => state.noteTiming.reset();
    state.padConfiguration.voices[0] = { type: "MIDI DRUM", channel: 2, note: 36, colorNote: 40, output: { mode: "DEFAULT" } };
    state.motif[0][1] = true; apply(actions, [0], [1]);
    state.motifs[0].colors = Array.from({ length: 16 }, () => Array(32).fill(true));
    const notes = [], leds = [], app = await source("app.js");
    const body = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", body + ";return triggerMotifStep;")(
        state, { options: [{ textContent: "Drums" }], selectedIndex: 0 },
        { send: (_, msg) => notes.push([time.api.now(), ...msg]), findOutput: () => ({}) },
        { pulseInstrument: v => leds.push([time.api.now(), v]) }, time.api.later);
    state.transportState = "PLAY"; state.playheadPosition = 1; trigger(1);
    assert.equal(notes.length, 0); time.run(62.5);
    assert.deepEqual(notes, [[62.5, 0x91, 40, 100]]); assert.deepEqual(leds, [[62.5, 0]]);
    actions.stop(); time.run(112.5);
    assert.deepEqual(notes[1], [112.5, 0x91, 40, 0]);
    state.transportState = "PLAY"; state.playheadPosition = 1; trigger(1); actions.pausePlayback(); time.run(300);
    assert.equal(notes.length, 2);
    actions.stop(); trigger(1, 0, "MOTIF"); assert.equal(notes.length, 3);
    assert.equal(notes[2][0], 300);
});

test("SWING AUDIO uses the same delay and pulse; a new step expires overdue onsets without a burst", async () => {
    const { state, clock, actions } = setup(), time = timer();
    Object.defineProperty(state, "noteTiming", { value: new SwingTiming(state, clock, time.api) });
    state.padConfiguration.voices[0] = { type: "AUDIO", source: "kick.wav", output: "LEFT" };
    state.motif[0][1] = true; apply(actions, [0], [1], 3);
    state.transportState = "PLAY"; state.playheadPosition = 1;
    const sounds = [], leds = [], app = await source("app.js");
    const body = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const trigger = new Function("state", "audioPlayer", "launchpad", body + ";return triggerMotifStep;")(
        state, { trigger: (voice, velocity) => { sounds.push([time.api.now(), voice.source, velocity]); return true; } },
        { pulseInstrument: v => leds.push([time.api.now(), v]) });
    trigger(1); time.run(39); assert.equal(sounds.length, 0); time.run(40);
    assert.deepEqual(sounds, [[40, "kick.wav", 100]]); assert.deepEqual(leds, [[40, 0]]);
    time.jump(125); trigger(1); // Still pending when a late next clock step arrives.
    time.jump(250); state.playheadPosition = 0; trigger(0); time.run(300);
    assert.equal(sounds.length, 1); assert.equal(time.jobs.size, 0);
});

test("SWING CANCEL and reset during PLAY take effect immediately", () => {
    const { state, actions } = setup();
    state.motif[0].fill(true); state.motifs[0].voiceLengths[0] = 3; state.motifs[0].motifLength = 8;
    state.transportState = "PLAY"; state.playheadPosition = 1;
    actions.at.begin(2); actions.at.select("instruments", 0); actions.at.apply(0);
    actions.nextStep(); actions.nextStep(); assert.equal(readSwing(state, 0).value, 75);
    actions.at.finish(false); assert.equal(state.motifs[0].swings, undefined);
    assert.equal(readSwing(state, 0).value, 50);
    for (let i = 0; i < 3; i++) actions.nextStep();
    assert.equal(readSwing(state, 0).value, 50);
    state.transportState = "STOP"; state.liveLengthCycle = null; apply(actions);
    state.transportState = "PLAY"; state.playheadPosition = 7; actions.at.resetMotif();
    assert.equal(readSwing(state, 0).value, 50);
    actions.nextStep(); assert.equal(state.playheadPosition, 0); assert.equal(readSwing(state, 0).value, 50);
});

test("SWING last explicit Motif step is delayed inside the boundary, with unchanged temporal geometry", () => {
    const { state, actions, clock } = setup(), time = timer();
    state.motifs[0].motifLength = 4; state.motifs[0].voiceLengths[0] = 5;
    state.motif[0][3] = true; apply(actions, [], [3]);
    const timing = new SwingTiming(state, clock, time.api), emitted = [];
    state.transportState = "PLAY"; state.playheadPosition = 3;
    timing.beginStep(); timing.schedule(timing.delayFor(0), () => emitted.push(time.api.now()));
    time.run(62.5); assert.deepEqual(emitted, [62.5]);
    time.run(125); actions.nextStep(); timing.beginStep();
    assert.equal(state.playheadPosition, 0); assert.equal(state.getVoiceStep(0), 0);
    assert.equal(state.motifs[0].motifLength, 4); assert.equal(state.motifs[0].voiceLengths[0], 5);
});
