import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readPlayStatus, initializePlayStatusUI } from "../src/PlayStatusUI.mjs";
import { initializePlayFooterUI, readPlayFooter } from "../src/PlayFooterUI.mjs";

const source = file => fs.readFile(new URL(`../${file}`, import.meta.url), "utf8");
const moduleURL = text => `data:text/javascript;base64,${Buffer.from(text.replace('"./ATTransaction.mjs"', JSON.stringify(new URL("../src/ATTransaction.mjs", import.meta.url).href))).toString("base64")}`;
const padURL = moduleURL(await source("src/PadConfiguration.js"));
const { LiRythmeState } = await import(moduleURL((await source("src/LiRythmeState.js"))
    .replace('"./PadConfiguration.js"', JSON.stringify(padURL))));
const { LiRythmeClock } = await import(moduleURL(await source("src/LiRythmeClock.js")));
const { LiRythmeActions } = await import(moduleURL(await source("src/LiRythmeActions.js")));
function setup() {
    const state = new LiRythmeState();
    const clock = new LiRythmeClock(state);
    const actions = new LiRythmeActions(state, clock);
    const midiManager = { clockInput: null };
    return { state, clock, actions, midiManager, read: () => readPlayStatus(state, clock, midiManager) };
}

test('PLAY GATE text and color follow selected Voice and Key Group transaction', () => {
    const context = setup(), { state } = context;
    state.padConfiguration.voices[0] = { id: 0, name: 'Synth', type: 'KEY GROUP' };
    state.selectedInstrument = 0;
    const elements = new Map();
    for (const id of ['selected', 'state', 'bpm', 'source', 'gate', 'gate-current',
        ...Array.from({ length: 8 }, (_, index) => `gate-value-${index}`)]) {
        const element = { textContent: '', hidden: false, active: false, style: {} };
        element.classList = { toggle: (_, active) => { element.active = active; } };
        elements.set(`play-${id}`, element);
    }
    const ui = initializePlayStatusUI({ ...context,
        document: { getElementById: id => elements.get(id) },
        window: { requestAnimationFrame() {}, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} } });
    assert.equal(elements.get('play-gate-current').textContent, 'GATE 12,5 %');
    assert.equal(elements.get('play-gate-current').style.color, '#ffffff');
    state.padConfiguration.voices[0].gate = 87.5; ui.render();
    assert.equal(elements.get('play-gate-current').style.color, '#ff9999');
    assert.equal(elements.get('play-gate-current').textContent, 'GATE 87,5 %');
    state.selectedInstrument = null;
    state.atTransaction = { slot: 4, instruments: new Set([0]) }; ui.render();
    assert.equal(elements.get('play-gate').hidden, false);
    state.atTransaction = null; ui.render();
    assert.equal(elements.get('play-gate').hidden, true);
    ui.dispose();
});

test("SELECTED uses the musical selection, including null, unnamed Voices and configuration replacement", () => {
    const { state, actions, read } = setup();
    assert.equal(read().selected, "Kick");
    actions.toggleSelectedInstrument(12);
    assert.equal(read().selected, "Motif 01");
    actions.toggleSelectedInstrument(0);
    assert.equal(read().selected, "VOICE 01");
    state.padConfiguration = { voices: [{ id: 0, name: "<Kick>" }] };
    assert.equal(read().selected, "<Kick>");
    actions.enterFocusMode();
    assert.equal(read().selected, "Motif 01");
    state.selectedInstrument = 99;
    assert.equal(read().selected, "Motif 01");
});

test("footer observes all independent active flags and COPY stages through the existing render loop", async () => {
    const context = setup();
    const controller = { copyStage: null, deleteArmed: false };
    const keys = ["solo", "mute", "copy", "delete"];
    const zones = ["zone1", "project", "states", "book"];
    const elements = new Map(zones.map(key => [`play-footer-${key}`, { textContent: "" }]));
    const footer = initializePlayFooterUI({ state: context.state, controller,
        document: { getElementById: id => elements.get(id) } });
    const { tick, ui } = mount({ ...context, renderFooter: footer.render });
    const value = key => elements.get(`play-footer-${key}`).textContent;
    assert.equal(value("states"), "");
    assert.equal(value("zone1"), "MOTIF 01");
    assert.equal(value("project"), "Non disponible");
    assert.equal(value("book"), "A/T Motifs");
    for (let mask = 0; mask < 16; mask++) {
        context.state.soloActive = Boolean(mask & 1);
        context.state.muteActive = Boolean(mask & 2);
        controller.copyStage = mask & 4 ? "SOURCE" : null;
        controller.deleteArmed = Boolean(mask & 8);
        const before = structuredClone({ state: context.state, controller });
        tick();
        assert.equal(value("states"), keys.filter((key, bit) => mask & (1 << bit)).map(key => key.toUpperCase()).join("  "));
        assert.equal(value("project"), "Non disponible");
        assert.equal(value("book"), "A/T Motifs");
        assert.equal(value("zone1"), "MOTIF 01");
        assert.deepEqual(structuredClone({ state: context.state, controller }), before);
    }
    controller.copyStage = "TARGET"; tick();
    assert.equal(value("states"), "SOLO  MUTE  COPY  DELETE");
    context.state.soloActive = false; context.state.muteActive = false;
    context.state.soloSelection.add(1); context.state.muteSelection.add(2);
    context.state.filterMode = true;
    controller.copyStage = null; controller.deleteArmed = false;
    tick();
    assert.equal(value("states"), "");
    assert.equal(value("zone1"), "MOTIF 01");
    assert.equal(value("project"), "Non disponible");
    assert.equal(value("book"), "A/T Motifs");
    context.state.motifLength = 8; context.state.stepDivision = 8;
    context.state.soloActive = true; tick();
    assert.equal(value("book"), "A/T Motifs");
    assert.equal(value("project"), "Non disponible");
    assert.equal(value("states"), "SOLO");
    assert.equal(value("zone1"), "MOTIF 01");
    ui.dispose();
    assert.doesNotMatch(await source("src/PlayFooterUI.mjs"), /addEventListener|setTimeout|setInterval|requestAnimationFrame|innerHTML/);
    assert.match(await source("src/app.js"), /initializePlayFooterUI\(\{ state, controller: launchpad \}\)/);
    assert.match(await source("src/app.js"), /renderFooter: \(\) => \{ footerUI\?\.render\(\); atUI\.render\(\); \}/);
});

test("BPM reads the Clock's real internal tempo and never substitutes it for external BPM", () => {
    const { state, clock, actions, read } = setup();
    assert.equal(read().bpm, "120");
    actions.adjustInternalTempo(7.5);
    assert.equal(read().bpm, "127.5");
    clock.setSource("MIDI");
    for (let i = 0; i < 48; i++) clock.receiveMidiClockPulse();
    assert.equal(read().bpm, "XXX");
    clock.setSource("INTERNAL");
    assert.equal(read().bpm, "127.5");
    state.tempo = NaN;
    assert.equal(read().bpm, "XXX");
});

test("CLOCK SOURCE uses the engine and connected input, with honest generic fallback", () => {
    const { clock, midiManager, read } = setup();
    midiManager.clockInput = { name: "DrumBrute Impact" };
    assert.equal(read().source, "INTERNAL");
    clock.setSource("MIDI");
    assert.equal(read().source, "EXTERNAL — DrumBrute Impact");
    midiManager.clockInput = { name: "Other clock" };
    assert.equal(read().source, "EXTERNAL — Other clock");
    midiManager.clockInput = null;
    assert.equal(read().source, "EXTERNAL — MIDI");
});

function mount(context) {
    const elements = new Map(["selected", "state", "bpm", "source"].map(key => [`play-${key}`, { textContent: "" }]));
    const frames = new Map(), listeners = new Map();
    let id = 0;
    const window = {
        requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name) { listeners.delete(name); }
    };
    const ui = initializePlayStatusUI({ ...context, window,
        document: { getElementById: id => elements.get(id) } });
    return { ui, frames, listeners, value: key => elements.get(`play-${key}`).textContent,
        tick() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}

test("STATE follows real LOCAL and MIDI transport transitions synchronously", () => {
    const context = setup();
    const { ui, value } = mount(context);
    context.actions.setTransportTransitionHandler(() => ui.render());
    assert.equal(value("state"), "STOP");
    for (const origin of ["LOCAL", "MIDI_IN"]) {
        context.actions.startPlayback({ origin }); assert.equal(value("state"), "PLAY");
        context.actions.pausePlayback({ origin }); assert.equal(value("state"), "PAUSE");
        context.actions.continuePlayback({ origin }); assert.equal(value("state"), "PLAY");
        context.actions.stop({ origin }); assert.equal(value("state"), "STOP");
    }
    ui.dispose();
});

test("visual observation propagates selection, name, tempo and source changes without modifying engines", () => {
    const context = setup();
    const { tick, value, listeners, frames } = mount(context);
    context.actions.toggleSelectedInstrument(8);
    context.state.padConfiguration.voices[8].name = "Renamed";
    context.actions.adjustInternalTempo(10);
    tick();
    assert.equal(value("selected"), "Renamed");
    assert.equal(value("bpm"), "130");
    context.actions.toggleSelectedInstrument(8);
    tick();
    assert.equal(value("selected"), "Motif 01");
    context.clock.setSource("MIDI");
    context.midiManager.clockInput = { name: "Hardware" };
    const before = structuredClone(context.state);
    const clockBefore = { ...context.clock };
    tick(); tick();
    assert.equal(value("source"), "EXTERNAL — Hardware");
    assert.equal(value("bpm"), "XXX");
    assert.deepEqual(structuredClone(context.state), before);
    assert.deepEqual({ ...context.clock }, clockBefore);
    listeners.get("pagehide")();
    assert.equal(frames.size, 0);
    assert.equal(listeners.size, 0);
});

test("PLAY has only informational markup and app wires rendering before transport early returns", async () => {
    const html = await source("index.html");
    const play = html.slice(html.indexOf('<section id="play-page"'), html.indexOf('<section id="help-panel"'));
    assert.doesNotMatch(play, /<(button|input|select|textarea|a|canvas|summary)\b|\b(?:onclick|onkeydown|tabindex|contenteditable)\s*=/i);
    assert.match(play, /<p id="play-selected"/);
    for (const key of ["state", "bpm", "source"]) {
        assert.match(play, new RegExp(`<dd id="play-${key}">`));
    }
    const app = await source("src/app.js");
    assert.match(app, /initializePlayStatusUI\(\{ state, clock, midiManager,\s*renderMotif: \(\) => \{ motifUI.render\(\); modulationUI.render\(\); cycleUI.forEach\(ui => ui.render\(\)\); \}, renderFooter:/);
    assert.match(app, /setTransportTransitionHandler\(\s*\(\{ from, to, origin, transportRevision \}\) => \{\s*playStatusUI.render\(\);/);
    assert.doesNotMatch(await source("src/PlayStatusUI.mjs"), /innerHTML|\.actions|\.setTempo\(|\.setSource\(|\.send\(/);
});

test("footer states include FREEZE and LOCK without repeating Modulation activation", () => {
    const { state } = setup(), controller = { copyStage: "TARGET", deleteArmed: true };
    state.soloActive = state.muteActive = state.freezeMode = state.lockMode = true;
    state.modulationActive = state.modulationRequested = true;
    assert.equal(readPlayFooter(state, controller).states, "SOLO  MUTE  FREEZE  LOCK  COPY  DELETE");
    state.soloActive = state.muteActive = state.freezeMode = state.lockMode = false;
    controller.copyStage = null; controller.deleteArmed = false;
    state.modulationRequested = false;
    assert.equal(readPlayFooter(state, controller).states, "");
});

test("footer Book follows Books and Settings independently of transport", () => {
    const { state } = setup(), controller = {};
    const elements = new Map(["zone1", "project", "states", "book"].map(key => [`play-footer-${key}`, { textContent: "" }]));
    elements.set("settings-page", { hidden: true });
    const footer = initializePlayFooterUI({ state, controller, document: { getElementById: id => elements.get(id) } });
    const book = () => { footer.render(); return elements.get("play-footer-book").textContent; };
    for (const transport of ["PLAY", "PAUSE", "STOP"]) {
        state.transportState = transport;
        state.currentTimeline = "MOTIF"; state.currentView = "MOTIF_LIBRARY";
        assert.equal(book(), "Motif");
        state.currentTimeline = "MODULATION"; assert.equal(book(), "Modulation");
        state.currentView = "PLAY"; assert.equal(book(), "A/T Modulation");
        state.currentTimeline = "MOTIF"; assert.equal(book(), "A/T Motifs");
        state.atTransaction = { system: "MODULATION" };
        assert.equal(book(), "A/T Modulation"); state.atTransaction = null;
        elements.get("settings-page").hidden = false; assert.equal(book(), "Settings");
        elements.get("settings-page").hidden = true; assert.equal(book(), "A/T Motifs");
    }
});
