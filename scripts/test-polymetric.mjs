import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readPlayMotif, initializePlayMotifUI } from "../src/PlayMotifUI.mjs";

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
const url = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
async function load(file, imports = {}) {
    let text = await source(file);
    for (const [name, value] of Object.entries(imports)) text = text.replace(JSON.stringify(name), JSON.stringify(value));
    return url(text);
}
const pad = await load("PadConfiguration.js");
const { LiRythmeState } = await import(await load("LiRythmeState.js", { "./PadConfiguration.js": pad }));
const { LiRythmeActions } = await import(await load("LiRythmeActions.js"));
const { LiRythmeClock } = await import(await load("LiRythmeClock.js"));
const imports = {};
for (const file of ["LaunchpadMapping.js", "LaunchpadColors.js", "GenesisLayout.js"]) {
    imports[`./${file}`] = await load(`hardware/launchpad/${file}`);
}
const { LaunchpadMini } = await import(await load("hardware/launchpad/LaunchpadMini.js", imports));
function setup() {
    const state = new LiRythmeState(), clock = new LiRythmeClock(state);
    const actions = new LiRythmeActions(state, clock);
    const controller = new LaunchpadMini({ send() {} }, state, actions, "Launchpad");
    const length = (id, n) => { state.selectedInstrument = id; return actions.setSelectedLength(n); };
    return { state, clock, actions, controller, length };
}

test("SHIFT+STEP sets, moves and removes Voice/Motif boundaries; DELETE has no length role", () => {
    const { state, controller } = setup();
    const notes = structuredClone(state.motif);
    const press = (status, pad, velocity = 127) => controller.handleMidiMessage([status, pad, velocity]);
    press(0xB0, controller.mapping.TOP_CONTROLS.SHIFT);
    press(0x90, controller.mapping.MOTIF[6]);
    assert.equal(state.voiceLengths[12], 7);
    assert.equal(state.motifLength, null);
    // Real instrument selection toggles the target to Motif.
    press(0x90, controller.mapping.INSTRUMENTS[12]);
    assert.equal(state.selectedInstrument, null);
    press(0x90, controller.mapping.MOTIF[23]);
    assert.equal(state.motifLength, 24);
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE);
    assert.equal(state.motifLength, 24);
    press(0x90, controller.mapping.MOTIF[10]);
    assert.equal(state.motifLength, 11);
    press(0x90, controller.mapping.MOTIF[10], 0);
    assert.equal(state.motifLength, 11);
    press(0x90, controller.mapping.MOTIF[10]);
    assert.equal(state.motifLength, null);
    assert.equal(state.voiceLengths[12], 7);
    press(0x90, controller.mapping.INSTRUMENTS[12]);
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE);
    assert.equal(state.voiceLengths[12], 7);
    press(0x90, controller.mapping.MOTIF[10]);
    assert.equal(state.voiceLengths[12], 11);
    press(0x90, controller.mapping.MOTIF[10]);
    assert.equal(state.voiceLengths[12], null);
    assert.deepEqual(state.motif, notes);
    press(0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 0);
    press(0x90, controller.mapping.MOTIF[6]);
    assert.equal(state.motif[12][6], true);
    assert.equal(state.voiceLengths[12], null);
    controller.resetInputState();
});

test("single DIM RED boundary follows explicit target, never implicit 32 or natural resolution", () => {
    const { state, controller, length } = setup();
    const colors = () => Array.from({ length: 32 }, (_, step) => controller.getMotifStepColor(step));
    for (const id of [null, 12]) {
        state.selectedInstrument = id;
        assert.ok(colors().every(color => color === 0));
        for (const n of [1, 7, 11, 32]) {
            length(id, n);
            assert.deepEqual(colors(), Array.from({ length: 32 }, (_, step) => step === n - 1 ? controller.colors.DIM_RED : 0));
        }
        length(id, null);
        assert.ok(colors().every(color => color === 0));
    }
    length(12, 7);
    state.selectedInstrument = null;
    assert.equal(state.getMotifDuration(), 7);
    assert.ok(colors().every(color => color === 0));
});

test("only boundary events are FULL RED; normal events restore YELLOW/DIM AMBER and empty steps stay OFF", () => {
    const { state, controller, length, actions } = setup();
    length(12, 7);
    state.motif[12][6] = true;
    state.motif[13][2] = true;
    assert.equal(controller.getMotifStepColor(6), controller.colors.RED);
    assert.equal(controller.getMotifStepColor(2), controller.colors.DIM_AMBER);
    const leds = new Map();
    controller.setLed = (note, color) => leds.set(note, color);
    controller.drawPlayhead(6);
    assert.equal(leds.get(controller.mapping.MOTIF[6]), controller.colors.RED);
    controller.drawPlayhead(2);
    assert.equal(leds.get(controller.mapping.MOTIF[2]), controller.colors.GREEN);
    controller.drawPlayhead(1);
    assert.equal(leds.get(controller.mapping.MOTIF[1]), controller.colors.DIM_GREEN);
    state.motif[12][6] = false;
    controller.drawPlayhead(6);
    assert.equal(leds.get(controller.mapping.MOTIF[6]), controller.colors.DIM_RED);
    actions.toggleSelectedLength(11);
    controller.drawMotif();
    assert.equal(leds.get(controller.mapping.MOTIF[6]), 0);
    assert.equal(leds.get(controller.mapping.MOTIF[10]), controller.colors.DIM_RED);
    actions.toggleSelectedLength(11);
    controller.drawMotif();
    assert.equal(leds.get(controller.mapping.MOTIF[10]), 0);
    assert.equal(leds.get(controller.mapping.MOTIF[2]), controller.colors.DIM_AMBER);
    state.motif[12][6] = true;
    controller.drawPlayhead(6);
    assert.equal(leds.get(controller.mapping.MOTIF[6]), controller.colors.GREEN);
    controller.drawClockStep(6, 1);
    assert.equal(leds.get(controller.mapping.MOTIF[6]), controller.colors.YELLOW);
    controller.drawClockStep(1, 2);
    assert.equal(leds.get(controller.mapping.MOTIF[1]), 0);
    controller.drawClockStep(2, 1);
    assert.equal(leds.get(controller.mapping.MOTIF[2]), controller.colors.DIM_AMBER);
    assert.ok(Array.from({ length: 32 }, (_, step) => controller.getMotifStepColor(step))
        .every(color => color !== controller.colors.RED && color !== controller.colors.DIM_RED));
    state.selectedInstrument = null;
    assert.equal(controller.getMotifStepColor(6), controller.colors.DIM_AMBER);
    length(null, 7);
    assert.equal(controller.getMotifStepColor(6), controller.colors.RED);
});

test("MODULATION playhead colors remain unchanged", () => {
    const { state, controller, length } = setup();
    state.currentTimeline = "MODULATION";
    const leds = new Map();
    controller.setLed = (note, color) => leds.set(note, color);
    const colorAt = step => { controller.drawPlayhead(step); return leds.get(controller.mapping.MOTIF[step]); };
    assert.equal(colorAt(0), controller.colors.DIM_RED);
    state.motif[12][0] = true;
    assert.equal(colorAt(0), controller.colors.RED);
    state.motif[13][1] = true;
    assert.equal(colorAt(1), controller.colors.DIM_RED);
    length(12, 7);
    assert.equal(colorAt(6), controller.colors.DIM_RED);
    state.motif[12][6] = true;
    assert.equal(colorAt(6), controller.colors.RED);
});

test("fallback and explicit lengths distinguish null from 32; validation is atomic", () => {
    const { state, length, actions } = setup();
    assert.equal(state.getMotifDuration(), 32);
    assert.equal(state.getVoiceLength(12), 32);
    length(12, 7);
    assert.equal(state.getMotifDuration(), 7);
    length(13, 32);
    assert.equal(state.getMotifDuration(), 224);
    actions.clearSelectedLength();
    assert.equal(state.getMotifDuration(), 7);
    for (const invalid of [0, 33, -1, 1.5, "7", NaN, Infinity, undefined]) {
        const before = structuredClone(state);
        assert.equal(actions.setSelectedLength(invalid), false);
        assert.deepEqual(structuredClone(state), before);
    }
    for (const id of [-1, 16, 1.5, undefined]) {
        state.selectedInstrument = id;
        assert.equal(actions.setSelectedLength(7), false);
    }
});

test("LCM examples, free Voices exclusion and exact large resolution", () => {
    for (const [lengths, expected] of [[[4, 6], 12], [[5, 7], 35], [[7, 11, 5], 385], [[7], 7], [[], 32], [[1], 1]]) {
        const { state, length } = setup();
        lengths.forEach((n, id) => length(id, n));
        assert.equal(state.getMotifDuration(), expected);
        assert.equal(state.getVoiceLength(15), 32);
    }
    const { state, length } = setup();
    [32, 27, 25, 7, 11, 13, 17, 19, 23, 29, 31].forEach((n, id) => length(id, n));
    assert.equal(state.getMotifDuration(), 144403552893600);
    assert.ok(Number.isSafeInteger(state.getMotifDuration()));
});

test("explicit Motif overrides LCM; clearing restores resolution without deleting notes or Voice lengths", () => {
    const { state, length, actions } = setup();
    length(0, 5); length(1, 7); length(null, 16);
    state.motif[0][31] = true;
    assert.equal(state.getMotifDuration(), 16);
    actions.clearSelectedLength();
    assert.equal(state.getMotifDuration(), 35);
    assert.equal(state.motif[0][31], true);
    assert.deepEqual(state.voiceLengths.slice(0, 2), [5, 7]);
});

test("all local phases reset at natural or explicit boundary, including free Voice", () => {
    for (const explicit of [null, 16]) {
        const { state, length, clock, actions } = setup();
        length(0, 5); length(1, 7); length(null, explicit);
        const duration = explicit ?? 35;
        actions.startPlayback();
        for (let tick = 1; tick <= duration * 2; tick++) {
            clock.advanceStepPipeline();
            const global = tick % duration;
            assert.equal(state.playheadPosition, global);
            assert.equal(state.getVoiceStep(0), global % 5);
            assert.equal(state.getVoiceStep(1), global % 7);
            assert.equal(state.getVoiceStep(2), global % 32);
        }
        assert.equal(state.playheadPosition, 0);
        for (let id = 0; id < 16; id++) assert.equal(state.getVoiceStep(id), 0);
    }
});

test("length edits reset atomically during PLAY, idempotent sets do not; PAUSE and STOP remain coherent", () => {
    const { state, clock, actions, length } = setup();
    actions.startPlayback();
    clock.advanceStepPipeline();
    length(12, 7);
    assert.equal(state.transportState, "PLAY");
    assert.equal(state.playheadPosition, 0);
    clock.advanceStepPipeline();
    assert.equal(length(12, 7), false);
    assert.equal(state.playheadPosition, 1);
    actions.pausePlayback();
    actions.continuePlayback();
    assert.equal(state.playheadPosition, 1);
    actions.stop();
    assert.equal(state.playheadPosition, 0);
    assert.equal(state.voiceLengths[12], 7);
    actions.previousStep();
    assert.equal(state.playheadPosition, 6);
    actions.nextStep();
    assert.equal(state.playheadPosition, 0);
});

test("native internal events and external MIDI pulses use the same polymetric advancement", () => {
    for (const source of ["INTERNAL", "MIDI"]) {
        const { state, clock, actions, length } = setup();
        length(0, 4); length(1, 6);
        clock.setSource(source);
        actions.startPlayback();
        for (let i = 1; i <= 12; i++) {
            if (source === "MIDI") for (let pulse = 0; pulse < 6; pulse++) clock.receiveMidiClockPulse();
            else assert.equal(clock.receiveInternalClockStep({ sequence: i, transportRevision: clock.transportRevision }).accepted, true);
            assert.equal(state.playheadPosition, i % 12);
        }
        actions.pausePlayback();
        if (source === "MIDI") for (let i = 0; i < 6; i++) clock.receiveMidiClockPulse();
        else assert.equal(clock.receiveInternalClockStep({ sequence: 13, transportRevision: clock.transportRevision }).accepted, false);
        assert.equal(state.playheadPosition, 0);
    }
});

test("PLAY DURATION and STEP render engine lengths when target changes, without musical mutations", () => {
    const { state, length } = setup();
    const elements = new Map();
    const ui = initializePlayMotifUI({ state, document: { getElementById(id) {
        const field = { textContent: "" }; elements.set(id, field); return field;
    } } });
    length(0, 5); length(1, 7);
    for (const [id, expected] of [[0, "5"], [1, "7"], [2, "32"], [null, "35"]]) {
        state.selectedInstrument = id;
        const before = structuredClone(state);
        ui.render();
        assert.equal(elements.get("play-motif-step").textContent, expected);
        assert.equal(elements.get("play-motif-duration").textContent, "35 STEPS");
        assert.deepEqual(structuredClone(state), before);
    }
    length(null, 16);
    assert.equal(readPlayMotif(state).duration, "16 STEPS");
    assert.equal(readPlayMotif(state).step, "16");
});

test("real note dispatch uses local index, free Voice loops at 32, Note Off survives global/length/transport resets", async () => {
    const { state, length, actions } = setup();
    length(12, 5); length(13, 7);
    state.motif[12][0] = true; state.motif[13][0] = true;
    state.motif[14][0] = true; state.motif[14][31] = true;
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const events = [], pending = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
        { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
        { send: (output, data) => events.push([output, data]), findOutput: () => ({}) },
        { pulseInstrument() {} }, fn => pending.push(fn));
    for (let step = 0; step < 35; step++) trigger(step);
    const ons = events.map(([, data]) => data);
    assert.equal(ons.filter(data => data[1] === 36).length, 7);
    assert.equal(ons.filter(data => data[1] === 37).length, 5);
    assert.equal(ons.filter(data => data[1] === 38).length, 3); // 0,31,32
    state.playheadPosition = 34;
    actions.nextStep(); trigger(state.playheadPosition);
    length(null, 16);
    actions.stop();
    const noteOns = events.slice();
    state.padConfiguration.voices[12].note = 99;
    pending.forEach(fn => fn());
    assert.deepEqual(events.slice(noteOns.length), noteOns.map(([output, [status, note]]) => [output, [status, note, 0]]));
});

test("physical playhead remains within 32 pads when resolution exceeds 32", () => {
    const { state, length, controller } = setup();
    length(0, 5); length(1, 7);
    const leds = [];
    controller.setLed = (note, color) => leds.push([note, color]);
    state.playheadPosition = 34;
    controller.drawPlayhead();
    assert.equal(controller.lastPlayheadStep, 2);
    assert.equal(leds.at(-1)[0], controller.mapping.MOTIF[2]);
    controller.drawClockStep(controller.lastPlayheadStep, 0);
    assert.equal(controller.lastPlayheadStep, 0);
    assert.ok(leds.every(([note]) => Number.isInteger(note)));
});
