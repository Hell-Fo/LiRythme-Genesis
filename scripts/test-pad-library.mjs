import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PadConfigurationLibrary } from "../src/PadConfigurationLibrary.cjs";
import { PadConfigurationPreferences } from "../src/PadConfigurationPreferences.cjs";
import { PadLibrarySession } from "../src/PadLibrarySession.mjs";
import { parseConfiguration, serializeConfiguration } from "../src/PadConfigurationFile.mjs";
import { writeConfiguration } from "../src/PadConfigurationStorage.cjs";

const example = fileURLToPath(new URL("../docs/examples/DrumBrute Impact.lirythme-pads.json", import.meta.url));
const original = await fs.readFile(example, "utf8");
async function fixture(run) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lirythme-library-"));
    const prefs = new PadConfigurationPreferences(path.join(root, "preferences"), root);
    const library = new PadConfigurationLibrary(path.join(root, "library"), prefs, example);
    try { await run({ root, prefs, library }); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
}
const apiFor = library => ({
    restore: () => library.restore(), list: () => library.list(), select: token => library.select(token),
    activated: token => library.activated(token), create: name => library.newConfiguration(name),
    duplicate: (text, name) => library.create(text, name),
    save: (text, token, expectedText) => library.save(token, text, expectedText)
});
const stateFor = () => ({ padConfiguration: parseConfiguration(original), transportState: "STOP", motif: [[true, false, true]], playheadPosition: 2, cycles: 9 });

test("first startup creates real compatibility file, remembers selection and restores after restart", () => fixture(async ({ root, prefs, library }) => {
    const state = stateFor(); const before = structuredClone(state);
    const session = new PadLibrarySession(state, apiFor(library));
    await session.run("restore");
    assert.equal(path.dirname(session.active.file), library.directory);
    assert.deepEqual(parseConfiguration(await fs.readFile(session.active.file, "utf8")), state.padConfiguration);
    assert.deepEqual(state.motif, before.motif); assert.equal(state.cycles, before.cycles);
    const created = await session.run("new", { name: "Eurorack" });
    const restartedPrefs = new PadConfigurationPreferences(path.join(root, "preferences"), root);
    await restartedPrefs.load();
    const restarted = new PadConfigurationLibrary(library.directory, restartedPrefs, example);
    assert.equal((await restarted.restore()).file, created.file);
    assert.equal(prefs.values.lastActiveFile, created.file);
}));

test("legacy external active configuration migrates once into independent library copy", () => fixture(async ({ root, prefs, library }) => {
    const outside = path.join(root, "external.lirythme-pads.json");
    await fs.writeFile(outside, original);
    await prefs.update({ lastActiveFile: outside });
    const restored = await library.restore();
    assert.notEqual(restored.file, outside);
    assert.equal(path.dirname(restored.file), library.directory);
    await library.activated(restored.token);
    await fs.writeFile(outside, "invalid");
    assert.equal((await library.restore()).file, restored.file);
    assert.equal((await library.list()).entries.length, 1);
}));

test("NEW has exactly 16 NONE voices; DUPLICATE preserves data and never overwrites same names", () => fixture(async ({ library }) => {
    const empty = await library.newConfiguration("Test");
    const config = parseConfiguration(empty.text);
    assert.equal(config.voices.length, 16);
    assert.ok(config.voices.every(v => v.type === "NONE"));
    const a = await library.create(original, "DrumBrute Impact TEST");
    const b = await library.create(a.text, "DrumBrute Impact TEST");
    assert.notEqual(a.file, b.file);
    assert.deepEqual(parseConfiguration(a.text).voices, parseConfiguration(original).voices);
    const edit = parseConfiguration(b.text); edit.voices[12].note = 60;
    await library.save(b.token, serializeConfiguration(edit), b.text);
    assert.equal((await library.select(a.token)).text, a.text);
    for (const name of ["", "  ", null, undefined, "x".repeat(121)]) await assert.rejects(library.newConfiguration(name), /nom/);
    const unusual = await library.newConfiguration("../CON: test");
    assert.equal(path.dirname(unusual.file), library.directory);
}));

test("IMPORT validates BOM/Unicode, copies independently, rejects syntax/semantic/duplicate errors", () => fixture(async ({ root, library }) => {
    const outside = path.join(root, "external.lirythme-pads.json");
    const config = parseConfiguration(original); config.name = "Été 🥁";
    await fs.writeFile(outside, "\uFEFF" + serializeConfiguration(config));
    const imported = await library.importFile(outside);
    assert.equal(imported.name, config.name);
    for (const bad of ["{", original.replace('"note": 36', '"note": 128'), original.replace('"VOICE 12": {', '"VOICE 12": {}, "VOICE 12": {')]) {
        await fs.writeFile(outside, bad);
        await assert.rejects(library.importFile(outside));
        assert.equal((await library.list()).entries.length, 1);
    }
    assert.equal((await library.select(imported.token)).text, imported.text);
}));

test("manual files appear on refresh; invalid presets are diagnosed and cannot replace active state", () => fixture(async ({ library }) => {
    const active = await library.restore();
    const manual = path.join(library.directory, "manual.lirythme-pads.json");
    await fs.writeFile(manual, original);
    let result = await library.list();
    assert.equal(result.entries.length, 2);
    const entry = result.entries.find(e => e.file === manual);
    assert.equal((await library.select(entry.token)).file, manual);
    await fs.writeFile(manual, original.replace('"note": 36', '"note": 128'));
    result = await library.list();
    assert.equal(result.entries.length, 1);
    assert.match(result.warning, /manual.*VOICE 13 → note/s);
    await assert.rejects(library.select(entry.token), /VOICE 13/);
    assert.equal((await library.select(active.token)).text, active.text);
    await assert.rejects(library.select(manual), /inconnue/);
    await assert.rejects(library.select("../outside"), /inconnue/);
}));

test("IMPORT preserves all valid Phase B names including empty, whitespace and long Unicode", () => fixture(async ({ root, library }) => {
    const file = path.join(root, "source.lirythme-pads.json");
    for (const name of ["", "  ", "🥁".repeat(150)]) {
        const config = parseConfiguration(original); config.name = name;
        await fs.writeFile(file, serializeConfiguration(config));
        const imported = await library.importFile(file);
        assert.equal(imported.name, name);
        assert.deepEqual(parseConfiguration(imported.text), config);
    }
}));

test("missing/corrupt last preset falls back to real file; corrupt default is preserved", () => fixture(async ({ prefs, library }) => {
    const first = await library.restore();
    await library.activated(first.token);
    await fs.writeFile(first.file, "broken");
    const recovered = await library.restore();
    assert.notEqual(recovered.file, first.file);
    assert.equal(await fs.readFile(first.file, "utf8"), "broken");
    assert.match(recovered.warning, /indisponible/);
    await library.activated(recovered.token);
    await fs.unlink(recovered.file);
    const missing = await library.restore();
    assert.match(missing.warning, /indisponible/);
    assert.ok(missing.text);
    assert.equal(prefs.values.lastActiveFile, recovered.file); // Read alone never claims activation.
}));

test("SAVE rejects external edits and invalid content; exclusive publication preserves target", () => fixture(async ({ library }) => {
    const active = await library.restore();
    await assert.rejects(library.save(active.token, "invalid", active.text), /JSON invalide/);
    assert.equal((await library.select(active.token)).text, active.text);
    const external = parseConfiguration(active.text); external.voices[12].note = 60;
    await fs.writeFile(active.file, serializeConfiguration(external));
    await assert.rejects(library.save(active.token, active.text, active.text), /changements externes/);
    await assert.rejects(writeConfiguration(active.file, original, { exclusive: true }), { code: "EEXIST" });
    assert.equal(parseConfiguration(await fs.readFile(active.file, "utf8")).voices[12].note, 60);
    assert.ok((await fs.readdir(library.directory)).every(name => !name.endsWith(".tmp")));
}));

test("unavailable library returns error without modifying compatibility or Motif", () => fixture(async ({ root, prefs }) => {
    const blocked = path.join(root, "blocked"); await fs.writeFile(blocked, "file");
    const library = new PadConfigurationLibrary(blocked, prefs, example);
    const state = stateFor(); const before = structuredClone(state);
    const session = new PadLibrarySession(state, apiFor(library));
    await assert.rejects(session.run("restore"));
    assert.deepEqual(state, before); assert.equal(session.active, null);
}));

test("selection is atomic, refuses PLAY including async race, remembers only accepted activation", () => fixture(async ({ library, prefs }) => {
    const state = stateFor(); const motif = state.motif;
    const api = apiFor(library); const session = new PadLibrarySession(state, api);
    await session.run("restore");
    const initial = session.active;
    const other = await library.newConfiguration("Other");
    state.transportState = "PLAY";
    for (const action of ["select", "new", "duplicate", "import"]) await assert.rejects(session.run(action, { token: other.token, name: "Test" }), /PLAY/);
    state.transportState = "PAUSE";
    api.select = async token => { const result = await library.select(token); state.transportState = "PLAY"; return result; };
    await assert.rejects(session.run("select", { token: other.token }), /PLAY/);
    assert.equal(session.active, initial);
    assert.equal(prefs.values.lastActiveFile, initial.file);
    state.transportState = "PAUSE"; api.select = token => library.select(token);
    await session.run("select", { token: other.token });
    assert.equal(session.active.file, other.file); assert.equal(state.motif, motif);
    assert.equal(state.playheadPosition, 2); assert.equal(state.cycles, 9);
    assert.equal(prefs.values.lastActiveFile, other.file);
}));

test("dirty state blocks accidental loss, duplicate preserves edits, save/revert clear dirty", () => fixture(async ({ library }) => {
    const state = stateFor(); const session = new PadLibrarySession(state, apiFor(library));
    await session.run("restore");
    const initial = session.active;
    state.padConfiguration.voices[12].note = 60;
    assert.equal(session.dirty, true);
    await assert.rejects(session.run("new", { name: "Other" }), /modifiée/);
    await session.run("duplicate", { name: "Edited copy" });
    assert.equal(session.dirty, false);
    assert.equal(state.padConfiguration.voices[12].note, 60);
    assert.equal((await library.select(initial.token)).text, initial.text);
    state.padConfiguration.voices[12].note = 61;
    await session.run("save"); assert.equal(session.dirty, false);
    state.padConfiguration.voices[12].note = 62;
    await session.run("select", { token: session.active.token, discard: true });
    assert.equal(state.padConfiguration.voices[12].note, 61);
    assert.equal(session.dirty, false);
}));

test("cancelled import, failed save and preference failures preserve honest state", () => fixture(async ({ library }) => {
    const state = stateFor(); const api = apiFor(library);
    const session = new PadLibrarySession(state, api); await session.run("restore");
    const initial = session.active;
    api.import = async () => ({ canceled: true });
    assert.equal((await session.run("import")).canceled, true); assert.equal(session.active, initial);
    state.padConfiguration.voices[12].note = 60;
    api.save = async () => ({ error: "Write failed" });
    await assert.rejects(session.run("save"), /Write failed/);
    assert.equal(session.active, initial); assert.equal(session.dirty, true);
    api.activated = async () => { throw new Error("Preferences failed"); };
    const result = await session.run("duplicate", { name: "Copy" });
    assert.match(result.warning, /Preferences failed/);
    assert.equal(session.active.file, result.file); assert.equal(session.dirty, false);
}));

test("dirty edits made during asynchronous SAVE remain marked; concurrent actions refused", () => fixture(async ({ library }) => {
    const state = stateFor(); const api = apiFor(library);
    const session = new PadLibrarySession(state, api); await session.run("restore");
    const save = api.save; let release;
    api.save = async (...args) => { await new Promise(resolve => { release = resolve; }); return save(...args); };
    state.padConfiguration.voices[12].note = 60;
    const pending = session.run("save");
    state.padConfiguration.voices[12].note = 61;
    await assert.rejects(session.run("new", { name: "Other" }), /déjà en cours/);
    release(); await pending;
    assert.equal(session.dirty, true);
    assert.equal(parseConfiguration(session.active.text).voices[12].note, 60);
    assert.equal(state.padConfiguration.voices[12].note, 61);
}));

test("IPC rejects other senders/frames; IMPORT remembers directory and cancellation writes nothing", async () => {
    const source = await fs.readFile(new URL("../main.js", import.meta.url), "utf8");
    const start = source.indexOf('ipcMain.handle("pad-configuration-file"');
    const end = source.indexOf("\nlet mainWindow;", start);
    let handler;
    const mainFrame = {}; const webContents = { mainFrame };
    const event = { sender: webContents, senderFrame: mainFrame };
    let selected = { canceled: true }; const calls = [];
    const prefs = { dialogDirectory: async () => "remembered", update: async values => { calls.push(values); } };
    const library = { importFile: async file => { calls.push(file); return { text: original }; } };
    new Function("ipcMain", "mainWindow", "padLibrary", "padPreferences", "dialog", "path", `let padFileBusy = false; let padPreferencesWarning; ${source.slice(start, end)}`)(
        { handle: (_channel, fn) => { handler = fn; } }, { webContents }, library, prefs,
        { showOpenDialog: async (_window, options) => { assert.equal(options.defaultPath, "remembered"); return selected; },
            showMessageBox: async (_window, options) => { assert.equal(options.cancelId, 0); return { response: 1 }; } }, path
    );
    await assert.rejects(handler({ sender: {} }, { action: "list" }), /Unauthorized/);
    await assert.rejects(handler({ sender: webContents, senderFrame: {} }, { action: "list" }), /Unauthorized/);
    assert.equal((await handler(event, { action: "import" })).canceled, true);
    assert.equal(calls.length, 0);
    selected = { filePaths: [path.join(os.tmpdir(), "preset.lirythme-pads.json")] };
    assert.equal((await handler(event, { action: "import" })).text, original);
    assert.deepEqual(calls[0], { lastDirectory: os.tmpdir() });
    assert.ok((await handler(event, { action: "arbitrary-read", file: "secret" })).error);
    assert.equal((await handler(event, { action: "confirmDiscard", reason: "close" })).confirmed, true);
    assert.equal((await handler(event, { action: "confirmDiscard", reason: "reload" })).confirmed, true);
    assert.ok((await handler(event, { action: "confirmDiscard", reason: "arbitrary" })).error);
});
