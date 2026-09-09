import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseConfiguration, serializeConfiguration, activateConfiguration, voiceKey, voiceId } from "../src/PadConfigurationFile.mjs";
import storage from "../src/PadConfigurationStorage.cjs";

// Renderer .js files are browser ESM inside a CommonJS Electron package.
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const padURL = moduleURL(await fs.readFile(new URL("../src/PadConfiguration.js", import.meta.url), "utf8"));
const { PadConfiguration } = await import(padURL);
const stateSource = await fs.readFile(new URL("../src/LiRythmeState.js", import.meta.url), "utf8");
const { LiRythmeState } = await import(moduleURL(stateSource.replace('"./PadConfiguration.js"', JSON.stringify(padURL))));

const original = () => new PadConfiguration();
const document = () => JSON.parse(serializeConfiguration(original()));
const parseDoc = doc => parseConfiguration(JSON.stringify(doc));

test("canonical 16 Voices and compatibility round trip", () => {
    const config = original();
    assert.deepEqual(parseConfiguration(serializeConfiguration(config)), { ...config });
    assert.equal(config.voices.length, 16);
    assert.equal(voiceKey(0), "VOICE 01");
    assert.equal(voiceKey(15), "VOICE 16");
    assert.equal(voiceId("VOICE 01"), 0);
    assert.equal(voiceId("VOICE 16"), 15);
    assert.throws(() => voiceId("VOICE 00"));
    assert.throws(() => voiceKey(16));
    assert.ok(config.voices.slice(0, 8).every(v => v.type === "NONE"));
    assert.deepEqual(config.voices.slice(8).map(v => v.note), [39, 40, 43, 44, 36, 37, 38, 41]);
});
for (const [field, valid, invalid] of [
    ["channel", [1, 16], [0, 17, 1.5, "10", null]],
    ["note", [0, 127], [-1, 128, 36.5, "36", null]]
]) {
    for (const value of valid) test(`${field} ${value} accepted`, () => {
        const doc = document(); doc.voices["VOICE 13"][field] = value;
        assert.equal(parseDoc(doc).voices[12][field], value);
    });
    for (const value of invalid) test(`${field} ${JSON.stringify(value)} rejected`, () => {
        const doc = document(); doc.voices["VOICE 13"][field] = value;
        assert.throws(() => parseDoc(doc), new RegExp(`VOICE 13 → ${field}`));
    });
}
for (const [name, edit, pattern] of [
    ["missing Voice", d => delete d.voices["VOICE 12"], /VOICE 12.*manquante/],
    ["extra Voice", d => d.voices["VOICE 17"] = { name: "", type: "NONE" }, /VOICE 17/],
    ["unknown type", d => d.voices["VOICE 04"].type = "MIDI BANANA", /VOICE 04 → type/],
    ["DEVICE", d => d.voices["VOICE 13"].output.mode = "DEVICE", /Seul DEFAULT/],
    ["missing note", d => delete d.voices["VOICE 09"].note, /VOICE 09 → note.*obligatoire/],
    ["missing output", d => delete d.voices["VOICE 09"].output, /VOICE 09 → output/],
    ["bad output", d => d.voices["VOICE 09"].output = [], /VOICE 09 → output/],
    ["NONE extra field", d => d.voices["VOICE 01"].note = 0, /champ non supporté/],
    ["future field", d => d.voices["VOICE 13"].level = 100, /champ non supporté/],
    ["format", d => d.format = "Other", /format/],
    ["version", d => d.version = 2, /version/],
    ["voices array", d => d.voices = [], /voices/],
    ["missing voices", d => delete d.voices, /voices/],
    ["invalid name", d => d.name = null, /name/],
    ["invalid description", d => d.description = 5, /description/],
    ["invalid Voice", d => d.voices["VOICE 01"] = null, /VOICE 01/]
]) test(name, () => { const doc = document(); edit(doc); assert.throws(() => parseDoc(doc), pattern); });

test("JSON errors, BOM, Unicode and string punctuation", () => {
    assert.throws(() => parseConfiguration('{"voices":'), /JSON invalide/);
    assert.throws(() => parseConfiguration("null"), /objet/);
    const config = original();
    config.name = 'Été 🥁 { "name": "a", "name": "b" }';
    config.description = "Français\n日本語";
    assert.deepEqual(parseConfiguration("\uFEFF" + serializeConfiguration(config)), { ...config });
});
test("duplicate keys including escaped Voice keys and nested fields", () => {
    const text = serializeConfiguration(original());
    for (const duplicate of [
        text.replace('"VOICE 12": {', '"VOICE 12": {}, "VOICE 12": {'),
        text.replace('"VOICE 12": {', '"VOICE 12": {}, "VOICE \\u0031\\u0032": {'),
        text.replace('"note": 36', '"note": 35, "note": 36'),
        text.replace('"mode": "DEFAULT"', '"mode": "DEVICE", "mode": "DEFAULT"'),
        text.replace('"version": 1', '"version": 2, "version": 1')
    ]) assert.throws(() => parseConfiguration(duplicate), /clé dupliquée.*ligne.*colonne/);
});
test("invalid LOAD is atomic; valid STOP/PAUSE LOAD preserves all other state", () => {
    for (const transport of ["STOP", "PAUSE", "PLAY"]) {
        const state = new LiRythmeState();
        state.transportState = transport;
        state.motif[0][7] = true; state.motif[12][19] = true;
        state.playheadPosition = 19;
        state.cycles = { count: 4 };
        const previous = state.padConfiguration;
        const motif = state.motif;
        const before = JSON.stringify(state);
        const snapshot = structuredClone({ ...state });
        assert.throws(() => activateConfiguration(state, "invalid"));
        assert.equal(state.padConfiguration, previous);
        assert.equal(JSON.stringify(state), before);
        const changed = original(); changed.voices[12].note = 60;
        if (transport === "PLAY") {
            assert.throws(() => activateConfiguration(state, serializeConfiguration(changed)), /activation refusée/);
            assert.equal(JSON.stringify(state), before);
        } else {
            activateConfiguration(state, serializeConfiguration(changed));
            assert.equal(state.padConfiguration.voices[12].note, 60);
            assert.equal(state.motif, motif);
            const { padConfiguration: ignored, ...rest } = state;
            const { padConfiguration: ignoredBefore, ...restBefore } = snapshot;
            assert.deepEqual(rest, restBefore);
        }
    }
});
test("Settings file association changes only after success; cancellation and PLAY keep previous file", async () => {
    const elements = new Map();
    const element = () => ({ textContent: "", hidden: false, children: [], options: [], selectedIndex: 0,
        listeners: {}, setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; },
        appendChild(child) { this.children.push(child); } });
    const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    let result;
    let savedToken;
    const globals = { document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage };
    let cleanup;
    globalThis.document = { getElementById: get, createElement: element, addEventListener() {} };
    globalThis.localStorage = { getItem: () => null };
    globalThis.window = {
        addEventListener: (name, fn) => { if (name === "pagehide") cleanup = fn; },
        padConfigurationFiles: {
            load: async () => result,
            save: async (_text, token) => { savedToken = token; return result; },
            saveAs: async () => result
        }
    };
    try {
        const source = await fs.readFile(new URL("../src/SettingsUI.js", import.meta.url), "utf8");
        const { initializeSettingsUI } = await import(moduleURL(source.replace('"./PadConfigurationFile.mjs"', JSON.stringify(new URL("../src/PadConfigurationFile.mjs", import.meta.url).href))));
        const state = new LiRythmeState();
        initializeSettingsUI({ state, clock: { source: "INTERNAL" }, actions: {} });
        const click = id => get(id).listeners.click();
        result = { text: serializeConfiguration(original()), file: "original.json", token: "original" };
        await click("pads-load");
        assert.equal(get("pads-file").textContent, "original.json");
        const active = state.padConfiguration;
        result = { text: "invalid", file: "bad.json", token: "bad" };
        await click("pads-load");
        assert.equal(state.padConfiguration, active);
        assert.match(get("pads-status").textContent, /JSON invalide/);
        state.transportState = "PLAY";
        result = { text: serializeConfiguration(original()), file: "other.json", token: "other" };
        await click("pads-load");
        assert.match(get("pads-status").textContent, /activation refusée/);
        assert.equal(state.padConfiguration, active);
        result = { error: "Écriture refusée" };
        await click("pads-save");
        assert.equal(savedToken, "original");
        assert.equal(get("pads-file").textContent, "original.json");
        result = { canceled: true };
        await click("pads-save-as");
        assert.equal(get("pads-file").textContent, "original.json");
        result = { file: "copy.json", token: "copy" };
        await click("pads-save-as");
        await click("pads-save");
        assert.equal(savedToken, "copy");
        assert.equal(get("pads-file").textContent, "copy.json");
        assert.equal(get("pads-load").disabled, false);
    } finally {
        cleanup?.();
        for (const [key, value] of Object.entries(globals)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});
test("UTF-8 file Save/Load, replacement, failed write and temp cleanup", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lirythme-pads-"));
    try {
        const file = path.join(directory, "test.lirythme-pads.json");
        const config = original(); config.description = "Été 🥁";
        await storage.writeConfiguration(file, serializeConfiguration(config));
        assert.deepEqual(parseConfiguration(await storage.readConfiguration(file)), { ...config });
        config.voices[12].note = 60;
        await storage.writeConfiguration(file, serializeConfiguration(config));
        assert.equal(parseConfiguration(await storage.readConfiguration(file)).voices[12].note, 60);
        await fs.writeFile(file, "\uFEFF" + serializeConfiguration(config), "utf8");
        assert.deepEqual(parseConfiguration(await storage.readConfiguration(file)), { ...config });
        const blocked = path.join(directory, "existing-directory");
        await fs.mkdir(blocked);
        await assert.rejects(storage.writeConfiguration(blocked, serializeConfiguration(config)));
        assert.deepEqual((await fs.readdir(directory)).sort(), ["existing-directory", "test.lirythme-pads.json"]);
        assert.deepEqual(parseConfiguration(await storage.readConfiguration(file)), { ...config });
        await fs.writeFile(file, Buffer.from([0xff, 0xfe, 0x61]));
        await assert.rejects(storage.readConfiguration(file));
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test("pending preview Note Off keeps original destination/channel/note after activation", async () => {
    const source = await fs.readFile(new URL("../src/app.js", import.meta.url), "utf8");
    const triggerSource = source.slice(source.indexOf("function triggerMotifStep(step) {"), source.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const state = new LiRythmeState();
    state.transportState = "PAUSE";
    state.motif[12][0] = true;
    state.motif[0][0] = true; // NONE events remain present and silent.
    const messages = [];
    const pending = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${triggerSource}; return triggerMotifStep;`)(
        state, { options: [{ textContent: "Default machine" }], selectedIndex: 0 },
        { send: (output, message) => messages.push([output, message]), findOutput: () => 0 },
        { pulseInstrument() {} }, callback => pending.push(callback)
    );
    trigger(0);
    const changed = original(); changed.voices[12].note = 60; changed.voices[12].channel = 16;
    activateConfiguration(state, serializeConfiguration(changed));
    pending.shift()();
    trigger(0);
    pending.shift()();
    assert.deepEqual(messages, [
        ["Default machine", [0x99, 36, 100]], ["Default machine", [0x99, 36, 0]],
        ["Default machine", [0x9f, 60, 100]], ["Default machine", [0x9f, 60, 0]]
    ]);
    assert.equal(state.motif[0][0], true);
});
