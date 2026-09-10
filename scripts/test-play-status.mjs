import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readPlayStatus, initializePlayStatusUI } from "../src/PlayStatusUI.mjs";

const source = file => fs.readFile(new URL(`../${file}`, import.meta.url), "utf8");
const moduleURL = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
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
    const play = html.slice(html.indexOf('<section id="play-page"'), html.indexOf('</main>'));
    assert.doesNotMatch(play, /<(button|input|select|textarea|a|canvas|summary)\b|\b(?:onclick|onkeydown|tabindex|contenteditable)\s*=/i);
    for (const key of ["selected", "state", "bpm", "source"]) {
        assert.match(play, new RegExp(`<dd id="play-${key}">`));
    }
    const app = await source("src/app.js");
    assert.match(app, /initializePlayStatusUI\(\{ state, clock, midiManager \}\)/);
    assert.match(app, /setTransportTransitionHandler\(\s*\(\{ from, to, origin, transportRevision \}\) => \{\s*playStatusUI.render\(\);/);
    assert.doesNotMatch(await source("src/PlayStatusUI.mjs"), /innerHTML|\.actions|\.setTempo\(|\.setSource\(|\.send\(/);
});
