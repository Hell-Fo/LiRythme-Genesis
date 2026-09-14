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
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE, 0);
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE);
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE, 0);
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
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE, 0);
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE);
    press(0x90, controller.mapping.VALUE_CONTROLS.DELETE, 0);
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

test("FOLLOWER length edits retain immediate reset; PAUSE and STOP remain coherent", () => {
    const { state, clock, actions, length } = setup();
    clock.setSource("MIDI");
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

test("LEADER Voice create/move/remove waits for local wrap, Motif duration waits for global wrap", () => {
    for (const [before, after] of [[null, 7], [7, 3], [3, 11], [7, null], [32, 1]]) {
        const { state, clock, actions, length } = setup();
        length(0, before); length(null, 32);
        actions.startPlayback();
        const tick = () => {
            const sequence = (clock.lastAcceptedNativeStepSequence ?? 0) + 1;
            assert.equal(clock.receiveInternalClockStep({ sequence, transportRevision: clock.transportRevision }).accepted, true);
        };
        tick(); tick();
        const revision = clock.transportRevision;
        length(0, after);
        assert.equal(state.playheadPosition, 2);
        assert.equal(state.getVoiceStep(0), 2);
        assert.equal(clock.transportRevision, revision);
        const oldLength = before ?? 32;
        for (let pos = 3; pos <= 32; pos++) {
            tick();
            assert.equal(state.playheadPosition, pos % 32);
            const expected = pos === 32 ? 0 : pos < oldLength ? pos : (pos - oldLength) % (after ?? 32);
            assert.equal(state.getVoiceStep(0), expected);
            assert.equal(state.getVoiceStep(1), pos % 32);
        }
        assert.equal(state.liveLengthCycle, null);
    }
});

test("LEADER Motif create/move/remove and implicit LCM finish the old global cycle", () => {
    for (const [before, after] of [[null, 3], [8, 3], [3, 8], [8, null]]) {
        const { state, clock, actions, length } = setup();
        length(0, 5); length(null, before);
        const duration = state.getMotifDuration();
        actions.startPlayback(); clock.advanceStepPipeline();
        length(null, after);
        assert.equal(state.playheadPosition, 1);
        for (let pos = 2; pos <= duration; pos++) {
            clock.advanceStepPipeline();
            assert.equal(state.playheadPosition, pos % duration);
        }
        const next = after ?? 5;
        for (let pos = 1; pos <= next; pos++) {
            clock.advanceStepPipeline();
            assert.equal(state.playheadPosition, pos % next);
        }
    }
    const { state, clock, actions, length } = setup();
    length(0, 4); length(1, 6);
    actions.startPlayback(); clock.advanceStepPipeline();
    length(0, 5);
    for (let pos = 2; pos <= 12; pos++) {
        clock.advanceStepPipeline();
        assert.equal(state.playheadPosition, pos % 12);
    }
    for (let pos = 1; pos <= 30; pos++) {
        clock.advanceStepPipeline();
        assert.equal(state.playheadPosition, pos % 30);
    }
});

test("LEADER pending edits coalesce, survive PAUSE, and clear on START/STOP", () => {
    const { state, clock, actions, length } = setup();
    length(0, 8); length(null, 16);
    actions.startPlayback(); clock.advanceStepPipeline();
    length(0, 3); length(0, 5); length(null, 7);
    assert.equal(length(0, 5), false);
    actions.pausePlayback();
    const snapshot = structuredClone(state.liveLengthCycle);
    actions.continuePlayback();
    assert.deepEqual(state.liveLengthCycle, snapshot);
    for (let pos = 2; pos <= 8; pos++) clock.advanceStepPipeline();
    assert.equal(state.getVoiceStep(0), 0);
    assert.equal(state.liveLengthCycle.lengths[0], 5);
    actions.stop();
    assert.equal(state.liveLengthCycle, null);
    assert.equal(state.playheadPosition, 0);
    actions.startPlayback(); clock.advanceStepPipeline(); length(0, 2);
    actions.startPlayback();
    assert.equal(state.liveLengthCycle, null);
    assert.equal(state.getVoiceStep(0), 0);
});

test("live Note On indices and captured Note Offs survive Leader/Follower length edits", async () => {
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    for (const mode of ["INTERNAL", "MIDI"]) {
        const { state, clock, actions, length } = setup();
        length(12, 4); length(null, 16);
        state.motif[12].fill(true);
        const events = [], pending = [], indices = [];
        const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
            { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
            { send: (output, data) => events.push([output, data]), findOutput: () => ({}) },
            { pulseInstrument() {} }, fn => pending.push(fn));
        clock.setSource(mode);
        clock.setClockStepHandler(() => { indices.push(state.getVoiceStep(12)); trigger(state.playheadPosition); });
        actions.startPlayback();
        let sequence = 0;
        const tick = () => {
            if (mode === "MIDI") for (let i = 0; i < 6; i++) clock.receiveMidiClockPulse();
            else assert.equal(clock.receiveInternalClockStep({ sequence: ++sequence, transportRevision: clock.transportRevision }).accepted, true);
        };
        tick(); length(12, 3); tick(); tick(); tick(); tick();
        assert.deepEqual(indices, mode === "INTERNAL" ? [1, 2, 3, 0, 1] : [1, 1, 2, 0, 1]);
        length(12, null); length(null, 2);
        tick();
        actions.pausePlayback(); actions.continuePlayback(); tick(); actions.stop();
        const ons = events.slice();
        state.padConfiguration.voices[12].note = 99;
        pending.forEach(fn => fn());
        assert.equal(ons.length, 7);
        assert.deepEqual(events.slice(ons.length), ons.map(([output, [status, note]]) => [output, [status, note, 0]]));
    }
});

test("FOLLOWER create/move/remove retains pulse phase and immediate pattern reset", () => {
    for (const target of [0, null]) for (const [before, after] of [[null, 7], [7, 3], [3, 11], [7, null]]) {
        const { state, clock, actions, length } = setup();
        length(target, before); clock.setSource("MIDI"); actions.startPlayback();
        for (let i = 0; i < 9; i++) clock.receiveMidiClockPulse();
        const revision = clock.transportRevision;
        length(target, after);
        assert.equal(state.playheadPosition, 0);
        assert.equal(state.liveLengthCycle, null);
        assert.equal(clock.midiPulseCount, 3);
        assert.equal(clock.transportRevision, revision);
        for (let i = 0; i < 3; i++) clock.receiveMidiClockPulse();
        assert.equal(state.playheadPosition, 1);
    }
});

test("PLAY cycle feedback follows real Leader/Follower wraps with explicit priority and fallback", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const mode of ["INTERNAL", "MIDI"]) {
        for (const [motif, voices, duration, colorName] of [[8, [], 8, "YELLOW"], [null, [5, 7], 35, "RED"], [16, [5, 7], 16, "YELLOW"], [null, [], 32, null], [1, [], 1, "YELLOW"]]) {
            const { state, clock, actions, controller, length } = setup();
            voices.forEach((n, id) => length(id, n)); length(null, motif);
            const colors = [];
            controller.setTransportPulseLed = color => colors.push(color);
            // Execute the actual app step wiring, including musical dispatch order.
            const app = await source("app.js");
            const wiring = app.slice(app.indexOf("actions.setClockStepHandler(() => {"), app.indexOf("// TEST DRUMBRUTE"));
            new Function("actions", "state", "launchpad", "triggerMotifStep", wiring)(actions, state, controller, () => {});
            clock.setSource(mode); actions.startPlayback();
            assert.deepEqual(colors, []);
            for (let tick = 1; tick <= duration * 2; tick++) {
                colors.length = 0;
                if (mode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
                else assert.equal(clock.receiveInternalClockStep({ sequence: tick, transportRevision: clock.transportRevision }).accepted, true);
                assert.equal(state.playheadPosition, tick % duration);
                const special = colors.filter(c => c === controller.colors.YELLOW || c === controller.colors.RED);
                assert.deepEqual(special, tick % duration === 0 && colorName ? [controller.colors[colorName]] : []);
                if (tick % duration === 0 && colorName) {
                    assert.equal(colors.at(-1), controller.colors[colorName]); // beat must not overwrite cycle
                    controller.setTopLed = (_, color) => colors.push(color);
                    controller.drawTransport();
                    assert.equal(colors.at(-1), controller.colors[colorName]);
                }
                t.mock.timers.tick(80);
                if (colors.length) assert.equal(colors.at(-1), controller.colors.DIM_GREEN);
            }
            controller.resetInputState();
        }
    }
});

test("PLAY pulse ownership prevents stale beat/cycle timers overwriting transport or newer pulses", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, controller, length } = setup();
    const colors = [];
    controller.setTransportPulseLed = color => colors.push(color);
    length(null, 8); actions.startPlayback();
    controller.pulseTransport(); t.mock.timers.tick(40);
    controller.pulseMotifCycle();
    t.mock.timers.tick(40);
    assert.equal(colors.at(-1), controller.colors.YELLOW);
    controller.pulseTransport(); // lower priority cannot replace cycle
    t.mock.timers.tick(40);
    assert.equal(colors.at(-1), controller.colors.DIM_GREEN);
    controller.pulseTransport();
    assert.equal(colors.at(-1), controller.colors.GREEN);
    t.mock.timers.tick(80);
    assert.equal(colors.at(-1), controller.colors.DIM_GREEN);
    for (const transition of [() => actions.pausePlayback(), () => actions.stop()]) {
        actions.startPlayback(); controller.pulseMotifCycle();
        transition(); controller.drawTransport();
        assert.equal(colors.at(-1), state.transportState === "PAUSE" ? controller.colors.DIM_GREEN : controller.colors.OFF);
        const count = colors.length;
        t.mock.timers.tick(80);
        assert.equal(colors.length, count);
    }
    actions.startPlayback(); controller.pulseMotifCycle(); t.mock.timers.tick(40);
    actions.stop(); actions.startPlayback(); controller.pulseTransport();
    t.mock.timers.tick(40);
    assert.equal(colors.at(-1), controller.colors.GREEN);
    t.mock.timers.tick(40);
    assert.equal(colors.at(-1), controller.colors.DIM_GREEN);
    state.currentTimeline = "MODULATION";
    const count = colors.length;
    controller.pulseMotifCycle();
    assert.equal(colors.length, count);
});

test("cycle feedback observes the validated live boundary without changing Leader phases", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, clock, actions, controller, length } = setup();
    length(0, 5); length(1, 7);
    actions.startPlayback();
    const colors = [];
    controller.setTransportPulseLed = color => colors.push(color);
    clock.setClockStepHandler(() => {
        const before = structuredClone(state);
        controller.pulseMotifCycle();
        assert.deepEqual(structuredClone(state), before);
    });
    for (let tick = 1; tick <= 35; tick++) {
        if (tick === 4) length(null, 16);
        clock.advanceStepPipeline();
        assert.equal(state.playheadPosition, tick % 35);
        assert.equal(state.getVoiceStep(0), (tick % 35) % 5);
        assert.equal(state.getVoiceStep(1), (tick % 35) % 7);
        assert.deepEqual(colors, tick === 35 ? [controller.colors.YELLOW] : []);
    }
    t.mock.timers.tick(80);
    colors.length = 0;
    for (let tick = 1; tick <= 16; tick++) clock.advanceStepPipeline();
    assert.deepEqual(colors, [controller.colors.YELLOW]);
    controller.resetInputState();
});

test("DELETE arms, blinks RED, cancels and ignores invalid targets", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, controller } = setup();
    const events = [];
    controller.midiManager.send = (_, data) => events.push(data);
    const del = controller.mapping.VALUE_CONTROLS.DELETE;
    const press = (status, pad) => { controller.handleMidiMessage([status, pad, 127]); controller.handleMidiMessage([status, pad, 0]); };
    const before = structuredClone(state);
    press(0x90, del);
    assert.equal(controller.deleteArmed, true);
    assert.deepEqual(events.at(-1), [0x90, del, (controller.colors.RED & 0x33) | 4]);
    t.mock.timers.tick(160);
    assert.deepEqual(events.at(-1), [0x90, del, (controller.colors.OFF & 0x33) | 4]);
    t.mock.timers.tick(160);
    assert.equal(events.at(-1)[2], (controller.colors.RED & 0x33) | 4);
    for (const [status, pad] of [[0x90, controller.mapping.MOTIF[0]], [0x90, 127], [0xB0, controller.mapping.TOP_CONTROLS.NEXT]]) press(status, pad);
    assert.equal(controller.deleteArmed, true);
    assert.deepEqual(structuredClone(state), before);
    press(0x90, del);
    assert.equal(controller.deleteArmed, false);
    const count = events.length;
    t.mock.timers.tick(1000);
    assert.equal(events.length, count);
    assert.deepEqual(structuredClone(state), before);
    press(0x90, del); controller.resetInputState();
    assert.equal(controller.deleteArmed, false);
    assert.equal(controller.deleteBlinkTimer, null);
    state.currentTimeline = "MODULATION";
    press(0x90, del);
    assert.equal(controller.deleteArmed, false);
});

test("DELETE Voice/PLAY clears events only in Leader/Follower, consumes held target and release", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const mode of ["INTERNAL", "MIDI"]) for (const target of [3, null]) {
        const { state, clock, actions, controller, length } = setup();
        state.motif.forEach(row => row.fill(true));
        length(3, 7); length(4, 5); length(null, 16);
        clock.setSource(mode); actions.startPlayback(); clock.advanceStepPipeline();
        if (mode === "INTERNAL") length(3, 11); // preserve pending geometry too
        const before = structuredClone(state), revision = clock.transportRevision;
        const del = controller.mapping.VALUE_CONTROLS.DELETE;
        controller.handleMidiMessage([0x90, del, 127]);
        controller.handleMidiMessage([0x90, del, 0]);
        const status = target === null ? 0xB0 : 0x90;
        const pad = target === null ? controller.mapping.TOP_CONTROLS.PLAY_STOP : controller.mapping.INSTRUMENTS[target];
        controller.handleMidiMessage([status, pad, 127]);
        assert.equal(controller.deleteArmed, false);
        t.mock.timers.tick(500); // target hold must not STOP
        controller.handleMidiMessage([status, pad, 0]); // release must not PAUSE/select
        const expected = structuredClone(before);
        if (target === null) expected.motif.forEach(row => row.fill(false));
        else expected.motif[target].fill(false);
        assert.deepEqual(structuredClone(state), expected);
        assert.equal(clock.transportRevision, revision);
        assert.equal(controller.playStopTimer, null);
        controller.resetInputState();
    }
});

test("event deletion retains scheduled Note Offs and suppresses subsequent Note Ons", async () => {
    const { state, actions, controller } = setup();
    state.motif[12].fill(true);
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const events = [], pending = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
        { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
        { send: (output, data) => events.push([output, data]), findOutput: () => ({}) },
        { pulseInstrument() {} }, fn => pending.push(fn));
    actions.startPlayback(); trigger(0);
    const ons = structuredClone(events);
    controller.handleMidiMessage([0x90, controller.mapping.VALUE_CONTROLS.DELETE, 127]);
    controller.handleMidiMessage([0x90, controller.mapping.VALUE_CONTROLS.DELETE, 0]);
    controller.handleMidiMessage([0x90, controller.mapping.INSTRUMENTS[12], 127]);
    trigger(1);
    assert.deepEqual(events, ons);
    state.padConfiguration.voices[12].note = 99;
    pending.forEach(fn => fn());
    assert.deepEqual(events.slice(ons.length), ons.map(([output, [status, note]]) => [output, [status, note, 0]]));
    for (const invalid of [-1, 16, 1.5, "0"]) assert.equal(actions.clearMotifEvents(invalid), false);
    controller.resetInputState();
});

test("COPY stages, cancellation, invalid targets, SHIFT reservation and DELETE exclusion", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, controller } = setup();
    const events = [];
    controller.midiManager.send = (_, data) => events.push(data);
    const press = (status, pad) => { controller.handleMidiMessage([status, pad, 127]); controller.handleMidiMessage([status, pad, 0]); };
    const copy = () => press(0x90, controller.mapping.VALUE_CONTROLS.COPY);
    const before = structuredClone(state);
    copy(); assert.equal(controller.copyStage, "SOURCE");
    assert.equal(events.at(-1)[2], (controller.colors.YELLOW & 0x33) | 4);
    t.mock.timers.tick(160); assert.equal(events.at(-1)[2], (controller.colors.OFF & 0x33) | 4);
    copy(); assert.equal(controller.copyStage, null);
    copy(); press(0x90, controller.mapping.INSTRUMENTS[0]);
    assert.equal(controller.copyStage, "TARGET");
    assert.equal(controller.copyTimer, null);
    assert.equal(events.at(-1)[2], (controller.colors.YELLOW & 0x33) | 4);
    press(0xB0, controller.mapping.TOP_CONTROLS.PLAY_STOP);
    press(0x90, controller.mapping.MOTIF[0]);
    assert.equal(controller.copyStage, "TARGET");
    copy(); assert.equal(controller.copyStage, null);
    t.mock.timers.tick(500);
    assert.deepEqual(structuredClone(state), before);
    controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 127]);
    copy(); assert.equal(controller.copyStage, null);
    controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 0]);
    copy(); press(0x90, controller.mapping.VALUE_CONTROLS.DELETE);
    assert.equal(controller.copyStage, null); assert.equal(controller.deleteArmed, true);
    copy(); assert.equal(controller.deleteArmed, false); assert.equal(controller.copyStage, "SOURCE");
    controller.resetInputState(); assert.equal(controller.copyStage, null);
    state.currentTimeline = "MODULATION"; copy(); assert.equal(controller.copyStage, null);
});

test("COPY Voice snapshots events and explicit/null geometry without identity or source mutations", () => {
    for (const sourceLength of [7, null, 32]) {
        const { state, actions, controller, length } = setup();
        length(0, sourceLength); length(1, 3); length(null, 16);
        state.motif[0][0] = true; state.motif[0][31] = true; state.motif[1].fill(true);
        const before = structuredClone(state);
        const press = pad => { controller.handleMidiMessage([0x90, pad, 127]); controller.handleMidiMessage([0x90, pad, 0]); };
        press(controller.mapping.VALUE_CONTROLS.COPY); press(controller.mapping.INSTRUMENTS[0]);
        press(controller.mapping.INSTRUMENTS[1]);
        const expected = structuredClone(before);
        expected.voiceLengths[1] = sourceLength; expected.motif[1] = before.motif[0].slice();
        assert.deepEqual(structuredClone(state), expected);
        assert.equal(controller.copyStage, null);
        assert.notEqual(state.motif[0], state.motif[1]);
        const snapshot = actions.captureMusicalCopy("VOICE", 0);
        state.motif[0][0] = false;
        actions.applyVoiceCopy(snapshot, 1); assert.equal(state.motif[1][0], true);
        const motif = actions.captureMusicalCopy("MOTIF");
        assert.deepEqual(motif, { kind: "MOTIF", events: state.motif, voiceLengths: state.voiceLengths, motifLength: 16 });
        assert.equal(actions.applyVoiceCopy(motif, 1), false);
        for (const invalid of [-1, 16, null, "1"]) assert.equal(actions.applyVoiceCopy(snapshot, invalid), false);
        controller.resetInputState();
    }
});

test("COPY live Leader/Follower reuses local/global boundaries without resetting phase", () => {
    for (const mode of ["INTERNAL", "MIDI"]) for (const sourceLength of [7, null]) {
        const { state, clock, actions, length } = setup();
        length(0, sourceLength); length(1, 4); length(null, 16);
        state.motif[0][0] = true;
        clock.setSource(mode); actions.startPlayback();
        let sequence = 0;
        const tick = () => {
            if (mode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
            else assert.equal(clock.receiveInternalClockStep({ sequence: ++sequence, transportRevision: clock.transportRevision }).accepted, true);
        };
        tick(); tick();
        const revision = clock.transportRevision, config = structuredClone(state.padConfiguration);
        actions.applyVoiceCopy(actions.captureMusicalCopy("VOICE", 0), 1);
        assert.equal(state.playheadPosition, 2); assert.equal(state.getVoiceStep(1), 2);
        assert.equal(state.transportState, "PLAY"); assert.equal(clock.transportRevision, revision);
        assert.deepEqual(structuredClone(state.padConfiguration), config);
        tick(); assert.equal(state.getVoiceStep(1), 3);
        tick(); assert.equal(state.getVoiceStep(1), 0);
        tick(); assert.equal(state.getVoiceStep(1), 1);
        for (let i = 6; i <= 16; i++) tick();
        assert.equal(state.playheadPosition, 0); assert.equal(state.liveLengthCycle, null);
        assert.equal(state.getVoiceLength(1), sourceLength ?? 32);
    }
});

test("COPY retains captured Note Offs for active destination notes", async () => {
    const { state, actions } = setup();
    state.motif[12][0] = true;
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const events = [], pending = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
        { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
        { send: (output, data) => events.push([output, data]), findOutput: () => ({}) },
        { pulseInstrument() {} }, fn => pending.push(fn));
    actions.startPlayback(); trigger(0);
    const ons = structuredClone(events);
    actions.applyVoiceCopy(actions.captureMusicalCopy("VOICE", 0), 12);
    trigger(0); assert.deepEqual(events, ons);
    pending.forEach(fn => fn());
    assert.deepEqual(events.slice(ons.length), ons.map(([output, [status, note]]) => [output, [status, note, 0]]));
});

test("instrument event feedback respects selection, redraws, retriggers and selection modes", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, controller } = setup();
    t.after(() => controller.resetInputState());
    const before = structuredClone(state);
    const leds = new Map();
    controller.midiManager.send = (_, [status, note, value]) => {
        if (status === 0x90) leds.set(note, value & 0x33);
    };
    const color = id => leds.get(controller.mapping.INSTRUMENTS[id]);
    const selected = state.selectedInstrument;
    const normal = state.padConfiguration.voices.findIndex((voice, id) => id !== selected && voice.type === "MIDI DRUM");
    controller.drawInstruments();
    assert.equal(color(normal), controller.colors.DIM_GREEN & 0x33);
    assert.equal(color(selected), controller.colors.DIM_AMBER & 0x33);
    controller.pulseInstrument(normal); controller.pulseInstrument(selected);
    assert.equal(color(normal), controller.colors.GREEN & 0x33);
    assert.equal(color(selected), controller.colors.YELLOW & 0x33);
    controller.drawInstruments();
    assert.equal(color(normal), controller.colors.GREEN & 0x33);
    assert.equal(color(selected), controller.colors.YELLOW & 0x33);
    t.mock.timers.tick(40); controller.pulseInstrument(selected);
    t.mock.timers.tick(40);
    assert.equal(color(normal), controller.colors.DIM_GREEN & 0x33);
    assert.equal(color(selected), controller.colors.YELLOW & 0x33);
    t.mock.timers.tick(40);
    assert.equal(color(selected), controller.colors.DIM_AMBER & 0x33);
    assert.deepEqual(structuredClone(state), before);
    controller.filterSelectionMode = true;
    state.visibleInstrumentFilter.add(normal);
    controller.drawInstruments();
    assert.equal(color(normal), controller.colors.YELLOW & 0x33);
    controller.performanceHolds.set("solo", { selection: new Set([selected]), edited: false });
    controller.drawInstruments(); controller.pulseInstrument(normal);
    assert.equal(color(normal), controller.colors.DIM_GREEN & 0x33);
    assert.equal(color(selected), controller.colors.YELLOW & 0x33);
});

test("PLAY flashes GREEN over DIM GREEN; PAUSE stays dim and STOP sends real OFF", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, controller } = setup();
    t.after(() => controller.resetInputState());
    const messages = [];
    controller.midiManager.send = (_, message) => messages.push(message);
    const color = () => messages.at(-1)[2] & 0x33;
    actions.startPlayback(); controller.drawTransport();
    assert.equal(color(), controller.colors.DIM_GREEN & 0x33);
    for (let beat = 0; beat < 3; beat++) {
        controller.pulseTransport();
        assert.equal(color(), controller.colors.GREEN & 0x33);
        controller.drawTransport();
        assert.equal(color(), controller.colors.GREEN & 0x33);
        t.mock.timers.tick(80);
        assert.equal(color(), controller.colors.DIM_GREEN & 0x33);
    }
    for (const transport of ["PAUSE", "STOP"]) {
        actions.startPlayback(); controller.pulseTransport();
        if (transport === "PAUSE") actions.pausePlayback(); else actions.stop();
        controller.drawTopControls(); controller.drawTransport();
        const expected = transport === "PAUSE" ? controller.colors.DIM_GREEN & 0x33 : 0;
        assert.deepEqual(messages.at(-1), [0xB0, controller.mapping.TOP_CONTROLS.PLAY_STOP, expected | 4]);
        const count = messages.length;
        controller.pulseTransport(); t.mock.timers.tick(1000);
        assert.equal(messages.length, count);
        assert.equal(color(), expected);
        assert.equal(state.transportState, transport);
    }
});

test("SHIFT+SOLO restores historical Instrument Timeline Focus independently of SOLO memory", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, controller } = setup();
    t.after(() => controller.resetInputState());
    const top = (name, value) => controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS[name], value]);
    const voice = id => {
        controller.handleMidiMessage([0x90, controller.mapping.INSTRUMENTS[id], 127]);
        controller.handleMidiMessage([0x90, controller.mapping.INSTRUMENTS[id], 0]);
    };
    top("SOLO", 127); voice(3); top("SOLO", 0);
    const before = structuredClone(state);
    const colors = [];
    controller.midiManager.send = (_, message) => colors.push(message);
    const begin = () => { top("SHIFT", 127); top("SOLO", 127); };
    const end = () => { top("SOLO", 0); top("SHIFT", 0); };
    begin();
    assert.equal(state.filterMode, true);
    assert.equal(state.selectedInstrument, null);
    assert.equal(controller.performanceHolds.size, 0);
    assert.equal(state.visibleInstrumentFilter.size, 0);
    end(); // First empty activation stays active.
    assert.equal(state.filterMode, true);
    begin(); end(); // Unedited active focus exits completely.
    assert.equal(state.filterMode, false);
    begin(); voice(1); voice(2); voice(1);
    top("SHIFT", 0); top("SOLO", 0); // Release order must not toggle audio SOLO.
    assert.equal(controller.filterSelectionMode, false);
    assert.equal(state.filterMode, true);
    assert.deepEqual([...state.visibleInstrumentFilter], [2]);
    begin(); voice(4); end(); // Editing an active focus keeps it active.
    assert.equal(state.filterMode, true);
    assert.deepEqual([...state.visibleInstrumentFilter], [2, 4]);
    t.mock.timers.tick(160);
    assert.equal(colors.filter(m => m[1] === controller.mapping.TOP_CONTROLS.SOLO).at(-1)[2], 4);
    t.mock.timers.tick(160);
    assert.equal(colors.filter(m => m[1] === controller.mapping.TOP_CONTROLS.SOLO).at(-1)[2],
        (controller.colors.GREEN & 0x33) | 4);
    begin(); end();
    assert.equal(state.filterMode, false);
    assert.equal(state.visibleInstrumentFilter.size, 0);
    const expected = structuredClone(before);
    expected.selectedInstrument = null;
    assert.deepEqual(structuredClone(state), expected);
    t.mock.timers.tick(160);
    assert.equal(colors.filter(m => m[1] === controller.mapping.TOP_CONTROLS.SOLO).at(-1)[2], 4);
    top("SOLO", 127); top("SOLO", 0);
    assert.equal(state.soloActive, false);
    assert.deepEqual([...state.soloSelection], [3]);
    top("SOLO", 127); top("SOLO", 0);
    assert.equal(state.soloActive, true);
    // DELETE retains priority even when SHIFT is held.
    top("SHIFT", 127);
    const del = controller.mapping.VALUE_CONTROLS.DELETE;
    controller.handleMidiMessage([0x90, del, 127]);
    controller.handleMidiMessage([0x90, del, 0]);
    top("SOLO", 127); top("SOLO", 0); top("SHIFT", 0);
    assert.equal(state.soloActive, false);
    assert.equal(state.soloSelection.size, 0);
    assert.equal(state.filterMode, false);
});

test("SOLO/MUTE hold selection, memory, empty selection, DELETE and independent blinking", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, controller } = setup();
    const top = (kind, value) => controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS[kind], value]);
    const voice = id => { const pad = controller.mapping.INSTRUMENTS[id]; controller.handleMidiMessage([0x90, pad, 127]); controller.handleMidiMessage([0x90, pad, 0]); };
    const colors = [];
    controller.midiManager.send = (_, message) => colors.push(message);
    for (const kind of ["SOLO", "MUTE"]) {
        const key = kind.toLowerCase();
        top(kind, 127); voice(0); voice(1); voice(0);
        assert.equal(state[key + "Active"], false);
        assert.equal(controller.getInstrumentColor(1), controller.colors.YELLOW);
        top(kind, 0);
        assert.deepEqual([...state[key + "Selection"]], [1]);
        assert.equal(state[key + "Active"], true);
        t.mock.timers.tick(160);
        assert.ok(colors.some(m => m[1] === controller.mapping.TOP_CONTROLS[kind] && m[2] === 4));
        top(kind, 127); top(kind, 0);
        assert.equal(state[key + "Active"], false);
        assert.deepEqual([...state[key + "Selection"]], [1]);
        top(kind, 127); top(kind, 0); assert.equal(state[key + "Active"], true);
    }
    assert.equal(state.isVoiceAudible(1), false);
    assert.equal(state.isVoiceAudible(0), false);
    for (const kind of ["SOLO", "MUTE"]) {
        const del = controller.mapping.VALUE_CONTROLS.DELETE;
        controller.handleMidiMessage([0x90, del, 127]); controller.handleMidiMessage([0x90, del, 0]);
        top(kind, 127); top(kind, 0);
        assert.equal(controller.deleteArmed, false);
        assert.equal(state[kind.toLowerCase() + "Active"], false);
        assert.equal(state[kind.toLowerCase() + "Selection"].size, 0);
    }
    top("SOLO", 127); voice(2); voice(2); top("SOLO", 0);
    assert.equal(state.soloActive, false);
    assert.equal(state.isVoiceAudible(0), true);
    controller.resetInputState();
});

test("SOLO/MUTE filter actual notes while phases and scheduled Note Offs survive", async () => {
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    for (const sourceMode of ["INTERNAL", "MIDI"]) {
        const { state, actions, clock, length } = setup();
        length(12, 5); length(13, 7);
        state.motif[12].fill(true); state.motif[13].fill(true);
        const events = [], pending = [];
        const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
            { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
            { send: (_, data) => events.push(data), findOutput: () => ({}) },
            { pulseInstrument() {} }, fn => pending.push(fn));
        clock.setSource(sourceMode); actions.startPlayback(); clock.setClockStepHandler(() => trigger(state.playheadPosition));
        trigger(0); assert.equal(events.length, 2);
        const before = structuredClone(state);
        actions.setPerformanceSelection("solo", new Set([12, 13]), true);
        actions.setPerformanceSelection("mute", new Set([13]), true);
        for (let i = 1; i <= 35; i++) {
            if (sourceMode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
            else clock.receiveInternalClockStep({ sequence: i, transportRevision: clock.transportRevision });
            assert.equal(state.playheadPosition, i % 35);
            assert.equal(state.getVoiceStep(12), (i % 35) % 5);
            assert.equal(state.getVoiceStep(13), (i % 35) % 7);
        }
        assert.deepEqual(state.motif, before.motif);
        assert.deepEqual(state.voiceLengths, before.voiceLengths);
        assert.equal(state.transportState, "PLAY");
        assert.equal(events.filter(m => m[1] === 37).length, 1);
        const ons = events.slice(); pending.forEach(fn => fn());
        assert.deepEqual(events.slice(ons.length), ons.map(([status, note]) => [status, note, 0]));
    }
});

test("THE GATE: initial PLAY, mapping, edge-triggered toggle and SWITCH always OFF", () => {
    const { state, controller } = setup();
    const messages = [];
    controller.midiManager.send = (_, message) => messages.push(message);
    assert.equal(state.currentView, "PLAY");
    assert.equal(controller.mapping.VALUE_CONTROLS.SWITCH, 120);
    controller.drawViewStatus();
    assert.deepEqual(messages.at(-1), [0x90, 120, 4]);
    controller.handleMidiMessage([0x90, 120, 127]);
    assert.equal(state.currentView, "MOTIF_LIBRARY");
    assert.deepEqual(messages.at(-1), [0x90, 120, 4]);
    controller.handleMidiMessage([0x90, 120, 127]);
    controller.handleMidiMessage([0x80, 120, 64]);
    assert.equal(state.currentView, "MOTIF_LIBRARY");
    controller.resetInputState();
    messages.length = 0;
    controller.drawTopControls();
    assert.deepEqual(messages.filter(m => m[0] === 0x90 && m[1] === 120), [[0x90, 120, 4]]);
    controller.handleMidiMessage([0x90, 120, 127]);
    controller.handleMidiMessage([0x90, 120, 0]);
    assert.equal(state.currentView, "PLAY");
    assert.deepEqual(messages.at(-1), [0x90, 120, 4]);
    assert.ok(messages.filter(m => m[0] === 0x90 && m[1] === 120).every(m => m[2] === 4));
});

test("THE GATE preserves all musical state, clock and pending performance gestures", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const transport of ["STOP", "PAUSE", "PLAY"]) {
        const { state, actions, clock, controller, length } = setup();
        length(12, 5); length(13, 7);
        state.transportState = transport;
        state.playheadPosition = 9;
        if (transport === "PLAY") length(12, 11);
        state.soloSelection.add(12); state.soloActive = true;
        state.muteSelection.add(13); state.muteActive = true;
        state.motif[12][2] = true;
        controller.setCopyStage("TARGET", actions.captureMusicalCopy("VOICE", 12));
        controller.setDeleteArmed(true);
        controller.performanceHolds.set("solo", { selection: new Set([12]), edited: false });
        const before = structuredClone(state), motif = state.motif;
        const clockBefore = { ...clock };
        const gestureBefore = [controller.copyStage, controller.copySource, controller.copyTimer,
            controller.deleteArmed, controller.deleteBlinkTimer, controller.performanceHolds];
        for (const expected of ["MOTIF_LIBRARY", "PLAY"]) {
            controller.handleMidiMessage([0x90, 120, 127]);
            controller.handleMidiMessage([0x90, 120, 0]);
            assert.equal(state.currentView, expected);
            assert.deepEqual(structuredClone(state), { ...before, currentView: expected });
            assert.equal(state.motif, motif);
            assert.deepEqual({ ...clock }, clockBefore);
            assert.deepEqual([controller.copyStage, controller.copySource, controller.copyTimer,
                controller.deleteArmed, controller.deleteBlinkTimer, controller.performanceHolds], gestureBefore);
        }
        controller.resetInputState();
    }
});

test("THE GATE keeps Leader/Follower polymetric playback and scheduled Note Offs running", async () => {
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    for (const mode of ["INTERNAL", "MIDI"]) {
        const { state, actions, clock, controller, length } = setup();
        length(12, 5); length(13, 7);
        state.motif[12].fill(true); state.motif[13].fill(true);
        const events = [], pending = [];
        const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
            { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
            { send: (_, data) => events.push(data), findOutput: () => ({}) },
            { pulseInstrument() {} }, fn => pending.push(fn));
        clock.setSource(mode); actions.startPlayback();
        clock.setClockStepHandler(() => trigger(state.playheadPosition));
        trigger(0);
        const revision = clock.transportRevision;
        for (let i = 1; i <= 70; i++) {
            if (i === 1 || i === 40) {
                controller.handleMidiMessage([0x90, 120, 127]);
                controller.handleMidiMessage([0x90, 120, 0]);
            }
            if (mode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
            else clock.receiveInternalClockStep({ sequence: i, transportRevision: revision });
            assert.equal(state.playheadPosition, i % 35);
            assert.equal(state.getVoiceStep(12), (i % 35) % 5);
            assert.equal(state.getVoiceStep(13), (i % 35) % 7);
            assert.equal(state.transportState, "PLAY");
            assert.equal(clock.transportRevision, revision);
        }
        assert.equal(events.length, 142);
        const ons = events.slice(); pending.forEach(fn => fn());
        assert.deepEqual(events.slice(ons.length), ons.map(([status, note]) => [status, note, 0]));
    }
});

test("THE GATE redraws BOOK on view changes and restores PLAY reservations", () => {
    const { state, actions, controller } = setup();
    const messages = [];
    controller.midiManager.send = (_, message) => messages.push(message);
    const bookMessages = () => messages.filter(([status, note]) =>
        status === 0x90 && controller.mapping.BOOKS.includes(note));
    const expected = library => controller.mapping.BOOKS.map((note, i) => [0x90, note,
        ((library ? (i === 0 ? controller.colors.GREEN : controller.colors.DIM_GREEN)
            : i < 8 ? controller.colors.DIM_RED : controller.colors.DIM_AMBER) & 0x33) | 4]);
    const check = library => {
        assert.deepEqual(bookMessages(), expected(library));
        assert.ok(messages.every(([status, note]) => status === 0x90 &&
            (controller.mapping.BOOKS.includes(note) || Object.values(controller.mapping.VALUE_CONTROLS).includes(note))));
        messages.length = 0;
    };
    assert.equal(state.currentView, "PLAY");
    controller.drawBooks();
    check(false);
    for (const library of [true, false]) {
        controller.handleMidiMessage([0x90, 120, 127]);
        controller.handleMidiMessage([0x90, 120, 0]);
        assert.equal(state.currentView, library ? "MOTIF_LIBRARY" : "PLAY");
        check(library);
    }
    // Non-hardware navigation uses the same notification and renderer.
    actions.toggleView();
    check(true);
    controller.drawBooks();
    check(true);
    actions.toggleView();
    check(false);
});

test("THE GATE retains functional COPY/DELETE, blink phase and Footer Zone 3 in both views", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { initializePlayFooterUI } = await import("../src/PlayFooterUI.mjs");
    const { state, controller } = setup();
    const leds = new Map();
    controller.midiManager.send = (_, [status, note, color]) => leds.set(`${status}:${note}`, color);
    const fields = new Map();
    const footer = initializePlayFooterUI({ state, controller, document: {
        getElementById(id) { if (!fields.has(id)) fields.set(id, { textContent: "" }); return fields.get(id); }
    } });
    const states = () => { footer.render(); return fields.get("play-footer-states").textContent; };
    const tap = (note, status = 0x90) => {
        controller.handleMidiMessage([status, note, 127]);
        controller.handleMidiMessage([status, note, 0]);
    };
    const color = note => leds.get(`144:${note}`);
    state.soloSelection.add(12); state.muteSelection.add(13);
    tap(controller.mapping.TOP_CONTROLS.SOLO, 0xB0);
    tap(controller.mapping.TOP_CONTROLS.MUTE, 0xB0);
    assert.equal(states(), "SOLO  MUTE");
    for (const view of ["MOTIF_LIBRARY", "PLAY"]) {
        tap(120);
        assert.equal(state.currentView, view);
        state.motif[12][3] = true;
        tap(104); // COPY source selection
        assert.equal(controller.copyStage, "SOURCE");
        assert.equal(color(104), (controller.colors.YELLOW & 0x33) | 4);
        assert.equal(states(), "SOLO  MUTE  COPY");
        t.mock.timers.tick(160);
        assert.equal(color(104), 4);
        const timer = controller.copyTimer;
        tap(120); tap(120);
        assert.equal(controller.copyTimer, timer);
        assert.equal(color(104), 4); // refresh preserves the dark blink phase
        t.mock.timers.tick(160);
        assert.equal(color(104), (controller.colors.YELLOW & 0x33) | 4);
        tap(controller.mapping.INSTRUMENTS[12]);
        assert.equal(controller.copyStage, "TARGET");
        tap(120); tap(120);
        assert.equal(color(104), (controller.colors.YELLOW & 0x33) | 4);
        tap(controller.mapping.INSTRUMENTS[14]);
        assert.deepEqual(state.motif[14], state.motif[12]);
        assert.equal(controller.copyStage, null);
        assert.equal(states(), "SOLO  MUTE");
        tap(88);
        assert.equal(controller.deleteArmed, true);
        assert.equal(color(88), (controller.colors.RED & 0x33) | 4);
        assert.equal(states(), "SOLO  MUTE  DELETE");
        t.mock.timers.tick(160);
        const deleteTimer = controller.deleteBlinkTimer;
        tap(120); tap(120);
        assert.equal(controller.deleteBlinkTimer, deleteTimer);
        assert.equal(color(88), 4);
        t.mock.timers.tick(160);
        assert.equal(color(88), (controller.colors.RED & 0x33) | 4);
        tap(controller.mapping.INSTRUMENTS[14]);
        assert.ok(state.motif[14].every(event => !event));
        assert.equal(controller.deleteArmed, false);
        assert.equal(states(), "SOLO  MUTE");
        assert.deepEqual([...state.soloSelection], [12]);
        assert.deepEqual([...state.muteSelection], [13]);
    }
    controller.resetInputState();
});

test("PHASE A: 16 independent event and geometry records restore edits through hardware", () => {
    const { state, controller, actions } = setup();
    assert.equal(state.currentMotifId, 0);
    assert.equal(state.motifs.length, 16);
    assert.equal(new Set(state.motifs).size, 16);
    assert.equal(new Set(state.motifs.flatMap(m => m.events)).size, 256);
    assert.equal(new Set(state.motifs.map(m => m.voiceLengths)).size, 16);
    const tap = note => { controller.handleMidiMessage([0x90, note, 127]); controller.handleMidiMessage([0x90, note, 0]); };
    tap(120);
    for (let id = 0; id < 16; id++) {
        tap(controller.mapping.BOOKS[id]);
        assert.equal(state.currentMotifId, id);
        assert.ok(state.motif.every(row => row.every(event => !event)));
        assert.equal(state.motifLength, null);
        assert.ok(state.voiceLengths.every(n => n === null));
        tap(controller.mapping.MOTIF[id]);
        actions.setSelectedLength(id + 1);
        state.selectedInstrument = null;
        actions.setSelectedLength(32 - id);
        state.selectedInstrument = 12;
    }
    for (let id = 0; id < 16; id++) {
        tap(controller.mapping.BOOKS[id]);
        assert.deepEqual(state.motif[12], Array.from({ length: 32 }, (_, step) => step === id));
        assert.equal(state.voiceLengths[12], id + 1);
        assert.equal(state.motifLength, 32 - id);
        assert.equal(state.motif, state.getMotif(id).events);
    }
    tap(120);
    assert.equal(state.currentView, "PLAY");
    assert.equal(state.currentMotifId, 15);
    tap(controller.mapping.BOOKS[0]);
    assert.equal(state.currentMotifId, 15); // PLAY BOOK reservations do not select motifs
});

test("PHASE A: STOP/PAUSE select synchronously, PLAY and invalid selections are inert", () => {
    for (const mode of ["INTERNAL", "MIDI"]) {
        const { state, actions, clock, controller } = setup();
        clock.setSource(mode);
        for (const transport of ["STOP", "PAUSE"]) {
            state.transportState = transport;
            state.playheadPosition = 25;
            state.liveLengthCycle = { duration: 32, lengths: Array(16).fill(32), steps: Array(16).fill(25) };
            const revision = clock.transportRevision;
            assert.equal(actions.selectMotif(transport === "STOP" ? 4 : 5), true);
            assert.equal(state.transportState, transport);
            assert.equal(state.playheadPosition, 0);
            assert.equal(state.liveLengthCycle, null);
            assert.equal(clock.transportRevision, revision);
        }
        actions.startPlayback();
        actions.toggleView();
        const before = structuredClone(state), clockBefore = { ...clock };
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[9], 127]);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[9], 0]);
        assert.equal(actions.selectMotif(9), false);
        assert.deepEqual(structuredClone(state), before);
        assert.deepEqual({ ...clock }, clockBefore);
        actions.pausePlayback();
        for (const id of [-1, 16, 1.5, "1", null, NaN, state.currentMotifId]) {
            const snapshot = structuredClone(state);
            assert.equal(actions.selectMotif(id), false);
            assert.deepEqual(structuredClone(state), snapshot);
        }
    }
});

test("PHASE A: BOOK current slot, Footer Zone 1 and PLAY projections follow selection", async () => {
    const { initializePlayFooterUI } = await import("../src/PlayFooterUI.mjs");
    const { readPlayStatus } = await import("../src/PlayStatusUI.mjs");
    const { state, actions, clock, controller } = setup();
    const leds = new Map(), elements = new Map();
    controller.midiManager.send = (_, [status, note, color]) => leds.set(`${status}:${note}`, color);
    const footer = initializePlayFooterUI({ state, controller, document: {
        getElementById(id) { if (!elements.has(id)) elements.set(id, { textContent: "" }); return elements.get(id); }
    } });
    actions.setMotifChangeHandler(() => { controller.drawSelectedMotif(); footer.render(); });
    state.selectedInstrument = null;
    actions.toggleView();
    for (const id of [4, 15, 0]) {
        assert.equal(actions.selectMotif(id), true);
        assert.equal(elements.get("play-footer-zone1").textContent, `MOTIF ${String(id + 1).padStart(2, "0")}`);
        assert.equal(readPlayMotif(state).title, elements.get("play-footer-zone1").textContent);
        assert.equal(readPlayStatus(state, clock, {}).selected, `Motif ${String(id + 1).padStart(2, "0")}`);
        controller.mapping.BOOKS.forEach((note, index) => assert.equal(leds.get(`144:${note}`),
            ((index === id ? controller.colors.GREEN : controller.colors.DIM_GREEN) & 0x33) | 4));
        assert.equal(leds.get("144:120"), 4);
    }
    const app = await source("app.js");
    assert.match(app, /setMotifChangeHandler\(\(\) => \{\s*launchpad.drawSelectedMotif\(\);\s*playStatusUI.render\(\);/);
});

test("PHASE A: pending COPY/DELETE do not cross slots, globals stay global", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, controller } = setup();
    const config = state.padConfiguration;
    state.soloSelection.add(12); state.soloActive = true;
    state.muteSelection.add(13); state.muteActive = true;
    state.filterMode = true; state.visibleInstrumentFilter.add(12);
    actions.toggleView();
    for (const note of [104, 88]) {
        controller.handleMidiMessage([0x90, note, 127]);
        controller.handleMidiMessage([0x90, note, 0]);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[1], 127]);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[1], 0]);
        assert.equal(state.currentMotifId, 0);
        assert.ok(note === 104 ? controller.copyStage : controller.deleteArmed);
        controller.handleMidiMessage([0x90, note, 127]);
        controller.handleMidiMessage([0x90, note, 0]);
    }
    actions.selectMotif(1);
    assert.equal(state.padConfiguration, config);
    assert.equal(state.soloActive, true); assert.equal(state.muteActive, true);
    assert.deepEqual([...state.soloSelection], [12]); assert.deepEqual([...state.muteSelection], [13]);
    assert.equal(state.filterMode, true); assert.deepEqual([...state.visibleInstrumentFilter], [12]);
    controller.resetInputState();
});

test("PHASE A: paused motif selection preserves captured Note Offs and resumes the new geometry", async () => {
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    for (const mode of ["INTERNAL", "MIDI"]) {
        const { state, actions, clock, length } = setup();
        state.motif[12][0] = true;
        const original = structuredClone(state.getMotif(0));
        actions.selectMotif(1); length(12, 5); length(13, 7);
        state.motif[13].fill(true);
        actions.selectMotif(0);
        const events = [], pending = [];
        const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
            { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
            { send: (_, data) => events.push(data), findOutput: () => ({}) },
            { pulseInstrument() {} }, fn => pending.push(fn));
        clock.setSource(mode); actions.startPlayback(); trigger(0);
        const ons = events.slice();
        assert.equal(ons.length, 1);
        actions.pausePlayback(); actions.selectMotif(1);
        pending.splice(0).forEach(fn => fn());
        assert.deepEqual(events.slice(ons.length), ons.map(([status, note]) => [status, note, 0]));
        actions.continuePlayback();
        clock.setClockStepHandler(() => trigger(state.playheadPosition));
        for (let i = 1; i <= 35; i++) {
            if (mode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
            else clock.receiveInternalClockStep({ sequence: i, transportRevision: clock.transportRevision });
            assert.equal(state.playheadPosition, i % 35);
            assert.equal(state.getVoiceStep(12), (i % 35) % 5);
            assert.equal(state.getVoiceStep(13), (i % 35) % 7);
        }
        assert.equal(events.length, 37);
        pending.splice(0).forEach(fn => fn());
        assert.deepEqual(state.getMotif(0), original);
        assert.equal(state.currentMotifId, 1);
        assert.equal(state.transportState, "PLAY");
    }
});

test("hardware repro 4/7/5/32: exact dispatch across 4480 ticks (four LCM cycles), before and after Phase A", async () => {
    const { execFileSync } = await import("node:child_process");
    const baseline = file => execFileSync("git", ["show", `e322070:src/${file}`], { encoding: "utf8" });
    const baselinePad = url(baseline("PadConfiguration.js"));
    const { LiRythmeState: OldState } = await import(url(baseline("LiRythmeState.js").replace('"./PadConfiguration.js"', JSON.stringify(baselinePad))));
    const { LiRythmeActions: OldActions } = await import(url(baseline("LiRythmeActions.js")));
    const { LiRythmeClock: OldClock } = await import(url(baseline("LiRythmeClock.js")));
    const configurations = [[OldState, OldActions, OldClock, baseline("app.js")],
        [LiRythmeState, LiRythmeActions, LiRythmeClock, await source("app.js")]];
    const traces = [];
    const log = console.log;
    console.log = () => {};
    try {
        for (const [State, Actions, Clock, app] of configurations) {
            for (const mode of ["INTERNAL", "MIDI"]) {
                const state = new State(), clock = new Clock(state), actions = new Actions(state, clock);
                // Exact supplied patterns, mapped to four valid drum Voices.
                const patterns = [[4, [0]], [7, [1, 3, 5]], [5, [1, 3]], [32, [0]]];
                const ids = [12, 11, 10, 15];
                ids.forEach((id, i) => {
                    state.setTargetLength(patterns[i][0], { target: id });
                    patterns[i][1].forEach(step => { state.motif[id][step] = true; });
                    state.padConfiguration.voices[id] = { type: "MIDI DRUM", output: { mode: "DEFAULT" }, channel: 1, note: 60 + i };
                });
                assert.equal(state.getMotifDuration(), 1120); // LCM = 32 * 7 * 5; 4 divides 32.
                const geometry = structuredClone(state.voiceLengths), matrix = structuredClone(state.motif);
                const events = ids.map(() => []);
                let tick = 0;
                const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
                const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${dispatch}; return triggerMotifStep;`)(state,
                    { options: [{ textContent: "Hardware" }], selectedIndex: 0 },
                    { send: (_, [, note, velocity]) => { if (velocity) events[note - 60].push(tick); }, findOutput: () => ({}) },
                    { pulseInstrument() {} }, () => {});
                clock.setSource(mode); actions.startPlayback(); trigger(0);
                clock.setClockStepHandler(() => trigger(state.playheadPosition));
                for (tick = 1; tick <= 4480; tick++) {
                    if (mode === "MIDI") for (let p = 0; p < 6; p++) clock.receiveMidiClockPulse();
                    else clock.receiveInternalClockStep({ sequence: tick, transportRevision: clock.transportRevision });
                    ids.forEach((id, i) => assert.equal(state.getVoiceStep(id), tick % patterns[i][0]));
                }
                patterns.forEach(([period, onSteps], i) => {
                    const expected = Array.from({ length: 4481 }, (_, n) => n).filter(n => onSteps.includes(n % period));
                    assert.deepEqual(events[i], expected);
                });
                assert.ok(events[0].slice(1).every((n, i) => n - events[0][i] === 4));
                assert.deepEqual(state.voiceLengths, geometry);
                assert.deepEqual(state.motif, matrix);
                assert.equal(state.liveLengthCycle, null);
                traces.push(events);
            }
        }
    } finally { console.log = log; }
    traces.slice(1).forEach(events => assert.deepEqual(events, traces[0]));
});

test("shared MIDI worker drains simultaneous Voices without pulse spacing and respects clock guard", async () => {
    const { execFileSync } = await import("node:child_process");
    const old = execFileSync("git", ["show", "e322070:src/hardware/midi/MidiClockWorker.cjs"], { encoding: "utf8" });
    const current = await source("hardware/midi/MidiClockWorker.cjs");
    const run = (code, name, costs = [], offs = []) => {
        const section = code.slice(code.indexOf("function takePendingMidiMessage()"), code.indexOf("function scheduleIdleMidiFlush()"));
        return new Function("costs", "offs", `
            let now = 0n, nextPulseTimeNs = 20833333n;
            const MIDI_SEND_GUARD_NS = 2000000n;
            const process = { hrtime: { bigint: () => now } };
            const pendingMidiMessages = [45, 43, 44, 36].map(note => [0x99, note, 100]);
            const pendingNoteOffMessages = offs.slice();
            const sent = [], diagnostic = null;
            const output = { sendMessage(message) { sent.push({ message, at: Number(now) / 1e6 }); now += BigInt(costs.shift() ?? 100000); } };
            const getPendingMidiCount = () => pendingMidiMessages.length + pendingNoteOffMessages.length;
            const recordMidiDrop = () => {}, post = () => {}, serializeError = e => String(e);
            ${section}
            ${name}();
            const firstBatch = sent.length;
            now = nextPulseTimeNs; nextPulseTimeNs += 20833333n;
            ${name}();
            return { sent, firstBatch, pending: getPendingMidiCount() };
        `)(costs.slice(), offs);
    };
    const before = run(old, "sendOneMidiMessageAfterClockPulse");
    assert.equal(before.firstBatch, 1);
    assert.equal(before.sent[1].at, 20.833333);
    const after = run(current, "flushMidiMessagesAfterClockPulse");
    assert.equal(after.firstBatch, 4);
    assert.deepEqual(after.sent.map(e => e.message[1]), [45, 43, 44, 36]);
    assert.equal(after.sent[3].at, 0.3);
    assert.equal(after.pending, 0);
    const guarded = run(current, "flushMidiMessagesAfterClockPulse", [19000000]);
    assert.equal(guarded.firstBatch, 1);
    assert.equal(guarded.sent[1].at, 20.833333);
    assert.equal(guarded.pending, 0);
    const noteOff = [0x99, 40, 0];
    const priority = run(current, "flushMidiMessagesAfterClockPulse", [], [noteOff]);
    assert.deepEqual(priority.sent[0].message, noteOff);
    assert.equal(priority.firstBatch, 5);
    assert.match(current, /nextPulseTimeNs \+= pulseIntervalNs;\s*flushMidiMessagesAfterClockPulse\(\);/);
});
