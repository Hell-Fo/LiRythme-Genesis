import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createVelocities } from "../src/ATTransaction.mjs";
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from "../src/MotifBankFormat.mjs";
import { readATPanel } from "../src/PlayATUI.mjs";

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
async function load(file, imports = {}) {
    let text = await source(file);
    text = text.replace('"./LaunchpadATInput.mjs"', JSON.stringify(new URL("../src/hardware/launchpad/LaunchpadATInput.mjs", import.meta.url).href));
    imports["./ATTransaction.mjs"] = new URL("../src/ATTransaction.mjs", import.meta.url).href;
    for (const [name, value] of Object.entries(imports)) text = text.replace(JSON.stringify(name), JSON.stringify(value));
    return `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
}
const { LiRythmeState } = await import(await load("LiRythmeState.js", { "./PadConfiguration.js": await load("PadConfiguration.js") }));
const { LiRythmeActions } = await import(await load("LiRythmeActions.js"));
const { LiRythmeClock } = await import(await load("LiRythmeClock.js"));
const imports = {};
for (const file of ["LaunchpadMapping.js", "LaunchpadColors.js", "GenesisLayout.js"]) {
    imports[`./${file}`] = await load(`hardware/launchpad/${file}`);
}
const { LaunchpadMini } = await import(await load("hardware/launchpad/LaunchpadMini.js", imports));
function setup(t) {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const state = new LiRythmeState(), clock = new LiRythmeClock(state), actions = new LiRythmeActions(state, clock);
    const leds = new Map();
    const c = new LaunchpadMini({ send: (_, [status, note, color]) => leds.set(`${status}:${note}`, color) }, state, actions, "LP");
    const press = (note, status = 0x90) => c.handleMidiMessage([status, note, 127]);
    const release = (note, status = 0x90) => c.handleMidiMessage([status, note, 0]);
    const tap = (note, status = 0x90) => { press(note, status); release(note, status); };
    const begin = () => { state.currentView = "PLAY"; tap(68); assert.ok(state.atTransaction); };
    t.after(() => c.resetInputState());
    return { state, clock, actions, c, leds, press, release, tap, begin };
}
function drainAT(t, c) {
    for (let i = 0; (c.atLEDQueue.size || c.instrumentFeedbackPending) && i < 32; i++) t.mock.timers.tick(4);
    assert.equal(c.atLEDQueue.size, 0);
}
import { mutateMotif, MUTATION_METHODS } from "../src/Mutation.mjs";
import { composeGroove } from "../src/GrooveMorph.mjs";
import { readPlayChain, initializePlayChainUI } from "../src/PlayChainUI.mjs";

test('Groove Morph Book cycles GREEN/AMBER/RED, DIM idle, FULL selected/playing, and stops on exit/reset', t => {
    const { state, c, leds } = setup(t);
    state.getMotif(1).grooveMorph = { level: 0 };
    state.getMotif(2).grooveMorph = { level: 7 };
    state.currentView = 'MOTIF_LIBRARY'; state.playingMotifId = 1;
    c.drawBooks();
    const led = id => leds.get(`144:${c.mapping.BOOKS[id]}`);
    const color = name => (c.colors[name] & 0x33) | 4;
    for (const [full, dim] of [['GREEN', 'DIM_GREEN'], ['AMBER', 'DIM_AMBER'], ['RED', 'DIM_RED'], ['GREEN', 'DIM_GREEN']]) {
        assert.equal(led(1), color(full)); assert.equal(led(2), color(dim));
        t.mock.timers.tick(400);
    }
    state.chainEnabled = true; state.chain = [1, 2]; state.chainPlayingIndex = 0;
    state.chainPlayingDetached = false; state.transportState = 'PLAY';
    state.chainFocus = true; state.viewMotifId = 2;
    c.drawBooks();
    assert.equal(c.getLibraryMotifColor(1), c.getLibraryMotifColor(2));
    state.currentView = 'PLAY'; c.drawBooks();
    assert.equal(c.grooveColorTimer, null);
    state.currentView = 'MOTIF_LIBRARY'; c.drawBooks();
    assert.notEqual(c.grooveColorTimer, null);
    c.resetInputState(); assert.equal(c.grooveColorTimer, null);
});

test('PLAY chain uses [GM] labels with existing occurrence styling and updates after conversion', () => {
    const state = new LiRythmeState();
    state.chain = [0, 1, 4, 1]; state.getMotif(1).grooveMorph = { level: 3 };
    state.chainEnabled = true; state.chainPlayingDetached = false; state.chainPlayingIndex = 1;
    state.transportState = 'PLAY'; state.chainLoopMasterIndex = 3;
    const occurrences = readPlayChain(state);
    assert.deepEqual(occurrences.map(o => o.label), ['[01]', '[GM]', '[05]', '[GM]']);
    assert.equal(occurrences[1].playing, true); assert.equal(occurrences[3].loopMaster, true);
    const container = { replaceChildren(...children) { this.children = children; } };
    const document = { getElementById: id => id === 'play-chain-occurrences' ? container : null,
        createElement: () => ({}) };
    const ui = initializePlayChainUI({ state, system: 'MOTIF', document });
    assert.equal(container.children[1].className, 'chain-occurrence is-playing is-entry');
    delete state.getMotif(1).grooveMorph; ui.render();
    assert.equal(container.children[1].textContent, '[02]');
});

for (let level = 0; level < 8; level++) test(`Groove Morph ${level}: identical neighbors vary reproducibly with shared landmarks`, () => {
    const state = new LiRythmeState(), a = phrase(state), original = structuredClone(a);
    const recipe = structuredClone(state.getMotif(1)); recipe.grooveMorph = { level }; recipe.motifLength = 16;
    const morph = composeGroove(a, a, recipe);
    assert.deepEqual(morph, composeGroove(a, a, recipe));
    assert.deepEqual(a, original);
    assert.notDeepEqual(morph.velocities, a.velocities);
    for (let voice = 0; voice < 2; voice++) for (const step of [0, 2, 4]) {
        if (a.events[voice][step]) assert.equal(morph.events[voice][step], true);
    }
    assert.equal(morph.motifLength, 16);
    assert.equal(morph.grooveMorph, undefined);
    validateMotifBank({ format: 'lirythme-motif-bank', version: 1, currentMotifId: 0,
        motifs: [morph, ...state.motifs.slice(1)] });
});

test('Groove Morph hardware: Shift+Mutation, choose empty Book, A-H, commit and reopen/cancel', t => {
    const { state, actions, c, press, release, tap } = setup(t);
    phrase(state); state.currentView = 'MOTIF_LIBRARY';
    press(c.mapping.TOP_CONTROLS.SHIFT, 0xB0);
    tap(c.mapping.TOP_CONTROLS.MUTATION, 0xB0);
    release(c.mapping.TOP_CONTROLS.SHIFT, 0xB0);
    assert.equal(state.atTransaction.kind, 'GROOVE_MORPH');
    tap(c.mapping.BOOKS[1]); tap(c.mapping.AT_VALUE[6]);
    assert.deepEqual(state.getMotif(1).grooveMorph, { level: 6 });
    assert.equal(snapshotMotifBank(state).motifs[1].grooveMorph, undefined);
    press(c.mapping.TOP_CONTROLS.MUTATION, 0xB0); t.mock.timers.tick(300); release(c.mapping.TOP_CONTROLS.MUTATION, 0xB0);
    assert.equal(state.atTransaction, null);
    const bank = snapshotMotifBank(state); restoreMotifBank(state, bank);
    assert.deepEqual(state.getMotif(1).grooveMorph, { level: 6 });
    state.currentView = 'PLAY'; state.playingMotifId = 1;
    assert.equal(actions.at.beginGrooveMorph(), true);
    actions.at.apply(7); actions.at.finish(false);
    assert.deepEqual(state.getMotif(1).grooveMorph, { level: 6 });
    state.playingMotifId = 0;
    assert.equal(actions.at.beginGrooveMorph(), false);
    state.playingMotifId = 1;
    const copy = actions.captureMotifCopy(1);
    assert.equal(actions.applyMotifCopy(copy, 2), true);
    assert.deepEqual(state.getMotif(2).grooveMorph, { level: 6 });
    state.chainEnabled = true; state.chain = [2];
    actions.deleteChainMotif(2);
    assert.equal(state.getMotif(2).grooveMorph, undefined);
});

test('Groove Morph occurrence context, stable passes, deferred source changes and variable duration', t => {
    const { state, actions } = setup(t);
    const a = phrase(state); state.motifs[2] = structuredClone(a); state.motifs[3] = structuredClone(a);
    state.motifs[3].events[2][7] = true;
    state.getMotif(1).grooveMorph = { level: 0 }; state.getMotif(1).motifLength = 8;
    state.chain = [0, 1, 2, 1, 3]; state.chainEnabled = true; state.chainPlayingDetached = false;
    state.playingMotifId = 1; state.chainPlayingIndex = 1; state.transportState = 'PLAY';
    const first = structuredClone(state.getPlaybackMotifForVoice(0));
    assert.equal(state.getMotifDuration(), 8);
    state.playheadPosition = 4; state.getMotif(2).velocities[0][2] = 23;
    assert.deepEqual(state.getPlaybackMotifForVoice(0), first);
    state.playheadPosition = 0;
    const updated = structuredClone(state.getPlaybackMotifForVoice(0));
    assert.notDeepEqual(updated, first);
    assert.deepEqual(state.getPlaybackMotifForVoice(0), updated);
    state.chainPlayingIndex = 3;
    const second = state.getPlaybackMotifForVoice(0);
    assert.notDeepEqual(second, updated);
    assert.equal(second.events[2][7], true);
    assert.equal(state.getMotif(1).events.flat().some(Boolean), false);
    state.transportState = 'STOP';
    actions.at.beginGrooveMorph(); actions.at.apply(7); actions.at.finish(false);
    assert.deepEqual(state.getMotif(1).grooveMorph, { level: 0 });
});

function phrase(state) {
    const m = state.getMotif(0);
    m.motifLength = 16; m.voiceLengths[0] = 8; m.voiceLengths[1] = 7;
    for (const s of [0, 2, 4]) m.events[0][s] = true;
    for (const s of [0, 3, 5]) m.events[1][s] = true;
    m.velocities = createVelocities();
    m.colors = Array.from({ length: 16 }, () => Array(32).fill(false));
    m.swings = Array.from({ length: 16 }, () => Array(32).fill(null));
    m.ratchets = Array.from({ length: 16 }, () => Array(32).fill(null));
    m.atDestinations = { SWING: Array.from({ length: 16 }, () => Array(32).fill(null)) };
    for (let v = 0; v < 2; v++) for (let s = 0; s < 8; s++) if (m.events[v][s]) {
        m.velocities[v][s] = s === 0 ? 127 : 70 + s;
        m.colors[v][s] = true; m.swings[v][s] = 63; m.ratchets[v][s] = 3;
        m.atDestinations.SWING[v][s] = "STEP";
    }
    return m;
}
const count = m => m.events.flat().filter(Boolean).length;

for (let index = 0; index < 8; index++) test(`Mutation ${MUTATION_METHODS[index]} is repeatable, bounded and transports complete events`, () => {
    const state = new LiRythmeState(), source = phrase(state), before = structuredClone(source);
    const result = mutateMotif(source, index);
    assert.deepEqual(source, before); assert.deepEqual(result, mutateMotif(source, index));
    assert.notDeepEqual(result.events, source.events);
    assert.equal(result.motifLength, 16); assert.deepEqual(result.voiceLengths, source.voiceLengths);
    if (![0, 2, 3].includes(index)) assert.equal(count(result), count(source));
    if ([0, 2].includes(index)) assert.ok(count(result) > count(source));
    if (index === 3) assert.ok(count(result) < count(source));
    for (let v = 0; v < 16; v++) for (let s = 0; s < 32; s++) {
        if (result.events[v][s]) {
            assert.ok(v < 2); assert.ok(s < source.voiceLengths[v]);
            assert.equal(result.colors[v][s], true); assert.equal(result.swings[v][s], 63);
            assert.equal(result.ratchets[v][s], 3); assert.equal(result.atDestinations.SWING[v][s], "STEP");
            assert.ok([127, 72, 74, 73, 75].includes(result.velocities[v][s]));
        } else {
            assert.equal(result.colors[v][s], false); assert.equal(result.swings[v][s], null);
            assert.equal(result.ratchets[v][s], null); assert.equal(result.atDestinations.SWING[v][s], null);
        }
    }
    assert.equal(result.events[0][0], true); assert.equal(result.events[1][0], true);
});

test('Mutation handles empty/full/one-step cycles and preserves data beyond explicit boundaries', () => {
    for (const length of [1, 2, 3, 5, 16, 32, null]) for (const full of [false, true]) {
        const state = new LiRythmeState(), m = state.getMotif(0);
        m.motifLength = length; m.events[0].fill(full); m.events[1][31] = true;
        for (let i = 0; i < 8; i++) {
            const result = mutateMotif(m, i);
            assert.equal(result.motifLength, length); assert.deepEqual(result.voiceLengths, m.voiceLengths);
            if (length !== null && length < 32) assert.deepEqual(result.events.map(row => row.slice(length)), m.events.map(row => row.slice(length)));
        }
    }
    const m = new LiRythmeState().getMotif(0);
    for (const value of [-1, 8, 1.5, null]) assert.equal(mutateMotif(m, value), null);
});

for (const transport of ['STOP', 'PAUSE', 'PLAY']) test(`Mutation button, blink, A-H ownership and short CANCEL in ${transport}`, t => {
    const f = setup(t), { state, actions, c, tap, leds, clock } = f;
    const original = structuredClone(phrase(state)); state.transportState = transport;
    const revision = clock.transportRevision;
    tap(c.mapping.TOP_CONTROLS.MUTATION, 0xB0); drainAT(t, c);
    assert.equal(state.atTransaction.kind, 'MUTATION');
    for (const note of c.mapping.AT_VALUE) assert.equal(leds.get(`144:${note}`) & 0x33, c.colors.DIM_AMBER & 0x33);
    assert.equal(leds.get('176:109') & 0x33, c.colors.RED & 0x33);
    t.mock.timers.tick(160); drainAT(t, c);
    assert.equal(leds.get('176:109') & 0x33, c.colors.DIM_RED & 0x33);
    tap(c.mapping.AT_VALUE[7]); const first = structuredClone(state.getMotif(0));
    tap(c.mapping.AT_VALUE[2]); tap(c.mapping.AT_VALUE[7]);
    assert.deepEqual(state.getMotif(0), first);
    assert.equal(readATPanel(state).name, 'MUTATION'); assert.equal(readATPanel(state).selected, 7);
    assert.deepEqual(readATPanel(state).values, MUTATION_METHODS);
    for (const note of [...c.mapping.INSTRUMENTS, ...c.mapping.MOTIF, ...c.mapping.BOOKS]) tap(note);
    assert.deepEqual(state.getMotif(0), first); assert.equal(state.atTransaction.instruments.size, 0);
    assert.equal(c.deleteArmed, false); assert.equal(c.copyStage, null);
    tap(c.mapping.TOP_CONTROLS.MUTATION, 0xB0);
    assert.equal(state.atTransaction, null); assert.deepEqual(state.getMotif(0), original);
    assert.equal(clock.transportRevision, revision); assert.equal(state.playheadPosition, 0);
    assert.equal(actions.at.apply(0), false);
});

test('Mutation long hold commits once; provisional autosave restores BEGIN and persisted result is ordinary Motif', t => {
    const { state, c, tap, press, release } = setup(t); const original = structuredClone(phrase(state));
    let saves = 0; state.onBankChange = () => saves++;
    state.currentView = 'MOTIF_LIBRARY';
    tap(109, 0xB0); tap(c.mapping.AT_VALUE[0]);
    const result = structuredClone(state.getMotif(0));
    assert.deepEqual(snapshotMotifBank(state).motifs[0], original); assert.equal(saves, 0);
    press(109, 0xB0); press(109, 0xB0); t.mock.timers.tick(300);
    assert.equal(state.atTransaction, null); assert.equal(saves, 1);
    release(109, 0xB0); assert.deepEqual(state.getMotif(0), result);
    const fresh = new LiRythmeState(); restoreMotifBank(fresh, snapshotMotifBank(state));
    assert.deepEqual(fresh.getMotif(0), result); validateMotifBank(snapshotMotifBank(state));
});

for (const cancelAfterEntry of [false, true]) test(`Mutation/CANCEL preserve engaged geometry (${cancelAfterEntry ? 'after' : 'before'} entry)`, t => {
    const { state, actions, clock } = setup(t); phrase(state); state.motifLength = 4;
    state.transportState = 'PLAY'; state.playheadPosition = 1;
    const original = structuredClone(state.getMotif(0));
    const revision = clock.transportRevision;
    actions.at.beginMutation(); actions.at.apply(7);
    const variation = structuredClone(state.getMotif(0));
    assert.deepEqual(state.getPlaybackMotifForVoice(0), original);
    if (cancelAfterEntry) {
        for (let i = 0; i < 3; i++) actions.nextStep();
        assert.deepEqual(state.getPlaybackMotifForVoice(0), variation);
    }
    actions.at.finish(false);
    assert.deepEqual(state.getMotif(0), original);
    assert.deepEqual(state.getPlaybackMotifForVoice(0), cancelAfterEntry ? variation : original);
    for (let i = 0; i < (cancelAfterEntry ? 4 : 3); i++) actions.nextStep();
    assert.deepEqual(state.getPlaybackMotifForVoice(0), original); assert.equal(clock.transportRevision, revision);
});

test('Chain captures PLAYING on press, keeps target across entries and saves only that motif', t => {
    const { state, actions, c, press, release, tap } = setup(t); phrase(state);
    state.motifLength = 2; state.chainEnabled = true; state.chain = [0, 1];
    state.chainPlayingIndex = 0; state.chainPlayingDetached = false;
    state.transportState = 'PLAY'; state.playheadPosition = 1;
    const other = structuredClone(state.getMotif(1));
    press(109, 0xB0); actions.nextStep(); release(109, 0xB0);
    assert.equal(state.playingMotifId, 1); assert.equal(state.atTransaction.editingMotifId, 0);
    tap(c.mapping.AT_VALUE[2]); assert.equal(readATPanel(state).motif, 1);
    assert.deepEqual(state.getMotif(1), other); assert.equal(state.liveLengthCycle, null);
    actions.at.finish(true); assert.deepEqual(state.chain, [0, 1]);
});

test('FOCUS targets VIEW without moving PLAYING; stopped arrows preview the captured mutated target', t => {
    const { state, actions, tap } = setup(t); phrase(state);
    state.motifs[1] = structuredClone(state.getMotif(0)); state.chain = [0, 1]; state.chainEnabled = true;
    state.chainFocus = true; state.viewMotifId = 1; state.transportState = 'PLAY';
    const playing = structuredClone(state.getMotif(0));
    tap(109, 0xB0); actions.at.apply(0);
    assert.equal(state.atTransaction.editingMotifId, 1); assert.equal(state.playingMotifId, 0);
    assert.deepEqual(state.getMotif(0), playing); assert.equal(state.liveLengthCycle, null);
    state.transportState = 'STOP'; const previews = []; actions.setStepPreviewHandler((...args) => previews.push(args));
    tap(111, 0xB0);
    assert.deepEqual(previews, [[1, 1, 'MOTIF']]); assert.equal(state.atTransaction.kind, 'MUTATION');
    actions.at.finish(false);
});

test('Mutation and A/T are exclusive; Modulation cannot acquire note mutations', t => {
    const { state, actions, tap } = setup(t); phrase(state);
    actions.at.begin(0); tap(109, 0xB0); assert.equal(state.atTransaction.slot, 0);
    actions.at.finish(false); state.currentTimeline = 'MODULATION';
    const before = structuredClone(state.modulation.motifs);
    tap(109, 0xB0); assert.equal(state.atTransaction, null); assert.deepEqual(state.modulation.motifs, before);
});

for (const source of ['INTERNAL', 'MIDI']) test(`Mutation is global, preserves polymetric phases and leaves Modulation running (${source})`, t => {
    const { state, actions, clock } = setup(t); phrase(state); clock.setSource(source);
    state.motifLength = 8; state.voiceLengths[0] = 3; state.voiceLengths[1] = 5;
    state.modulation.motifLength = 6; state.modulation.playheadPosition = 1;
    state.transportState = 'PLAY'; state.playheadPosition = 1;
    const original = structuredClone(state.getMotif(0)), mod = structuredClone(state.modulation.motifs);
    const revision = clock.transportRevision;
    actions.at.beginMutation(); actions.at.apply(2); actions.at.finish(true);
    for (let i = 2; i < 8; i++) {
        actions.nextStep();
        assert.deepEqual(state.getPlaybackMotifForVoice(0), original);
        assert.equal(state.getVoiceStep(0), i % 3); assert.equal(state.getVoiceStep(1), i % 5);
        assert.equal(state.modulation.playheadPosition, i % 6);
    }
    actions.nextStep(); assert.equal(state.playheadPosition, 0); assert.equal(state.getVoiceStep(1), 0);
    assert.equal(state.getPlaybackMotifForVoice(0), state.getMotif(0));
    assert.equal(state.modulation.playheadPosition, 2); assert.deepEqual(state.modulation.motifs, mod);
    assert.equal(clock.transportRevision, revision);
});

test('Mutation over a pending DOUBLE can be cancelled without discarding the DOUBLE', t => {
    const { state, actions } = setup(t); phrase(state);
    state.transportState = 'PLAY'; state.playheadPosition = 1; state.selectedInstrument = 0;
    const original = structuredClone(state.getMotif(0)); actions.doubleSelected();
    const doubled = structuredClone(state.getMotif(0));
    actions.at.beginMutation(); actions.at.apply(0); actions.at.finish(false);
    assert.deepEqual(state.getMotif(0), doubled); assert.deepEqual(state.getPlaybackMotifForVoice(0), original);
    for (let i = 1; i < 16; i++) actions.nextStep();
    assert.deepEqual(state.getPlaybackMotifForVoice(0), doubled);
});

test('Empty Mutation is a no-op with a selectable method, no dirty bank and no temporal snapshot', t => {
    const { state, actions } = setup(t); state.transportState = 'PLAY';
    let saves = 0; state.onBankChange = () => saves++;
    actions.at.beginMutation();
    for (let i = 0; i < 8; i++) { assert.ok(actions.at.apply(i)); assert.equal(readATPanel(state).selected, i); }
    actions.at.finish(true); assert.equal(state.liveLengthCycle, null); assert.equal(saves, 0);
});

for (const mode of ['NORMAL', 'CHAIN', 'FOCUS']) for (const commit of [false, true]) {
    test(`Mutation preserves Motif Book colors through entry, blink, edits and ${commit ? 'COMMIT' : 'CANCEL'} (${mode})`, t => {
        const { state, actions, c, tap, leds } = setup(t); phrase(state);
        state.currentView = 'MOTIF_LIBRARY';
        if (mode !== 'NORMAL') {
            state.chainEnabled = true; state.chain = [0, 1];
            state.chainPlayingIndex = 0; state.chainPlayingDetached = false;
            state.chainFocus = mode === 'FOCUS';
        }
        const assertBook = () => {
            c.drawBooks(); drainAT(t, c);
            for (const [id, note] of c.mapping.BOOKS.entries()) {
                assert.equal(leds.get(`144:${note}`) & 0x33,
                    c.colors[c.getLibraryMotifColor(id)] & 0x33, `Book pad ${id}`);
            }
            assert.equal(state.currentView, 'MOTIF_LIBRARY');
        };
        assertBook(); tap(109, 0xB0); assertBook();
        t.mock.timers.tick(160); assertBook();
        tap(c.mapping.AT_VALUE[2]); assertBook();
        assert.equal(leds.get(`144:${c.mapping.AT_VALUE[2]}`) & 0x33, c.colors.RED & 0x33);
        actions.at.finish(commit); assertBook();
    });
}
