import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readPlayMotif, initializePlayMotifUI } from "../src/PlayMotifUI.mjs";
import { initializePlayStatusUI } from "../src/PlayStatusUI.mjs";

const source = file => fs.readFile(new URL(`../${file}`, import.meta.url), "utf8");
const url = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const pad = url(await source("src/PadConfiguration.js"));
const { LiRythmeState } = await import(url((await source("src/LiRythmeState.js")).replace('"./PadConfiguration.js"', JSON.stringify(pad))));
const { LiRythmeClock } = await import(url(await source("src/LiRythmeClock.js")));
const { LiRythmeActions } = await import(url(await source("src/LiRythmeActions.js")));

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
    const zone = html.slice(html.indexOf('<section id="play-motif"'), html.indexOf('</main>'));
    const positions = ["play-motif-title", "DURATION", "GRAPHIC CLOCK", ">STEP<", "PLAY MODE", ">CHAIN<"].map(label => zone.indexOf(label));
    assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
    assert.doesNotMatch(zone, /<(button|input|select|textarea|a|canvas|svg|summary)\b|\b(onclick|onkeydown|tabindex|contenteditable)\s*=/i);
    assert.match(zone, /<h3 id="motif-chain-title">CHAIN<\/h3>\s*<\/section>/);
    assert.doesNotMatch(zone, /Position globale du Motif|motif-step-scope/);
    const header = html.slice(html.indexOf('<section id="play-page"'), html.indexOf('<div class="play-zones">'));
    assert.doesNotMatch(header, /play-selected|SELECTION|SELECTED/);
    assert.ok(zone.indexOf('id="play-modulation"') < zone.indexOf('id="play-selection"'));
    assert.match(zone, /<h3 id="play-modulation-title">MODULATION<\/h3>\s*<\/section>/);
    assert.match(zone, /<h3 id="play-selection-title">SELECTION<\/h3>\s*<p id="play-selected"/);
    const footer = zone.match(/<footer id="play-footer-3"[^>]*>([\s\S]*?)<\/footer>/)[1];
    assert.deepEqual([...footer.matchAll(/<span id="play-footer-(\w+)"[^>]*><\/span>/g)].map(match => match[1]),
        ["zone1", "project", "states", "resolution"]);
    assert.equal((footer.match(/<span\b/g) || []).length, 4);
    assert.match(html, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(await source("src/PlayMotifUI.mjs"), /addEventListener|requestAnimationFrame|setInterval|setTimeout|innerHTML/);
    assert.match(await source("src/app.js"), /initializePlayMotifUI\(\{ state \}\)/);
});
