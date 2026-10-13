import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { AT_SLOTS, createVelocities } from "../src/ATTransaction.mjs";
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from "../src/MotifBankFormat.mjs";
import { readATPanel, initializePlayATUI } from "../src/PlayATUI.mjs";

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
async function load(file, imports = {}) {
    let text = await source(file);
    imports["./ATTransaction.mjs"] = new URL("../src/ATTransaction.mjs", import.meta.url).href;
    for (const [name, value] of Object.entries(imports)) text = text.replace(JSON.stringify(name), JSON.stringify(value));
    return `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
}
const { LiRythmeState } = await import(await load("LiRythmeState.js", { "./PadConfiguration.js": await load("PadConfiguration.js") }));
const { LiRythmeActions } = await import(await load("LiRythmeActions.js"));
const { LiRythmeClock } = await import(await load("LiRythmeClock.js"));
const imports = {};
for (const file of ["LaunchpadMapping.js", "LaunchpadColors.js", "GenesisLayout.js"]) {
    imports[`./${file}`] = await load(`hardware/launchpad/${file}`);
}
const { LaunchpadMini } = await import(await load("hardware/launchpad/LaunchpadMini.js", imports));
function setup(t) {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const state = new LiRythmeState(), clock = new LiRythmeClock(state), actions = new LiRythmeActions(state, clock);
    const leds = new Map();
    const c = new LaunchpadMini({ send: (_, [status, note, color]) => leds.set(`${status}:${note}`, color) }, state, actions, "LP");
    const press = (note, status = 0x90) => c.handleMidiMessage([status, note, 127]);
    const release = (note, status = 0x90) => c.handleMidiMessage([status, note, 0]);
    const tap = (note, status = 0x90) => { press(note, status); release(note, status); };
    const begin = () => { state.currentView = "PLAY"; tap(68); assert.ok(state.atTransaction); };
    t.after(() => c.resetInputState());
    return { state, clock, actions, c, leds, press, release, tap, begin };
}
function drainAT(t, c) {
    for (let i = 0; (c.atLEDQueue.size || c.instrumentFeedbackPending) && i < 32; i++) t.mock.timers.tick(4);
    assert.equal(c.atLEDQueue.size, 0);
}
test("velocity meter holds the real value full while the dim tail descends every 40ms", t => {
    const { state, c, leds, tap, begin } = setup(t);
    state.motif[12][0] = state.motif[12][1] = true;
    state.transportState = "PLAY";
    begin(); drainAT(t, c); tap(c.mapping.AT_VALUE[2]); drainAT(t, c);
    const expectTail = tail => c.mapping.AT_VALUE.forEach((note, row) => {
        const color = row === 2 ? c.colors.YELLOW : row < tail ? c.colors.OFF : c.colors.DIM_GREEN;
        assert.equal(leds.get('144:' + note), (color & 0x33) | 4);
    });
    expectTail(3);
    for (let tail = 4; tail <= 8; tail++) {
        t.mock.timers.tick(40); drainAT(t, c); expectTail(tail);
    }
    t.mock.timers.tick(80); drainAT(t, c); expectTail(8);
    state.playheadPosition = 1; c.drawATValues(); drainAT(t, c); expectTail(3);
    state.playheadPosition = 2; c.drawATValues(); drainAT(t, c);
    c.mapping.AT_VALUE.forEach(note => assert.equal(leds.get('144:' + note), (c.colors.OFF & 0x33) | 4));
    assert.equal(c.velocityMeterTimer, null);
    state.playheadPosition = 0; c.drawATValues(); drainAT(t, c); expectTail(3);
    tap(68); drainAT(t, c); assert.equal(c.velocityMeterTimer, null);
});
const velocity = (state, voice, step, id = state.currentMotifId) => state.getMotif(id).velocities?.[voice]?.[step] ?? 100;

test("velocity meter follows each timeline step independently of edit step selection", t => {
    const { state, actions, c, leds, begin } = setup(t);
    state.motif[12][2] = state.motif[13][4] = true;
    state.getMotif(0).velocities = createVelocities();
    state.getMotif(0).velocities[12][2] = 96;
    state.getMotif(0).velocities[13][4] = 127;
    begin();
    const expectMeter = first => {
        c.drawATValues(); drainAT(t, c);
        c.mapping.AT_VALUE.forEach((note, row) => {
            const color = row < first ? c.colors.OFF : row === first ? row === 0 ? c.colors.RED : row <= 2 ? c.colors.YELLOW : c.colors.GREEN
                : row === 0 ? c.colors.DIM_RED : row <= 2 ? c.colors.DIM_AMBER : c.colors.DIM_GREEN;
            assert.equal(leds.get(`144:${note}`), (color & 0x33) | 4);
        });
    };
    expectMeter(8);
    actions.at.select("steps", 4);
    state.playheadPosition = 2; expectMeter(2);
    state.playheadPosition = 4; expectMeter(0);
    actions.at.select("instruments", 12); expectMeter(8);
    state.playheadPosition = 2; expectMeter(2);
    assert.deepEqual([...state.atTransaction.steps], [4]);
    assert.deepEqual([...state.atTransaction.instruments], [12]);
});

for (const dense of [false, true]) test(`A/T PLAY workload probe (${dense ? 512 : 1} events)`, t => {
    const { state, actions, c, tap, begin } = setup(t);
    state.transportState = "PLAY";
    if (dense) state.motif.forEach(row => row.fill(true));
    else state.motif[0][0] = true;
    // Include the maximum velocity snapshot rather than only uninitialized motifs.
    state.motifs.forEach(m => { m.velocities = createVelocities(); });
    let sends = 0, notifications = 0, saves = 0;
    const send = c.midiManager.send;
    c.midiManager.send = (...args) => { sends++; send(...args); };
    const changed = actions.onATChange;
    actions.onATChange = (...args) => { notifications++; changed(...args); };
    state.onBankChange = () => { saves++; };
    const measure = (name, fn) => {
        sends = notifications = saves = 0;
        const start = performance.now(); fn();
        const syncMs = performance.now() - start;
        assert.equal(sends, 0, name + ' must not send synchronous LED bursts');
        const queued = c.atLEDQueue.size;
        drainAT(t, c);
        t.diagnostic(`${name}: ${sends} LED sends, ${notifications} notifications, ${saves} saves, ${syncMs.toFixed(3)} ms synchronous, ${queued} queued (mock MIDI)`);
    };
    measure("BEGIN", begin);
    measure("TARGET", () => tap(c.mapping.INSTRUMENTS[0]));
    tap(c.mapping.INSTRUMENTS[0]); drainAT(t, c);
    measure("APPLY", () => tap(c.mapping.AT_VALUE[0]));
    measure("32 VALUES", () => { for (let i = 0; i < 32; i++) tap(c.mapping.AT_VALUE[i % 8]); });
    measure("CANCEL", () => tap(68));
    begin(); tap(c.mapping.AT_VALUE[0]); drainAT(t, c);
    measure("COMMIT", () => actions.at.finish(true));
});

test("A/T LED bursts are bounded, coalesced and superseded by current musical feedback", t => {
    const { state, clock, c, tap, begin } = setup(t);
    state.transportState = "PLAY";
    state.motif.forEach(row => row.fill(true));
    const before = musicalContext(state, clock);
    const messages = [];
    c.midiManager.send = (_, message) => messages.push(message);
    begin();
    assert.equal(messages.length, 0);
    t.mock.timers.tick(4);
    assert.equal(messages.length, 4);
    drainAT(t, c);
    messages.length = 0;
    const blink = c.atBlinkTimer;
    // VALUE must not redraw the musical surface or cancel an active note pulse.
    c.drawSelectedMotif = () => assert.fail("VALUE redrew the entire Launchpad");
    for (let i = 0; i < 32; i++) tap(c.mapping.AT_VALUE[i % 8]);
    assert.equal(c.atBlinkTimer, blink);
    assert.equal(messages.length, 0);
    assert.equal(c.atLEDQueue.size, 5);
    assert.equal(velocity(state, 0, 0), 16);
    drainAT(t, c);
    assert.equal(messages.length, 5);
    assert.equal(c.atLEDKnown.get(`144:${c.mapping.AT_VALUE[7]}`), (c.colors.GREEN & 0x33) | 4);
    assert.deepEqual(musicalContext(state, clock), before);

    const note = c.mapping.MOTIF[0];
    c.collectATLEDs = true;
    c.setLed(note, c.colors.RED);
    c.collectATLEDs = false;
    c.setLed(note, c.colors.GREEN); // a newer clock render wins
    assert.equal(c.atLEDQueue.has(`144:${note}`), false);
    delete c.drawSelectedMotif;
    c.resetInputState();
    assert.equal(c.atLEDTimer, null);
    assert.equal(c.atLEDQueue.size, 0);
});
function musicalContext(state, clock) {
    return structuredClone({ transport: state.transportState, playing: state.playingMotifId, view: state.viewMotifId,
        current: state.currentMotifId, focus: state.chainFocus, chain: state.chain, next: state.nextMotifId,
        index: state.chainPlayingIndex, viewIndex: state.chainViewIndex, loop: state.chainLoopMasterIndex,
        phase: state.playheadPosition, live: state.liveLengthCycle, revision: clock.transportRevision,
        voiceLengths: state.motifs.map(m => m.voiceLengths), lengths: state.motifs.map(m => m.motifLength) });
}

test("A/T navigation is inert; VELOCITY available and COLOR disabled by default among 8+8 slots", t => {
    const { state, clock, actions, c, tap } = setup(t);
    const before = musicalContext(state, clock);
    for (const view of ["MOTIF_LIBRARY", "PLAY"]) {
        tap(120); assert.equal(state.currentView, view); assert.equal(state.atTransaction, null);
        assert.deepEqual(musicalContext(state, clock), before);
    }
    actions.toggleView(); actions.toggleView();
    assert.equal(AT_SLOTS.length, 16);
    for (const note of c.mapping.BOOKS.filter((_, slot) => slot !== 0 && slot !== 2 && slot !== 3 && slot !== 4 && slot !== 8)) { tap(note); assert.equal(state.atTransaction, null); }
    tap(68); assert.equal(state.atTransaction.slot, 0);
    assert.deepEqual([...state.atTransaction.instruments], []);
    assert.deepEqual([...state.atTransaction.steps], []);
    assert.equal(readATPanel(state).target, "MOTIF");
    assert.equal(actions.toggleView(), "PLAY");
    assert.deepEqual(musicalContext(state, clock), before);
});

for (const [name, instruments, steps] of [
    ["Motif", [], []], ["Instrument", [12], []], ["Step", [], [2]],
    ["Instrument x Step", [12], [2]], ["multi-Instrument", [12, 13], []],
    ["multi-Step", [], [2, 4, 6]], ["multi-intersection", [12, 13], [2, 4, 6]]
]) test(`VELOCITY target ${name} changes only existing events in the Cartesian product`, t => {
    const { state, actions, begin } = setup(t);
    for (const row of state.motif) row.fill(true);
    state.motif[12][4] = false;
    const events = structuredClone(state.motif);
    begin();
    instruments.forEach(id => actions.at.select("instruments", id, true));
    steps.forEach(id => actions.at.select("steps", id, true));
    actions.at.apply(0);
    for (let v = 0; v < 16; v++) for (let s = 0; s < 32; s++) {
        const targeted = events[v][s] && (!instruments.length || instruments.includes(v)) && (!steps.length || steps.includes(s));
        assert.equal(velocity(state, v, s), targeted ? 127 : 100, `${v}:${s}`);
    }
    assert.deepEqual(state.motif, events);
});

for (const [name, voices, steps] of [
    ["motif", [], []], ["instrument", [12], []],
    ["instrument then steps", [12], [2, 4]], ["steps only", [], [2, 4]]
]) test(`hardware velocity selection ${name} after an existing assignment`, t => {
    const { state, c, tap, press, release, begin } = setup(t);
    state.motif.forEach(row => row.fill(true));
    begin(); tap(c.mapping.AT_VALUE[2]);
    voices.forEach(voice => tap(c.mapping.INSTRUMENTS[voice]));
    steps.forEach((step, index) => {
        if (index) press(104, 0xB0);
        tap(c.mapping.MOTIF[step]);
        if (index) release(104, 0xB0);
    });
    tap(c.mapping.AT_VALUE[4]); drainAT(t, c);
    for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
        const selected = (!voices.length || voices.includes(voice)) && (!steps.length || steps.includes(step));
        assert.equal(velocity(state, voice, step), selected ? 64 : 96, `${voice}:${step}`);
    }
    voices.forEach(voice => assert.equal(c.getInstrumentColor(voice), c.colors.YELLOW));
    steps.forEach(step => assert.equal(c.getMotifStepColor(step), c.colors.YELLOW));
});

test("independent hardware selection: exclusive, additive toggle, removal, dynamic target", t => {
    const { state, c, tap, press, release, begin } = setup(t);
    state.motif.forEach(row => row.fill(true));
    const historical = state.selectedInstrument;
    begin(); tap(c.mapping.INSTRUMENTS[12]); tap(c.mapping.MOTIF[2]);
    press(104, 0xB0); tap(c.mapping.INSTRUMENTS[13]); tap(c.mapping.MOTIF[4]); tap(c.mapping.MOTIF[6]); release(104, 0xB0);
    assert.deepEqual([...state.atTransaction.instruments], [12, 13]);
    assert.deepEqual([...state.atTransaction.steps], [2, 4, 6]);
    tap(24); assert.equal(velocity(state, 12, 4), 111); assert.equal(velocity(state, 14, 4), 100);
    tap(c.mapping.INSTRUMENTS[12]); // remove selected, retain 13
    tap(c.mapping.MOTIF[1]); // exclusive replacement in this category only
    tap(56); assert.equal(velocity(state, 13, 1), 80); assert.equal(velocity(state, 12, 4), 111);
    assert.equal(velocity(state, 12, 1), 100);
    assert.deepEqual([...state.atTransaction.instruments], [13]);
    assert.deepEqual([...state.atTransaction.steps], [1]);
    press(104, 0xB0); tap(c.mapping.INSTRUMENTS[13]); release(104, 0xB0);
    tap(c.mapping.MOTIF[1]); assert.equal(readATPanel(state).target, "MOTIF");
    assert.equal(state.selectedInstrument, historical);
    assert.ok(state.voiceLengths.every(n => n === null));
});

test("physical A-H applies all eight values; F/G/H cannot DELETE/COPY/SWITCH", t => {
    const { state, actions, c, leds, tap, begin } = setup(t);
    state.motif[12][0] = true; begin();
    assert.deepEqual(c.mapping.AT_VALUE, [8, 24, 40, 56, 72, 88, 104, 120]);
    [127, 111, 96, 80, 64, 48, 32, 16].forEach((value, i) => {
        tap(c.mapping.AT_VALUE[i]); assert.equal(velocity(state, 12, 0), value);
        assert.equal(state.atTransaction.valueIndex, i);
        drainAT(t, c);
        c.mapping.AT_VALUE.forEach((note, row) => {
            const color = row < i ? c.colors.OFF : row === i ? row === 0 ? c.colors.RED : row <= 2 ? c.colors.YELLOW : c.colors.GREEN
                : row === 0 ? c.colors.DIM_RED : row <= 2 ? c.colors.DIM_AMBER : c.colors.DIM_GREEN;
            assert.equal(leds.get(`144:${note}`), (color & 0x33) | 4, `velocity ${value}, row ${row}`);
        });
        assert.equal(c.copyStage, null); assert.equal(c.deleteArmed, false); assert.equal(state.currentView, "PLAY");
        assert.equal(actions.toggleView(), "PLAY");
    });
    tap(68); assert.equal(state.atTransaction, null); assert.equal(velocity(state, 12, 0), 100);
    tap(104); assert.equal(c.copyStage, "SOURCE"); tap(104); assert.equal(c.copyStage, null);
    tap(88); assert.equal(c.deleteArmed, true); tap(88); assert.equal(c.deleteArmed, false);
    tap(120); assert.equal(state.currentView, "MOTIF_LIBRARY");
});

for (const commit of [false, true]) test(`${commit ? "COMMIT" : "CANCEL"} covers all targets and starts a fresh snapshot`, t => {
    const { state, actions, clock, tap, press, release, begin } = setup(t);
    state.motif[12][2] = state.motif[13][4] = true;
    state.getMotif(0).velocities = createVelocities(); state.getMotif(0).velocities[12][2] = 77;
    const original = structuredClone(state.motifs), context = musicalContext(state, clock);
    begin(); actions.at.select("instruments", 12); tap(8);
    actions.at.select("instruments", 13); tap(120);
    if (commit) { press(68); t.mock.timers.tick(300); release(68); }
    else tap(68);
    assert.equal(state.atTransaction, null);
    assert.deepEqual(musicalContext(state, clock), context);
    if (commit) { assert.equal(velocity(state, 12, 2), 127); assert.equal(velocity(state, 13, 4), 16); }
    else assert.deepEqual(state.motifs, original);
    const saved = structuredClone(state.motifs);
    tap(68); assert.equal(readATPanel(state).target, "MOTIF"); tap(88); tap(68);
    assert.deepEqual(state.motifs, saved);
});

test("blink, value LEDs and pending COPY feedback survive exit, without held-release leakage", t => {
    const { state, c, leds, tap, press, release, begin } = setup(t);
    state.motif[12][0] = true;
    const color = n => leds.get(`144:${n}`);
    for (const command of ["COPY"]) {
        tap(command === "COPY" ? 104 : 88);
        const stage = c.copyStage, armed = c.deleteArmed;
        begin(); drainAT(t, c); assert.equal(color(68), (c.colors.RED & 0x33) | 4);
        t.mock.timers.tick(160); drainAT(t, c); assert.equal(color(68), 4);
        press(120); tap(88); tap(104);
        assert.equal(c.copyStage, stage); assert.equal(c.deleteArmed, armed);
        t.mock.timers.tick(160); drainAT(t, c);
        assert.equal(color(104), (c.colors.GREEN & 0x33) | 4);
        press(68); t.mock.timers.tick(300); release(68); release(120); drainAT(t, c);
        assert.equal(state.currentView, "PLAY"); assert.equal(state.atTransaction, null);
        assert.equal(c.atBlinkTimer, null); assert.equal(color(120), 4);
        assert.equal(color(104), ((c.copyStage && c.copyLit ? c.colors.YELLOW : 0) & 0x33) | 4);
        assert.equal(color(88), ((c.deleteArmed && c.deleteLit ? c.colors.RED : 0) & 0x33) | 4);
        assert.equal(color(8), 4);
        tap(command === "COPY" ? 104 : 88);
    }
});

for (const transport of ["PLAY", "PAUSE", "STOP"]) test(`CHAIN/FOCUS ${transport}: edits VIEW, cancel/commit preserve all contextual state`, t => {
    const { state, actions, clock, tap, begin } = setup(t);
    state.chainEnabled = true; state.chain = [0, 1, 1]; state.chainPlayingIndex = 0;
    state.chainPlayingDetached = false; state.chainLoopMasterIndex = 2;
    state.chainFocus = true; state.viewMotifId = 1; state.chainViewIndex = 1;
    state.nextMotifId = 1; state.transportState = transport; state.playheadPosition = 9;
    state.motifs[0].events[12][0] = state.motifs[1].events[12][0] = true;
    const before = musicalContext(state, clock), playing = structuredClone(state.motifs[0]);
    begin(); tap(8); assert.equal(velocity(state, 12, 0, 1), 127);
    assert.deepEqual(state.motifs[0], playing); tap(68);
    assert.deepEqual(musicalContext(state, clock), before); assert.equal(velocity(state, 12, 0, 1), 100);
    begin(); tap(24); actions.at.finish(true);
    assert.deepEqual(musicalContext(state, clock), before); assert.deepEqual(state.motifs[0], playing);
});

test("live CHAIN change and FOCUS navigation preserve the captured A/T motif", t => {
    const { state, actions, begin } = setup(t);
    state.chainEnabled = true; state.chain = [0, 1, 2]; state.chainPlayingIndex = 0; state.chainPlayingDetached = false;
    state.motifs.forEach(m => m.events[12][0] = true);
    const original = structuredClone(state.motifs);
    begin(); actions.at.apply(0);
    state.playingMotifId = 1; state.chainPlayingIndex = 1; // natural playback boundary
    actions.at.apply(1); assert.equal(velocity(state, 12, 0, 0), 111); assert.equal(velocity(state, 12, 0, 1), 100);
    state.chainFocus = true; state.viewMotifId = 2; state.chainViewIndex = 2;
    actions.at.apply(7); assert.equal(velocity(state, 12, 0, 0), 16); assert.equal(velocity(state, 12, 0, 2), 100);
    actions.at.finish(false); assert.deepEqual(state.motifs, original);
    assert.equal(state.playingMotifId, 1); assert.equal(state.viewMotifId, 2);
});

test("FOCUS chord stays exclusive; PLAY context selection preserves captured VELOCITY target", t => {
    const { state, actions, c, clock, tap, press, release, begin } = setup(t);
    state.chainEnabled = true; state.chain = [0, 1, 1, 2]; state.chainPlayingIndex = 0;
    state.chainPlayingDetached = false; state.chainLoopMasterIndex = 3;
    state.transportState = "PLAY"; state.playheadPosition = 7;
    state.motifs.forEach(m => m.events[12][0] = true);
    begin();
    press(110, 0xB0); press(111, 0xB0); release(110, 0xB0); release(111, 0xB0);
    assert.equal(state.chainFocus, true); assert.equal(state.chainViewIndex, 0);
    tap(111, 0xB0); assert.equal(state.chainViewIndex, 0); assert.equal(state.currentTimeline, "MODULATION");
    tap(8); assert.equal(velocity(state, 12, 0, 1), 100); assert.equal(velocity(state, 12, 0, 0), 127);
    tap(111, 0xB0); assert.equal(state.chainViewIndex, 0); assert.equal(state.currentMotifId, 0);
    tap(110, 0xB0); assert.equal(state.currentTimeline, "MOTIF"); assert.equal(state.chainViewIndex, 0);
    tap(120); assert.equal(velocity(state, 12, 0, 0), 16); assert.equal(velocity(state, 12, 0, 2), 100);
    assert.equal(state.playheadPosition, 7); assert.equal(state.playingMotifId, 0);
    const context = musicalContext(state, clock);
    actions.at.finish(false); assert.deepEqual(musicalContext(state, clock), context);
    assert.equal(velocity(state, 12, 0, 1), 100); assert.equal(velocity(state, 12, 0, 2), 100);
    assert.equal(c.atBlinkTimer, null);
});

test("natural CHAIN boundary continues during VELOCITY and rollback preserves deferred cycle identity", t => {
    const { state, actions, clock, begin } = setup(t);
    state.chainEnabled = true; state.chain = [0, 1]; state.chainPlayingIndex = 0;
    state.chainPlayingDetached = false; state.motifs[0].motifLength = state.motifs[1].motifLength = 2;
    state.motifs[0].events[12][0] = state.motifs[1].events[12][0] = true;
    state.transportState = "PLAY"; state.playheadPosition = 1;
    begin(); actions.at.apply(0); actions.nextStep();
    assert.equal(state.playingMotifId, 1); assert.equal(state.chainPlayingIndex, 1);
    actions.at.apply(7); assert.equal(velocity(state, 12, 0, 0), 16); assert.equal(velocity(state, 12, 0, 1), 100);
    state.liveLengthCycle = { duration: 2, lengths: Array(16).fill(2), steps: Array(16).fill(0), untilEntry: true };
    const cycle = state.liveLengthCycle, before = musicalContext(state, clock);
    actions.at.finish(false);
    assert.equal(state.liveLengthCycle, cycle); assert.deepEqual(musicalContext(state, clock), before);
    assert.equal(velocity(state, 12, 0, 0), 100); assert.equal(velocity(state, 12, 0, 1), 100);
});

test("Note Off, duplicate presses, idle longpress and reset do not leak or retain A/T gestures", t => {
    const { state, c, actions, press, release, tap, begin } = setup(t);
    state.currentView = "PLAY"; press(68); t.mock.timers.tick(300); release(68);
    assert.equal(state.atTransaction, null);
    state.motif[12][0] = true; begin();
    press(c.mapping.INSTRUMENTS[12]); press(c.mapping.INSTRUMENTS[12]);
    c.handleMidiMessage([0x80, c.mapping.INSTRUMENTS[12], 64]);
    assert.deepEqual([...state.atTransaction.instruments], [12]);
    tap(8); press(68); t.mock.timers.tick(300); press(68);
    c.handleMidiMessage([0x80, 68, 64]);
    assert.equal(state.atTransaction, null); assert.equal(velocity(state, 12, 0), 127);
    tap(68); tap(120); c.resetInputState();
    assert.equal(state.atTransaction, null); assert.equal(velocity(state, 12, 0), 127);
    assert.equal(c.atBlinkTimer, null); assert.equal(c.atPadHold, null); assert.equal(c.atHeld.size, 0);
    assert.equal(actions.toggleView(), "MOTIF_LIBRARY");
});

test("historical VALUE presses released during A/T cannot leave stale SWITCH/COPY latches", t => {
    const { state, c, press, release, tap } = setup(t);
    state.currentView = "MOTIF_LIBRARY";
    press(104); // COPY still held when the transaction begins
    press(120); assert.equal(state.currentView, "PLAY");
    tap(68); assert.ok(state.atTransaction);
    release(104); release(120);
    tap(68); assert.equal(state.atTransaction, null);
    tap(104); assert.equal(c.copyStage, null);
    tap(120); assert.equal(state.currentView, "MOTIF_LIBRARY");
});

for (const commit of [false, true]) test(`existing PLAY A/T surface: all 16 family LEDs survive ${commit ? "COMMIT" : "CANCEL"}`, t => {
    const { state, c, leds, tap, press, release } = setup(t);
    const colors = () => c.mapping.BOOKS.map(note => leds.get(`144:${note}`));
    const expected = lit => Array.from({ length: 16 }, (_, i) =>
        (c.colors[i === 0 ? (lit ? "RED" : "OFF") : (i === 2 || i === 3 || i === 4) ? "RED" : i < 8 ? "DIM_RED" : i === 8 ? "YELLOW" : "DIM_AMBER"] & 0x33) | 4);
    assert.equal(state.currentView, "PLAY");
    c.drawBooks(); assert.deepEqual(colors(), expected(true));
    for (const note of c.mapping.BOOKS.filter((_, slot) => slot !== 0 && slot !== 2 && slot !== 3 && slot !== 4 && slot !== 8)) { tap(note); assert.equal(state.atTransaction, null); }
    tap(68); assert.ok(state.atTransaction); assert.deepEqual(colors(), expected(true));
    t.mock.timers.tick(160); drainAT(t, c); assert.deepEqual(colors(), expected(false));
    c.drawBooks(); assert.deepEqual(colors(), expected(false));
    if (commit) { press(68); t.mock.timers.tick(300); release(68); } else tap(68);
    drainAT(t, c); assert.equal(state.atTransaction, null); assert.deepEqual(colors(), expected(true));
    t.mock.timers.tick(320); assert.deepEqual(colors(), expected(true));
    tap(120); assert.equal(state.currentView, "MOTIF_LIBRARY");
    tap(120); assert.equal(state.currentView, "PLAY"); assert.deepEqual(colors(), expected(true));
});

test("A/T implemented Transformations use their YELLOW family without enabling an empty slot", t => {
    const { c, state, actions } = setup(t);
    assert.equal(c.getATBookColor(8), "YELLOW");
    assert.equal(c.getATBookColor(9), "DIM_AMBER");
    const definition = actions.at.definition.bind(actions.at);
    actions.at.definition = slot => slot === 8 ? { id: "TEST_ONLY" } : definition(slot);
    assert.equal(c.getATBookColor(8), "YELLOW");
    state.atTransaction = { slot: 8 }; c.atLit = false;
    assert.equal(c.getATBookColor(8), "OFF"); c.atLit = true;
    assert.equal(c.getATBookColor(8), "YELLOW");
    state.atTransaction = null;
    actions.at.definition = definition;
});

test("bank backward compatibility, optional velocities, isolation and provisional autosave", t => {
    const { state, actions, begin } = setup(t);
    state.motif[12][0] = true;
    const legacy = snapshotMotifBank(state); assert.equal(legacy.version, 1);
    let changes = 0; state.onBankChange = () => changes++;
    begin(); actions.at.apply(7);
    assert.deepEqual(snapshotMotifBank(state), legacy); assert.equal(changes, 0);
    actions.at.finish(true); assert.equal(changes, 1);
    const saved = snapshotMotifBank(state), restored = new LiRythmeState();
    restoreMotifBank(restored, saved); assert.equal(velocity(restored, 12, 0), 16);
    saved.motifs[0].velocities[12][0] = 32; assert.equal(velocity(restored, 12, 0), 16);
    saved.motifs[0].velocities[12][0] = 0; assert.throws(() => validateMotifBank(saved));
    restoreMotifBank(restored, legacy); assert.equal(velocity(restored, 12, 0), 100);
    assert.equal("atTransaction" in snapshotMotifBank(state), false);
});

test("COPY carries velocity with events; DELETE and event recreation clear it", t => {
    const { state, actions, begin } = setup(t);
    state.motif[12][0] = true; begin(); actions.at.apply(7); actions.at.finish(true);
    actions.applyVoiceCopy(actions.captureMusicalCopy("VOICE", 12), 13);
    assert.equal(velocity(state, 13, 0), 16);
    actions.applyMotifCopy(actions.captureMotifCopy(0), 1);
    assert.equal(velocity(state, 13, 0, 1), 16);
    actions.clearMotifEvents(13); assert.equal(velocity(state, 13, 0), 100);
    state.selectedInstrument = 12; actions.toggleInstrumentStep(0); actions.toggleInstrumentStep(0);
    assert.equal(velocity(state, 12, 0), 100);
    actions.deleteMotif(1); assert.equal(state.motifs[1].velocities, undefined);
});

test("PLAY third panel updates target, eight values, highlight and restores SELECTION", t => {
    const { state, actions, begin } = setup(t);
    state.motif[12][2] = true;
    const fields = new Map();
    const document = { getElementById(id) {
        if (!fields.has(id)) fields.set(id, { textContent: "", hidden: false, attributes: {}, classes: new Set(),
            setAttribute(k, v) { this.attributes[k] = v; }, classList: { toggle(k, enabled) {
                if (enabled) fields.get(id).classes.add(k); else fields.get(id).classes.delete(k);
            } } });
        return fields.get(id);
    } };
    const ui = initializePlayATUI({ state, document });
    assert.equal(fields.get("play-at").hidden, true);
    begin(); ui.render(); assert.equal(fields.get("play-selection-title").textContent, "VELOCITY");
    assert.equal(fields.get("play-at-target").textContent, "MOTIF");
    actions.at.select("steps", 2); actions.at.select("steps", 4, true); actions.at.select("steps", 6, true);
    ui.render(); assert.equal(fields.get("play-at-target").textContent, "STEPS 03·05·07");
    state.padConfiguration.voices[12].name = "SNARE"; actions.at.select("instruments", 12);
    actions.at.apply(3); ui.render(); assert.equal(fields.get("play-at-target").textContent, "SNARE · 03·05·07");
    AT_SLOTS[0].values.forEach((v, i) => {
        assert.equal(fields.get(`play-at-value-${i}`).textContent, `${String.fromCharCode(65 + i)}   ${v}`);
        assert.equal(fields.get(`play-at-value-${i}`).classes.has("at-selected"), i === 3);
    });
    actions.at.finish(false); ui.render(); assert.equal(fields.get("play-selection-title").textContent, "SELECTION");
    assert.equal(fields.get("play-selected").hidden, false); assert.equal(fields.get("play-at").hidden, true);
});

for (const mode of ["INTERNAL", "MIDI"]) test(`audible live velocity and unchanged scheduled gates/5x7 phase (${mode})`, async t => {
    const { state, actions, clock, c, begin } = setup(t);
    state.voiceLengths[12] = 5; state.voiceLengths[13] = 7;
    state.motif[12].fill(true); state.motif[13].fill(true);
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const notes = [], pending = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
        { options: [{ textContent: "DBI" }], selectedIndex: 0 }, { send: (_, data) => notes.push(data), findOutput: () => ({}) },
        { pulseInstrument() {} }, fn => pending.push(fn));
    clock.setSource(mode); actions.startPlayback(); clock.setClockStepHandler(() => trigger(state.playheadPosition));
    const revision = clock.transportRevision;
    begin(); actions.at.apply(0);
    for (let i = 1; i <= 70; i++) {
        if (i === 20) actions.at.apply(7);
        if (i === 40) actions.at.finish(false);
        if (mode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
        else clock.receiveInternalClockStep({ sequence: i, transportRevision: revision });
        assert.equal(state.playheadPosition, i % 35);
        assert.equal(clock.transportRevision, revision);
        assert.equal(notes.at(-1)[2], i < 20 ? 127 : i < 40 ? 16 : 100);
    }
    const ons = notes.slice(); pending.forEach(fn => fn());
    assert.deepEqual(notes.slice(ons.length), ons.map(([s, n]) => [s, n, 0]));
    c.resetInputState();
});

for (const focus of [false, true]) test(`A/T Instrument visibility is independent of Steps (FOCUS ${focus})`, t => {
    const { state, clock, actions, c, leds, begin } = setup(t);
    state.chainEnabled = true;
    state.chainFocus = focus;
    state.playingMotifId = 0;
    state.currentMotifId = focus ? 3 : 0;
    state.motif[0][1] = true;
    state.motif[1][2] = true;
    state.motif[2][3] = true;
    state.getMotif(focus ? 0 : 3).events[0][8] = true;
    state.filterMode = focus;
    state.visibleInstrumentFilter.add(2);
    state.selectedInstrument = 2;
    const bank = structuredClone(state.motifs);
    const context = musicalContext(state, clock);
    begin();
    assert.equal(state.chainFocus, focus);
    assert.equal(state.filterMode, focus);
    assert.deepEqual([...state.visibleInstrumentFilter], [2]);
    assert.deepEqual([0, 1, 2, 3].map(i => c.getInstrumentColor(i)),
        Array(4).fill(c.colors.DIM_GREEN));
    const colors = () => [1, 2, 3, 8, 9].map(step => c.getMotifStepColor(step));
    const { DIM_AMBER: event, OFF: off, YELLOW: selected } = c.colors;
    assert.deepEqual(colors(), [event, event, event, off, off]);
    actions.at.select("instruments", 0);
    assert.deepEqual(colors(), [event, off, off, off, off]);
    drainAT(t, c);
    assert.equal(leds.get('144:' + c.mapping.MOTIF[2]), (off & 0x33) | 4);
    assert.equal(c.getInstrumentColor(0), c.colors.DIM_AMBER);
    assert.equal(c.getInstrumentColor(1), c.colors.DIM_GREEN);
    actions.at.select("instruments", 1, true);
    assert.deepEqual(colors(), [event, event, off, off, off]);
    actions.at.select("steps", 3);
    actions.at.select("steps", 9, true);
    assert.deepEqual(colors(), [event, event, c.colors.DIM_GREEN, off, c.colors.DIM_GREEN]);
    actions.at.select("instruments", 0);
    actions.at.select("instruments", 1);
    assert.deepEqual(colors(), [event, event, selected, off, c.colors.DIM_GREEN]);
    actions.at.select("steps", 3);
    actions.at.select("steps", 9);
    assert.deepEqual(colors(), [event, event, event, off, off]);
    actions.at.select("instruments", 3);
    assert.deepEqual(colors(), [off, off, off, off, off]);
    assert.equal(c.getInstrumentColor(3), c.colors.DIM_AMBER);
    actions.at.select("instruments", 3);
    drainAT(t, c);
    assert.deepEqual(state.motifs, bank);
    assert.deepEqual(musicalContext(state, clock), context);
    actions.at.finish(false);
    assert.equal(c.getMotifStepColor(1), focus ? 0 : event);
    assert.equal(c.getMotifStepColor(3), selected);
});

test("CHAIN FOCUS NEXT holds each green phase 500 ms and PLAYING stays steady", t => {
    const { state, clock, c } = setup(t);
    state.chainEnabled = true;
    state.chainFocus = true;
    state.chain = [0, 1, 2];
    state.currentView = "MOTIF_LIBRARY";
    state.currentMotifId = 2;
    state.playingMotifId = 0;
    state.nextMotifId = 1;
    state.transportState = "PLAY";
    const before = musicalContext(state, clock);
    c.drawBooks();
    for (const [elapsed, expected] of [[499, "GREEN"], [1, "DIM_GREEN"], [499, "DIM_GREEN"], [1, "GREEN"]]) {
        t.mock.timers.tick(elapsed);
        assert.equal(c.getLibraryMotifColor(0), "GREEN");
        assert.equal(c.getLibraryMotifColor(1), expected);
        assert.equal(c.getLibraryMotifColor(2), "YELLOW");
    }
    assert.deepEqual(musicalContext(state, clock), before);
});

for (const focus of [false, true]) for (const commit of [false, true])
test(`CHAIN A/T EDIT VIEW stays on 05 while PLAYING advances 03/08 (FOCUS ${focus}, commit ${commit})`, t => {
    const { state, actions, clock, c, leds, begin } = setup(t);
    state.chainEnabled = true;
    state.chain = [4, 2, 7];
    state.selectedInstrument = null;
    state.chainPlayingIndex = 0;
    state.chainPlayingDetached = false;
    state.chainLoopMasterIndex = 2;
    state.playingMotifId = 4;
    state.chainFocus = focus;
    state.viewMotifId = 4;
    state.chainViewIndex = 0;
    for (const id of state.chain) state.getMotif(id).motifLength = 2;
    state.getMotif(4).events[12][0] = true;
    state.getMotif(4).events[13][1] = true;
    state.getMotif(2).events[14][0] = true;
    state.getMotif(7).events[15][0] = true;
    state.transportState = "PLAY";
    state.playheadPosition = 1;
    const revision = clock.transportRevision;
    begin();
    assert.equal(state.atTransaction.editingMotifId, 4);
    const colors = () => Array.from({ length: 32 }, (_, i) => c.getMotifStepColor(i));
    const instruments = () => Array.from({ length: 16 }, (_, i) => c.getInstrumentColor(i));
    const timeline = colors(), pads = instruments();
    for (const [id, next, value] of [[2, 7, 0], [7, 4, 7]]) {
        for (let tick = 0; tick < 2 && state.playingMotifId !== id; tick++) actions.nextStep();
        assert.equal(state.playingMotifId, id);
        assert.equal(state.nextMotifId, next);
        assert.equal(state.chainLoopMasterIndex, 2);
        assert.equal(state.transportState, "PLAY");
        assert.equal(clock.transportRevision, revision);
        assert.equal(state.chainFocus, focus);
        assert.equal(state.atTransaction.editingMotifId, 4);
        assert.deepEqual(colors(), timeline);
        assert.deepEqual(instruments(), Array.from({ length: 16 }, (_, i) =>
            i === 12 ? c.colors.GREEN : c.colors.DIM_GREEN));
        c.drawPlayhead();
        actions.at.apply(value);
        assert.equal(velocity(state, 12, 0, 4), value === 0 ? 127 : 16);
        assert.equal(velocity(state, id === 2 ? 14 : 15, 0, id), 100);
        drainAT(t, c);
        assert.equal(leds.get('144:' + c.mapping.INSTRUMENTS[12]), (c.colors.GREEN & 0x33) | 4);
    }
    actions.at.select("instruments", 12);
    actions.at.select("steps", 1);
    assert.equal(c.getMotifStepColor(0), c.colors.DIM_AMBER);
    assert.equal(c.getMotifStepColor(1), c.colors.DIM_GREEN);
    actions.at.finish(commit);
    drainAT(t, c);
    assert.equal(state.atTransaction, null);
    assert.equal(actions.at.getEditingMotifId(), focus ? 4 : 7);
    assert.equal(state.chainFocus, focus);
    assert.equal(velocity(state, 12, 0, 4), commit ? 16 : 100);
    assert.equal(c.getMotifStepColor(0), c.colors.DIM_AMBER);
    assert.equal(c.getMotifStepColor(1), focus ? c.colors.RED : c.colors.DIM_RED);
});

test("A/T outside CHAIN retains its captured target across navigation", t => {
    const { state, actions, begin } = setup(t);
    state.getMotif(0).events[12][0] = true;
    state.getMotif(1).events[13][1] = true;
    begin();
    assert.equal(state.atTransaction.editingMotifId, 0);
    actions.at.apply(0);
    state.currentMotifId = 1;
    assert.equal(actions.at.getEditingMotifId(), 0);
    actions.at.apply(7);
    assert.equal(velocity(state, 12, 0, 0), 16);
    assert.equal(velocity(state, 13, 1, 1), 100);
    actions.at.finish(false);
    assert.equal(velocity(state, 12, 0, 0), 100);
    assert.equal(velocity(state, 13, 1, 1), 100);
});

for (const view of ["PLAY", "MOTIF_LIBRARY"]) for (const chain of [false, true])
for (const transport of ["STOP", "PAUSE"])
test(`Book navigation ${view}/CHAIN=${chain}/${transport}: Steps or occurrences`, t => {
    const { state, actions, c, tap, press, release } = setup(t);
    state.currentView = view; state.chainEnabled = chain; state.transportState = transport;
    state.chain = [0, 4, 2]; state.chainPlayingIndex = 0; state.chainPlayingDetached = false;
    state.chainLoopMasterIndex = 2; state.playheadPosition = 0;
    const bank = structuredClone(state.motifs);
    tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0);
    const structural = chain;
    assert.equal(state.chainPlayingIndex, structural ? 1 : 0);
    assert.equal(state.playheadPosition, structural ? 0 : 1);
    tap(c.mapping.TOP_CONTROLS.PREVIOUS, 0xB0);
    assert.equal(state.chainPlayingIndex, 0); assert.equal(state.playheadPosition, 0);
    const before = [state.playheadPosition, state.chainPlayingIndex];
    press(110, 0xB0); press(111, 0xB0); release(110, 0xB0); release(111, 0xB0);
    assert.deepEqual([state.playheadPosition, state.chainPlayingIndex], before);
    assert.deepEqual(state.chain, [0, 4, 2]); assert.equal(state.chainLoopMasterIndex, 2);
    assert.equal(state.transportState, transport); assert.deepEqual(state.motifs, bank);
});

for (const count of [0, 1, 3]) test(`Step navigation shows ${count} Instruments in steady GREEN`, t => {
    const { state, actions, c, tap, leds } = setup(t);
    state.selectedInstrument = null;
    for (let i = 0; i < count; i++) state.motif[12 + i][1] = true;
    actions.setStepPreviewHandler(() => { for (let i = 0; i < count; i++) c.pulseInstrument(12 + i); });
    tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0);
    const colors = () => Array.from({length: 16}, (_, i) => c.getInstrumentColor(i));
    const expected = Array.from({length: 16}, (_, i) => i >= 12 && i < 12 + count ? c.colors.GREEN : c.colors.DIM_GREEN);
    assert.deepEqual(colors(), expected);
    assert.equal([...c.instrumentPulses.values()].some(p => p.timer != null), false);
    for (const delay of [80, 160, 500]) {
        t.mock.timers.tick(delay); assert.deepEqual(colors(), expected);
        for (let i = 0; i < 16; i++) assert.equal(leds.get('144:' + c.mapping.INSTRUMENTS[i]) & 0x33, expected[i] & 0x33);
    }
    tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0);
    assert.deepEqual(colors(), Array(16).fill(c.colors.DIM_GREEN));
});

for (const focus of [false, true]) test(`A/T Step navigation uses captured motif duration and preserves YELLOW (FOCUS ${focus})`, t => {
    const { state, actions, c, tap, begin } = setup(t);
    state.chainEnabled = true; state.chainFocus = focus; state.currentMotifId = 4;
    state.getMotif(4).motifLength = 3; state.getMotif(4).events[12][1] = true;
    begin(); actions.at.select("instruments", 12);
    state.playingMotifId = 2; state.getMotif(2).motifLength = 8;
    state.transportState = "PAUSE"; state.playheadPosition = 2;
    const tx = state.atTransaction;
    tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0);
    assert.equal(state.playheadPosition, 0); assert.equal(state.playingMotifId, 2);
    assert.equal(state.atTransaction, tx); assert.equal(tx.editingMotifId, 4);
    assert.equal(state.chainFocus, focus); assert.equal(c.getInstrumentColor(12), c.colors.DIM_AMBER);
    tap(c.mapping.TOP_CONTROLS.PREVIOUS, 0xB0); assert.equal(state.playheadPosition, 2);
});

for (const mode of ["MOTIFS_NORMAL", "AT_NORMAL", "AT_CHAIN", "AT_FOCUS"])
for (const transport of ["STOP", "PAUSE"]) for (const direction of [-1, 1])
test(`Step hold UI cadence and clean PLAY: ${mode} ${transport} ${direction}`, t => {
    const { state, actions, clock, c, press, release } = setup(t);
    state.currentView = mode === "MOTIFS_NORMAL" ? "MOTIF_LIBRARY" : "PLAY";
    state.chainEnabled = mode === "AT_CHAIN" || mode === "AT_FOCUS";
    state.chainFocus = mode === "AT_FOCUS";
    state.transportState = transport;
    if (mode.startsWith("AT_")) actions.at.begin();
    const previewQueue = [];
    actions.setStepPreviewHandler(step => previewQueue.push(step));
    const note = c.mapping.TOP_CONTROLS[direction < 0 ? "PREVIOUS" : "NEXT"];
    const duration = state.getStepDurationMs();
    const revision = clock.transportRevision;
    press(note, 0xB0);
    t.mock.timers.tick(duration - 1); assert.equal(state.playheadPosition, 0);
    t.mock.timers.tick(1); assert.equal(state.playheadPosition, (32 + direction) % 32);
    for (let n = 2; n <= 8; n++) {
        t.mock.timers.tick(duration);
        assert.equal(state.playheadPosition, (32 + n * direction) % 32);
        assert.equal(c.lastPlayheadStep, state.playheadPosition);
    }
    release(note, 0xB0);
    const stopped = state.playheadPosition;
    assert.equal(c.stepNavigationTimer, null);
    t.mock.timers.tick(duration * 12);
    assert.equal(state.playheadPosition, stopped);
    assert.deepEqual(previewQueue, Array.from({ length: 8 }, (_, i) => (32 + (i + 1) * direction) % 32));
    assert.equal(clock.transportRevision, revision);
    let musicalSteps = 0;
    actions.setClockStepHandler(() => musicalSteps++);
    actions.startPlayback();
    t.mock.timers.tick(duration * 4);
    assert.equal(musicalSteps, 0); assert.equal(state.playheadPosition, 0);
    clock.receiveInternalClockStep({ sequence: 1, transportRevision: clock.transportRevision });
    assert.equal(musicalSteps, 1); assert.equal(state.playheadPosition, 1);
    assert.deepEqual(previewQueue, Array.from({ length: 8 }, (_, i) => (32 + (i + 1) * direction) % 32));
});

test("Step hold is cancelled by FOCUS chord, reset and PLAY press; occurrences never repeat", t => {
    const { state, c, press, release, tap } = setup(t);
    const duration = state.getStepDurationMs();
    press(111, 0xB0); press(110, 0xB0);
    t.mock.timers.tick(duration * 8);
    assert.equal(state.playheadPosition, 0); assert.equal(c.stepNavigationTimer, null);
    release(111, 0xB0); release(110, 0xB0);
    state.chainFocus = false; state.chainEnabled = false;
    press(111, 0xB0); c.resetInputState(); t.mock.timers.tick(duration * 8);
    assert.equal(state.playheadPosition, 0);
    press(111, 0xB0); press(c.mapping.TOP_CONTROLS.PLAY_STOP, 0xB0);
    assert.equal(c.stepNavigationTimer, null);
    release(111, 0xB0); release(c.mapping.TOP_CONTROLS.PLAY_STOP, 0xB0);
    c.resetInputState();
    state.transportState = "STOP"; state.currentView = "MOTIF_LIBRARY";
    state.chainEnabled = true; state.chain = [0, 1, 2]; state.chainPlayingIndex = 0;
    press(111, 0xB0); t.mock.timers.tick(duration * 8);
    assert.equal(state.chainPlayingIndex, 0); assert.equal(c.stepNavigationTimer, null);
    release(111, 0xB0); assert.equal(state.chainPlayingIndex, 1);
});

for (const mode of ["NORMAL", "ALTERNATE", "FOCUS", "AT", "CHAIN", "CHAIN_FOCUS"])
test(`Instrument input/render stress probe ${mode}`, t => {
    const { state, actions, clock, c, press, release, begin } = setup(t);
    state.transportState = "PLAY";
    state.chainEnabled = mode.startsWith("CHAIN"); state.chainFocus = mode === "CHAIN_FOCUS";
    state.motif.forEach((row, voice) => { row[voice % 32] = true; });
    if (mode === "FOCUS") { state.filterMode = true; c.filterSelectionMode = true; }
    if (mode === "AT") { begin(); drainAT(t, c); }
    c.drawSelectedMotif();
    let inputs = 0, mutations = 0, requests = 0, renders = 0, generated = 0, sent = 0, peak = 0;
    const request = c.requestInstrumentFeedback.bind(c);
    c.requestInstrumentFeedback = () => { requests++; request(); };
    const render = c.drawMotif.bind(c), send = c.sendController.bind(c);
    c.drawMotif = () => { renders++; render(); };
    c.sendController = (...args) => { generated++; send(...args); peak = Math.max(peak, c.atLEDQueue.size); };
    const messages = [];
    c.midiManager.send = (_, message) => { sent++; messages.push(message); };
    const selection = () => JSON.stringify(mode === "AT" ? [...state.atTransaction.instruments]
        : mode === "FOCUS" ? [...state.visibleInstrumentFilter] : state.selectedInstrument);
    const before = musicalContext(state, clock);
    for (let n = 0; n < 1024; n++) {
        const note = c.mapping.INSTRUMENTS[n % (mode === "ALTERNATE" ? 2 : 16)];
        const old = selection(); press(note); release(note); inputs += 2;
        if (old !== selection()) mutations++;
    }
    const final = selection(), synchronous = sent, pending = c.atLEDQueue.size;
    drainAT(t, c);
    assert.equal(selection(), final);
    assert.equal(inputs, 2048); assert.equal(mutations, 1024);
    assert.equal(requests, 1024); assert.equal(renders, 1);
    assert.equal(synchronous, 0); assert.ok(sent <= 56); assert.ok(peak <= 56);
    assert.equal(c.atLEDQueue.size, 0); assert.equal(c.instrumentFeedbackPending, false);
    assert.equal(c.atLEDTimer, null);
    const latest = new Map(messages.filter(m => m[0] === 0x90).map(m => [m[1], m[2]]));
    for (let i = 0; i < 16; i++) {
        const color = latest.get(c.mapping.INSTRUMENTS[i]);
        if (color !== undefined) assert.equal(color & 0x33, c.getInstrumentColor(i) & 0x33);
    }
    const sentAtConvergence = sent;
    t.mock.timers.tick(40);
    assert.equal(sent, sentAtConvergence);
    assert.deepEqual(musicalContext(state, clock), before);
    t.diagnostic(JSON.stringify({mode, inputs, mutations, requests, renders, generated, synchronous, sent, peak, pending, final}));
});

test("Instrument feedback replaces a partially sent burst and sends only changed pads thereafter", t => {
    const { state, c, tap, leds } = setup(t);
    state.transportState = "PLAY";
    state.motif[0][4] = true; state.motif[1][5] = true;
    c.drawSelectedMotif();
    tap(c.mapping.INSTRUMENTS[0]);
    t.mock.timers.tick(4); // First four writes have left, other pads are pending.
    tap(c.mapping.INSTRUMENTS[1]);
    tap(c.mapping.INSTRUMENTS[2]);
    drainAT(t, c);
    assert.equal(state.selectedInstrument, 2);
    for (let i = 0; i < 16; i++) assert.equal(leds.get('144:' + c.mapping.INSTRUMENTS[i]) & 0x33, c.getInstrumentColor(i) & 0x33);
    for (let i = 1; i < 32; i++) assert.equal(leds.get('144:' + c.mapping.MOTIF[i]) & 0x33, c.getMotifStepColor(i) & 0x33);
    let sends = 0; c.midiManager.send = () => sends++;
    tap(c.mapping.INSTRUMENTS[3]); drainAT(t, c);
    assert.equal(sends, 2); // Old and new Instrument only; unchanged Timeline is free.
    tap(c.mapping.INSTRUMENTS[4]); c.resetInputState();
    assert.equal(c.instrumentFeedbackPending, false); assert.equal(c.atLEDTimer, null);
});

test("Instrument stress interleaved with native clock preserves immediate musical Note On/Off and phase", async t => {
    const { state, actions, clock, c, tap } = setup(t);
    state.motif[12].fill(true); state.motif[13].fill(true);
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const notes = [], offs = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", dispatch + '; return triggerMotifStep;')(
        state, {options:[{textContent:"DBI"}],selectedIndex:0},
        {send:(_, message)=>notes.push(message),findOutput:()=>({})}, c, fn=>offs.push(fn));
    actions.startPlayback(); const revision = clock.transportRevision;
    actions.setClockStepHandler(() => { trigger(state.playheadPosition); c.drawClockStep((state.playheadPosition + 31) % 32, state.playheadPosition); });
    for (let n = 1; n <= 32; n++) {
        for (let i = 0; i < 64; i++) tap(c.mapping.INSTRUMENTS[i % 16]);
        const start = notes.length;
        clock.receiveInternalClockStep({sequence:n,transportRevision:revision});
        assert.equal(notes.length - start, 2);
        const ons = notes.slice(start);
        offs.splice(0).forEach(fn => fn());
        assert.deepEqual(notes.slice(start + 2), ons.map(([status,note]) => [status,note,0]));
        assert.equal(state.playheadPosition, n % 32);
        assert.equal(clock.transportRevision, revision);
        t.mock.timers.tick(4);
        assert.ok(c.atLEDQueue.size <= 48);
    }
    const count = notes.length; drainAT(t,c); t.mock.timers.tick(100);
    assert.equal(notes.length,count); assert.equal(offs.length,0);
});

for (const transport of ["STOP", "PAUSE", "PLAY"]) for (const long of [false, true])
test(`CHAIN DELETE confirmation duplicates ${transport} long=${long}`, t => {
    const { state, actions, clock, c, tap, press, release } = setup(t);
    state.currentView = "MOTIF_LIBRARY"; state.chainEnabled = true;
    state.chain = [0, 4, 2, 4, 7]; state.chainPlayingIndex = 1;
    state.chainPlayingDetached = false; state.playingMotifId = 4;
    state.chainLoopMasterIndex = 3; state.chainViewIndex = 4;
    state.transportState = transport; state.playheadPosition = 2;
    state.getMotif(4).events[12][1] = true; state.getMotif(4).motifLength = 5;
    state.getMotif(4).voiceLengths[12] = 3;
    const bank = structuredClone(state.motifs), revision = clock.transportRevision;
    tap(c.mapping.VALUE_CONTROLS.DELETE);
    const pad = c.mapping.BOOKS[4]; press(pad);
    t.mock.timers.tick(299);
    assert.deepEqual(state.chain, [0,4,2,4,7]); assert.deepEqual(state.motifs, bank);
    if (long) {
        t.mock.timers.tick(1);
        assert.deepEqual(state.chain, [0,2,7]);
        assert.equal(state.getMotif(4).events.some(row => row.some(Boolean)), false);
        assert.equal(state.getMotif(4).motifLength, null);
        assert.ok(state.getMotif(4).voiceLengths.every(n => n === null));
        assert.equal(state.chainLoopMasterIndex, null);
        if (transport === "PLAY") assert.equal(state.liveLengthCycle.duration, 5);
    }
    release(pad);
    assert.deepEqual(state.chain, long ? [0,2,7] : [0,2,4,7]);
    if (!long) { assert.deepEqual(state.motifs, bank); assert.equal(state.chainLoopMasterIndex, 2); }
    assert.equal(state.chainViewIndex, long ? 2 : 3);
    assert.equal(state.playingMotifId, 4); assert.equal(state.chainPlayingDetached, true);
    assert.equal(state.chainPlayingIndex, 0); assert.equal(state.nextMotifId, 2);
    assert.equal(state.playheadPosition, 2); assert.equal(clock.transportRevision, revision);
    const after = structuredClone(state.chain);
    t.mock.timers.tick(900); release(pad); assert.deepEqual(state.chain, after);
    assert.equal(c.deleteArmed, false);
});

for (const long of [false,true]) test(`CHAIN FOCUS DELETE stays local long=${long}`, t => {
    const { state, c, tap, press, release } = setup(t);
    state.currentView = "MOTIF_LIBRARY"; state.chainEnabled = true; state.chainFocus = true;
    state.chain = [0,4,2,4,7]; state.viewMotifId = 4; state.playingMotifId = 0;
    state.chainLoopMasterIndex = 3; state.getMotif(4).events[12][0] = true;
    tap(c.mapping.VALUE_CONTROLS.DELETE); press(c.mapping.BOOKS[4]);
    if (long) t.mock.timers.tick(600);
    release(c.mapping.BOOKS[4]);
    assert.deepEqual(state.chain, [0,4,2,4,7]); assert.equal(state.chainLoopMasterIndex, 3);
    assert.equal(state.chainFocus, true); assert.equal(state.viewMotifId, 4);
    assert.equal(state.getMotif(4).events[12][0], false);
});

test("CHAIN DELETE long empties an all-duplicate Chain; cancelled intent does nothing", t => {
    const { state, c, tap, press, release } = setup(t);
    state.currentView = "MOTIF_LIBRARY"; state.chainEnabled = true;
    state.chain = [4,4]; state.chainPlayingIndex = 0; state.playingMotifId = 4;
    state.getMotif(4).events[12][0] = true;
    tap(c.mapping.VALUE_CONTROLS.DELETE); press(c.mapping.BOOKS[4]);
    tap(c.mapping.VALUE_CONTROLS.DELETE); t.mock.timers.tick(600); release(c.mapping.BOOKS[4]);
    assert.deepEqual(state.chain,[4,4]); assert.equal(state.getMotif(4).events[12][0],true);
    tap(c.mapping.VALUE_CONTROLS.DELETE); press(c.mapping.BOOKS[4]); t.mock.timers.tick(300);
    release(c.mapping.BOOKS[4]); assert.deepEqual(state.chain,[]);
    assert.equal(state.chainPlayingIndex,-1); assert.equal(state.nextMotifId,null);
});

test("CHAIN long DELETE non-PLAYING preserves playing occurrence and shifts unrelated LoopMaster", t => {
    const {state,actions,clock,c,tap,press,release}=setup(t);
    state.currentView="MOTIF_LIBRARY"; state.chainEnabled=true; state.transportState="PLAY";
    state.chain=[0,4,2,4,7]; state.chainPlayingIndex=2; state.chainPlayingDetached=false;
    state.playingMotifId=2; state.chainLoopMasterIndex=4; state.chainViewIndex=2;
    state.playheadPosition=6; state.getMotif(4).events[12][0]=true;
    const revision=clock.transportRevision;
    tap(c.mapping.VALUE_CONTROLS.DELETE); press(c.mapping.BOOKS[4]);
    t.mock.timers.tick(300); release(c.mapping.BOOKS[4]);
    assert.deepEqual(state.chain,[0,2,7]); assert.equal(state.chainPlayingIndex,1);
    assert.equal(state.chainViewIndex,1); assert.equal(state.chainLoopMasterIndex,2);
    assert.equal(state.chainPlayingDetached,false); assert.equal(state.playingMotifId,2);
    assert.equal(state.nextMotifId,7); assert.equal(state.playheadPosition,6);
    assert.equal(clock.transportRevision,revision);
});

function beginColor(f) {
    f.actions.at.setColorEnabled(true);
    f.tap(f.c.mapping.BOOKS[1]);
    assert.equal(f.state.atTransaction?.slot, 1);
}
const colorAt = (state, voice, step, id = state.atTransaction?.editingMotifId ?? state.currentMotifId) =>
    state.getMotif(id).colors?.[voice]?.[step] ?? false;
const colorLED = (f, t, step) => {
    f.state.playheadPosition = step;
    f.c.drawPlayhead(); drainAT(t, f.c);
    return f.leds.get(`144:${f.c.mapping.AT_VALUE[0]}`) & 0x33;
};

test("COLOR availability gates BEGIN only, disabled pad is DIM RED, only active slot can finish", t => {
    const f = setup(t), { state, actions, c, tap, press, release } = f;
    assert.equal(state.colorEnabled, false); assert.equal(c.getATBookColor(1), "DIM_RED");
    tap(69); assert.equal(state.atTransaction, null);
    assert.equal(actions.at.begin(1), false);
    beginColor(f); state.motif[12][0] = true; tap(8);
    assert.equal(colorAt(state, 12, 0), true);
    tap(68); assert.equal(state.atTransaction.slot, 1);
    actions.at.setColorEnabled(false);
    assert.equal(c.getATBookColor(1), "DIM_RED");
    assert.equal(colorAt(state, 12, 0), true);
    press(69); t.mock.timers.tick(300); release(69);
    assert.equal(state.atTransaction, null); assert.equal(colorAt(state, 12, 0), true);
    tap(69); assert.equal(state.atTransaction, null);
});

test("COLOR scenarios A/B: Voice then two Steps; cursor inspects but never narrows collective edits", t => {
    const f = setup(t), { state, actions, c, tap } = f;
    for (const v of [12, 13]) for (const step of [1, 3, 5]) state.motif[v][step] = true;
    beginColor(f); tap(c.mapping.INSTRUMENTS[12]); state.playheadPosition = 31; tap(8);
    for (const step of [1, 3, 5]) {
        assert.equal(colorAt(state, 12, step), true);
        assert.equal(colorLED(f, t, step), (c.colors.RED & 0x33));
    }
    assert.equal(colorLED(f, t, 2), (c.colors.DIM_AMBER & 0x33));
    tap(c.mapping.INSTRUMENTS[13]); assert.equal(colorLED(f, t, 1), (c.colors.DIM_AMBER & 0x33));
    tap(c.mapping.MOTIF[1]);
    actions.at.select("steps", 3, true); actions.at.select("steps", 2, true);
    tap(8);
    assert.equal(colorAt(state, 13, 1), true); assert.equal(colorAt(state, 13, 3), true);
    assert.equal(colorAt(state, 13, 5), false); assert.equal(state.motif[13][2], false);
    assert.equal(colorAt(state, 13, 2), false);
    tap(8); assert.equal(colorAt(state, 13, 1), false); assert.equal(colorAt(state, 13, 3), false);
    assert.equal(colorAt(state, 12, 1), true);
    actions.at.finish(false); assert.equal(state.getMotif(0).colors, undefined);
});

test("COLOR scenarios C/D: mixed states become common ON/OFF, A shows 0/1/multiple events for full Step", t => {
    const f = setup(t), { state, actions, c, tap } = f;
    state.motif[12][2] = true; state.motif[13][2] = true; state.motif[14][4] = true;
    beginColor(f); actions.at.select("instruments", 12); tap(8);
    actions.at.select("instruments", 13, true);
    assert.equal(colorLED(f, t, 2), (c.colors.RED & 0x33));
    tap(8); assert.equal(colorLED(f, t, 2), (c.colors.RED & 0x33));
    t.mock.timers.tick(160); assert.equal(f.leds.get("144:8") & 0x33, (c.colors.RED & 0x33));
    tap(8); assert.equal(colorLED(f, t, 2), (c.colors.DIM_AMBER & 0x33));
    actions.at.select("instruments", 12); actions.at.select("instruments", 13);
    assert.equal(state.atTransaction.instruments.size, 0);
    state.playheadPosition = 31; tap(8);
    assert.equal(colorLED(f, t, 2), (c.colors.RED & 0x33)); assert.equal(colorLED(f, t, 4), (c.colors.RED & 0x33));
    assert.equal(colorLED(f, t, 3), (c.colors.DIM_AMBER & 0x33));
    actions.at.select("steps", 4);
    assert.equal(colorLED(f, t, 2), (c.colors.DIM_AMBER & 0x33)); assert.equal(colorLED(f, t, 4), (c.colors.RED & 0x33));
    actions.at.select("steps", 4); tap(8); tap(8);
    assert.equal(colorLED(f, t, 2), (c.colors.DIM_AMBER & 0x33)); assert.equal(colorLED(f, t, 4), (c.colors.DIM_AMBER & 0x33));
});

for (const transport of ["STOP", "PAUSE", "PLAY"]) test(`COLOR VALUE ownership and differential cursor feedback (${transport})`, t => {
    const f = setup(t), { state, clock, actions, c, tap } = f;
    state.transportState = transport; state.motif[12][1] = true;
    beginColor(f); tap(8); drainAT(t, c);
    const before = musicalContext(state, clock), bank = structuredClone(state.motifs);
    c.deleteArmed = true; c.copyStage = "SOURCE";
    for (const note of c.mapping.AT_VALUE.slice(1)) tap(note);
    assert.deepEqual(state.motifs, bank); assert.deepEqual(musicalContext(state, clock), before);
    assert.equal(c.deleteArmed, true); assert.equal(c.copyStage, "SOURCE");
    for (const note of c.mapping.AT_VALUE.slice(1)) assert.equal(f.leds.get(`144:${note}`) & 0x33, 0);
    c.deleteArmed = false; c.copyStage = null;
    const messages = []; const send = c.midiManager.send;
    c.midiManager.send = (...args) => { messages.push(args[1]); send(...args); };
    if (transport === "PLAY") { state.playheadPosition = 1; c.drawPlayhead(); }
    else tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0);
    // The A update is queued; musical state is independent from controller work.
    assert.equal(c.atLEDQueue.has("144:8"), true);
    drainAT(t, c);
    assert.equal(f.leds.get("144:8") & 0x33, (c.colors.RED & 0x33));
    messages.length = 0; c.drawPlayhead(); drainAT(t, c); assert.equal(messages.filter(m => m[1] === 8).length, 0);
    state.playheadPosition = 2; c.drawPlayhead();
    state.playheadPosition = 1; c.drawPlayhead(); drainAT(t, c);
    assert.equal(f.leds.get("144:8") & 0x33, (c.colors.RED & 0x33));
    assert.equal(clock.transportRevision, before.revision);
});

for (const commit of [false, true]) test(`COLOR scenario E: CHAIN pins transaction, timeline and PLAY panel through entry (${commit ? "COMMIT" : "CANCEL"})`, t => {
    const f = setup(t), { state, actions, c, tap } = f;
    state.motifs[0].motifLength = 2; state.motifs[1].motifLength = 3;
    state.motifs[0].events[12][0] = true; state.motifs[1].events[13][1] = true;
    actions.toggleChain(); actions.requestMotif(0); actions.requestMotif(1); actions.startPlayback();
    beginColor(f); tap(8);
    const motif1 = structuredClone(state.motifs[1]);
    actions.nextStep(); actions.nextStep();
    assert.equal(state.playingMotifId, 1); assert.equal(actions.at.getEditingMotifId(), 0);
    assert.equal(readATPanel(state).motif, 1); assert.equal(readATPanel(state).name, "COLOR");
    assert.deepEqual(readATPanel(state).values, ["ON"]);
    assert.equal(c.getMotifStepColor(0), c.colors.DIM_AMBER);
    assert.equal(c.getMotifStepColor(1), c.colors.OFF);
    tap(8); assert.deepEqual(readATPanel(state).values, ["OFF"]);
    tap(8); actions.at.finish(commit);
    assert.equal(colorAt(state, 12, 0, 0), commit);
    assert.deepEqual(state.motifs[1], motif1); assert.equal(readATPanel(state), null);
    actions.stop();
});

test("COLOR persistence excludes provisional edits, validates boolean matrices and keeps VELOCITY independent", t => {
    const f = setup(t), { state, actions, tap } = f;
    state.motif[12][1] = true;
    state.getMotif(0).velocities = createVelocities(); state.getMotif(0).velocities[12][1] = 48;
    const initial = snapshotMotifBank(state);
    beginColor(f); tap(8);
    assert.deepEqual(snapshotMotifBank(state), initial);
    let saves = 0; state.onBankChange = () => saves++;
    actions.at.finish(true); assert.equal(saves, 1);
    const saved = snapshotMotifBank(state), restored = new LiRythmeState();
    restoreMotifBank(restored, saved); assert.equal(colorAt(restored, 12, 1), true);
    assert.equal(velocity(restored, 12, 1), 48);
    const broken = structuredClone(saved); broken.motifs[0].colors[0][0] = 1;
    assert.throws(() => validateMotifBank(broken));
    beginColor(f); tap(8); tap(8); assert.equal(colorAt(state, 12, 1), false);
    assert.deepEqual(snapshotMotifBank(state), saved);
    actions.at.finish(false); assert.deepEqual(snapshotMotifBank(state), saved);
    assert.equal(actions.at.begin(0), true); actions.at.apply(0); actions.at.finish(false);
    assert.deepEqual(snapshotMotifBank(state), saved);
});

test("COLOR survives COPY/DOUBLE with independent rows, DELETE removes it, old copies clear it", t => {
    const f = setup(t), { state, actions, tap } = f;
    state.motif[12][1] = true; state.voiceLengths[12] = 4; state.motifLength = 8;
    beginColor(f); tap(8); actions.at.finish(true);
    const voice = actions.captureMusicalCopy("VOICE", 12);
    assert.equal(actions.applyVoiceCopy(voice, 13), true);
    assert.equal(colorAt(state, 13, 1), true);
    state.getMotif(0).colors[13][1] = false; assert.equal(colorAt(state, 12, 1), true);
    const motif = actions.captureMotifCopy(0); assert.equal(actions.applyMotifCopy(motif, 1), true);
    assert.equal(colorAt(state, 12, 1, 1), true);
    state.selectedInstrument = 12; assert.equal(actions.doubleSelected(), true);
    assert.equal(colorAt(state, 12, 5), true); assert.equal(state.motif[12][5], true);
    actions.toggleInstrumentStep(5); actions.toggleInstrumentStep(5); assert.equal(colorAt(state, 12, 5), false);
    actions.clearMotifEvents(12); assert.equal(colorAt(state, 12, 1), false);
    actions.applyVoiceCopy(voice, 12); delete voice.colors;
    actions.applyVoiceCopy(voice, 12); assert.equal(colorAt(state, 12, 1), false);
    actions.clearMotifEvents(); assert.equal(state.getMotif(0).colors, undefined);
    actions.deleteMotif(1); assert.equal(state.getMotif(1).colors, undefined);
});

for (const mode of ["INTERNAL", "MIDI"]) test(`COLOR MIDI variant/fallback, velocities, gates and DOUBLE temporal snapshot (${mode})`, async t => {
    const f = setup(t), { state, clock, actions, c, tap } = f;
    state.motifLength = 8; state.voiceLengths[12] = 4; state.voiceLengths[13] = 5;
    state.motif[12].fill(true); state.motif[13].fill(true);
    state.padConfiguration.voices[12].colorNote = 0; // valid, no transposition rule
    beginColor(f); tap(8); actions.at.finish(true); actions.at.setColorEnabled(false);
    state.getMotif(0).velocities = createVelocities(); state.getMotif(0).velocities[12].fill(48);
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const notes = [], offs = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
        { options: [{ textContent: "Synth" }], selectedIndex: 0 },
        { send: (_, msg) => notes.push(msg), findOutput: () => ({}) }, { pulseInstrument() {} }, fn => offs.push(fn));
    clock.setSource(mode); actions.startPlayback(); actions.setClockStepHandler(() => trigger(state.playheadPosition));
    const revision = clock.transportRevision;
    for (let tick = 1; tick <= 16; tick++) {
        if (tick === 2) {
            state.selectedInstrument = 12; assert.equal(actions.doubleSelected(), true);
            state.getMotif(0).colors[12].fill(false);
        }
        if (mode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
        else clock.receiveInternalClockStep({ sequence: tick, transportRevision: revision });
        assert.equal(notes.at(-2)[1], tick < 4 ? 0 : 36);
        assert.equal(notes.at(-2)[2], 48); assert.equal(notes.at(-1)[1], 37); // no COLOR note => main
        assert.equal(state.playheadPosition, tick % 8); assert.equal(clock.transportRevision, revision);
    }
    const ons = notes.slice(); state.padConfiguration.voices[12].colorNote = 127;
    actions.stop(); offs.forEach(fn => fn());
    assert.deepEqual(notes.slice(ons.length), ons.map(([s, n]) => [s, n, 0]));
    c.resetInputState();
});

test("COLOR PLAY panel shows collective ON/OFF separately from cursor intensity and restores VELOCITY rows", t => {
    const f = setup(t), { state, actions, tap } = f;
    const fields = new Map();
    const document = { getElementById(id) {
        if (!fields.has(id)) fields.set(id, { textContent: "", hidden: false, setAttribute() {}, classList: { toggle() {} } });
        return fields.get(id);
    } };
    const ui = initializePlayATUI({ state, document });
    state.motif[12][1] = true; state.motif[13][1] = true;
    beginColor(f); ui.render();
    assert.equal(fields.get("play-selection-title").textContent, "COLOR");
    assert.equal(fields.get("play-at-value-0").textContent, "A   —");
    for (let i = 1; i < 8; i++) assert.equal(fields.get(`play-at-value-${i}`).hidden, true);
    actions.at.select("instruments", 12); actions.at.select("steps", 1);
    tap(8); ui.render(); assert.equal(fields.get("play-at-value-0").textContent, "A   ON");
    assert.match(fields.get("play-at-target").textContent, /Kick/);
    state.playheadPosition = 30; ui.render(); assert.equal(fields.get("play-at-value-0").textContent, "A   ON");
    tap(8); ui.render(); assert.equal(fields.get("play-at-value-0").textContent, "A   OFF");
    actions.at.finish(true); ui.render(); assert.equal(fields.get("play-selected").hidden, false);
    actions.at.begin(0); ui.render();
    for (let i = 0; i < 8; i++) assert.equal(fields.get(`play-at-value-${i}`).hidden, false);
    assert.equal(fields.get("play-at-value-7").textContent, "H   16");
});

test("COLOR FOCUS pins VIEW at BEGIN despite later focus navigation; no provisional disk values", t => {
    const f = setup(t), { state, actions, tap, c } = f;
    state.chainEnabled = true; state.chainFocus = true; state.viewMotifId = 3;
    state.motifs[3].events[12][1] = true; state.motifs[4].events[13][2] = true;
    beginColor(f); state.viewMotifId = 4;
    tap(8);
    assert.equal(colorAt(state, 12, 1, 3), true); assert.equal(colorAt(state, 13, 2, 4), false);
    assert.equal(readATPanel(state).motif, 4);
    assert.equal(c.getMotifStepColor(1), c.colors.DIM_AMBER);
    assert.equal(snapshotMotifBank(state).motifs[3].colors, undefined);
    actions.at.finish(false); assert.equal(state.motifs[3].colors, undefined);
});

test("COLOR Book regression: real SETTINGS preference drives physical pad 69 and click accessibility", async t => {
    const f = setup(t), { state, actions, c, leds, tap } = f;
    const fields = new Map(), lifecycle = {}, preferences = new Map();
    const get = id => {
        if (!fields.has(id)) fields.set(id, { textContent: "", value: "", checked: false,
            hidden: false, children: [], options: [], selectedIndex: 0, listeners: {},
            setAttribute() {}, replaceChildren(...children) { this.children = children; }, appendChild(child) { this.children.push(child); },
            addEventListener(name, callback) { this.listeners[name] = callback; } });
        return fields.get(id);
    };
    const saved = { document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage };
    globalThis.document = { getElementById: get, createElement: () => ({ setAttribute() {}, addEventListener() {} }), addEventListener() {} };
    globalThis.window = { addEventListener: (name, callback) => { lifecycle[name] = callback; } };
    globalThis.localStorage = { getItem: key => preferences.get(key) ?? null,
        setItem: (key, value) => preferences.set(key, value) };
    t.after(() => { lifecycle.pagehide?.(); Object.assign(globalThis, saved); });
    const library = `data:text/javascript;base64,${Buffer.from('export const initializePadLibraryUI = () => ({ busy:false, hasActivePreset:true, ready:Promise.resolve(), refresh() {} });').toString('base64')}`;
    const { initializeSettingsUI } = await import(await load("SettingsUI.js", {
        "./PadLibraryUI.js": library,
        "./PadVoiceEditor.mjs": new URL("../src/PadVoiceEditor.mjs", import.meta.url).href
    }));
    await initializeSettingsUI({ state, clock: f.clock, actions }).ready;
    const colorPad = c.mapping.BOOKS[1];
    assert.equal(colorPad, 69); assert.equal(actions.at.definition(1).id, "COLOR");
    const revision = f.clock.transportRevision;
    for (const enabled of [false, true, false, true]) {
        get("color-enabled").checked = enabled;
        get("color-enabled").listeners.change(); drainAT(t, c);
        assert.equal(state.colorEnabled, enabled);
        assert.equal(preferences.get("colorEnabled"), String(enabled));
        assert.equal(leds.get(`144:${colorPad}`), ((enabled ? c.colors.RED : c.colors.DIM_RED) & 0x33) | 4);
        const bank = structuredClone(state.motifs);
        tap(colorPad);
        assert.equal(state.atTransaction?.slot ?? null, enabled ? 1 : null);
        assert.deepEqual(state.motifs, bank);
        if (enabled) tap(colorPad); // existing CANCEL grammar
        drainAT(t, c);
        assert.equal(state.atTransaction, null);
        assert.equal(leds.get(`144:${colorPad}`), ((enabled ? c.colors.RED : c.colors.DIM_RED) & 0x33) | 4);
    }
    assert.equal(f.clock.transportRevision, revision);
    assert.equal(state.transportState, "STOP");
});

for (const slot of [0, 1]) for (const scenario of ["empty", "mixed steps", "mixed voices"]) {
    test(`${slot === 0 ? "VELOCITY" : "COLOR"}: ${scenario} edits only occupied target cells and renders selection separately`, t => {
        const f = setup(t), { state, actions, c, tap } = f;
        state.colorEnabled = true;
        state.motif[12][2] = true;
        state.motif[14][3] = true; // not in the selected Voices
        const events = structuredClone(state.motif);
        tap(c.mapping.BOOKS[slot]);
        actions.at.select("instruments", 12);
        actions.at.select("steps", scenario === "empty" ? 3 : 2);
        if (scenario === "mixed steps") actions.at.select("steps", 3, true);
        if (scenario === "mixed voices") actions.at.select("instruments", 13, true);
        assert.equal(c.getMotifStepColor(3), scenario === "mixed voices" ? c.colors.OFF : c.colors.DIM_GREEN);
        if (scenario !== "empty") assert.equal(c.getMotifStepColor(2), c.colors.YELLOW);
        const before = structuredClone(state.motifs);
        const valueIndex = slot === 0 ? 7 : 0;
        assert.equal(actions.at.apply(valueIndex), scenario !== "empty");
        assert.deepEqual(state.motif, events);
        if (scenario === "empty") {
            assert.deepEqual(state.motifs, before);
            assert.equal(state.atTransaction.valueIndex, null);
            assert.equal(state.atTransaction.touched.size, 0);
            assert.equal(readATPanel(state).selected, null);
            drainAT(t, c);
            const expected = slot === 0 ? c.colors.OFF : c.colors.DIM_AMBER;
            assert.equal(f.leds.get(`144:${c.mapping.AT_VALUE[valueIndex]}`), (expected & 0x33) | 4);
            let saves = 0; state.onBankChange = () => saves++;
            actions.at.finish(true); assert.equal(saves, 0);
            return;
        }
        const matrix = slot === 0 ? state.getMotif(0).velocities : state.getMotif(0).colors;
        for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
            // Dense legacy matrices retain only neutral defaults on empty cells.
            assert.equal(matrix[voice][step], voice === 12 && step === 2 ? (slot === 0 ? 16 : true) : (slot === 0 ? 100 : false));
        }
        assert.equal(state.atTransaction.touched.size, 1);
        actions.at.finish(false); assert.deepEqual(state.motifs, before);
    });
}

test("empty COLOR click does not advance collective toggle; selected empty Steps stay navigable", t => {
    const f = setup(t), { state, actions, c, tap } = f;
    beginColor(f); actions.at.select("steps", 1);
    tap(8); assert.equal(state.atTransaction.valueIndex, null);
    assert.equal(state.getMotif(0).colors, undefined);
    tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0);
    assert.equal(state.playheadPosition, 1); assert.equal(state.atTransaction.steps.has(1), true);
    assert.equal(c.getMotifStepColor(1), c.colors.DIM_GREEN);
    state.motif[12][1] = true;
    tap(8); assert.equal(colorAt(state, 12, 1), true);
    assert.equal(c.getMotifStepColor(1), c.colors.DIM_RED);
});

for (const slot of [null, 0, 1]) test(`STOP preview and cursor render actual editing events and attributes (slot ${slot})`, async t => {
    const f = setup(t), { state, actions, clock, c, tap, leds } = f;
    state.chainEnabled = true; state.chainFocus = true; state.viewMotifId = 3;
    const edit = state.getMotif(3);
    edit.motifLength = 8; edit.voiceLengths[12] = 1;
    edit.events[12][1] = true;
    edit.velocities = createVelocities(); edit.velocities[12][1] = 127;
    edit.colors = Array.from({ length: 16 }, () => Array(32).fill(false)); edit.colors[12][1] = true;
    state.padConfiguration.voices[12].colorNote = 60;
    state.getMotif(0).events[13][1] = true; // must not preview PLAYING
    if (slot !== null) { state.colorEnabled = true; actions.at.begin(slot); }
    const app = await source("app.js");
    const code = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const messages = [], offs = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", code + '; return triggerMotifStep;')(state,
        { options: [{ textContent: "Synth" }], selectedIndex: 0 },
        { send: (_, msg) => messages.push(msg), findOutput: () => ({}) }, c, fn => offs.push(fn));
    actions.setStepPreviewHandler(trigger);
    const revision = clock.transportRevision;
    tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0); drainAT(t, c);
    assert.deepEqual(messages, [[0x99, 60, 127]]);
    assert.equal(state.playingMotifId, 0); assert.equal(state.playheadPosition, 1);
    assert.equal(c.lastPlayheadStep, 1);
    assert.equal(leds.get('144:' + c.mapping.MOTIF[1]) & 0x33, (slot === null ? c.colors.GREEN : c.colors.RED) & 0x33);
    assert.equal(c.getInstrumentColor(12), c.colors.GREEN);
    assert.equal(c.getInstrumentColor(13), c.colors.DIM_GREEN);
    if (slot !== null) assert.equal(leds.get('144:8') & 0x33, c.colors.RED & 0x33);
    tap(c.mapping.TOP_CONTROLS.NEXT, 0xB0); drainAT(t, c);
    assert.equal(messages.length, 1); assert.equal(c.getInstrumentColor(12), c.colors.DIM_GREEN);
    if (slot !== null) assert.equal(leds.get('144:8') & 0x33, (slot === 0 ? c.colors.OFF : c.colors.DIM_AMBER) & 0x33);
    state.padConfiguration.voices[12].colorNote = 72; offs.forEach(fn => fn());
    assert.deepEqual(messages[1], [0x99, 60, 0]);
    assert.equal(clock.transportRevision, revision); assert.equal(state.transportState, "STOP");
});

for (const slot of [0, 1]) test(`A/T PLAY cursor advances and Instrument feedback lasts the full Step (slot ${slot})`, t => {
    const f = setup(t), { state, actions, c, leds } = f;
    state.colorEnabled = true; state.motif[12][1] = true;
    actions.at.begin(slot); state.transportState = "PLAY";
    actions.nextStep(); c.drawClockStep(0, 1); drainAT(t, c);
    assert.equal(c.getInstrumentColor(12), c.colors.GREEN);
    assert.equal(leds.get('144:' + c.mapping.MOTIF[1]) & 0x33, c.colors.GREEN & 0x33);
    c.pulseInstrument(12); t.mock.timers.tick(100); drainAT(t, c);
    assert.equal(c.getInstrumentColor(12), c.colors.GREEN);
    assert.equal(c.instrumentPulses.size, 0);
    actions.nextStep(); c.drawClockStep(1, 2); drainAT(t, c);
    assert.equal(c.getInstrumentColor(12), c.colors.DIM_GREEN);
    assert.equal(leds.get('144:' + c.mapping.MOTIF[1]) & 0x33, c.colors.DIM_AMBER & 0x33);
    assert.equal(leds.get('144:' + c.mapping.MOTIF[2]) & 0x33, c.colors.DIM_GREEN & 0x33);
});

test("preview worker drops queued/late arrow Note Ons across PLAY, retains every Note Off and normal note", async () => {
    const worker = await source("hardware/midi/MidiClockWorker.cjs");
    const helpers = worker.slice(worker.indexOf("function isNoteOff("), worker.indexOf("function dropPendingMidiMessages("));
    const commands = worker.slice(worker.indexOf("function handleCommand(command)"), worker.indexOf("function handleCommandSafely("));
    const run = new Function(`
        let previewEpoch = 0, pendingMidiMessages = [], pendingNoteOffMessages = [];
        let now = 0, idleMidiFlushScheduled = false, diagnostic = null;
        const Date = { now: () => now }, MAX_PENDING_MIDI_MESSAGES = 256;
        const sent = [], output = {sendMessage: message => sent.push(message)};
        const canRun = () => false, setImmediate = () => {};
        const getPendingMidiCount = () => pendingMidiMessages.length + pendingNoteOffMessages.length;
        ${helpers}
        ${commands}
        return {send: handleCommand, flush() { while (getPendingMidiCount()) sendOnePendingMidiMessage(); },
            advance(ms) { now += ms; }, sent};
    `);
    const f = run();
    // Simulate a blocked output queue while arrows preview several Steps.
    for (let note = 36; note < 40; note++) f.send({type:"SEND_MIDI",message:[0x99,note,100],previewEpoch:0,previewExpiresAt:50});
    f.send({type:"SEND_MIDI",message:[0x99,35,0]});
    f.send({type:"INVALIDATE_PREVIEWS",epoch:1});
    f.send({type:"SEND_MIDI",message:[0x99,40,100],previewEpoch:0,previewExpiresAt:50}); // late IPC
    f.send({type:"SEND_MIDI",message:[0x99,42,100]}); // first playback note
    f.flush(); assert.deepEqual(f.sent, [[0x99,35,0],[0x99,42,100]]);
    // Fresh previews still sound; their gate is not cancelled by a transition.
    f.send({type:"SEND_MIDI",message:[0x99,60,48],previewEpoch:1,previewExpiresAt:50}); f.flush();
    f.send({type:"INVALIDATE_PREVIEWS",epoch:2});
    f.send({type:"SEND_MIDI",message:[0x99,60,0]}); f.flush();
    assert.deepEqual(f.sent.slice(-2), [[0x99,60,48],[0x99,60,0]]);
    f.send({type:"SEND_MIDI",message:[0x99,61,100],previewEpoch:2,previewExpiresAt:50});
    f.advance(50); f.flush(); assert.equal(f.sent.length, 4);
});

test("preview routing rejects expired and invalidated notes before a destination becomes ready", async () => {
    const code = await source("hardware/midi/MidiClockUtility.cjs");
    const route = code.slice(code.indexOf("function routeNotesMessage("), code.indexOf("function reconcileOutputRouting("));
    const f = new Function(`let previewEpoch=0, workerDestinationName=null, notesDestinationName="Synth", now=0;
        const Date={now:()=>now}, pendingNotesMessages=[], sent=[];
        const clockWorker={postMessage:msg=>sent.push(msg)}, nativeMidiBridge={notesOutputName:null};
        ${route}
        return {route:routeNotesMessage, flush:flushPendingNotesMessages, pendingNotesMessages, sent,
            ready(){workerDestinationName="Synth";}, invalidate(){previewEpoch++;}, advance(){now=50;}};
    `)();
    const note = {name:"Synth",message:[0x99,36,100],previewEpoch:0,previewExpiresAt:50};
    assert.equal(f.route(note.name, note.message, note), false);
    f.pendingNotesMessages.push(note, {name:"Synth",message:[0x99,35,0]});
    f.invalidate(); f.ready(); f.flush();
    assert.deepEqual(f.sent, [{type:"SEND_MIDI",message:[0x99,35,0]}]);
    assert.equal(f.pendingNotesMessages.length, 0);
    assert.equal(f.route("Synth", [0x99,37,100], {previewEpoch:1,previewExpiresAt:50}), true);
    f.advance(); f.route("Synth", [0x99,38,100], {previewEpoch:1,previewExpiresAt:50});
    assert.equal(f.sent.length, 2);
});

test("arrow preview metadata reaches native MIDI; transport invalidation leaves gate Note Off untagged", async t => {
    const { state, actions } = setup(t);
    const { MidiManager } = await import(await load("hardware/midi/MidiManager.js"));
    const commands = [], offs = [];
    const midi = Object.assign(Object.create(MidiManager.prototype), {
        backend:"NATIVE_MIDI", previewEpoch:0, controllerOutputName:"LP",
        nativeBridge:{send:message=>commands.push(message)}, findOutput:()=>({})
    });
    state.motif[12][1] = true;
    const app = await source("app.js");
    const code = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const trigger = new Function("state","midiOutputSelector","midiManager","launchpad","setTimeout",code+';return triggerMotifStep;')(state,
        {options:[{textContent:"Synth"}],selectedIndex:0},midi,{pulseInstrument(){}},fn=>offs.push(fn));
    actions.setStepPreviewHandler(trigger);
    actions.navigate(1);
    assert.equal(commands[0].previewEpoch, 0);
    assert.ok(commands[0].previewExpiresAt <= Date.now()+50);
    midi.invalidatePreviews();
    assert.deepEqual(commands[1], {type:"INVALIDATE_PREVIEWS",epoch:1});
    offs[0]();
    assert.deepEqual(commands[2], {type:"SEND_NOTES",name:"Synth",message:[0x99,36,0]});
    trigger(1);
    assert.equal(commands[3].previewEpoch, undefined);
    assert.match(app, /playStatusUI.render\(\);\s*midiManager.invalidatePreviews\(\);/);
});

test("complete INTERNAL worker emits arrow previews and gates during STOP before any START", async () => {
    const { runInNewContext } = await import("node:vm");
    const code = await source("hardware/midi/MidiClockWorker.cjs");
    let now = 0n, listener;
    const sent = [], posted = [], callbacks = [];
    const scheduled = [
        [10, {type:"SEND_MIDI",message:[0x99,36,100],previewEpoch:0,previewExpiresAt:60}],
        [60, {type:"SEND_MIDI",message:[0x99,36,0]}],
        [90, {type:"SEND_MIDI",message:[0x99,37,48],previewEpoch:0,previewExpiresAt:140}],
        [140, {type:"SEND_MIDI",message:[0x99,37,0]}],
        [170, {type:"INVALIDATE_PREVIEWS",epoch:1}],
        [170, {type:"TRANSPORT",status:"START",transportRevision:1}],
        [340, {type:"SET_ENABLED",enabled:false}]
    ];
    const port = { on: (_, cb) => {listener=cb;}, postMessage: msg => posted.push(msg) };
    runInNewContext(code, {
        __dirname:"mock", setImmediate: cb=>callbacks.push(cb),
        Date:{now:()=>Number(now)/1e6},
        process:{versions:{},hrtime:{bigint:()=>{now+=10000n;return now;}},exit(){throw Error("unexpected exit");}},
        require(name) {
            if(name==="node:path") return {join:(...parts)=>parts.join("/")};
            if(name==="node:worker_threads") return {parentPort:port,receiveMessageOnPort(){
                if(scheduled.length && Number(now)/1e6>=scheduled[0][0]) return {message:scheduled.shift()[1]};
            }};
            if(name==="@julusian/midi") return {Output:class {
                getPortCount(){return 1;} getPortName(){return "Synth";} openPort(){} closePort(){}
                sendMessage(msg){sent.push({at:Number(now)/1e6,message:Array.from(msg)});}
            }};
            return {prepareTimingThread(){},preciseSleep(ms){now+=BigInt(Math.round(ms*1e6));}};
        }
    }, {timeout:2000});
    listener({type:"SET_DESTINATION",name:"Synth"});
    listener({type:"SET_CLOCK_OUTPUT_SELECTED",selected:true});
    listener({type:"SET_STEP_TRANSPORT",status:"STOP",transportRevision:0});
    listener({type:"SET_ENABLED",enabled:true});
    while(callbacks.length) callbacks.shift()();
    const notes=sent.filter(entry=>entry.message.length===3);
    assert.deepEqual(notes.map(entry=>entry.message), [[0x99,36,100],[0x99,36,0],[0x99,37,48],[0x99,37,0]]);
    assert.ok(notes.every(entry=>entry.at<170), "all preview notes and gates must exit while stopped");
    assert.ok(notes[0].at<50 && notes[2].at<130, "previews must not wait for START");
    assert.equal(sent.filter(entry=>entry.message[0]===0xFA).length,1);
    assert.ok(posted.filter(entry=>entry.type==="STEP").every(entry=>entry.transportRevision===1));
    assert.equal(posted.some(entry=>entry.type==="ERROR"),false);
});

for (const slot of [0, 1]) for (const destination of ["STEP", "INSTRUMENT", "MOTIF"]) {
    test(`A/T destination ${destination}, family ${slot}: LEDs, save and cancel`, t => {
        const { state, actions, c, leds } = setup(t);
        state.currentView = "PLAY"; state.colorEnabled = true;
        state.motif[0][0] = state.motif[0][3] = true;
        actions.at.begin(slot);
        if (destination !== "MOTIF") actions.at.select("instruments", 0);
        if (destination === "STEP") {
            actions.at.select("steps", 0); actions.at.select("steps", 3, true);
        }
        actions.at.apply(0); drainAT(t, c);
        const led = (status, note) => leds.get(status + ':' + note) & 0x33;
        assert.equal(c.getMotifStepColor(3), destination === "STEP" ? slot === 0 ? c.colors.YELLOW : c.colors.DIM_RED : c.colors.DIM_AMBER);
        assert.equal(led(144, c.mapping.MOTIF[0]), (destination === "STEP" && slot !== 0 ? c.colors.RED : c.colors.GREEN) & 0x33);
        assert.equal(c.getInstrumentColor(0), destination === "INSTRUMENT" ? slot === 0 ? c.colors.YELLOW : c.colors.RED
            : destination === "STEP" ? c.colors.YELLOW : c.colors.GREEN);
        assert.equal(c.hasMotifAT(), destination === "MOTIF");
        if (destination === "MOTIF") assert.equal(led(176, c.mapping.TOP_CONTROLS.PLAY_STOP), c.colors.DIM_RED & 0x33);
        state.playheadPosition = 2; c.drawPlayhead(); drainAT(t, c);
        if (destination === "INSTRUMENT") assert.equal(c.getInstrumentColor(0), slot === 0 ? c.colors.DIM_AMBER : c.colors.DIM_RED);
        if (destination === "MOTIF") {
            state.transportState = "PLAY"; c.pulseTransport();
            assert.equal(led(176, c.mapping.TOP_CONTROLS.PLAY_STOP), c.colors.RED & 0x33);
            t.mock.timers.tick(120); drainAT(t, c);
            assert.equal(led(176, c.mapping.TOP_CONTROLS.PLAY_STOP), c.colors.DIM_RED & 0x33);
            state.transportState = "STOP";
        }
        assert.equal(snapshotMotifBank(state).motifs[0].atDestinations, undefined);
        actions.at.finish(true);
        const bank = snapshotMotifBank(state);
        const key = actions.at.definition(slot).id;
        assert.equal(bank.motifs[0].atDestinations[key][0][3], destination);
        restoreMotifBank(state, bank);
        actions.at.begin(slot);
        assert.equal(c.hasMotifAT(), destination === "MOTIF");
        actions.at.select("steps", 3); actions.at.apply(0);
        actions.at.finish(false);
        assert.deepEqual(snapshotMotifBank(state), bank);
        actions.at.begin(1 - slot);
        assert.equal(c.hasMotifAT(), false);
        assert.notEqual(c.getMotifStepColor(3), c.colors.DIM_RED);
        assert.notEqual(c.getInstrumentColor(0), c.colors.DIM_RED);
    });
}

test("BOOK Delete then A/T resets all families only in editing motif, without opening a transaction", t => {
    const { state, actions, c, tap } = setup(t);
    state.currentView = "PLAY"; state.colorEnabled = true;
    state.chainEnabled = true; state.chainFocus = true; state.viewMotifId = 3;
    state.getMotif(3).events[0][0] = true; state.getMotif(0).events[0][0] = true;
    state.getMotif(0).velocities = createVelocities(); state.getMotif(0).velocities[0][0] = 16;
    for (const slot of [0, 1]) { actions.at.begin(slot); actions.at.apply(0); actions.at.finish(true); }
    const beforeEvents = structuredClone(state.getMotif(3).events);
    tap(c.mapping.VALUE_CONTROLS.DELETE); assert.equal(c.deleteArmed, true);
    tap(c.mapping.BOOKS[1]); drainAT(t, c);
    assert.equal(state.atTransaction, null); assert.equal(c.deleteArmed, false);
    assert.equal(state.getMotif(3).velocities, undefined);
    assert.equal(state.getMotif(3).colors, undefined);
    assert.equal(state.getMotif(3).atDestinations, undefined);
    assert.deepEqual(state.getMotif(3).events, beforeEvents);
    assert.equal(state.getMotif(0).velocities[0][0], 16);
    assert.equal(snapshotMotifBank(state).motifs[3].atDestinations, undefined);
});

test("A/T destinations survive independent copies and clear with events; malformed data is rejected", t => {
    const { state, actions } = setup(t);
    state.currentView = "PLAY"; state.motif[0][3] = true;
    actions.at.begin(0); actions.at.select("instruments", 0); actions.at.apply(0); actions.at.finish(true);
    const source = actions.captureMotifCopy(0);
    assert.equal(actions.applyMotifCopy(source, 1), true);
    source.atDestinations.VELOCITY[0][3] = "STEP";
    assert.equal(state.getMotif(1).atDestinations.VELOCITY[0][3], "INSTRUMENT");
    const voice = actions.captureMusicalCopy("VOICE", 0);
    assert.equal(actions.applyVoiceCopy(voice, 1), true);
    voice.atDestinations.VELOCITY[3] = "STEP";
    assert.equal(state.getMotif(0).atDestinations.VELOCITY[1][3], "INSTRUMENT");
    actions.clearMotifEvents(1);
    assert.equal(state.getMotif(0).atDestinations.VELOCITY[1][3], null);
    assert.equal(state.getMotif(0).atDestinations.VELOCITY[0][3], "INSTRUMENT");
    state.selectedInstrument = 0; state.getMotif(0).voiceLengths[0] = 4;
    assert.equal(actions.doubleSelected(), true);
    assert.equal(state.getMotif(0).atDestinations.VELOCITY[0][7], "INSTRUMENT");
    const bank = snapshotMotifBank(state);
    bank.motifs[0].atDestinations.VELOCITY[0][3] = "INVALID";
    assert.throws(() => validateMotifBank(bank));
    source.atDestinations.VELOCITY[0][3] = "INVALID";
    assert.equal(actions.applyMotifCopy(source, 2), false);
    voice.atDestinations.VELOCITY[3] = "INVALID";
    assert.equal(actions.applyVoiceCopy(voice, 2), false);
    actions.clearMotifEvents();
    assert.equal(state.getMotif(0).atDestinations, undefined);
});

for (const [target, voices, steps] of [
    ["motif", [], []], ["instrument", [0], []], ["steps", [], [0, 1]], ["intersection", [0], [0, 1]]
]) test(`ROTATION ${target}: simultaneous moves, swaps, attributes, cancel and autosave`, t => {
    const { state, actions } = setup(t);
    const motif = state.getMotif(0);
    motif.events[0][0] = motif.events[0][1] = motif.events[0][2] = motif.events[1][0] = true;
    motif.velocities = createVelocities();
    motif.velocities[0][0] = 16; motif.velocities[0][1] = 64; motif.velocities[0][2] = 127;
    motif.colors = Array.from({ length: 16 }, () => Array(32).fill(false)); motif.colors[0][0] = true;
    motif.atDestinations = { COLOR: Array.from({ length: 16 }, () => Array(32).fill(null)) };
    motif.atDestinations.COLOR[0][0] = "INSTRUMENT";
    motif.voiceLengths[0] = 4; motif.motifLength = 8;
    const before = snapshotMotifBank(state);
    assert.equal(actions.at.begin(8), true);
    for (const voice of voices) actions.at.select("instruments", voice, true);
    for (const step of steps) actions.at.select("steps", step, true);
    assert.equal(actions.at.rotate(1), true);
    assert.equal(motif.events[0][0], steps.length > 0);
    if (steps.length) assert.equal(motif.velocities[0][0], 127);
    assert.equal(motif.events[0][1], true); assert.equal(motif.velocities[0][1], 16);
    assert.equal(motif.events[0][2], true); assert.equal(motif.velocities[0][2], 64);
    assert.equal(motif.colors[0][1], true); assert.equal(motif.colors[0][0], false);
    assert.equal(motif.atDestinations.COLOR[0][1], "INSTRUMENT");
    assert.equal(motif.events[0][3], steps.length === 0);
    assert.equal(motif.events[1][0], voices.length > 0);
    assert.equal(motif.events[1][1], voices.length === 0);
    assert.equal(motif.atDestinations.ROTATION[0][1], steps.length ? "STEP" : voices.length ? "INSTRUMENT" : "MOTIF");
    assert.deepEqual([...state.atTransaction.steps], steps.map(step => step + 1));
    assert.equal(motif.voiceLengths[0], 4); assert.equal(motif.motifLength, 8);
    assert.deepEqual(snapshotMotifBank(state), before);
    actions.at.finish(false);
    assert.deepEqual(snapshotMotifBank(state), before);
});

test("ROTATION wraps, follows the moving selection, commits and survives save/copy/reset", t => {
    const { state, actions, c } = setup(t);
    state.motif[0][31] = true;
    actions.at.begin(8); actions.at.select("instruments", 0); actions.at.select("steps", 31);
    actions.at.rotate(1); assert.equal(state.motif[0][0], true);
    actions.at.rotate(1); assert.equal(state.motif[0][1], true);
    assert.deepEqual([...state.atTransaction.steps], [1]);
    assert.equal(c.getMotifStepColor(1), c.colors.DIM_RED);
    assert.notEqual(c.getInstrumentColor(0), c.colors.RED);
    actions.at.rotate(-1); actions.at.rotate(-1); assert.equal(state.motif[0][31], true);
    actions.at.finish(true);
    const bank = snapshotMotifBank(state); restoreMotifBank(state, bank);
    assert.equal(state.getMotif(0).atDestinations.ROTATION[0][31], "STEP");
    assert.equal(actions.applyMotifCopy(actions.captureMotifCopy(0), 1), true);
    assert.equal(state.getMotif(1).atDestinations.ROTATION[0][31], "STEP");
    assert.equal(actions.applyVoiceCopy(actions.captureMusicalCopy("VOICE", 0), 1), true);
    assert.equal(state.getMotif(0).atDestinations.ROTATION[1][31], "STEP");
    actions.at.resetMotif();
    assert.equal(state.motif[0][31], true); assert.equal(state.getMotif(0).atDestinations, undefined);
});

test("ROTATION empty targets and VALUE pads are inert; rotation pins the editing motif", t => {
    const { state, actions, c, tap } = setup(t);
    state.chainEnabled = true; state.chainFocus = true; state.viewMotifId = 3;
    state.getMotif(3).events[0][0] = true; state.getMotif(0).events[0][0] = true;
    actions.at.begin(8); actions.at.select("steps", 2);
    const before = structuredClone(state.motifs);
    assert.equal(actions.at.rotate(1), false);
    for (const pad of c.mapping.AT_VALUE) tap(pad);
    assert.deepEqual(state.motifs, before); assert.equal(state.atTransaction.touched.size, 0);
    actions.at.select("steps", 2);
    state.viewMotifId = 4;
    actions.at.rotate(1);
    assert.equal(state.getMotif(3).events[0][1], true);
    assert.equal(state.getMotif(0).events[0][0], true);
    assert.equal(state.getMotif(4).events[0][1], false);
    assert.equal(readATPanel(state).name, "ROTATION");
    assert.equal(readATPanel(state).values.length, 2);
});

for (const commit of [false, true]) test(`ROTATION hardware arrows blink RED, consume holds, ${commit ? "commit" : "cancel"}`, t => {
    const { state, actions, c, tap, press, release, leds, clock } = setup(t);
    state.motif[0][0] = true; state.transportState = "PLAY";
    const before = musicalContext(state, clock);
    const rotation = c.mapping.BOOKS[8], left = c.mapping.TOP_CONTROLS.PREVIOUS, right = c.mapping.TOP_CONTROLS.NEXT;
    tap(rotation); drainAT(t, c);
    const color = note => leds.get('176:' + note) & 0x33;
    assert.equal(state.atTransaction.slot, 8);
    assert.equal(color(left), c.colors.RED & 0x33); assert.equal(color(right), c.colors.RED & 0x33);
    t.mock.timers.tick(160); drainAT(t, c);
    assert.equal(color(left), 0); assert.equal(color(right), 0);
    t.mock.timers.tick(160); drainAT(t, c);
    assert.equal(color(left), c.colors.RED & 0x33);
    press(right, 0xB0); press(right, 0xB0); t.mock.timers.tick(500);
    assert.equal(state.motif[0][1], true); assert.equal(state.motif[0][2], false);
    assert.deepEqual({ ...musicalContext(state, clock), live: before.live }, before);
    assert.equal(state.getPlaybackMotifForVoice(0).events[0][0], true);
    if (commit) { press(rotation); t.mock.timers.tick(300); release(rotation); } else tap(rotation);
    release(right, 0xB0); drainAT(t, c);
    assert.equal(state.atTransaction, null); assert.equal(c.atBlinkTimer, null);
    assert.equal(state.motif[0][commit ? 1 : 0], true);
    assert.equal(c.nextPressed, false); assert.equal(c.focusNavigationHeld?.size ?? 0, 0);
    assert.notEqual(color(left), c.colors.RED & 0x33);
});

for (const direction of [-1, 1]) test(`ROTATION respects individual 8/6 cycles and preserves out-of-cycle events (${direction})`, t => {
    const { state, actions } = setup(t);
    const motif = state.getMotif(0);
    motif.voiceLengths[0] = 8; motif.voiceLengths[1] = 6;
    motif.motifLength = 4; // Global break must not replace individual voice cycles.
    motif.events[0][direction === 1 ? 7 : 0] = true;
    motif.events[1][direction === 1 ? 5 : 0] = true;
    motif.events[0][12] = motif.events[1][12] = true;
    motif.velocities = createVelocities(); motif.velocities[0][12] = 16;
    const before = snapshotMotifBank(state);
    actions.at.begin(8); actions.at.rotate(direction);
    assert.equal(motif.events[0][direction === 1 ? 0 : 7], true);
    assert.equal(motif.events[1][direction === 1 ? 0 : 5], true);
    assert.equal(motif.events[0][12], true); assert.equal(motif.events[1][12], true);
    assert.equal(motif.velocities[0][12], 16);
    assert.equal(motif.events[0][direction === 1 ? 13 : 11], false);
    actions.at.finish(false); assert.deepEqual(snapshotMotifBank(state), before);
});

test("ROTATION follows per-voice step targets without pulling unselected events into subsequent moves", t => {
    const { state, actions } = setup(t);
    const motif = state.getMotif(0);
    motif.voiceLengths[0] = 8; motif.voiceLengths[1] = 6;
    motif.events[0][0] = motif.events[1][0] = true;
    motif.events[0][5] = true; // Must not join the snare's wrapped selection at step 6.
    actions.at.begin(8); actions.at.select("steps", 0);
    actions.at.rotate(-1);
    assert.deepEqual([...state.atTransaction.steps].sort(), [5, 7]);
    actions.at.rotate(-1);
    assert.equal(motif.events[0][6], true); assert.equal(motif.events[1][4], true);
    assert.equal(motif.events[0][5], true); assert.equal(motif.events[0][4], false);
    actions.at.select("steps", 5); // Explicit target change starts a fresh selection.
    actions.at.rotate(-1);
    assert.equal(motif.events[0][5], false); assert.equal(motif.events[0][4], true);
});

for (const direction of [-1, 1]) for (const count of [1, 2, 4]) {
    test(`ROTATION swaps preserve all events and attributes across wrap (${direction}, ${count} selected)`, t => {
        const { state, actions } = setup(t);
        const motif = state.getMotif(0), length = 6;
        motif.voiceLengths[0] = length;
        motif.velocities = createVelocities();
        motif.colors = Array.from({ length: 16 }, () => Array(32).fill(false));
        motif.atDestinations = { COLOR: Array.from({ length: 16 }, () => Array(32).fill(null)) };
        const selected = Array.from({ length: count }, (_, i) => (direction === 1 ? 5 + i : length - i) % length);
        const collision = (selected.at(-1) + direction + length) % length;
        for (const [index, step] of [...selected, collision].entries()) {
            motif.events[0][step] = true; motif.velocities[0][step] = 20 + index;
        }
        motif.colors[0][collision] = true; motif.atDestinations.COLOR[0][collision] = "INSTRUMENT";
        const before = snapshotMotifBank(state);
        actions.at.begin(8); actions.at.select("instruments", 0);
        selected.forEach(step => actions.at.select("steps", step, true));
        actions.at.rotate(direction);
        assert.equal(motif.events[0].filter(Boolean).length, count + 1);
        selected.forEach((step, index) => assert.equal(motif.velocities[0][(step + direction + length) % length], 20 + index));
        assert.equal(motif.velocities[0][selected[0]], 20 + count);
        assert.equal(motif.colors[0][selected[0]], true);
        assert.equal(motif.atDestinations.COLOR[0][selected[0]], "INSTRUMENT");
        assert.equal(motif.atDestinations.ROTATION[0][selected[0]], null);
        assert.deepEqual(snapshotMotifBank(state), before);
        actions.at.rotate(-direction);
        assert.deepEqual(motif.events, before.motifs[0].events);
        assert.deepEqual(motif.velocities, before.motifs[0].velocities);
        assert.deepEqual(motif.colors, before.motifs[0].colors);
        actions.at.finish(false); assert.deepEqual(snapshotMotifBank(state), before);
    });
}

test("ROTATION disjoint selected runs and a full cycle preserve note count on commit", t => {
    const { state, actions } = setup(t);
    const motif = state.getMotif(0); motif.voiceLengths[0] = 6;
    motif.velocities = createVelocities();
    for (let step = 0; step < 6; step++) { motif.events[0][step] = true; motif.velocities[0][step] = 10 + step; }
    actions.at.begin(8); actions.at.select("instruments", 0);
    actions.at.select("steps", 0); actions.at.select("steps", 3, true);
    actions.at.rotate(1);
    assert.deepEqual(motif.velocities[0].slice(0, 6), [11, 10, 12, 14, 13, 15]);
    assert.equal(motif.events[0].filter(Boolean).length, 6);
    actions.at.finish(true);
    actions.at.begin(8); actions.at.select("instruments", 0); actions.at.rotate(1);
    assert.deepEqual(motif.velocities[0].slice(0, 6), [15, 11, 10, 12, 14, 13]);
    assert.equal(motif.events[0].filter(Boolean).length, 6);
    actions.at.finish(true);
    restoreMotifBank(state, snapshotMotifBank(state));
    assert.equal(state.motif[0].filter(Boolean).length, 6);
});

for (const whole of [false, true]) test(`ROTATION audio waits for ${whole ? "motif" : "individual voice"} cycle, including commit`, t => {
    const { state, actions } = setup(t);
    const motif = state.getMotif(0);
    motif.voiceLengths[0] = 8; motif.voiceLengths[1] = 6;
    motif.events[0][0] = motif.events[1][0] = true;
    state.transportState = "PLAY"; state.playheadPosition = 4;
    actions.at.begin(8);
    if (!whole) { actions.at.select("instruments", 0); actions.at.select("instruments", 1, true); }
    actions.at.rotate(1); actions.at.rotate(1);
    assert.equal(motif.events[0][2], true);
    assert.equal(state.getPlaybackMotifForVoice(0).events[0][0], true);
    assert.equal(state.getPlaybackMotifForVoice(1).events[1][0], true);
    actions.at.finish(true);
    actions.nextStep(); actions.nextStep(); // voice 1 starts its next 6-step cycle
    assert.equal(state.getPlaybackMotifForVoice(1).events[1][whole ? 0 : 2], true);
    assert.equal(state.getPlaybackMotifForVoice(0).events[0][0], true);
    actions.nextStep(); actions.nextStep(); // voice 0 starts its next 8-step cycle
    assert.equal(state.getPlaybackMotifForVoice(0).events[0][whole ? 0 : 2], true);
    while (state.playheadPosition !== 0) actions.nextStep(); // LCM 24
    assert.equal(state.getPlaybackMotifForVoice(0).events[0][2], true);
    assert.equal(state.getPlaybackMotifForVoice(1).events[1][2], true);
});

for (const afterBoundary of [false, true]) test(`ROTATION cancel ${afterBoundary ? "after" : "before"} audible boundary preserves engaged cycle`, t => {
    const { state, actions } = setup(t);
    state.getMotif(0).voiceLengths[0] = 8;
    state.motif[0][0] = true; state.transportState = "PLAY"; state.playheadPosition = 6;
    actions.at.begin(8); actions.at.select("instruments", 0); actions.at.rotate(1);
    if (afterBoundary) { actions.nextStep(); actions.nextStep(); }
    actions.at.finish(false);
    assert.equal(state.motif[0][0], true);
    assert.equal(state.getPlaybackMotifForVoice(0).events[0][afterBoundary ? 1 : 0], true);
    do { actions.nextStep(); } while (state.getVoiceStep(0) !== 0);
    assert.equal(state.getPlaybackMotifForVoice(0).events[0][0], true);
});
