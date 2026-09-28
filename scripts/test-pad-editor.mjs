import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { editPadVoice } from "../src/PadVoiceEditor.mjs";
import { parseConfiguration, serializeConfiguration } from "../src/PadConfigurationFile.mjs";
import { PadLibrarySession } from "../src/PadLibrarySession.mjs";
import { PadConfigurationLibrary } from "../src/PadConfigurationLibrary.cjs";
import { PadConfigurationPreferences } from "../src/PadConfigurationPreferences.cjs";

const example = fileURLToPath(new URL("../docs/examples/DrumBrute Impact.lirythme-pads.json", import.meta.url));
const text = await fs.readFile(example, "utf8");
const stateFor = () => ({ padConfiguration: parseConfiguration(text), transportState: "STOP", motif: Array.from({ length: 16 }, () => Array(32).fill(false)), playheadPosition: 9, cycles: 7, selectedInstrument: 12, tempo: 120, minimumTempo: 20, maximumTempo: 300 });

test("all 16 Voices support edits; valid type transitions preserve names and all musical state", () => {
    const state = stateFor(); state.motif[0][3] = true;
    const motif = state.motif;
    const { padConfiguration: ignored, ...before } = structuredClone(state);
    for (let id = 0; id < 16; id++) {
        editPadVoice(state, id, "name", `Été 🥁 ${id}`);
        editPadVoice(state, id, "type", "NONE");
        assert.deepEqual(state.padConfiguration.voices[id], { id, name: `Été 🥁 ${id}`, type: "NONE" });
        editPadVoice(state, id, "type", "MIDI DRUM");
        assert.deepEqual(state.padConfiguration.voices[id], { id, name: `Été 🥁 ${id}`, type: "MIDI DRUM", output: { mode: "DEFAULT" }, channel: 10, note: 36 });
        editPadVoice(state, id, "channel", id + 1);
        editPadVoice(state, id, "note", id === 0 ? 0 : 127);
        assert.equal(state.padConfiguration.voices[id].channel, id + 1);
        assert.equal(state.padConfiguration.voices[id].note, id === 0 ? 0 : 127);
        assert.deepEqual(parseConfiguration(serializeConfiguration(state.padConfiguration)), state.padConfiguration);
    }
    const { padConfiguration: edited, ...after } = state;
    assert.deepEqual(after, before); assert.equal(state.motif, motif);
});

test("editor uses Phase B errors and invalid edits are atomic", () => {
    const state = stateFor();
    for (const [field, values] of [["channel", [0, 17, 1.5, NaN, "10", null]], ["note", [-1, 128, 1.5, NaN, "42", null]], ["type", ["AUDIO", "MIDI BANANA", ""]], ["name", [null, 42]]]) {
        for (const value of values) {
            const previous = state.padConfiguration;
            assert.throws(() => editPadVoice(state, 12, field, value), new RegExp(`VOICE 13 → ${field}`));
            assert.equal(state.padConfiguration, previous);
        }
    }
    assert.throws(() => editPadVoice(state, 0, "note", 36), /champ non supporté/);
    assert.throws(() => editPadVoice(state, 12, "output", { mode: "DEVICE" }), /non éditable/);
    for (const id of [-1, 16, 1.5]) assert.throws(() => editPadVoice(state, id, "name", "Bad"));
});

test("PLAY rejects every editable parameter synchronously; STOP/PAUSE accept changes", () => {
    const state = stateFor();
    state.transportState = "PLAY";
    const before = structuredClone(state);
    for (const [field, value] of [["name", "Changed"], ["type", "NONE"], ["channel", 1], ["note", 45]]) {
        assert.throws(() => editPadVoice(state, 12, field, value), /PLAY/);
        assert.deepEqual(state, before);
    }
    for (const transport of ["STOP", "PAUSE"]) {
        state.transportState = transport;
        editPadVoice(state, 12, "note", transport === "STOP" ? 42 : 45);
        assert.equal(state.padConfiguration.voices[12].note, transport === "STOP" ? 42 : 45);
    }
});

test("edited note/channel drives playback, old Note Off survives edit and NONE stays silent", async () => {
    const state = stateFor(); state.transportState = "PAUSE"; state.motif[12][0] = true;
    state.getMotif = () => ({ events: state.motif });
    editPadVoice(state, 12, "note", 42);
    const source = await fs.readFile(new URL("../src/app.js", import.meta.url), "utf8");
    const triggerSource = source.slice(source.indexOf("function triggerMotifStep(step) {"), source.indexOf("actions.setStepPreviewHandler(triggerMotifStep)"));
    const messages = [], pending = [];
    const trigger = new Function("state", "midiOutputSelector", "midiManager", "launchpad", "setTimeout", `${triggerSource}; return triggerMotifStep;`)(
        state, { options: [{ textContent: "Default" }], selectedIndex: 0 },
        { send: (output, data) => messages.push([output, data]), findOutput: () => 0 },
        { pulseInstrument() {} }, callback => pending.push(callback)
    );
    trigger(0);
    editPadVoice(state, 12, "note", 45); editPadVoice(state, 12, "channel", 16);
    pending.shift()(); trigger(0);
    editPadVoice(state, 12, "type", "NONE"); pending.shift()(); trigger(0);
    assert.deepEqual(messages, [["Default", [0x99, 42, 100]], ["Default", [0x99, 42, 0]], ["Default", [0x9f, 45, 100]], ["Default", [0x9f, 45, 0]]]);
    assert.equal(state.motif[12][0], true); assert.equal(pending.length, 0);
});

test("edits remain memory-only until SAVE; dirty protection, independent duplicate and disk reload", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lirythme-editor-"));
    try {
        const prefs = new PadConfigurationPreferences(path.join(root, "prefs"), root);
        const library = new PadConfigurationLibrary(path.join(root, "library"), prefs, example);
        const api = { restore: () => library.restore(), activated: token => library.activated(token),
            select: token => library.select(token), create: name => library.newConfiguration(name),
            duplicate: (text, name) => library.create(text, name),
            save: (text, token, expected) => library.save(token, text, expected) };
        const state = stateFor(); const session = new PadLibrarySession(state, api);
        await session.run("restore"); const original = session.active;
        editPadVoice(state, 12, "name", "Cow Bell"); editPadVoice(state, 12, "note", 42);
        assert.equal(session.dirty, true);
        assert.equal(await fs.readFile(original.file, "utf8"), original.text);
        for (const action of ["select", "new", "import", "restore"]) await assert.rejects(session.run(action, { token: original.token, name: "Other" }), /modifiée/);
        await session.run("save"); assert.equal(session.dirty, false);
        editPadVoice(state, 12, "note", 45);
        await session.run("select", { token: original.token, discard: true });
        assert.equal(state.padConfiguration.voices[12].note, 42);
        editPadVoice(state, 12, "note", 45);
        await session.run("duplicate", { name: "Independent copy" });
        assert.equal(state.padConfiguration.voices[12].note, 45);
        assert.equal(session.dirty, false);
        assert.equal(parseConfiguration(await fs.readFile(original.file, "utf8")).voices[12].note, 42);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("integrated UI: 16 pads, values, immediate names/star, invalid input, SAVE and transport lock", async () => {
    const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    const elements = new Map();
    const element = () => ({ textContent: "", value: "", hidden: false, disabled: false, children: [], options: [], selectedIndex: 0, listeners: {}, attrs: {},
        get valueAsNumber() { return this.value.trim() ? Number(this.value) : NaN; },
        setAttribute(name, value) { this.attrs[name] = value; }, focus() { document.activeElement = this; }, scrollIntoView() {},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; } });
    const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    const savedGlobals = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
    const lifecycle = {};
    let disk = text, saves = 0, confirmQuit = false, holdSelect, closed = false;
    const result = () => ({ token: "active", file: "library/preset.json", text: disk, name: parseConfiguration(disk).name });
    globalThis.document = { getElementById: get, createElement: element, addEventListener() {}, activeElement: null };
    const preferences = new Map();
    globalThis.localStorage = { getItem: key => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) };
    globalThis.window = { close: () => { closed = true; }, addEventListener: (name, fn) => { lifecycle[name] = fn; }, padConfigurationFiles: {
        confirmDiscard: async () => ({ confirmed: confirmQuit }),
        restore: async () => result(), list: async () => ({ entries: [result()], directory: "library" }), activated: async () => ({}),
        select: async () => { if (holdSelect) await holdSelect; return result(); },
        save: async saved => { saves++; disk = saved; return result(); }
    } };
    try {
        let librarySource = await fs.readFile(new URL("../src/PadLibraryUI.js", import.meta.url), "utf8");
        librarySource = librarySource.replace('"./PadLibrarySession.mjs"', JSON.stringify(new URL("../src/PadLibrarySession.mjs", import.meta.url).href));
        let source = await fs.readFile(new URL("../src/SettingsUI.js", import.meta.url), "utf8");
        source = source.replace('"./PadLibraryUI.js"', JSON.stringify(moduleURL(librarySource))).replace('"./PadVoiceEditor.mjs"', JSON.stringify(new URL("../src/PadVoiceEditor.mjs", import.meta.url).href));
        const { initializeSettingsUI } = await import(moduleURL(source));
        const state = stateFor(); const ui = initializeSettingsUI({ state, clock: { source: "INTERNAL" },
            actions: { at: { setColorEnabled: enabled => { state.colorEnabled = enabled; } } } });
        await ui.ready;
        assert.equal(get("color-enabled").checked, false);
        get("color-enabled").checked = true; get("color-enabled").listeners.change();
        assert.equal(state.colorEnabled, true); assert.equal(preferences.get("colorEnabled"), "true");
        const choose = id => get("voice-slots").children[id].listeners.click();
        const edit = (field, value) => { const input = get(`voice-${field}`); input.value = String(value); input.listeners[field === "name" ? "input" : "change"](); };
        for (let id = 0; id < 16; id++) {
            choose(id);
            const voice = state.padConfiguration.voices[id];
            assert.equal(get("voice-name").value, voice.name);
            assert.equal(get("voice-type").value, voice.type);
            assert.equal(get("voice-midi-fields").hidden, voice.type === "NONE");
            if (voice.type === "MIDI DRUM") {
                assert.equal(get("voice-channel").value, "10");
                assert.equal(get("voice-note").value, String(voice.note));
            }
        }
        assert.equal(state.selectedInstrument, 12);
        choose(3); assert.equal(get("voice-name").disabled, false);
        edit("name", "FM Drum");
        assert.equal(get("voice-slots").children[3].textContent, "FM Drum");
        assert.match(get("pads-dirty").textContent, /\*/);
        assert.match(get("pads-library").children[0].textContent, /\*/);
        assert.equal(get("pads-save").hidden, false); assert.equal(saves, 0); assert.equal(disk, text);
        edit("name", ""); assert.equal(get("voice-slots").children[3].textContent, "04");
        edit("type", "MIDI DRUM");
        assert.equal(get("voice-midi-fields").hidden, false);
        assert.equal(get("voice-channel").value, "10"); assert.equal(get("voice-note").value, "36");
        edit("channel", "16"); edit("note", "45");
        edit("colorNote", "0"); assert.equal(state.padConfiguration.voices[3].colorNote, 0);
        edit("colorNote", ""); assert.equal(state.padConfiguration.voices[3].colorNote, undefined);
        edit("colorNote", "127"); assert.equal(state.padConfiguration.voices[3].colorNote, 127);
        assert.equal(state.padConfiguration.voices[3].note, 45);
        for (const [field, value] of [["channel", "17"], ["note", "128"], ["note", ""], ["note", "1.5"], ["colorNote", "128"], ["colorNote", "-1"], ["colorNote", "1.5"]]) {
            const previous = state.padConfiguration;
            edit(field, value);
            assert.equal(state.padConfiguration, previous);
            assert.match(get("voice-error").textContent, new RegExp(`VOICE 04 → ${field}`));
            assert.equal(get(`voice-${field}`).value, String(previous.voices[3][field]));
        }
        let prevented = false;
        await lifecycle.beforeunload({ preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
        await get("pads-save").listeners.click();
        assert.equal(saves, 1); assert.equal(get("pads-dirty").textContent, "");
        assert.equal(parseConfiguration(disk).voices[3].note, 45);
        assert.equal(parseConfiguration(disk).voices[3].colorNote, 127);
        state.transportState = "PLAY"; choose(3);
        assert.equal(get("voice-note").disabled, true);
        assert.equal(get("voice-colorNote").disabled, true);
        edit("colorNote", "60"); assert.equal(state.padConfiguration.voices[3].colorNote, 127);
        edit("note", "42"); assert.equal(state.padConfiguration.voices[3].note, 45);
        assert.match(get("voice-error").textContent, /PLAY/);
        state.transportState = "PAUSE"; choose(3);
        assert.equal(get("voice-note").disabled, false);
        edit("type", "NONE"); assert.equal(get("voice-midi-fields").hidden, true);
        assert.deepEqual(state.padConfiguration.voices[3], { id: 3, name: "", type: "NONE" });
        confirmQuit = true;
        await get("pads-revert").listeners.click();
        assert.equal(state.padConfiguration.voices[3].type, "MIDI DRUM");
        let release; holdSelect = new Promise(resolve => { release = resolve; });
        get("pads-library").value = "active";
        const loading = get("pads-library").listeners.change();
        assert.equal(get("voice-name").disabled, true);
        edit("name", "Lost edit"); assert.equal(state.padConfiguration.voices[3].name, "");
        release(); await loading;
        assert.equal(get("voice-name").disabled, false);
        edit("name", "Unsaved");
        await lifecycle.beforeunload({ preventDefault() {} });
        assert.equal(closed, true);
        let canceledAgain = false;
        await lifecycle.beforeunload({ preventDefault() { canceledAgain = true; } });
        assert.equal(canceledAgain, false);
    } finally {
        lifecycle.pagehide?.();
        for (const [key, value] of Object.entries(savedGlobals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    }
});

test("COLOR note configuration: optional independent note, strict validation and legacy roundtrip", () => {
    const state = stateFor();
    const original = state.padConfiguration.voices[12].note;
    for (const note of [0, 17, 127]) {
        editPadVoice(state, 12, "colorNote", note);
        assert.equal(state.padConfiguration.voices[12].note, original);
        assert.equal(parseConfiguration(serializeConfiguration(state.padConfiguration)).voices[12].colorNote, note);
    }
    for (const value of [-1, 128, 2.5, NaN, true, "60"]) {
        const before = state.padConfiguration;
        assert.throws(() => editPadVoice(state, 12, "colorNote", value), /colorNote/);
        assert.equal(state.padConfiguration, before);
    }
    editPadVoice(state, 12, "colorNote", null);
    assert.equal(state.padConfiguration.voices[12].colorNote, undefined);
    assert.deepEqual(state.padConfiguration, parseConfiguration(text));
    const invalid = JSON.parse(serializeConfiguration(state.padConfiguration));
    invalid.voices["VOICE 13"].colorNote = null;
    assert.throws(() => parseConfiguration(JSON.stringify(invalid)), /colorNote/);
});
