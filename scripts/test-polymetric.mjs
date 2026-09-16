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
        ((library ? (i === 0 ? controller.colors.GREEN : controller.colors.OFF)
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

test("STOP/PAUSE select synchronously; PLAY arms NEXT without changing current motif", () => {
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
        before.nextMotifId = 9;
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
            ((index === id ? controller.colors.GREEN : controller.colors.OFF) & 0x33) | 4));
        assert.equal(leds.get("144:120"), 4);
    }
    const app = await source("app.js");
    assert.match(app, /setMotifChangeHandler\(\(\) => \{\s*launchpad.drawSelectedMotif\(\);\s*playStatusUI.render\(\);/);
});

test("COPY/DELETE BOOK targets do not select slots; globals stay global", t => {
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
        assert.equal(controller.copyStage, note === 104 ? "TARGET" : null);
        assert.equal(controller.deleteArmed, false);
        if (note === 88) continue;
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

test("NEXT: replacement, cancellation, blink, PAUSE/STOP and view restoration", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, controller } = setup();
    const leds = new Map();
    controller.midiManager.send = (_, [status, note, color]) => leds.set(`${status}:${note}`, color);
    const tap = id => { const note = controller.mapping.BOOKS[id]; controller.handleMidiMessage([0x90,note,127]); controller.handleMidiMessage([0x90,note,0]); };
    const color = id => leds.get(`144:${controller.mapping.BOOKS[id]}`);
    actions.toggleView(); actions.startPlayback(); state.playheadPosition = 3;
    tap(4);
    assert.equal(state.playingMotifId, 0); assert.equal(state.currentMotifId, 0);
    assert.equal(state.nextMotifId, 4); assert.equal(state.playheadPosition, 3);
    assert.equal(color(0), (controller.colors.GREEN & 0x33) | 4);
    t.mock.timers.tick(160); assert.equal(color(4), (controller.colors.DIM_GREEN & 0x33) | 4);
    tap(6); assert.equal(state.nextMotifId, 6);
    assert.equal(color(4), 4);
    t.mock.timers.tick(160); assert.equal(color(6), (controller.colors.DIM_GREEN & 0x33) | 4);
    tap(0); assert.equal(state.nextMotifId, null); assert.equal(state.playheadPosition, 3);
    assert.equal(controller.nextMotifBlinkTimer, null);
    tap(4); actions.toggleView(); assert.equal(controller.nextMotifBlinkTimer, null);
    actions.toggleView(); assert.notEqual(controller.nextMotifBlinkTimer, null);
    actions.pausePlayback(); assert.equal(state.nextMotifId, null);
    tap(6); assert.equal(state.playingMotifId, 6); assert.equal(state.playheadPosition, 0);
    actions.continuePlayback(); tap(4); actions.stop();
    assert.equal(state.nextMotifId, null); assert.equal(state.playingMotifId, 6);
    assert.equal(controller.nextMotifBlinkTimer, null);
    controller.resetInputState();
});

test("NEXT: polymetric boundary dispatches new step zero exactly once, with clock and Note Offs intact", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const app = await source("app.js");
    const dispatch = app.slice(app.indexOf("function triggerMotifStep(step) {"), app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const log = console.log; console.log = () => {};
    try {
        for (const mode of ["INTERNAL", "MIDI"]) {
            const { state, actions, clock, controller } = setup();
            const periods = [4,7,5,32], on = [[0],[1,3,5],[1,3],[0]];
            [12,11,10,15].forEach((id,i) => {
                state.setTargetLength(periods[i], { target:id });
                on[i].forEach(step => state.motif[id][step] = true);
                state.padConfiguration.voices[id] = { type:"MIDI DRUM", output:{mode:"DEFAULT"}, channel:1, note:60+i };
            });
            state.getMotif(4).motifLength = 3; state.getMotif(4).events[12][0] = true;
            state.getMotif(6).motifLength = 5; state.getMotif(6).events[15][0] = true;
            const bank = structuredClone(state.motifs), notes = [], offs = [], steps = [], order = [];
            let tick = 0;
            const trigger = new Function("state","midiOutputSelector","midiManager","launchpad","setTimeout",`${dispatch}; return triggerMotifStep;`)(state,
                {options:[{textContent:"Drums"}],selectedIndex:0},
                {send:(_,m)=>{notes.push({tick,id:state.playingMotifId,m});order.push("note");},findOutput:()=>({})},
                {pulseInstrument(){}}, fn=>offs.push(fn));
            actions.setMotifChangeHandler(() => { order.push("view"); controller.drawSelectedMotif(); });
            actions.setClockStepHandler(() => { steps.push([state.playingMotifId,state.playheadPosition]); trigger(state.playheadPosition); });
            clock.setSource(mode); actions.startPlayback(); trigger(0);
            const revision = clock.transportRevision;
            for (tick=1;tick<=2245;tick++) {
                if(tick===1121) { actions.requestMotif(4); actions.requestMotif(6); }
                if(mode==="MIDI") for(let p=0;p<6;p++) clock.receiveMidiClockPulse();
                else clock.receiveInternalClockStep({sequence:tick,transportRevision:revision});
                if(tick<2240) {
                    assert.equal(state.playingMotifId,0);
                    [12,11,10,15].forEach((id,i)=>assert.equal(state.getVoiceStep(id),tick%periods[i]));
                }
            }
            assert.equal(steps.length,2245);
            assert.deepEqual(steps[2238],[0,1119]);
            assert.deepEqual(steps[2239],[6,0]);
            assert.deepEqual(steps[2240],[6,1]);
            assert.deepEqual(steps[2244],[6,0]);
            assert.equal(state.nextMotifId,null); assert.equal(clock.transportRevision,revision);
            assert.equal(state.transportState,"PLAY");
            for(let i=0;i<4;i++) assert.deepEqual(notes.filter(n=>n.id===0&&n.m[1]===60+i).map(n=>n.tick),
                Array.from({length:2240},(_,n)=>n).filter(n=>on[i].includes(n%periods[i])));
            assert.deepEqual(notes.filter(n=>n.id===6).map(n=>n.tick),[2240,2245]);
            assert.equal(notes.some(n=>n.id===4),false);
            assert.equal(order[order.indexOf("view")-1],"note");
            const ons = notes.map(n=>n.m); offs.forEach(fn=>fn());
            assert.deepEqual(notes.slice(ons.length).map(n=>n.m),ons.map(([s,n])=>[s,n,0]));
            assert.deepEqual(state.motifs,bank);
            controller.resetInputState();
        }
    } finally { console.log = log; }
});

test("NEXT: live geometry boundary and Footer follow PLAYING, not the armed motif", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { readPlayFooter } = await import("../src/PlayFooterUI.mjs");
    const { state, actions, clock, controller } = setup();
    state.setTargetLength(8,{target:null});
    state.getMotif(4).motifLength=3;
    actions.toggleView(); actions.startPlayback();
    state.playheadPosition=2;
    actions.setSelectedLength(5); // Internal live change retains the current global cycle.
    assert.equal(state.liveLengthCycle.duration,8);
    actions.requestMotif(4);
    assert.equal(readPlayFooter(state,controller).zone1,"MOTIF 01");
    const frames=[];
    actions.setClockStepHandler(()=>frames.push([state.playingMotifId,state.playheadPosition]));
    for(let i=1;i<=6;i++) clock.receiveInternalClockStep({sequence:i,transportRevision:clock.transportRevision});
    assert.deepEqual(frames,[[0,3],[0,4],[0,5],[0,6],[0,7],[4,0]]);
    assert.equal(readPlayFooter(state,controller).zone1,"MOTIF 05");
    assert.equal(readPlayFooter(state,controller).resolution,"3 STEPS \u00b7 1/16");
    assert.equal(readPlayFooter(state,controller).states,"");
    assert.equal(controller.nextMotifBlinkTimer,null);
    assert.equal(state.liveLengthCycle,null);
    controller.resetInputState();
});

test("PHASE C: hardware COPY/DELETE in STOP/PAUSE, independent snapshot, geometry and Footer", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { readPlayFooter } = await import("../src/PlayFooterUI.mjs");
    for (const transport of ["STOP","PAUSE"]) {
        const {state,actions,controller}=setup();
        state.transportState=transport;
        state.motif[12][3]=true; state.voiceLengths[12]=7; state.motifLength=21;
        const source=structuredClone(state.getMotif(0));
        state.soloActive=true; state.muteActive=true;
        actions.toggleView();
        const tap=n=>{controller.handleMidiMessage([0x90,n,127]);controller.handleMidiMessage([0x90,n,0]);};
        tap(104); assert.equal(readPlayFooter(state,controller).states,"SOLO  MUTE  COPY");
        tap(controller.mapping.BOOKS[0]); assert.equal(controller.copyStage,"TARGET");
        state.motif[12][4]=true; // Snapshot is captured at source selection.
        tap(controller.mapping.BOOKS[4]);
        assert.equal(controller.copyStage,null);
        assert.equal(state.currentMotifId,0);
        assert.deepEqual(state.getMotif(4),source);
        assert.notEqual(state.getMotif(4).events[12],state.getMotif(0).events[12]);
        assert.notEqual(state.getMotif(4).voiceLengths,state.getMotif(0).voiceLengths);
        const intact=structuredClone(state.getMotif(0));
        actions.selectMotif(4); actions.toggleInstrumentStep(8); actions.setSelectedLength(11);
        assert.deepEqual(state.getMotif(0),intact);
        tap(104); tap(controller.mapping.BOOKS[4]);
        const before=structuredClone(state), reference=state.getMotif(4);
        tap(controller.mapping.BOOKS[4]);
        assert.deepEqual(structuredClone(state),before); assert.equal(state.getMotif(4),reference);
        assert.equal(controller.copyStage,null);
        tap(88); assert.equal(readPlayFooter(state,controller).states,"SOLO  MUTE  DELETE");
        tap(controller.mapping.BOOKS[4]);
        assert.ok(state.motif.every(row=>row.every(v=>v===false)));
        assert.deepEqual(state.voiceLengths,Array(16).fill(null)); assert.equal(state.motifLength,null);
        assert.equal(state.playheadPosition,0); assert.equal(state.transportState,transport);
        assert.equal(readPlayFooter(state,controller).states,"SOLO  MUTE");
        assert.deepEqual(state.getMotif(0),intact);
        controller.resetInputState();
    }
});

test("PHASE C: PLAYING/NEXT writes refused; sources permitted; guards rechecked after NEXT transition", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for(const mode of ["INTERNAL","MIDI"]) {
        const {state,actions,clock,controller}=setup();
        state.motif[12][0]=true; state.motifLength=2;
        state.getMotif(4).motifLength=3; state.getMotif(4).events[13][1]=true;
        clock.setSource(mode); actions.startPlayback(); actions.requestMotif(4);
        const before=structuredClone(state), revision=clock.transportRevision;
        const copy=actions.captureMotifCopy(0), nextCopy=actions.captureMotifCopy(4);
        assert.equal(actions.applyMotifCopy(copy,4),false);
        assert.equal(actions.applyMotifCopy(nextCopy,0),false);
        assert.equal(actions.deleteMotif(4),false);
        assert.deepEqual(structuredClone(state),before); assert.equal(clock.transportRevision,revision);
        assert.equal(actions.applyMotifCopy(copy,5),true);
        assert.equal(actions.applyMotifCopy(nextCopy,6),true);
        assert.deepEqual(state.getMotif(5),state.getMotif(0));
        assert.equal(state.nextMotifId,4);
        actions.setClockStepHandler(()=>{});
        for(let i=1;i<=2;i++) {
            if(mode==="MIDI") for(let p=0;p<6;p++) clock.receiveMidiClockPulse();
            else clock.receiveInternalClockStep({sequence:i,transportRevision:revision});
        }
        assert.equal(state.playingMotifId,4); assert.equal(state.nextMotifId,null);
        const playing=structuredClone(state.getMotif(4));
        assert.equal(actions.applyMotifCopy(copy,4),false);
        assert.deepEqual(state.getMotif(4),playing);
        assert.equal(actions.deleteMotif(4),true);
        assert.equal(actions.deleteMotif(0),true);
        assert.equal(state.playheadPosition,0); assert.equal(clock.transportRevision,revision);
        assert.equal(state.transportState,"PLAY");
        controller.resetInputState();
    }
});

test("PHASE C: refused hardware targets keep feedback active and never arm NEXT", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const {state,actions,controller}=setup();
    actions.toggleView(); actions.startPlayback(); actions.requestMotif(4);
    const tap=n=>{controller.handleMidiMessage([0x90,n,127]);controller.handleMidiMessage([0x90,n,0]);};
    tap(104); tap(controller.mapping.BOOKS[1]); tap(controller.mapping.BOOKS[0]);
    assert.equal(controller.copyStage,"TARGET"); assert.equal(state.nextMotifId,4);
    tap(controller.mapping.BOOKS[4]); assert.equal(controller.copyStage,"TARGET");
    tap(controller.mapping.BOOKS[5]); assert.equal(controller.copyStage,null);
    tap(88); tap(controller.mapping.BOOKS[4]); assert.equal(controller.deleteArmed,true);
    assert.equal(state.nextMotifId,4);
    tap(controller.mapping.BOOKS[0]); assert.equal(controller.deleteArmed,false);
    tap(88);
    tap(controller.mapping.BOOKS[5]); assert.equal(controller.deleteArmed,false);
    assert.equal(state.playingMotifId,0); assert.equal(state.nextMotifId,4);
    controller.resetInputState();
});

test("PHASE C hardware: PLAYING and NEXT are valid sources, protected destinations retain snapshot", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for(const sourceId of [0,1]) {
        const {state,actions,clock,controller}=setup();
        const leds=new Map(); controller.midiManager.send=(_, [status,n,c])=>leds.set(`${status}:${n}`,c);
        state.getMotif(sourceId).events[12][0]=true;
        state.getMotif(sourceId).voiceLengths[12]=7;
        state.getMotif(sourceId).motifLength=21;
        actions.toggleView(); actions.startPlayback(); actions.requestMotif(1);
        const tap=n=>{controller.handleMidiMessage([0x90,n,127]);controller.handleMidiMessage([0x80,n,0]);};
        const book=id=>tap(controller.mapping.BOOKS[id]);
        tap(104); book(sourceId);
        assert.equal(controller.copyStage,"TARGET");
        const snapshot=controller.copySource, expected=structuredClone(state.getMotif(sourceId));
        assert.equal(snapshot.sourceId,sourceId);
        assert.equal(leds.get("144:104"),(controller.colors.YELLOW&0x33)|4);
        const before=structuredClone(state), revision=clock.transportRevision;
        for(const id of [0,1]) {
            book(id);
            assert.equal(controller.copyStage,"TARGET");
            assert.equal(controller.copySource,snapshot);
            assert.deepEqual(structuredClone(state),before);
        }
        // An edit after source selection must not leak into the captured copy.
        state.getMotif(sourceId).events[12][1]=true;
        book(4);
        assert.equal(controller.copyStage,null);
        assert.deepEqual(state.getMotif(4),expected);
        assert.equal(state.playingMotifId,0); assert.equal(state.nextMotifId,1);
        assert.equal(state.playheadPosition,0); assert.equal(clock.transportRevision,revision);
        assert.equal(state.transportState,"PLAY");
        controller.resetInputState();
    }
});

test("PHASE C hardware: DELETE current in STOP/PAUSE redraws empty timeline and retains selected slot", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const {readPlayMotif}=await import("../src/PlayMotifUI.mjs");
    for(const transport of ["STOP","PAUSE"]) {
        const {state,actions,clock,controller}=setup();
        actions.selectMotif(4); state.transportState=transport;
        state.motif[12][2]=true; state.voiceLengths[12]=7; state.motifLength=21;
        state.playheadPosition=6; actions.toggleView();
        const leds=new Map(); controller.midiManager.send=(_, [status,n,c])=>leds.set(`${status}:${n}`,c);
        let redraws=0;
        actions.setMotifChangeHandler(()=>{redraws++;controller.drawSelectedMotif();});
        const revision=clock.transportRevision;
        const tap=n=>{controller.handleMidiMessage([0x90,n,127]);controller.handleMidiMessage([0x90,n,0]);};
        tap(88); tap(controller.mapping.BOOKS[4]);
        assert.equal(redraws,1); assert.equal(controller.deleteArmed,false);
        assert.equal(state.currentMotifId,4); assert.equal(state.playingMotifId,4);
        assert.equal(state.transportState,transport); assert.equal(clock.transportRevision,revision);
        assert.equal(state.motifLength,null); assert.deepEqual(state.voiceLengths,Array(16).fill(null));
        assert.ok(state.motif.every(row=>row.every(v=>!v)));
        assert.equal(state.playheadPosition,0);
        assert.equal(readPlayMotif(state).duration,"32 STEPS");
        assert.equal(leds.get(`144:${controller.mapping.BOOKS[4]}`),(controller.colors.GREEN&0x33)|4);
        // Step zero may retain the existing playhead overlay; all other steps are empty.
        controller.mapping.MOTIF.slice(1).forEach(n=>assert.equal(leds.get(`144:${n}`),controller.colors.OFF&0x33));
        controller.resetInputState();
    }
});

test("BOOK hierarchy: empty OFF, data DIM GREEN, active GREEN; COPY/DELETE redraw and NEXT override", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const {state,actions,controller}=setup();
    const leds=new Map(); controller.midiManager.send=(_, [status,n,c])=>leds.set(`${status}:${n}`,c);
    const color=id=>leds.get(`144:${controller.mapping.BOOKS[id]}`)&0x33;
    const tap=n=>{controller.handleMidiMessage([0x90,n,127]);controller.handleMidiMessage([0x90,n,0]);};
    const book=id=>tap(controller.mapping.BOOKS[id]);
    actions.toggleView();
    assert.equal(color(0),controller.colors.GREEN&0x33);
    for(let i=1;i<16;i++) assert.equal(color(i),0);
    state.getMotif(1).events[12][3]=true;
    state.getMotif(2).voiceLengths[12]=7;
    state.getMotif(3).motifLength=21;
    controller.drawBooks();
    for(const i of [1,2,3]) assert.equal(color(i),controller.colors.DIM_GREEN&0x33);
    tap(104);book(1);book(4); t.mock.timers.tick(120); assert.equal(color(4),controller.colors.DIM_GREEN&0x33);
    tap(88);book(4); assert.equal(color(4),0);
    book(4); assert.equal(color(4),controller.colors.GREEN&0x33);
    tap(104);book(1);book(4); t.mock.timers.tick(120); assert.equal(color(4),controller.colors.GREEN&0x33);
    tap(88);book(4); assert.equal(color(4),controller.colors.GREEN&0x33);
    book(0); assert.equal(color(4),0);
    actions.startPlayback();book(4);
    assert.equal(color(4),controller.colors.GREEN&0x33);
    t.mock.timers.tick(160); assert.equal(color(4),controller.colors.DIM_GREEN&0x33);
    book(1); assert.equal(color(4),0);
    t.mock.timers.tick(160); assert.equal(color(1),controller.colors.DIM_GREEN&0x33);
    book(0); assert.equal(color(1),controller.colors.DIM_GREEN&0x33);
    assert.equal(color(0),controller.colors.GREEN&0x33);
    controller.resetInputState();
});

test("COPY convention: source blink, yellow success, red held refusal and cancellation", async t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    const {readPlayFooter}=await import("../src/PlayFooterUI.mjs");
    for(const transport of ["STOP","PAUSE","PLAY"]) {
        const {state,actions,controller}=setup();
        const leds=new Map(); controller.midiManager.send=(_, [status,n,c])=>leds.set(`${status}:${n}`,c);
        const color=id=>leds.get(`144:${controller.mapping.BOOKS[id]}`)&0x33;
        const press=n=>controller.handleMidiMessage([0x90,n,127]);
        const release=n=>controller.handleMidiMessage([0x80,n,0]);
        const tap=n=>{press(n);release(n);};
        const book=id=>tap(controller.mapping.BOOKS[id]);
        actions.toggleView(); state.transportState=transport;
        state.motif[12][0]=true;
        tap(104); assert.equal(readPlayFooter(state,controller).states,"COPY");
        book(0); const snapshot=controller.copySource;
        t.mock.timers.tick(160); assert.equal(color(0),0);
        t.mock.timers.tick(160); assert.equal(color(0),controller.colors.GREEN&0x33);
        if(transport==="PLAY") {
            actions.requestMotif(1);
            const before=structuredClone(state);
            press(controller.mapping.BOOKS[1]);
            assert.equal(color(1),controller.colors.RED&0x33);
            t.mock.timers.tick(480); assert.equal(color(1),controller.colors.RED&0x33);
            release(controller.mapping.BOOKS[1]);
            assert.notEqual(color(1),controller.colors.RED&0x33);
            assert.equal(controller.copySource,snapshot);
            assert.equal(controller.copyStage,"TARGET");
            assert.deepEqual(structuredClone(state),before);
        }
        book(4);
        assert.equal(color(4),controller.colors.YELLOW&0x33);
        assert.equal(controller.copySourceBlinkTimer,null);
        assert.equal(controller.copyStage,null);
        assert.equal(readPlayFooter(state,controller).states,"");
        t.mock.timers.tick(120); assert.equal(color(4),controller.colors.DIM_GREEN&0x33);
        t.mock.timers.tick(320); assert.equal(color(4),controller.colors.DIM_GREEN&0x33);
        tap(104); book(5); // Empty source must still visibly blink.
        assert.equal(color(5),controller.colors.DIM_GREEN&0x33);
        t.mock.timers.tick(160); assert.equal(color(5),0);
        const bank=structuredClone(state.motifs);
        tap(104); assert.equal(controller.copySourceBlinkTimer,null);
        assert.equal(color(5),0);
        assert.equal(readPlayFooter(state,controller).states,"");
        t.mock.timers.tick(640); assert.equal(color(5),0);
        assert.deepEqual(state.motifs,bank);
        controller.resetInputState();
    }
});

test("PERSISTENCE: versioned 16-slot roundtrip restores only bank and current ID", async () => {
    const {snapshotMotifBank,restoreMotifBank,validateMotifBank}=await import("../src/MotifBankFormat.mjs");
    const {state}=setup();
    for(let i=0;i<16;i++){state.motifs[i].events[i][i]=true;state.motifs[i].voiceLengths[i]=i+1;state.motifs[i].motifLength=32-i;}
    state.currentMotifId=6;state.nextMotifId=9;state.transportState="PLAY";state.playheadPosition=15;
    const bank=JSON.parse(JSON.stringify(snapshotMotifBank(state)));
    assert.deepEqual(Object.keys(bank).sort(),["currentMotifId","format","motifs","version"]);
    const fresh=setup();restoreMotifBank(fresh.state,bank);
    assert.deepEqual(fresh.state.motifs,state.motifs);
    assert.equal(fresh.state.currentMotifId,6);assert.equal(fresh.state.playheadPosition,0);
    assert.equal(fresh.state.nextMotifId,null);assert.equal(fresh.state.transportState,"STOP");
    assert.equal(fresh.state.currentView,"PLAY");assert.equal(fresh.state.soloActive,false);
    fresh.state.motifs[0].events[0][0]=false;
    assert.equal(bank.motifs[0].events[0][0],true);
    assert.equal(new Set(fresh.state.motifs.flatMap(m=>m.events)).size,256);
    for(const mutate of [b=>b.version=2,b=>b.format="bad",b=>b.currentMotifId=16,b=>b.motifs.pop(),
        b=>b.motifs[0].events[0][0]=1,b=>b.motifs[0].voiceLengths[0]=0,b=>b.motifs[0].motifLength=33]){
        const bad=structuredClone(bank);mutate(bad);assert.throws(()=>validateMotifBank(bad));
    }
});

test("PERSISTENCE: absent file, atomic replacement, corruption preservation and failed rename", async t => {
    const {MotifBankStorage}=await import("../src/MotifBankStorage.mjs");
    const {snapshotMotifBank}=await import("../src/MotifBankFormat.mjs");
    const os=await import("node:os"),path=await import("node:path");
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),"genesis-bank-test-"));
    t.after(async()=>{for(const name of await fs.readdir(dir)) await fs.unlink(path.join(dir,name));await fs.rmdir(dir);});
    const file=path.join(dir,"motif-bank.json"), store=new MotifBankStorage(file);
    assert.deepEqual(await store.load(),{bank:null});
    const {state}=setup();const bank=snapshotMotifBank(state);
    await store.save(bank);
    const first=await fs.readFile(file,"utf8");
    bank.motifs[0].events[12][3]=true;
    const failing=new MotifBankStorage(file,{...fs,rename:async()=>{throw new Error("simulated rename failure");}});
    await assert.rejects(failing.save(bank));assert.equal(await fs.readFile(file,"utf8"),first);
    assert.deepEqual(await fs.readdir(dir),["motif-bank.json"]);
    await store.save(bank);assert.deepEqual((await new MotifBankStorage(file).load()).bank,bank);
    for(const text of ["{broken",JSON.stringify({...bank,version:99}),JSON.stringify({...bank,motifs:[]})]) {
        await fs.writeFile(file,text);
        const result=await new MotifBankStorage(file).load();assert.equal(result.bank,null);assert.ok(result.warning);
        const backups=(await fs.readdir(dir)).filter(n=>n.includes(".invalid-"));
        assert.ok((await Promise.all(backups.map(n=>fs.readFile(path.join(dir,n),"utf8")))).includes(text));
    }
});

test("PERSISTENCE: coalesced edits, COPY/DELETE, selected ID; no tick or LED snapshots", async () => {
    const {initializeMotifBankAutosave}=await import("../src/MotifBankAutosave.mjs");
    const {state,actions,clock,controller}=setup();
    let task=null,saves=[];
    const session=await initializeMotifBankAutosave(state,{load:async()=>({bank:null}),save:async bank=>saves.push(bank)},
        {schedule:fn=>{task=fn;return 1;},cancel:()=>{task=null;}});
    assert.equal(task,null);
    actions.toggleInstrumentStep(0);actions.toggleInstrumentStep(3);actions.setSelectedLength(7);
    assert.equal(saves.length,0);assert.ok(task);
    await session.flush();assert.equal(saves.length,1);
    assert.equal(saves[0].motifs[0].events[12][3],true);assert.equal(saves[0].motifs[0].voiceLengths[12],7);
    actions.applyMotifCopy(actions.captureMotifCopy(0),4);actions.selectMotif(4);
    await session.flush();assert.equal(saves.at(-1).currentMotifId,4);
    assert.deepEqual(saves.at(-1).motifs[4],saves.at(-1).motifs[0]);
    actions.deleteMotif(4);await session.flush();assert.equal(saves.at(-1).motifs[4].motifLength,null);
    assert.ok(saves.at(-1).motifs[4].events.every(row=>row.every(v=>!v)));
    const count=saves.length;actions.startPlayback();
    for(let i=1;i<=32;i++){clock.receiveInternalClockStep({sequence:i,transportRevision:clock.transportRevision});controller.drawBooks();}
    assert.equal(task,null);await session.flush();assert.equal(saves.length,count);
    actions.requestMotif(1);assert.equal(task,null); // NEXT itself is ephemeral.
    actions.setClockStepHandler(()=>{});
    for(let i=33;i<=64;i++)clock.receiveInternalClockStep({sequence:i,transportRevision:clock.transportRevision});
    assert.equal(saves.length,count);assert.ok(task);await session.flush();
    assert.equal(saves.at(-1).currentMotifId,1);assert.equal("nextMotifId" in saves.at(-1),false);
    controller.resetInputState();
});

test("PERSISTENCE: shutdown flush awaits in-flight save and includes a later edit; failure remains retryable", async () => {
    const {initializeMotifBankAutosave}=await import("../src/MotifBankAutosave.mjs");
    const {state,actions}=setup();let release,first=true;const saved=[];
    const session=await initializeMotifBankAutosave(state,{load:async()=>({bank:null}),save:async b=>{
        if(first){first=false;await new Promise(r=>release=r);} saved.push(b);
    }},{schedule:()=>1,cancel:()=>{}});
    actions.toggleInstrumentStep(0);const pending=session.flush();
    actions.toggleInstrumentStep(1);const closing=session.flush();release();
    await Promise.all([pending,closing]);assert.equal(saved.length,2);assert.equal(saved.at(-1).motifs[0].events[12][1],true);
    const other=setup();let fail=true;
    const retry=await initializeMotifBankAutosave(other.state,{load:async()=>({bank:null}),save:async()=>{if(fail)throw new Error("disk");}},
        {schedule:()=>1,cancel:()=>{}});
    other.actions.toggleInstrumentStep(0);await assert.rejects(retry.flush());fail=false;await retry.flush();
});

test("PERSISTENCE: restored BOOK displays empty/data/active; IPC close waits for flush", async () => {
    const {initializeMotifBankAutosave}=await import("../src/MotifBankAutosave.mjs");
    const {snapshotMotifBank}=await import("../src/MotifBankFormat.mjs");
    const original=setup();original.state.motif[12][0]=true;original.actions.selectMotif(6);
    const restored=setup();await initializeMotifBankAutosave(restored.state,{load:async()=>({bank:snapshotMotifBank(original.state)}),save:async()=>{}});
    restored.actions.toggleView();assert.equal(restored.controller.getLibraryMotifColor(0),"DIM_GREEN");
    assert.equal(restored.controller.getLibraryMotifColor(1),"OFF");assert.equal(restored.controller.getLibraryMotifColor(6),"GREEN");
    const main=await fs.readFile(new URL("../main.js",import.meta.url),"utf8");
    const preload=await fs.readFile(new URL("../preload.js",import.meta.url),"utf8");
    assert.match(main,/event.preventDefault\(\);[\s\S]*webContents.send\("motif-bank-flush"\)/);
    assert.match(preload,/await callback\(\); ipcRenderer.send\("motif-bank-flushed", true\)/);
    assert.match(await source("app.js"),/await initializeMotifBankAutosave[\s\S]*const clock = new LiRythmeClock/);
});

test("CHAIN: SHIFT transport is inert in PLAY/PAUSE/STOP and pulses yellow", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const mode of ["PLAY", "PAUSE", "STOP"]) {
        const {state, actions, clock, controller:c} = setup();
        state.transportState = mode; state.playheadPosition = 7; clock.midiPulseCount = 3;
        const revision = clock.transportRevision;
        const press = (name,v=127) => c.handleMidiMessage([0xB0,c.mapping.TOP_CONTROLS[name],v]);
        for (const enabled of [true,false]) {
            press("SHIFT"); press("PLAY_STOP"); press("SHIFT",0);
            t.mock.timers.tick(600); press("PLAY_STOP",0);
            assert.equal(state.chainEnabled,enabled); assert.equal(state.transportState,mode);
            assert.equal(state.playheadPosition,7); assert.equal(clock.midiPulseCount,3);
            assert.equal(clock.transportRevision,revision);
            if(enabled && mode === "PLAY") {
                c.pulseTransport(); assert.equal(c.transportPulseColor,c.colors.YELLOW);
                c.pulseTransport(c.colors.RED,1); assert.equal(c.transportPulseColor,c.colors.YELLOW);
            }
        }
        c.resetInputState();
    }
});

test("CHAIN: append duplicates, longpress once, structural DELETE and normal restoration", t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    const {state,actions,controller:c} = setup();
    state.currentView = "MOTIF_LIBRARY"; actions.toggleChain();
    const pad = (id,v=127) => c.handleMidiMessage([0x90,c.mapping.BOOKS[id],v]);
    const click = id => {pad(id);pad(id,0);};
    [0,0,4,2].forEach(id=>{pad(id);t.mock.timers.tick(300);pad(id,0);}); assert.deepEqual(state.chain,[0,0,4,2]);
    actions.startPlayback();
    pad(7);t.mock.timers.tick(300);pad(7,0);
    assert.deepEqual(state.chain,[0,0,4,2,7]);
    state.chain = [0,4,4,4,2,4,4];state.chainPlayingIndex = 0;actions.refreshChainNext();
    state.motifs[4].events[12][0] = true;
    const bank = structuredClone(state.motifs);
    const arm = () => {c.handleMidiMessage([0x90,c.mapping.VALUE_CONTROLS.DELETE,127]);c.handleMidiMessage([0x90,c.mapping.VALUE_CONTROLS.DELETE,0]);};
    arm();click(4);assert.deepEqual(state.chain,[0,4,4,4,2,4]);
    arm();click(4);assert.deepEqual(state.chain,[0,4,4,4,2]);
    arm();c.handleMidiMessage([0xB0,c.mapping.TOP_CONTROLS.NEXT,127]);c.handleMidiMessage([0xB0,c.mapping.TOP_CONTROLS.NEXT,0]);
    assert.deepEqual(state.chain,[0,4,4,2]);assert.equal(state.nextMotifId,4);
    arm();c.handleMidiMessage([0x90,c.mapping.INSTRUMENTS[12],127]);
    assert.deepEqual(state.motifs,bank);
    c.setDeleteArmed(false); actions.toggleChain();actions.requestMotif(2);assert.equal(state.nextMotifId,2);
    actions.stop();arm();click(4);assert.equal(state.motifs[4].events[12][0],false);
    c.resetInputState();
});

test("CHAIN: exact repeated cycles, wrap, mutable references and deletion of prepared NEXT on both clocks", t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    for (const mode of ["INTERNAL","MIDI"]) {
        const {state,actions,clock,controller} = setup();
        state.motifs[0].motifLength=2;
        state.motifs[4].voiceLengths[12]=3;state.motifs[4].voiceLengths[11]=2; // LCM 6
        state.motifs[2].motifLength=3;
        actions.toggleChain();[0,0,4,2].forEach(id=>actions.requestMotif(id));
        clock.setSource(mode);actions.startPlayback();const revision=clock.transportRevision;
        const actual=[[state.playingMotifId,state.playheadPosition]], expected=[];
        actions.setClockStepHandler(()=>actual.push([state.playingMotifId,state.playheadPosition]));
        for(let tour=0;tour<3;tour++) for(const [id,n] of [[0,2],[0,2],[4,6],[2,3]]) for(let step=0;step<n;step++) expected.push([id,step]);
        let seq=0;
        const tick=()=>{if(mode==="MIDI") for(let p=0;p<6;p++) clock.receiveMidiClockPulse();else clock.receiveInternalClockStep({sequence:++seq,transportRevision:revision});};
        for(let i=1;i<expected.length;i++) tick();
        assert.deepEqual(actual,expected);assert.equal(clock.transportRevision,revision);
        // Wrap NEXT is the first occurrence, not the later duplicate.
        assert.equal(state.chainPlayingIndex,3);actions.deleteChainNext();
        assert.deepEqual(state.chain,[0,4,2]);assert.equal(state.chainPlayingIndex,2);
        tick();assert.deepEqual(actual.at(-1),[0,0]);
        // Replace prepared NEXT, retain phase, then read current library content.
        actions.deleteChainNext();assert.deepEqual(state.chain,[0,2]);assert.equal(state.nextMotifId,2);
        state.motifs[2].events[12][0]=true;
        tick();tick();assert.deepEqual(actual.at(-1),[2,0]);assert.equal(state.motif[12][0],true);
        assert.equal(clock.transportRevision,revision);
        controller.resetInputState();
    }
});

test("CHAIN: pause resumes occurrence, STOP restarts list; deleting PLAYING or entire chain never stops", () => {
    const {state,actions,controller} = setup();
    actions.toggleChain();[4,2].forEach(id=>actions.requestMotif(id));actions.startPlayback();
    state.playheadPosition=5;actions.pausePlayback();actions.continuePlayback();
    assert.equal(state.playingMotifId,4);assert.equal(state.playheadPosition,5);assert.equal(state.nextMotifId,2);
    actions.deleteMotif(4);assert.equal(state.chainPlayingIndex,-1);assert.equal(state.playheadPosition,5);
    actions.deleteMotif(2);assert.equal(state.nextMotifId,null);assert.equal(state.transportState,"PLAY");
    actions.requestMotif(2);actions.stop();actions.continuePlayback();
    assert.equal(state.playingMotifId,2);assert.equal(state.playheadPosition,0);assert.equal(state.chainPlayingIndex,0);
    controller.resetInputState();
});

test("CHAIN: real note dispatcher emits one step zero per occurrence and preserves every Note Off", async t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    const app=await source("app.js");
    const dispatch=app.slice(app.indexOf("function triggerMotifStep(step) {"),app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    for(const mode of ["INTERNAL","MIDI"]) {
        const {state,actions,clock,controller}=setup();
        for(const id of [0,4,2]) {state.motifs[id].motifLength=2;state.motifs[id].events[12][0]=true;}
        state.padConfiguration.voices[12]={type:"MIDI DRUM",output:{mode:"DEFAULT"},channel:1,note:60};
        const messages=[],offs=[],order=[];
        const trigger=new Function("state","midiOutputSelector","midiManager","launchpad","setTimeout",`${dispatch}; return triggerMotifStep;`)(state,
            {options:[{textContent:"Drums"}],selectedIndex:0},
            {send:(_,m)=>{messages.push(m);order.push("note");},findOutput:()=>({})},
            {pulseInstrument(){}},fn=>offs.push(fn));
        actions.setMotifChangeHandler(()=>order.push("view"));
        actions.toggleChain();[0,0,4,2].forEach(id=>actions.requestMotif(id));
        clock.setSource(mode);actions.startPlayback();trigger(0);
        actions.setClockStepHandler(()=>trigger(state.playheadPosition));
        const revision=clock.transportRevision;
        for(let tick=1;tick<24;tick++) {
            if(mode==="MIDI") for(let p=0;p<6;p++) clock.receiveMidiClockPulse();
            else clock.receiveInternalClockStep({sequence:tick,transportRevision:revision});
        }
        assert.equal(messages.length,12);assert.equal(offs.length,12);
        const ons=messages.slice();offs.forEach(fn=>fn());
        assert.deepEqual(messages.slice(12),ons.map(([s,n])=>[s,n,0]));
        assert.equal(clock.transportRevision,revision);
        for(let i=1;i<order.length;i++) if(order[i]==="view") assert.equal(order[i-1],"note");
        controller.resetInputState();
    }
});

test("CHAIN RED: every occurrence including duplicates and wrap, after dispatch, overrides beat for 80 ms", t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    for(const mode of ["INTERNAL","MIDI"]) {
        const {state,actions,clock,controller:c}=setup();
        [0,4,2].forEach(id=>state.motifs[id].motifLength=2);
        actions.toggleChain();[0,0,4,2].forEach(id=>actions.requestMotif(id));
        const flashes=[],order=[];
        c.setTransportPulseLed=color=>{if(color===c.colors.RED) {flashes.push(state.chainPlayingIndex);order.push("red");}};
        actions.setClockStepHandler(()=>{order.push("dispatch");c.pulseMotifCycle();});
        actions.setClockBeatHandler(()=>c.pulseTransport());
        clock.setSource(mode);actions.startPlayback();
        assert.equal(c.transportPulseColor,c.colors.RED);
        const revision=clock.transportRevision;
        t.mock.timers.tick(80);
        for(let i=1;i<=8;i++) {
            if(mode==="MIDI") for(let p=0;p<6;p++) clock.receiveMidiClockPulse();
            else clock.receiveInternalClockStep({sequence:i,transportRevision:revision});
            if(i%2===0) {
                assert.equal(order.at(-1),"red");assert.equal(order.at(-2),"dispatch");
                c.pulseTransport();assert.equal(c.transportPulseColor,c.colors.RED);
                t.mock.timers.tick(79);assert.equal(c.transportPulseColor,c.colors.RED);
                t.mock.timers.tick(1);c.pulseTransport();assert.equal(c.transportPulseColor,c.colors.YELLOW);
            }
            t.mock.timers.tick(80);
        }
        assert.deepEqual(flashes,[0,1,2,3,0]);assert.equal(clock.transportRevision,revision);
        c.resetInputState();
    }
});

test("CHAIN DELETE PLAY: clears only structure in every transport state and consumes held release", t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    for(const mode of ["STOP","PAUSE","PLAY"]) {
        const {state,actions,clock,controller:c}=setup();
        state.motifs[0].motifLength=3;state.motifs[0].events[12][0]=true;
        const bank=structuredClone(state.motifs);
        actions.toggleChain();[0,4,4,2,6].forEach(id=>actions.requestMotif(id));
        state.transportState=mode;state.playheadPosition=1;
        clock.midiPulseCount=3;const revision=clock.transportRevision;
        const clear=()=>{
            c.handleMidiMessage([0x90,c.mapping.VALUE_CONTROLS.DELETE,127]);c.handleMidiMessage([0x90,c.mapping.VALUE_CONTROLS.DELETE,0]);
            c.handleMidiMessage([0xB0,c.mapping.TOP_CONTROLS.PLAY_STOP,127]);
            t.mock.timers.tick(500);c.handleMidiMessage([0xB0,c.mapping.TOP_CONTROLS.PLAY_STOP,0]);
        };
        clear();assert.deepEqual(state.chain,[]);assert.equal(state.nextMotifId,null);
        assert.deepEqual(state.motifs,bank);assert.equal(state.transportState,mode);
        assert.equal(state.playheadPosition,1);assert.equal(clock.midiPulseCount,3);assert.equal(clock.transportRevision,revision);
        if(mode==="PLAY") {actions.nextStep();assert.equal(state.playheadPosition,2);actions.nextStep();assert.equal(state.playheadPosition,0);assert.equal(state.playingMotifId,0);}
        actions.toggleChain();clear();assert.equal(state.motif[12][0],false);
        c.resetInputState();
    }
});

test("CHAIN UI: occurrence order, duplicates,/NEXT, every mutation and wrap refresh synchronously", async t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    const {initializePlayChainUI}=await import("../src/PlayChainUI.mjs");
    const {state,actions,clock,controller:c}=setup();
    const container={children:[],replaceChildren(...children){this.children=children;}};
    const document={getElementById:()=>container,createElement:()=>({})};
    initializePlayChainUI({state,actions,document});
    const labels=()=>container.children.map(e=>e.textContent);
    assert.deepEqual(labels(),[]);actions.toggleChain();
    [0,0,4,2].forEach(id=>actions.requestMotif(id));
    assert.deepEqual(labels(),["[01]","[01]","[05]","[03]"]);
    state.motifs.forEach(m=>m.motifLength=1);actions.startPlayback();
    assert.deepEqual(labels(),["[01]","[01]","[05]","[03]"]);
    actions.setClockStepHandler(()=>{});
    clock.advanceStepPipeline();assert.deepEqual(labels(),["[01]","[01]","[05]","[03]"]);
    clock.advanceStepPipeline();clock.advanceStepPipeline();
    assert.deepEqual(labels(),["[01]","[01]","[05]","[03]"]);
    clock.advanceStepPipeline();assert.equal(labels()[0],"[01]");
    actions.appendChainMotif(6,{afterPlaying:true});assert.equal(labels()[1],"[07]");
    actions.deleteMotif(0);assert.deepEqual(labels(),["[01]","[07]","[05]","[03]"]);
    actions.deleteChainNext();assert.deepEqual(labels(),["[01]","[05]","[03]"]);
    actions.deleteMotif(0);assert.deepEqual(labels(),["[05]","[03]"]); // detached is not another occurrence
    actions.clearChain();assert.deepEqual(labels(),[]);
    actions.requestMotif(4);clock.advanceStepPipeline();assert.deepEqual(labels(),["[05]"]);
    actions.toggleChain();assert.deepEqual(labels(),["[05]"]);
    c.resetInputState();
});

test("CHAIN BOOK: CHAIN palette, shared repeated pads and COPY priority", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 for(const ids of [[0,4,2],[0,0,4],[0,0,0,4],[0,4,0]]) {
  const {state,actions,clock,controller:c}=setup();state.currentView="MOTIF_LIBRARY";
  ids.forEach(id=>state.motifs[id].motifLength=1);
  actions.toggleChain();ids.forEach(id=>actions.requestMotif(id));actions.setClockStepHandler(()=>{});actions.startPlayback();
  for(let i=0;i<ids.length;i++) {
   const current=ids[i],next=ids[(i+1)%ids.length],repeat=current===next;
   for(const lit of [true,false]) {
    c.nextMotifLit=lit;
    assert.equal(c.getLibraryMotifColor(current),"GREEN");
    if(!repeat) assert.equal(c.getLibraryMotifColor(next),lit?"YELLOW":"DIM_AMBER");
    for(const id of new Set(ids)) if(id!==current&&id!==next) assert.equal(c.getLibraryMotifColor(id),"YELLOW");
    assert.equal(c.getLibraryMotifColor(15),"OFF");
   }
   const before=JSON.stringify(state);c.drawBooks();assert.equal(JSON.stringify(state),before);
   clock.advanceStepPipeline();assert.equal(c.getLibraryMotifColor(next),"GREEN");
  }
  actions.toggleChain();assert.equal(c.getLibraryMotifColor(state.playingMotifId),"GREEN");
  actions.requestMotif(14);c.nextMotifLit=false;assert.equal(c.getLibraryMotifColor(14),"DIM_GREEN");c.resetInputState();
 }
});

test("CHAIN BOOK: timer is scoped to library view and cleaned up; PLAY screen has original static styles", async t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    const {state,actions,controller:c}=setup();
    actions.toggleChain();actions.requestMotif(4);assert.equal(c.nextMotifBlinkTimer,null);
    actions.toggleView();assert.notEqual(c.nextMotifBlinkTimer,null);
    actions.toggleView();assert.equal(c.nextMotifBlinkTimer,null);
    actions.toggleView();c.resetInputState();assert.equal(c.nextMotifBlinkTimer,null);
    const html=await fs.readFile(new URL("../index.html",import.meta.url),"utf8");
    assert.doesNotMatch(html,/chain-occurrence-blink|--chain-blink-color/);
    assert.match(html,/\.chain-occurrence\.is-playing \{ color: #4a9b6b; \}/);
    assert.match(html,/#play-chain-occurrences \{ font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums; \}/);
    assert.match(html,/\.chain-occurrence \{ display: inline-block; \}/);
    assert.doesNotMatch(html,/\.chain-occurrence\.is-next/);
});

test("R1-R3: hardware target routing, current BOOK deletion, Voice COPY/DELETE and autosave notifications", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 for(const chain of [false,true]) for(const transport of ["STOP","PAUSE","PLAY"]) {
  const {state,actions,controller:c}=setup();state.currentView="MOTIF_LIBRARY";state.transportState=transport;
  if(chain) {actions.toggleChain();[0,4,0].forEach(id=>actions.requestMotif(id));}
  state.motif[1][3]=true;state.motif[2][4]=true;state.voiceLengths[1]=7;state.motifLength=16;
  let dirty=0;state.onBankChange=()=>dirty++;
  const tap=(status,n)=>{c.handleMidiMessage([status,n,127]);c.handleMidiMessage([status,n,0]);};
  const command=name=>tap(0x90,c.mapping.VALUE_CONTROLS[name]);
  const voice=id=>tap(0x90,c.mapping.INSTRUMENTS[id]);
  const structure=state.chain.slice();
  command("COPY");voice(1);voice(3);
  assert.equal(c.copyStage,null);assert.deepEqual(state.motif[3],state.motif[1]);assert.notEqual(state.motif[3],state.motif[1]);assert.equal(state.voiceLengths[3],7);
  command("DELETE");voice(1);
  assert.equal(state.motif[1][3],false);assert.equal(state.motif[3][3],true);assert.equal(state.motif[2][4],true);assert.equal(state.voiceLengths[1],7);
  assert.deepEqual(state.chain,structure);assert.ok(dirty>=2);
  const bank=structuredClone(state.motifs);
  command("DELETE");tap(0x90,c.mapping.BOOKS[0]);
  if(chain) {assert.deepEqual(state.motifs,bank);assert.deepEqual(state.chain,[0,4]);}
  else {assert.ok(state.motif.every(row=>row.every(v=>!v)));assert.equal(state.motifLength,null);assert.ok(state.voiceLengths.every(v=>v===null));assert.equal(state.currentMotifId,0);assert.equal(c.getLibraryMotifColor(0),"GREEN");assert.ok(dirty>=3);}
  c.resetInputState();
 }
});

test("R4: PLAY chain labels and dimensions stay stable as PLAYING advances", async () => {
 const {initializePlayChainUI}=await import("../src/PlayChainUI.mjs");const {state,actions,controller}=setup();
 const container={children:[],replaceChildren(...children){this.children=children;}};
 const document={getElementById:()=>container,createElement:()=>({})};
 state.chain=[0,4,4,4,2,4,4];state.chainEnabled=true;state.chainPlayingDetached=false;state.transportState="PLAY";
 const ui=initializePlayChainUI({state,actions,document});
 for(let i=0;i<7;i++) {state.chainPlayingIndex=i;ui.render();assert.deepEqual(container.children.map(e=>e.textContent),["[01]","[05]","[05]","[05]","[03]","[05]","[05]"]);assert.equal(container.children.map(e=>e.textContent).join(""),"[01][05][05][05][03][05][05]");assert.deepEqual(container.children.flatMap((e,index)=>e.className.includes("is-playing")?[index]:[]),[i]);assert.ok(container.children.every(e=>!e.className.includes("is-next")));}
 state.chain=[];ui.render();assert.deepEqual(container.children,[]);
 controller.resetInputState();
});

test("R5: short BOOK is inert, long BOOK appends once at tail in every transport state", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 for(const transport of ["STOP","PAUSE","PLAY"]) {
  const {state,actions,controller:c}=setup();state.currentView="MOTIF_LIBRARY";state.transportState=transport;actions.toggleChain();actions.requestMotif(0);actions.requestMotif(4);
  state.chainPlayingIndex=0;state.playheadPosition=3;
  const pad=v=>c.handleMidiMessage([0x90,c.mapping.BOOKS[2],v]);
  pad(127);t.mock.timers.tick(299);pad(0);assert.deepEqual(state.chain,[0,4]);assert.equal(state.currentMotifId,0);assert.equal(state.playheadPosition,3);
  pad(127);t.mock.timers.tick(300);assert.deepEqual(state.chain,[0,4,2]);pad(127);t.mock.timers.tick(600);pad(0);assert.deepEqual(state.chain,[0,4,2]);c.resetInputState();
 }
});

test("R1 persistence: current BOOK deletion is saved as an empty default slot", async t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 const {initializeMotifBankAutosave}=await import("../src/MotifBankAutosave.mjs");
 const {state,actions,controller:c}=setup();state.currentView="MOTIF_LIBRARY";
 const saves=[];const session=await initializeMotifBankAutosave(state,{load:async()=>({bank:null}),save:async bank=>saves.push(bank)});
 state.motif[12][4]=true;state.motifLength=7;actions.startPlayback();
 c.handleMidiMessage([0x90,c.mapping.VALUE_CONTROLS.DELETE,127]);c.handleMidiMessage([0x90,c.mapping.VALUE_CONTROLS.DELETE,0]);
 c.handleMidiMessage([0x90,c.mapping.BOOKS[0],127]);c.handleMidiMessage([0x90,c.mapping.BOOKS[0],0]);
 await session.flush();const bank=saves.at(-1);assert.equal(bank.version,1);assert.equal(bank.currentMotifId,0);assert.equal(bank.motifs[0].motifLength,null);assert.ok(bank.motifs[0].events.every(row=>row.every(v=>!v)));assert.ok(bank.motifs[0].voiceLengths.every(v=>v===null));c.resetInputState();
});

test("R3 cross-target COPY rejects Voice-to-BOOK and BOOK-to-Voice without consuming source", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 for(const chain of [false,true]) {
  const {state,actions,controller:c}=setup();state.currentView="MOTIF_LIBRARY";
  if(chain) {actions.toggleChain();actions.requestMotif(0);}
  state.motif[1][2]=true;state.voiceLengths[1]=5;
  const tap=(status,n)=>{c.handleMidiMessage([status,n,127]);c.handleMidiMessage([status,n,0]);};
  const copy=()=>tap(0x90,c.mapping.VALUE_CONTROLS.COPY), voice=id=>tap(0x90,c.mapping.INSTRUMENTS[id]), book=id=>tap(0x90,c.mapping.BOOKS[id]);
  const structure=state.chain.slice();copy();voice(1);const bank=structuredClone(state.motifs);book(4);assert.equal(c.copyStage,"TARGET");assert.deepEqual(state.motifs,bank);voice(2);assert.equal(c.copyStage,null);assert.deepEqual(state.motif[2],state.motif[1]);
  copy();book(0);const before=structuredClone(state.motifs);voice(3);assert.equal(c.copyStage,"TARGET");assert.deepEqual(state.motifs,before);book(4);assert.equal(c.copyStage,null);assert.deepEqual(state.motifs[4],state.motifs[0]);assert.notEqual(state.motifs[4].events[1],state.motifs[0].events[1]);assert.deepEqual(state.chain,structure);c.resetInputState();
 }
});

test("CHAIN BOOK: emitted LEDs keep PLAYING green while NEXT blinks amber/yellow through transitions", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 const {state,actions,clock,controller:c}=setup();state.currentView="MOTIF_LIBRARY";
 const leds=new Map();c.midiManager.send=(_,m)=>{if(m[0]===0x90) leds.set(m[1],m[2]);};
 const color=id=>leds.get(c.mapping.BOOKS[id]);const value=name=>(c.colors[name]&0x33)|4;
 [0,4,2].forEach(id=>state.motifs[id].motifLength=1);
 actions.toggleChain();[0,4,2].forEach(id=>actions.requestMotif(id));actions.setClockStepHandler(()=>{});actions.startPlayback();
 for(const [playing,next,other] of [[0,4,2],[4,2,0],[2,0,4]]) {
  c.drawBooks();assert.equal(color(playing),value("GREEN"));assert.equal(color(next),value("YELLOW"));assert.equal(color(other),value("YELLOW"));
  const before=JSON.stringify(state),revision=clock.transportRevision;
  t.mock.timers.tick(160);assert.equal(color(playing),value("GREEN"));assert.equal(color(next),value("DIM_AMBER"));
  t.mock.timers.tick(160);assert.equal(color(playing),value("GREEN"));assert.equal(color(next),value("YELLOW"));
  assert.equal(JSON.stringify(state),before);assert.equal(clock.transportRevision,revision);
  c.copyDeniedPads.add(playing);assert.equal(c.getLibraryMotifColor(playing),"RED");c.copyDeniedPads.clear();
  c.copySuccessPad=next;assert.equal(c.getLibraryMotifColor(next),"YELLOW");c.copySuccessPad=null;
  clock.advanceStepPipeline();
 }
 c.resetInputState();
});

test("CHAIN B: bounded occurrence navigation, duplicate Timeline, contextual hold and Loop Point gesture", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 for(const transport of ["STOP","PAUSE"]) {
  const {state,actions,controller:c}=setup();state.currentView="MOTIF_LIBRARY";state.transportState=transport;
  actions.toggleChain();[0,4,4,2].forEach(id=>actions.requestMotif(id));const bank=structuredClone(state.motifs);
  const tap=(status,n)=>{c.handleMidiMessage([status,n,127]);c.handleMidiMessage([status,n,0]);};
  const nav=name=>tap(0xB0,c.mapping.TOP_CONTROLS[name]);
  nav("PREVIOUS");assert.equal(state.chainPlayingIndex,0);nav("PREVIOUS");assert.equal(state.chainPlayingIndex,0);
  nav("NEXT");assert.equal(state.chainPlayingIndex,1);nav("NEXT");assert.equal(state.chainPlayingIndex,2);assert.equal(state.currentMotifId,4);assert.equal(state.playheadPosition,0);
  const pad=c.mapping.BOOKS[6];c.handleMidiMessage([0x90,pad,127]);t.mock.timers.tick(300);c.handleMidiMessage([0x90,pad,0]);
  assert.deepEqual(state.chain,[0,4,4,6,2]);assert.equal(state.chainPlayingIndex,2);assert.deepEqual(state.motifs,bank);
  const shiftBook=id=>{c.handleMidiMessage([0xB0,c.mapping.TOP_CONTROLS.SHIFT,127]);tap(0x90,c.mapping.BOOKS[id]);c.handleMidiMessage([0xB0,c.mapping.TOP_CONTROLS.SHIFT,0]);};
  shiftBook(4);assert.equal(state.chainLoopMasterIndex,2);nav("NEXT");nav("NEXT");nav("NEXT");assert.equal(state.chainPlayingIndex,4);
  shiftBook(2);assert.equal(state.chainLoopMasterIndex,4);assert.equal(c.getLibraryMotifColor(2),transport==="PAUSE"?"GREEN":"DIM_RED");assert.equal(state.nextMotifId,0);
  shiftBook(2);assert.equal(state.chainLoopMasterIndex,null);assert.deepEqual(state.chain,[0,4,4,6,2]);assert.equal(state.transportState,transport);c.resetInputState();
 }
});

test("CHAIN B: LoopMaster remains the same occurrence through insert append delete and clear", () => {
 const {state,actions,controller:c}=setup();actions.toggleChain();[0,4].forEach(id=>actions.requestMotif(id));actions.navigateContext(1);actions.navigateContext(1);actions.toggleChainLoopPoint(4);
 actions.holdChainMotif(2);assert.deepEqual(state.chain,[0,4,2]);assert.equal(state.chainLoopMasterIndex,1);assert.equal(state.chainPlayingIndex,1);assert.equal(state.nextMotifId,0);
 actions.appendChainMotif(6);assert.equal(state.chainLoopMasterIndex,1);actions.deleteMotif(6);assert.deepEqual(state.chain,[0,4,2]);assert.equal(state.chainLoopMasterIndex,1);
 actions.deleteMotif(2);assert.equal(state.nextMotifId,0);actions.clearChain();assert.equal(state.chainLoopMasterIndex,null);assert.equal(actions.toggleChainLoopPoint(4),false);c.resetInputState();
});

test("CHAIN B: LoopMaster wraps on natural polymetric boundary with one dispatch and stable transport, both clocks", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 for(const source of ["INTERNAL","MIDI"]) for(const ids of [[0],[0,4]]) {
  const {state,actions,clock,controller:c}=setup();state.currentView="MOTIF_LIBRARY";
  state.motifs[0].motifLength=2;state.motifs[4].voiceLengths[1]=2;state.motifs[4].voiceLengths[2]=3;
  actions.toggleChain();ids.forEach(id=>actions.requestMotif(id));ids.forEach(()=>actions.navigateContext(1));actions.toggleChainLoopPoint(ids.at(-1));actions.appendChainMotif(9);
  const steps=[],transitions=[],beats=[];actions.setClockStepHandler(()=>steps.push([state.playingMotifId,state.playheadPosition]));actions.setClockBeatHandler(()=>beats.push(1));actions.setTransportTransitionHandler(e=>transitions.push(e));
  clock.setSource(source);actions.startPlayback();const revision=clock.transportRevision;
  const duration=ids.length===1?2:8;
  for(let i=1;i<=duration;i++) {
   if(source==="MIDI") for(let p=0;p<6;p++) clock.receiveMidiClockPulse();else clock.receiveInternalClockStep({sequence:i,transportRevision:revision});
   if(i===duration-1) {assert.equal(state.transportState,"PLAY");c.nextMotifLit=true;assert.equal(c.getLibraryMotifColor(ids.at(-1)),"GREEN");c.nextMotifLit=false;assert.equal(c.getLibraryMotifColor(ids.at(-1)),"DIM_RED");}
  }
  assert.equal(steps.length,duration);assert.equal(state.transportState,"PLAY");assert.equal(transitions.filter(e=>e.to==="STOP").length,0);assert.deepEqual(steps.at(-1),[0,0]);assert.equal(state.chainPlayingIndex,0);
  assert.equal(clock.transportRevision,revision);assert.equal(beats.length,ids.length===1?1:3);assert.ok(steps.every(([id])=>id!==9));
  actions.stop();actions.continuePlayback();assert.equal(state.playingMotifId,0);assert.equal(state.chainPlayingIndex,0);assert.equal(state.playheadPosition,0);assert.equal(state.chainLoopMasterIndex,ids.length-1);c.resetInputState();
 }
});

test("CHAIN B: STOP/PAUSE selection highlight follows duplicate occurrence without changing text", async () => {
 const {initializePlayChainUI}=await import("../src/PlayChainUI.mjs");
 for(const transport of ["STOP","PAUSE"]) {
  const {state,actions,controller:c}=setup();state.transportState=transport;actions.toggleChain();[0,4,4,2].forEach(id=>actions.requestMotif(id));
  const container={children:[],replaceChildren(...v){this.children=v;}};initializePlayChainUI({state,actions,document:{getElementById:()=>container,createElement:()=>({})}});
  for(let i=0;i<4;i++) {actions.navigateContext(1);assert.equal(container.children.map(e=>e.textContent).join(""),"[01][05][05][03]");assert.deepEqual(container.children.flatMap((e,n)=>e.className.includes("is-playing")?[n]:[]),[i]);assert.equal(state.currentMotifId,state.chain[i]);}
  c.resetInputState();
 }
});

test("CHAIN B: repeated LoopMaster wraps preserve real dispatcher Note Off callbacks and occurrence colors", async t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 const app=await source("app.js"),dispatch=app.slice(app.indexOf("function triggerMotifStep(step) {"),app.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
 const {state,actions,clock,controller:c}=setup();state.currentView="MOTIF_LIBRARY";state.motifLength=2;state.motif[12][1]=true;
 state.padConfiguration.voices[12]={type:"MIDI DRUM",output:{mode:"DEFAULT"},channel:1,note:60};
 const notes=[],offs=[];
 const trigger=new Function("state","midiOutputSelector","midiManager","launchpad","setTimeout",dispatch+"; return triggerMotifStep;")(state,{options:[{textContent:"Drums"}],selectedIndex:0},{send:(_,m)=>notes.push(m),findOutput:()=>({})},{pulseInstrument(){}},fn=>offs.push(fn));
 actions.toggleChain();[0,0].forEach(id=>actions.requestMotif(id));actions.navigateContext(1);actions.navigateContext(1);actions.toggleChainLoopPoint(0);actions.appendChainMotif(4);
 actions.setClockStepHandler(()=>trigger(state.playheadPosition));actions.startPlayback();clock.advanceStepPipeline();clock.advanceStepPipeline();
 assert.equal(c.getLibraryMotifColor(0),"GREEN");t.mock.timers.tick(120);c.nextMotifLit=false;assert.equal(c.getLibraryMotifColor(0),"DIM_RED");
 clock.advanceStepPipeline();clock.advanceStepPipeline();assert.equal(state.transportState,"PLAY");assert.equal(c.getLibraryMotifColor(0),"GREEN");assert.equal(state.chainPlayingIndex,0);assert.equal(notes.length,2);assert.equal(offs.length,2);
 const ons=notes.slice();offs.forEach(fn=>fn());assert.deepEqual(notes.slice(2),ons.map(([s,n])=>[s,n,0]));c.resetInputState();
});


test("CHAIN correction: accepted contextual hold confirms after transaction only, then restores palette", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 for(const transport of ["STOP","PAUSE","PLAY"]) for(const accepted of [true,false]) {
  const {state,actions,controller:c}=setup();state.currentView="MOTIF_LIBRARY";
  actions.toggleChain();[0,4].forEach(id=>actions.requestMotif(id));actions.navigateContext(1);
  state.transportState=transport;
  if(!accepted) actions.holdChainMotif=()=>false;
  const pad=c.mapping.BOOKS[6],before=state.chain.slice();
  c.handleMidiMessage([0x90,pad,127]);t.mock.timers.tick(299);
  assert.deepEqual(state.chain,before);assert.equal(c.chainConfirmations.size,0);assert.equal(c.getLibraryMotifColor(6),"OFF");
  t.mock.timers.tick(1);
  assert.deepEqual(state.chain,accepted?(transport==="PLAY"?[0,4,6]:[0,6,4]):before);
  assert.equal(c.getLibraryMotifColor(6),accepted?"GREEN":"OFF");
  c.handleMidiMessage([0x90,pad,0]);t.mock.timers.tick(119);
  assert.equal(c.chainConfirmations.has(6),accepted);t.mock.timers.tick(1);
  assert.equal(c.chainConfirmations.size,0);
  assert.equal(c.getLibraryMotifColor(6),accepted?(state.nextMotifId===6?(c.nextMotifLit?"YELLOW":"DIM_AMBER"):"YELLOW"):"OFF");
  c.resetInputState();
 }
});



test("CHAIN correction: reset cancels pending hold and accepted confirmation timers", t => {
 t.mock.timers.enable({apis:["setTimeout"]});
 const {state,actions,controller:c}=setup();state.currentView="MOTIF_LIBRARY";actions.toggleChain();actions.requestMotif(0);
 const press=()=>c.handleMidiMessage([0x90,c.mapping.BOOKS[4],127]);
 press();t.mock.timers.tick(299);c.resetInputState();t.mock.timers.tick(121);assert.deepEqual(state.chain,[0]);assert.equal(c.chainMotifHolds.size,0);
 press();t.mock.timers.tick(300);assert.deepEqual(state.chain,[0,4]);assert.equal(c.chainConfirmations.size,1);
 c.resetInputState();assert.equal(c.chainConfirmations.size,0);t.mock.timers.tick(120);assert.deepEqual(state.chain,[0,4]);c.resetInputState();
});

// Real clock ingress and hardware gestures for the live Loop Point scenarios.
function setupLoopPerformance({ source = "INTERNAL", ids = [0,4,2,7,3,9], master = null } = {}) {
    const context = setup();
    const { state, actions, clock, controller } = context;
    state.currentView = "MOTIF_LIBRARY";
    ids.forEach(id => state.motifs[id].motifLength = 2);
    actions.toggleChain();
    ids.forEach(id => actions.requestMotif(id));
    if (master !== null) {
        for (let i = 0; i <= master; i++) actions.navigateContext(1);
        assert.equal(actions.toggleChainLoopPoint(ids[master]), true);
    }
    clock.setSource(source);
    const steps = [], transitions = [];
    actions.setClockStepHandler(() => steps.push([state.chainPlayingIndex, state.playingMotifId, state.playheadPosition]));
    actions.setTransportTransitionHandler(event => transitions.push(event));
    actions.startPlayback();
    steps.push([state.chainPlayingIndex, state.playingMotifId, state.playheadPosition]);
    let sequence = 0;
    const advance = (count = 1) => {
        for (let i = 0; i < count; i++) {
            if (source === "MIDI") for (let pulse = 0; pulse < 6; pulse++) clock.receiveMidiClockPulse();
            else assert.equal(clock.receiveInternalClockStep({ sequence: ++sequence, transportRevision: clock.transportRevision }).accepted, true);
        }
    };
    const shiftBook = id => {
        controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 127]);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[id], 127]);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[id], 0]);
        controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 0]);
    };
    return { ...context, steps, transitions, advance, shiftBook };
}

function loopPhase(state, clock) {
    return {
        transport: state.transportState, revision: clock.transportRevision,
        playing: state.playingMotifId, index: state.chainPlayingIndex,
        detached: state.chainPlayingDetached, position: state.playheadPosition,
        live: structuredClone(state.liveLengthCycle), pulses: clock.midiPulseCount,
        sequence: clock.lastAcceptedNativeStepSequence,
        chain: state.chain.slice(), motifs: structuredClone(state.motifs)
    };
}

for (const transport of ["STOP", "PAUSE"]) {
    test(`LOOP POINT hardware: ${transport} creates and removes the selected 05b in both views`, t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        for (const view of ["PLAY", "MOTIF_LIBRARY"]) {
            const { state, actions, clock, controller } = setup();
            state.currentView = view;
            actions.toggleChain();
            [0,4,4,2,7].forEach(id => actions.requestMotif(id));
            if (transport === "PAUSE") { actions.startPlayback();actions.pausePlayback(); }
            const tap = (status, note) => {
                controller.handleMidiMessage([status, note, 127]);
                controller.handleMidiMessage([status, note, 0]);
            };
            const next = () => tap(0xB0, controller.mapping.TOP_CONTROLS.NEXT);
            if (transport === "STOP") next(); // Select the head before moving to 05b.
            next();next();
            assert.equal(state.chainPlayingIndex, 2);
            assert.equal(state.chainPlayingDetached, false);
            const before = loopPhase(state, clock);
            const shiftBook = () => {
                controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 127]);
                tap(0x90, controller.mapping.BOOKS[4]);
                controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 0]);
            };
            shiftBook();assert.equal(state.chainLoopMasterIndex, 2);
            assert.deepEqual(loopPhase(state, clock), before);
            shiftBook();assert.equal(state.chainLoopMasterIndex, null);
            assert.deepEqual(loopPhase(state, clock), before);
            t.mock.timers.tick(600);
            assert.deepEqual(state.chain, before.chain);
            assert.equal(controller.chainMotifHolds.size, 0);
            assert.equal(controller.chainConfirmations.size, 0);
            assert.equal(state.currentView, view);
            controller.resetInputState();
        }
    });
}

test("LOOP POINT: intermediate LoopMaster repeats the prefix and leaves the tail intact on both clocks", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const source of ["INTERNAL", "MIDI"]) {
        const { state, clock, controller, steps, transitions, advance } = setupLoopPerformance({ source, master: 2 });
        const revision = clock.transportRevision;
        // Hardware APPEND remains accepted behind the frontier and confirms in GREEN.
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[11], 127]);
        t.mock.timers.tick(300);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[11], 0]);
        assert.equal(controller.getLibraryMotifColor(11), "GREEN");
        t.mock.timers.tick(120);assert.equal(controller.getLibraryMotifColor(11), "YELLOW");
        advance(18);
        assert.deepEqual(steps.filter(([, , step]) => step === 0).map(([index, id]) => [index, id]),
            [[0,0],[1,4],[2,2],[0,0],[1,4],[2,2],[0,0],[1,4],[2,2],[0,0]]);
        assert.deepEqual(state.chain, [0,4,2,7,3,9,11]);
        assert.equal(state.chainLoopMasterIndex, 2);
        assert.equal(state.transportState, "PLAY");
        assert.equal(clock.transportRevision, revision);
        assert.equal(transitions.length, 1); // Initial PLAY only; wraps are not transport events.
        controller.resetInputState();
    }
});

test("LOOP POINT: hardware LOOP OFF anywhere in PLAY preserves phase and continues into the tail", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const source of ["INTERNAL", "MIDI"]) for (const playingMaster of [false, true]) {
        const { state, clock, controller, steps, advance, shiftBook } = setupLoopPerformance({ source, master: 2 });
        advance(playingMaster ? 5 : 1); // Step 1 of LoopMaster or the first Motif.
        if (source === "MIDI") clock.receiveMidiClockPulse();
        const before = loopPhase(state, clock), live = state.liveLengthCycle;
        shiftBook(2);
        assert.equal(state.chainLoopMasterIndex, null);
        assert.deepEqual(loopPhase(state, clock), before);
        assert.equal(state.liveLengthCycle, live);
        assert.equal(state.nextMotifId, playingMaster ? 7 : 4);
        assert.equal(controller.getLibraryMotifColor(2), playingMaster ? "GREEN" : "YELLOW");
        assert.equal(controller.chainMotifHolds.size, 0);
        const offset = steps.length;
        advance(playingMaster ? 7 : 11);
        assert.deepEqual(steps.slice(offset).filter(([, , step]) => step === 0).map(([, id]) => id),
            playingMaster ? [7,3,9,0] : [4,2,7,3,9,0]);
        assert.equal(state.transportState, "PLAY");
        controller.resetInputState();
    }
});

test("LOOP POINT: on-the-fly creation uses only the attached PLAYING occurrence without reset or rephase", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const source of ["INTERNAL", "MIDI"]) {
        const { state, actions, clock, controller, advance, shiftBook } = setupLoopPerformance({ source });
        advance(9); // 04 (ID 3), occurrence index 4, step 1.
        assert.equal(state.playingMotifId, 3);
        const before = loopPhase(state, clock), live = state.liveLengthCycle;
        shiftBook(7); // Another pad cannot identify an arbitrary occurrence.
        assert.equal(state.chainLoopMasterIndex, null);
        assert.deepEqual(loopPhase(state, clock), before);
        shiftBook(3);
        assert.equal(state.chainLoopMasterIndex, 4);
        assert.deepEqual(loopPhase(state, clock), before);
        assert.equal(state.liveLengthCycle, live);
        assert.equal(state.nextMotifId, 0);
        assert.equal(controller.getLibraryMotifColor(3), "GREEN");
        actions.holdChainMotif(11);
        assert.deepEqual(state.chain, [0,4,2,7,3,9,11]);
        assert.equal(state.chainLoopMasterIndex, 4);
        advance();
        assert.equal(state.chainPlayingIndex, 0);
        assert.equal(state.playheadPosition, 0);
        shiftBook(0); // Existing Loop Point cannot be moved arbitrarily in PLAY.
        assert.equal(state.chainLoopMasterIndex, 4);
        shiftBook(3);
        assert.equal(state.chainLoopMasterIndex, null);
        controller.resetInputState();
    }
});

test("LOOP POINT: STOP/PAUSE navigation selects and moves the master precisely between duplicate occurrences", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const transport of ["STOP", "PAUSE"]) {
        const { state, actions, controller } = setup();
        state.currentView = "MOTIF_LIBRARY";
        state.transportState = transport;
        actions.toggleChain();
        [0,4,4,2].forEach(id => actions.requestMotif(id));
        const tap = (status, note) => {
            controller.handleMidiMessage([status, note, 127]);
            controller.handleMidiMessage([status, note, 0]);
        };
        const shiftBook = id => {
            controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 127]);
            tap(0x90, controller.mapping.BOOKS[id]);
            controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.SHIFT, 0]);
        };
        shiftBook(4); // No selected occurrence yet.
        assert.equal(state.chainLoopMasterIndex, null);
        tap(0xB0, controller.mapping.TOP_CONTROLS.NEXT);
        tap(0xB0, controller.mapping.TOP_CONTROLS.NEXT);
        const before = state.chain.slice();
        shiftBook(2);assert.equal(state.chainLoopMasterIndex, null);
        shiftBook(4);assert.equal(state.chainLoopMasterIndex, 1);
        tap(0xB0, controller.mapping.TOP_CONTROLS.NEXT);
        assert.equal(state.chainPlayingIndex, 2);
        shiftBook(4);assert.equal(state.chainLoopMasterIndex, 2);
        shiftBook(4);assert.equal(state.chainLoopMasterIndex, null);
        assert.deepEqual(state.chain, before);
        assert.equal(state.transportState, transport);
        controller.resetInputState();
    }
});

test("LOOP POINT: duplicate PLAYING creation and pad-based LOOP OFF keep occurrence identity", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const master of [1,2]) {
        const { state, clock, controller, advance, shiftBook } = setupLoopPerformance({ ids: [0,4,4,2] });
        advance(master * 2 + 1);
        shiftBook(4);
        assert.equal(state.chainLoopMasterIndex, master);
        assert.equal(controller.getLibraryMotifColor(4), "GREEN");
        advance();assert.equal(state.chainPlayingIndex, 0);
        for (const lit of [true,false]) {
            controller.nextMotifLit = lit;
            assert.equal(controller.getLibraryMotifColor(4), master === 1 ? (lit ? "RED" : "DIM_RED") : (lit ? "YELLOW" : "DIM_AMBER"));
        }
        if (master === 2) {
            advance(2); // Earlier 05a plays while 05b remains the master.
            assert.equal(state.chainPlayingIndex, 1);
            assert.equal(controller.getLibraryMotifColor(4), "GREEN");
        }
        const before = loopPhase(state, clock);
        shiftBook(4);
        assert.equal(state.chainLoopMasterIndex, null);
        assert.deepEqual(loopPhase(state, clock), before);
        controller.resetInputState();
    }
});

test("LOOP POINT: emitted LEDs show idle DIM RED, NEXT DIM RED/RED blink, PLAYING GREEN/DIM RED blink and immediate restoration", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, controller, advance, shiftBook } = setupLoopPerformance({ master: 2 });
    const leds = new Map();
    controller.midiManager.send = (_, [status, note, color]) => { if (status === 0x90) leds.set(note, color); };
    const color = id => leds.get(controller.mapping.BOOKS[id]);
    const value = name => (controller.colors[name] & 0x33) | 4;
    controller.drawBooks();
    assert.equal(color(2), value("DIM_RED"));assert.equal(color(0), value("GREEN"));
    advance(2); // NEXT is now LoopMaster.
    assert.equal(color(2), value("RED"));
    t.mock.timers.tick(160);assert.equal(color(2), value("DIM_RED"));assert.equal(color(4), value("GREEN"));
    t.mock.timers.tick(160);assert.equal(color(2), value("RED"));
    shiftBook(2); // Remove while NEXT: restore the same temporal grammar in amber/yellow.
    assert.equal(color(2), value("YELLOW"));
    t.mock.timers.tick(160);assert.equal(color(2), value("DIM_AMBER"));
    advance(2); // Current 03 can become master on-the-fly.
    shiftBook(2);assert.equal(color(2), value("GREEN"));
    t.mock.timers.tick(160);assert.equal(color(2), value("DIM_RED"));
    t.mock.timers.tick(160);assert.equal(color(2), value("GREEN"));
    advance(2); // Master leaves PLAYING: its role becomes DIM RED again.
    assert.equal(color(2), value("DIM_RED"));assert.equal(color(0), value("GREEN"));
    advance(2); // Next tour: master is NEXT, so only it blinks red.
    assert.equal(color(2), value("RED"));
    t.mock.timers.tick(160);assert.equal(color(2), value("DIM_RED"));
    advance(2);assert.equal(color(2), value("GREEN"));
    t.mock.timers.tick(160);assert.equal(color(2), value("DIM_RED"));
    t.mock.timers.tick(160);assert.equal(color(2), value("GREEN"));
    shiftBook(2);assert.equal(color(2), value("GREEN"));assert.equal(state.nextMotifId, 7);
    controller.resetInputState();
});

test("LOOP POINT: structural insertions and deletions preserve the precise duplicate master, deleting it disables LOOP", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const transport of ["STOP", "PAUSE", "PLAY"]) {
        const { state, actions, controller, advance } = setupLoopPerformance({ ids: [0,4,4,2], master: 2 });
        if (transport !== "PLAY") {
            if (transport === "STOP") actions.stop();else actions.pausePlayback();
            actions.navigateContext(1); // STOP: head; PAUSE: occurrence 1.
        }
        // INSERT before 05b, after the current selected/playing occurrence.
        actions.appendChainMotif(6, { afterPlaying: true });
        assert.equal(state.chainLoopMasterIndex, 3);
        assert.equal(state.chain[3], 4);
        const masterIndex = state.chainLoopMasterIndex;
        if (transport !== "PLAY") {
            while (state.chainPlayingIndex < masterIndex) actions.navigateContext(1);
            actions.holdChainMotif(7); // INSERT immediately after LoopMaster.
            assert.equal(state.chainLoopMasterIndex, masterIndex);
            assert.equal(state.chain[masterIndex + 1], 7);
        }
        actions.appendChainMotif(9);assert.equal(state.chainLoopMasterIndex, masterIndex);
        actions.removeChainOccurrence(state.chain.indexOf(6));assert.equal(state.chainLoopMasterIndex, masterIndex - 1);
        assert.equal(state.chain[state.chainLoopMasterIndex], 4);
        actions.removeChainOccurrence(state.chain.length - 1);assert.equal(state.chainLoopMasterIndex, masterIndex - 1);
        // DELETE BOOK 05 removes its last occurrence, which is precisely 05b.
        controller.setDeleteArmed(true);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[4], 127]);
        controller.handleMidiMessage([0x90, controller.mapping.BOOKS[4], 0]);
        assert.equal(state.chainLoopMasterIndex, null);
        assert.ok(state.chain.includes(4)); // 05a survives; it does not inherit the role.
        assert.equal(state.transportState, transport);
        if (transport === "PLAY") { advance(2);assert.equal(state.transportState, "PLAY"); }
        controller.resetInputState();
    }
});

test("LOOP POINT: deleting active LoopMaster finishes its current cycle, then continues at the gap", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const source of ["INTERNAL", "MIDI"]) {
        const { state, actions, clock, controller, advance } = setupLoopPerformance({ source, master: 2 });
        advance(5);
        const revision = clock.transportRevision;
        actions.removeChainOccurrence(2);
        assert.equal(state.chainLoopMasterIndex, null);
        assert.equal(state.chainPlayingDetached, true);
        assert.equal(state.playingMotifId, 2);
        assert.equal(state.playheadPosition, 1);
        assert.equal(state.nextMotifId, 7);
        assert.equal(controller.getLibraryMotifColor(2), "GREEN");
        advance();
        assert.equal(state.playingMotifId, 7);assert.equal(state.playheadPosition, 0);
        assert.equal(state.chainPlayingIndex, 2);assert.equal(clock.transportRevision, revision);
        controller.resetInputState();
    }
});

test("LOOP POINT: DELETE NEXT follows the actual wrap successor and adjusts LoopMaster identity", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, controller, advance } = setupLoopPerformance({ master: 2 });
    advance(5);assert.equal(state.nextMotifId, 0);
    actions.deleteChainNext();
    assert.deepEqual(state.chain, [4,2,7,3,9]);
    assert.equal(state.chainLoopMasterIndex, 1);assert.equal(state.chainPlayingIndex, 1);
    assert.equal(state.nextMotifId, 4);
    advance();assert.equal(state.playingMotifId, 4);assert.equal(state.chainPlayingIndex, 0);
    controller.resetInputState();
});

test("LOOP POINT: DELETE PLAY and deletion of the only occurrence leave an empty Chain with LOOP OFF", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const transport of ["STOP", "PAUSE", "PLAY"]) for (const single of [false,true]) {
        const { state, actions, clock, controller, advance } = setupLoopPerformance({ ids: single ? [0] : [0,4,2], master: single ? 0 : 1 });
        if (transport === "STOP") actions.stop();else if (transport === "PAUSE") actions.pausePlayback();
        const revision = clock.transportRevision;
        if (single) actions.deleteMotif(0);
        else {
            controller.setDeleteArmed(true);
            controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.PLAY_STOP, 127]);
            controller.handleMidiMessage([0xB0, controller.mapping.TOP_CONTROLS.PLAY_STOP, 0]);
        }
        assert.deepEqual(state.chain, []);assert.equal(state.chainLoopMasterIndex, null);
        assert.equal(state.nextMotifId, null);assert.equal(actions.toggleChainLoopPoint(0), false);
        assert.equal(state.transportState, transport);assert.equal(clock.transportRevision, revision);
        if (transport === "PLAY") { advance(4);assert.equal(state.transportState, "PLAY"); }
        controller.resetInputState();
    }
});

test("LOOP POINT: read-only Chain text and selected occurrence remain stable through loop edits", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { readPlayChain, initializePlayChainUI } = await import("../src/PlayChainUI.mjs");
    const { state, controller, advance, shiftBook } = setupLoopPerformance({ master: 2 });
    const container = { children: [], replaceChildren(...children) { this.children = children; } };
    initializePlayChainUI({ state, actions: controller.actions, document: { getElementById: () => container, createElement: () => ({}) } });
    const labels = () => container.children.map(element => element.textContent).join("");
    assert.equal(labels(), "[01][05][03][08][04][10]");
    advance(4);
    assert.equal(readPlayChain(state).findIndex(occurrence => occurrence.next), 0);
    shiftBook(2);
    assert.equal(readPlayChain(state).findIndex(occurrence => occurrence.next), 3);
    assert.equal(labels(), "[01][05][03][08][04][10]");
    assert.deepEqual(container.children.flatMap((element, index) => element.className.includes("is-playing") ? [index] : []), [2]);
    controller.resetInputState();
});

test("LOOP POINT: natural lengths explicit, polymetric LCM and default 32 wrap without changing MIDI phase", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const source of ["INTERNAL", "MIDI"]) for (const duration of [3,6,32]) {
        const { state, clock, controller, steps, advance } = setupLoopPerformance({ source, ids: [0,4,2], master: 1 });
        state.motifs[4].motifLength = duration === 3 ? 3 : null;
        if (duration === 6) { state.motifs[4].voiceLengths[1] = 2;state.motifs[4].voiceLengths[2] = 3; }
        const revision = clock.transportRevision;
        advance(2 + duration);
        assert.deepEqual(steps.slice(2, 2 + duration), Array.from({ length: duration }, (_, step) => [1,4,step]));
        assert.deepEqual(steps.at(-1), [0,0,0]);
        assert.equal(steps.length, 3 + duration);
        assert.equal(clock.transportRevision, revision);
        assert.equal(clock.midiPulseCount, 0);
        assert.equal(state.chainLoopMasterIndex, 1);
        controller.resetInputState();
    }
});

test("LOOP POINT: a detached PLAYING Motif cannot create a master on a surviving duplicate", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, clock, controller, advance, shiftBook } = setupLoopPerformance({ ids: [0,4,4,2] });
    advance(3);
    actions.removeChainOccurrence(1);
    const before = loopPhase(state, clock);
    shiftBook(4);
    assert.equal(state.chainLoopMasterIndex, null);
    assert.deepEqual(loopPhase(state, clock), before);
    advance();assert.equal(state.chainPlayingIndex, 1);assert.equal(state.chainPlayingDetached, false);
    shiftBook(4);assert.equal(state.chainLoopMasterIndex, 1);
    controller.resetInputState();
});

test("LOOP POINT hardware: PLAYING blinks GREEN/DIM RED for a shared master/NEXT pad and idle LOOP OFF restores YELLOW", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const single = setupLoopPerformance({ ids: [0], master: 0 });
    assert.equal(single.state.nextMotifId, 0);
    for (const lit of [true,false]) {
        single.controller.nextMotifLit = lit;
        assert.equal(single.controller.getLibraryMotifColor(0), lit ? "GREEN" : "DIM_RED");
    }
    single.advance(4);assert.equal(single.controller.getLibraryMotifColor(0), "DIM_RED");
    single.shiftBook(0);assert.equal(single.controller.getLibraryMotifColor(0), "GREEN");
    single.controller.resetInputState();
    const idle = setupLoopPerformance({ master: 2 });
    assert.equal(idle.controller.getLibraryMotifColor(2), "DIM_RED");
    idle.shiftBook(2);assert.equal(idle.controller.getLibraryMotifColor(2), "YELLOW");
    idle.controller.resetInputState();
});

test("LOOP POINT UI: only the master occurrence is red and keeps its PLAYING highlight without changing text", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { readPlayChain, initializePlayChainUI } = await import("../src/PlayChainUI.mjs");
    const { state, actions, controller } = setup();
    const container = { children: [], replaceChildren(...children) { this.children = children; } };
    initializePlayChainUI({ state, actions, document: { getElementById: () => container, createElement: () => ({}) } });
    actions.toggleChain();[0,4,4,2,7].forEach(id => actions.requestMotif(id));
    const labels = () => container.children.map(element => element.textContent).join("");
    const masters = () => container.children.flatMap((element, index) => element.className.includes("is-loop-master") ? [index] : []);
    actions.navigateContext(1);actions.navigateContext(1);actions.navigateContext(1);
    actions.toggleChainLoopPoint(4);assert.deepEqual(masters(), [2]);
    assert.equal(labels(), "[01][05][05][03][08]");
    assert.ok(container.children[2].className.includes("is-playing"));
    actions.navigateContext(-1);
    assert.deepEqual(masters(), [2]);assert.ok(container.children[1].className.includes("is-playing"));
    assert.ok(!container.children[2].className.includes("is-playing"));
    actions.toggleChainLoopPoint(4);assert.deepEqual(masters(), [1]); // 05a replaces 05b, with the same ID.
    actions.startPlayback();assert.deepEqual(masters(), [1]);
    assert.ok(container.children[0].className.includes("is-playing"));
    state.chainPlayingIndex = 1;state.playingMotifId = 4;actions.onChainChange();
    assert.ok(container.children[1].className.includes("is-playing"));assert.deepEqual(masters(), [1]);
    const before = JSON.stringify(state);readPlayChain(state);assert.equal(JSON.stringify(state), before);
    actions.toggleChainLoopPoint(4);assert.deepEqual(masters(), []);
    assert.ok(container.children[1].className.includes("is-playing"));
    assert.equal(labels(), "[01][05][05][03][08]");
    assert.equal(container.children.length, 5);
    const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.match(html, /\.chain-occurrence\.is-loop-master \{ color: #c94c4c; \}/);
    const combined = html.match(/\.chain-occurrence\.is-loop-master\.is-playing \{([^}]+)\}/)[1];
    assert.match(combined, /text-decoration-line: underline/);
    assert.match(combined, /text-decoration-color: #4a9b6b/);
    assert.doesNotMatch(combined, /(?:^|[;\n])\s*(?:font|margin|padding|border|width|height|transform|content|color)\s*:/);
    controller.resetInputState();
});

test("LOOP POINT LED: LOOP OFF during the dim phase restores fixed GREEN immediately without musical changes", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, clock, controller, advance, shiftBook } = setupLoopPerformance({ master: 2 });
    const leds = new Map();
    controller.midiManager.send = (_, [status, note, color]) => { if (status === 0x90) leds.set(note, color); };
    const value = name => (controller.colors[name] & 0x33) | 4;
    advance(4);
    const before = loopPhase(state, clock);
    t.mock.timers.tick(160);
    assert.equal(leds.get(controller.mapping.BOOKS[2]), value("DIM_RED"));
    assert.deepEqual(loopPhase(state, clock), before);
    shiftBook(2);
    assert.equal(leds.get(controller.mapping.BOOKS[2]), value("GREEN"));
    assert.deepEqual(loopPhase(state, clock), before);
    t.mock.timers.tick(160);assert.equal(leds.get(controller.mapping.BOOKS[2]), value("GREEN"));
    controller.resetInputState();
});

function observeNavigationBooks(controller) {
    const leds = new Map();
    controller.midiManager.send = (_, [status, note, color]) => {
        if (status === 0x90 && controller.mapping.BOOKS.includes(note)) leds.set(note, color);
    };
    const value = name => (controller.colors[name] & 0x33) | 4;
    const colors = () => controller.mapping.BOOKS.map(note => leds.get(note));
    const tap = name => {
        const note = controller.mapping.TOP_CONTROLS[name];
        controller.handleMidiMessage([0xB0, note, 127]);
        controller.handleMidiMessage([0xB0, note, 0]);
    };
    return { value, colors, tap };
}

for (const transport of ["STOP", "PAUSE"]) {
    test(`CHAIN navigation boundary: ${transport} flashes at both ends, repeats against stops, and restores LoopMaster/data LEDs`, t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const { state, actions, clock, controller } = setup();
        state.currentView = "MOTIF_LIBRARY";
        actions.toggleChain();[0,4,4,2].forEach(id => actions.requestMotif(id));
        state.motifs[15].voiceLengths[0] = 7;
        if (transport === "PAUSE") { actions.startPlayback();actions.pausePlayback(); }
        else actions.navigateContext(1);
        actions.navigateContext(1);actions.toggleChainLoopPoint(4);actions.navigateContext(1);
        assert.equal(state.chainPlayingIndex, 2);assert.equal(state.chainLoopMasterIndex, 1);
        const { value, colors, tap } = observeNavigationBooks(controller);
        const revision = clock.transportRevision;
        clock.midiPulseCount = 3;
        const restore = () => {
            const before = JSON.stringify(state);
            t.mock.timers.tick(119);
            assert.notEqual(controller.chainNavigationFlashColor, null);
            t.mock.timers.tick(1);
            assert.equal(controller.chainNavigationFlashColor, null);
            assert.equal(controller.chainNavigationFlashTimer, null);
            assert.deepEqual(colors(), controller.mapping.BOOKS.map((_, id) => value(controller.getLibraryMotifColor(id))));
            assert.equal(colors()[15], value("DIM_AMBER"));assert.equal(colors()[14], value("OFF"));
            assert.equal(JSON.stringify(state), before);
            assert.equal(clock.transportRevision, revision);assert.equal(clock.midiPulseCount, 3);
        };
        tap("PREVIOUS"); // 05b -> 05a is an intermediate occurrence, despite equal IDs.
        assert.equal(state.chainPlayingIndex, 1);
        assert.equal(controller.chainNavigationFlashTimer, null);
        assert.ok(new Set(colors()).size > 1);
        tap("PREVIOUS");assert.equal(state.chainPlayingIndex, 0);
        assert.deepEqual(colors(), Array(16).fill(value("YELLOW")));restore();
        assert.equal(colors()[4], value(controller.nextMotifLit ? "RED" : "DIM_RED"));
        const first = JSON.stringify(state);
        tap("PREVIOUS");assert.equal(JSON.stringify(state), first);
        assert.deepEqual(colors(), Array(16).fill(value("YELLOW")));restore();
        tap("NEXT");assert.equal(state.chainPlayingIndex, 1);assert.equal(controller.chainNavigationFlashTimer, null);
        tap("NEXT");assert.equal(state.chainPlayingIndex, 2);assert.equal(controller.chainNavigationFlashTimer, null);
        assert.ok(new Set(colors()).size > 1);
        tap("NEXT");assert.equal(state.chainPlayingIndex, 3);
        assert.deepEqual(colors(), Array(16).fill(value("RED")));restore();
        assert.equal(colors()[4], value("DIM_RED")); // Earlier duplicate remains the master.
        assert.equal(colors()[2], value(transport === "PAUSE" ? "GREEN" : "YELLOW"));
        const last = JSON.stringify(state);
        tap("NEXT");assert.equal(JSON.stringify(state), last);
        assert.deepEqual(colors(), Array(16).fill(value("RED")));restore();
        assert.deepEqual(state.chain, [0,4,4,2]);assert.equal(state.chainLoopMasterIndex, 1);
        controller.resetInputState();
    });

    test(`CHAIN navigation boundary: ${transport} single occurrence uses gesture direction and restores every BOOK in both views`, t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        for (const view of ["PLAY", "MOTIF_LIBRARY"]) {
            const { state, actions, controller } = setup();
            state.currentView = view;actions.toggleChain();actions.requestMotif(4);
            if (transport === "PAUSE") { actions.startPlayback();actions.pausePlayback(); }
            else actions.navigateContext(1);
            actions.toggleChainLoopPoint(4);
            const { value, colors, tap } = observeNavigationBooks(controller);
            for (const [direction, color] of [["PREVIOUS","YELLOW"],["PREVIOUS","YELLOW"],["NEXT","RED"],["NEXT","RED"]]) {
                const before = JSON.stringify(state);
                tap(direction);assert.equal(state.chainPlayingIndex, 0);
                assert.deepEqual(colors(), Array(16).fill(value(color)));
                t.mock.timers.tick(120);
                const restored = controller.mapping.BOOKS.map((_, id) => value(view === "MOTIF_LIBRARY"
                    ? controller.getLibraryMotifColor(id)
                    : id < 8 ? controller.layout.BOOKS.ATTRIBUTES : controller.layout.BOOKS.TRANSFORMATIONS));
                assert.deepEqual(colors(), restored);
                assert.equal(JSON.stringify(state), before);
                assert.equal(state.chainLoopMasterIndex, 0);
            }
            controller.resetInputState();
        }
    });
}

test("CHAIN navigation boundary: repeated press restarts 120 ms and leaving a boundary cancels the global flash", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, controller } = setup();state.currentView = "MOTIF_LIBRARY";
    actions.toggleChain();[0,4,2].forEach(id => actions.requestMotif(id));
    const { value, colors, tap } = observeNavigationBooks(controller);
    tap("PREVIOUS");assert.deepEqual(colors(), Array(16).fill(value("YELLOW")));
    t.mock.timers.tick(60);tap("PREVIOUS");t.mock.timers.tick(60);
    assert.deepEqual(colors(), Array(16).fill(value("YELLOW")));
    t.mock.timers.tick(59);assert.equal(controller.chainNavigationFlashColor, "YELLOW");
    t.mock.timers.tick(1);assert.equal(controller.chainNavigationFlashColor, null);
    assert.equal(controller.nextMotifLit, false); // NEXT's visual timer continued beneath the flash.
    assert.equal(colors()[4], value("DIM_AMBER"));
    assert.deepEqual(colors(), controller.mapping.BOOKS.map((_, id) => value(controller.getLibraryMotifColor(id))));
    tap("PREVIOUS");tap("NEXT");assert.equal(state.chainPlayingIndex, 1);
    assert.equal(controller.chainNavigationFlashColor, null);assert.equal(controller.chainNavigationFlashTimer, null);
    assert.ok(new Set(colors()).size > 1);
    controller.resetInputState();
});

test("CHAIN navigation boundary: empty Chains, normal mode and PLAY have no global flash; reset clears its timer", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { state, actions, controller } = setup();state.currentView = "MOTIF_LIBRARY";
    const { tap } = observeNavigationBooks(controller);
    actions.toggleChain();tap("PREVIOUS");tap("NEXT");
    assert.equal(controller.chainNavigationFlashColor, null);
    actions.requestMotif(0);actions.startPlayback();
    tap("PREVIOUS");tap("NEXT");assert.equal(controller.chainNavigationFlashColor, null);
    assert.equal(controller.chainNavigationFlashTimer, null);
    actions.stop();tap("PREVIOUS");assert.equal(controller.chainNavigationFlashColor, "YELLOW");
    actions.startPlayback();assert.equal(controller.chainNavigationFlashColor, null);
    actions.stop();actions.toggleChain();tap("PREVIOUS");tap("NEXT");
    assert.equal(controller.chainNavigationFlashColor, null);assert.equal(controller.chainNavigationFlashTimer, null);
    actions.toggleChain();tap("NEXT");assert.equal(controller.chainNavigationFlashColor, "RED");
    controller.resetInputState();assert.equal(controller.chainNavigationFlashColor, null);
    assert.equal(controller.chainNavigationFlashTimer, null);
    t.mock.timers.tick(120);assert.equal(controller.chainNavigationFlashColor, null);
});
