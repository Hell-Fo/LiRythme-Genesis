import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readPlayMotif, initializePlayMotifUI } from "../src/PlayMotifUI.mjs";
import { initializePlayStatusUI } from "../src/PlayStatusUI.mjs";
import { initializePlayChainUI } from "../src/PlayChainUI.mjs";
import { readPlayCycle, cyclePoint, cycleOutline } from "../src/PlayCycleUI.mjs";

const source = file => fs.readFile(new URL(`../${file}`, import.meta.url), "utf8");
const url = text => `data:text/javascript;base64,${Buffer.from(text.replace('"./ATTransaction.mjs"', JSON.stringify(new URL("../src/ATTransaction.mjs", import.meta.url).href))).toString("base64")}`;
const pad = url(await source("src/PadConfiguration.js"));
const { LiRythmeState } = await import(url((await source("src/LiRythmeState.js")).replace('"./PadConfiguration.js"', JSON.stringify(pad))));
const { LiRythmeClock } = await import(url(await source("src/LiRythmeClock.js")));
const { LiRythmeActions } = await import(url(await source("src/LiRythmeActions.js")));

test("cycle clocks follow independent playback and engaged lengths, not FOCUS or pending edits", () => {
    const state = new LiRythmeState();
    state.selectedInstrument = 0;
    state.motifLength = 8; state.voiceLengths[0] = 5;
    state.modulation.motifLength = 7; state.modulation.voiceLengths[0] = 3;
    state.transportState = "PLAY";
    state.playheadPosition = 6; state.modulation.playheadPosition = 4;
    assert.equal(readPlayCycle(state).voice.position, 1);
    assert.equal(readPlayCycle(state, "MODULATION").voice.position, 1);
    state.deferDouble([0], true);
    state.motifLength = 16; state.voiceLengths[0] = 10;
    assert.equal(readPlayCycle(state).length, 8);
    assert.equal(readPlayCycle(state).voice.length, 5);
    state.chainFocus = true;
    state.currentMotifId = 1;
    const before = JSON.stringify([state, state.modulation]);
    assert.equal(readPlayCycle(state).viewingOther, true);
    assert.equal(readPlayCycle(state).motifId, 0);
    assert.equal(JSON.stringify([state, state.modulation]), before);
    state.advanceLiveLengthCycle(); state.advanceLiveLengthCycle();
    assert.equal(readPlayCycle(state).position, 0);
    assert.equal(readPlayCycle(state).voice.position, 0);
    assert.equal(readPlayCycle(state).length, 16);
    state.selectedInstrument = null;
    assert.equal(readPlayCycle(state).voice, null);
});

test("long clocks use bounded rings, short cycles polygons, inner radius is 80 percent", () => {
    const state = new LiRythmeState();
    state.voiceLengths[0] = 32; state.voiceLengths[1] = 5;
    state.voiceLengths[2] = 30;
    assert.equal(readPlayCycle(state).length, 480);
    for (const length of [1, 2, 32, 320, 480, 72201776446800]) assert.equal(cycleOutline(length, 100), null);
    assert.equal(cycleOutline(5, 80).split(" ").length, 5);
    const distance = ([x, y]) => Math.hypot(x - 120, y - 120);
    assert.ok(Math.abs(distance(cyclePoint(2, 5, 80)) / distance(cyclePoint(2, 5, 100)) - .8) < 1e-12);
    assert.deepEqual(cyclePoint(0, 8, 100), [120, 20]);
});

test("PLAY keeps both banks and Chains visible and reports effective modulation activation", () => {
    const state = new LiRythmeState();
    state.selectedInstrument = null;
    state.setTargetLength(8);
    state.modulation.setTargetLength(5);
    state.chain = [0, 2]; state.chainEnabled = true;
    state.modulation.chain = [3, 4, 3]; state.modulation.chainEnabled = true;
    const elements = new Map();
    const document = { getElementById(id) {
        if (!elements.has(id)) elements.set(id, { textContent: "", children: [],
            classList: { toggle() {} }, replaceChildren(...children) { this.children = children; } });
        return elements.get(id);
    }, createElement() { return {}; } };
    const panels = ["MOTIF", "MODULATION"].map(system => initializePlayMotifUI({ state, system, document }));
    const chains = ["MOTIF", "MODULATION"].map(system => initializePlayChainUI({ state, system, document }));
    const value = id => elements.get(id).textContent;
    for (const context of ["MOTIF", "MODULATION"]) {
        state.currentTimeline = context;
        const before = JSON.stringify([state, state.modulation]);
        panels.forEach(panel => panel.render()); chains.forEach(chain => chain.render());
        assert.equal(value("play-motif-title"), "MOTIF 01");
        assert.equal(value("play-modulation-title"), "MODULATION 01");
        assert.equal(value("play-motif-duration"), "8 STEPS");
        assert.equal(value("play-modulation-duration"), "5 STEPS");
        assert.deepEqual(elements.get("play-chain-occurrences").children.map(x => x.textContent), ["[01]", "[03]"]);
        assert.deepEqual(elements.get("play-modulation-chain-occurrences").children.map(x => x.textContent), ["[04]", "[05]", "[04]"]);
        assert.equal(JSON.stringify([state, state.modulation]), before);
    }
    for (const [active, requested, expected] of [
        [false, false, "OFF"], [false, true, "OFF → ON (en attente)"],
        [true, true, "ON"], [true, false, "ON → OFF (en attente)"]
    ]) {
        state.modulationActive = active; state.modulationRequested = requested;
        panels[1].render(); assert.equal(value("play-modulation-active"), expected);
    }
});

test("current single Motif convention, actual matrix duration and unavailable Play Mode", () => {
    const state = new LiRythmeState();
    assert.deepEqual(readPlayMotif(state), { title: "MOTIF 01", duration: "32 STEPS", step: "32", mode: "Non disponible" });
    state.stepDivision = 8;
    state.motif[0][31] = true;
    assert.equal(readPlayMotif(state).duration, "32 STEPS");
    state.selectedInstrument = null;
    state.setTargetLength(16);
    assert.equal(readPlayMotif(state).duration, "16 STEPS");
    assert.equal(readPlayMotif(state).title, "MOTIF 01");
});

test("STEP displays shared target length and never follows transport or playhead", () => {
    const state = new LiRythmeState(), clock = new LiRythmeClock(state);
    const actions = new LiRythmeActions(state, clock);
    actions.previousStep();
    assert.equal(readPlayMotif(state).step, "32");
    actions.nextStep();
    assert.equal(readPlayMotif(state).step, "32");
    actions.startPlayback();
    clock.advanceStepPipeline();
    assert.equal(readPlayMotif(state).step, "32");
    for (const selection of [0, 12, null]) {
        state.selectedInstrument = selection;
        assert.equal(readPlayMotif(state).step, "32");
    }
    actions.pausePlayback();
    assert.equal(readPlayMotif(state).step, "32");
    actions.stop();
    assert.equal(readPlayMotif(state).step, "32");
});

test("missing or inconsistent matrix never fabricates duration or step; playhead is irrelevant", () => {
    const state = new LiRythmeState();
    for (const position of [-1, 32, 1.5, NaN, null]) {
        state.playheadPosition = position;
        assert.equal(readPlayMotif(state).step, "32");
    }
    for (const motif of [null, [], [[]], [[false], [false, true]]]) {
        state.motif = motif;
        assert.equal(readPlayMotif(state).title, "MOTIF —");
        assert.equal(readPlayMotif(state).duration, "Non disponible");
        assert.equal(readPlayMotif(state).step, "Non disponible");
    }
});

test("existing PLAY render loop propagates Motif changes read-only and disposes without another scheduler", () => {
    const state = new LiRythmeState(), clock = new LiRythmeClock(state);
    const elements = new Map();
    const document = { getElementById(id) {
        if (!elements.has(id)) elements.set(id, { textContent: "" });
        return elements.get(id);
    } };
    let frame, canceled = false;
    const window = { requestAnimationFrame(fn) { frame = fn; return 1; },
        cancelAnimationFrame() { canceled = true; }, addEventListener() {}, removeEventListener() {} };
    const motif = initializePlayMotifUI({ state, document });
    const ui = initializePlayStatusUI({ state, clock, midiManager: { clockInput: null }, document, window, renderMotif: motif.render });
    const value = key => elements.get(`play-motif-${key}`).textContent;
    assert.equal(value("duration"), "32 STEPS");
    state.playheadPosition = 8;
    state.selectedInstrument = null;
    state.setTargetLength(16);
    const before = structuredClone(state);
    frame();
    assert.equal(value("step"), "16");
    assert.equal(value("duration"), "16 STEPS");
    assert.equal(value("mode"), "Non disponible");
    assert.deepEqual(structuredClone(state), before);
    ui.dispose();
    assert.equal(canceled, true);
});

test("MOTIF layout preserves order, empty CHAIN and reserved clock without controls", async () => {
    const html = await source("index.html");
    const zone = html.slice(html.indexOf('<section id="play-motif"'), html.indexOf('<section id="help-panel"'));
    const positions = ["play-motif-title", "DURATION", "play-motif-clock", ">STEP<", "PLAY MODE", ">CHAIN<"].map(label => zone.indexOf(label));
    assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
    assert.doesNotMatch(zone, /<(button|input|select|textarea|a|canvas|svg|summary)\b|\b(onclick|onkeydown|tabindex|contenteditable)\s*=/i);
    assert.match(zone, /<h3 id="motif-chain-title">CHAIN<\/h3>\s*<div id="play-chain-occurrences"[^>]*><\/div>\s*<\/section>/);
    assert.doesNotMatch(zone, /Position globale du Motif|motif-step-scope/);
    const header = html.slice(html.indexOf('<section id="play-page"'), html.indexOf('<div class="play-zones">'));
    assert.doesNotMatch(header, /play-selected|SELECTION|SELECTED/);
    assert.ok(zone.indexOf('id="play-modulation"') < zone.indexOf('id="play-selection"'));
    for (const field of ["title", "active", "duration", "step", "mode", "chain-occurrences"])
        assert.ok(zone.includes(`id="play-modulation-${field}"`));
    assert.match(zone, /<h3 id="play-selection-title">SELECTION<\/h3>\s*<p id="play-selected"/);
    const footer = zone.match(/<footer id="play-footer-3"[^>]*>([\s\S]*?)<\/footer>/)[1];
    assert.deepEqual([...footer.matchAll(/<span id="play-footer-(\w+)"[^>]*><\/span>/g)].map(match => match[1]),
        ["zone1", "project", "states", "resolution"]);
    assert.equal((footer.match(/<span\b/g) || []).length, 4);
    assert.match(html, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(await source("src/PlayMotifUI.mjs"), /addEventListener|requestAnimationFrame|setInterval|setTimeout|innerHTML/);
    assert.match(await source("src/app.js"), /initializePlayMotifUI\(\{ state \}\)/);
});
