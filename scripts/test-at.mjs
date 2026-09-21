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
    for (let i = 0; c.atLEDQueue.size && i < 32; i++) t.mock.timers.tick(4);
    assert.equal(c.atLEDQueue.size, 0);
}
const velocity = (state, voice, step, id = state.currentMotifId) => state.getMotif(id).velocities?.[voice]?.[step] ?? 100;

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
    assert.equal(c.atLEDQueue.size, 1);
    assert.equal(velocity(state, 0, 0), 16);
    drainAT(t, c);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], [0x90, c.mapping.AT_VALUE[7], (c.colors.YELLOW & 0x33) | 4]);
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

test("A/T navigation is inert; only VELOCITY exists among 8+8 slots", t => {
    const { state, clock, actions, c, tap } = setup(t);
    const before = musicalContext(state, clock);
    for (const view of ["MOTIF_LIBRARY", "PLAY"]) {
        tap(120); assert.equal(state.currentView, view); assert.equal(state.atTransaction, null);
        assert.deepEqual(musicalContext(state, clock), before);
    }
    actions.toggleView(); actions.toggleView();
    assert.equal(AT_SLOTS.length, 16);
    for (const note of c.mapping.BOOKS.slice(1)) { tap(note); assert.equal(state.atTransaction, null); }
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
    const { state, actions, c, tap, begin } = setup(t);
    state.motif[12][0] = true; begin();
    assert.deepEqual(c.mapping.AT_VALUE, [8, 24, 40, 56, 72, 88, 104, 120]);
    [127, 111, 96, 80, 64, 48, 32, 16].forEach((value, i) => {
        tap(c.mapping.AT_VALUE[i]); assert.equal(velocity(state, 12, 0), value);
        assert.equal(state.atTransaction.valueIndex, i);
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

test("blink, value LEDs and pending COPY/DELETE feedback survive exit, without held-release leakage", t => {
    const { state, c, leds, tap, press, release, begin } = setup(t);
    const color = n => leds.get(`144:${n}`);
    for (const command of ["COPY", "DELETE"]) {
        tap(command === "COPY" ? 104 : 88);
        const stage = c.copyStage, armed = c.deleteArmed;
        begin(); drainAT(t, c); assert.equal(color(68), (c.colors.RED & 0x33) | 4);
        t.mock.timers.tick(160); drainAT(t, c); assert.equal(color(68), 4);
        press(120); tap(88); tap(104);
        assert.equal(c.copyStage, stage); assert.equal(c.deleteArmed, armed);
        t.mock.timers.tick(160); drainAT(t, c);
        assert.equal(color(104), (c.colors.YELLOW & 0x33) | 4);
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

test("live CHAIN change and FOCUS navigation use current context; CANCEL restores every edited motif", t => {
    const { state, actions, begin } = setup(t);
    state.chainEnabled = true; state.chain = [0, 1, 2]; state.chainPlayingIndex = 0; state.chainPlayingDetached = false;
    state.motifs.forEach(m => m.events[12][0] = true);
    const original = structuredClone(state.motifs);
    begin(); actions.at.apply(0);
    state.playingMotifId = 1; state.chainPlayingIndex = 1; // natural playback boundary
    actions.at.apply(1); assert.equal(velocity(state, 12, 0, 0), 127); assert.equal(velocity(state, 12, 0, 1), 111);
    state.chainFocus = true; state.viewMotifId = 2; state.chainViewIndex = 2;
    actions.at.apply(7); assert.equal(velocity(state, 12, 0, 2), 16);
    actions.at.finish(false); assert.deepEqual(state.motifs, original);
    assert.equal(state.playingMotifId, 1); assert.equal(state.viewMotifId, 2);
});

test("FOCUS chord and occurrence navigation retain their grammar during VELOCITY", t => {
    const { state, actions, c, clock, tap, press, release, begin } = setup(t);
    state.chainEnabled = true; state.chain = [0, 1, 1, 2]; state.chainPlayingIndex = 0;
    state.chainPlayingDetached = false; state.chainLoopMasterIndex = 3;
    state.transportState = "PLAY"; state.playheadPosition = 7;
    state.motifs.forEach(m => m.events[12][0] = true);
    begin();
    press(110, 0xB0); press(111, 0xB0); release(110, 0xB0); release(111, 0xB0);
    assert.equal(state.chainFocus, true); assert.equal(state.chainViewIndex, 0);
    tap(111, 0xB0); assert.equal(state.chainViewIndex, 1);
    tap(8); assert.equal(velocity(state, 12, 0, 1), 127); assert.equal(velocity(state, 12, 0, 0), 100);
    tap(111, 0xB0); assert.equal(state.chainViewIndex, 2); assert.equal(state.currentMotifId, 1);
    tap(111, 0xB0); assert.equal(state.chainViewIndex, 3); assert.equal(state.currentMotifId, 2);
    tap(120); assert.equal(velocity(state, 12, 0, 2), 16);
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
    actions.at.apply(7); assert.equal(velocity(state, 12, 0, 1), 16);
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
        (c.colors[i === 0 ? (lit ? "RED" : "OFF") : i < 8 ? "DIM_RED" : "DIM_AMBER"] & 0x33) | 4);
    assert.equal(state.currentView, "PLAY");
    c.drawBooks(); assert.deepEqual(colors(), expected(true));
    for (const note of c.mapping.BOOKS.slice(1)) { tap(note); assert.equal(state.atTransaction, null); }
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
    assert.equal(c.getATBookColor(8), "DIM_AMBER");
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
