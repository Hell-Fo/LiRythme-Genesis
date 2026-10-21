import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, source } from './load-engine.mjs';
import { initializeMotifBankAutosave } from '../src/MotifBankAutosave.mjs';
import { snapshotMotifBank, validateMotifBank } from '../src/MotifBankFormat.mjs';
import { initializeProjectBook } from '../src/ProjectBook.mjs';
import { initializePlayStatusUI } from '../src/PlayStatusUI.mjs';
import { assertReleasedNotes } from './midi-assertions.mjs';
import { PendingMidiCommands } from '../src/hardware/midi/PendingMidiCommands.cjs';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const { LiRythmeState, LiRythmeClock, LiRythmeActions } = await loadEngine();
const setup = () => {
    const state = new LiRythmeState(), clock = new LiRythmeClock(state);
    return { state, clock, actions: new LiRythmeActions(state, clock) };
};
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('closing flush shares the entire drain and waits for a separately delayed second save', async () => {
    const { state } = setup(), writes = [];
    const saver = await initializeMotifBankAutosave(state, {
        load: async () => ({}), save: bank => new Promise(resolve => writes.push({ bank, resolve }))
    }, { schedule: () => 1, cancel() {} });
    state.onBankChange();
    const first = saver.flush();
    state.motif[0][0] = true; state.onBankChange();
    const closing = saver.flush();
    assert.equal(first, closing);
    let closed = false; closing.then(() => { closed = true; });
    writes[0].resolve(); await settle();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].bank.motifs[0].events[0][0], true);
    assert.equal(closed, false);
    writes[1].resolve(); await closing;
    assert.equal(closed, true);
});

test('closing drain includes an edit arriving in the completion microtask', async () => {
    const { state } = setup(), writes = [];
    const saver = await initializeMotifBankAutosave(state, { load: async () => ({}),
        save: bank => new Promise(resolve => writes.push({ bank, resolve })) }, { schedule: () => 1, cancel() {} });
    state.onBankChange();
    let closed = false; const closing = saver.flush().then(() => { closed = true; });
    writes[0].resolve();
    queueMicrotask(() => { state.motif[0][0] = true; state.onBankChange(); });
    await settle();
    assert.equal(writes.length, 2); assert.equal(closed, false);
    writes[1].resolve(); await closing;
});

test('MIDI startup queue is bounded, coalesces LEDs and never replays old musical commands', () => {
    const queue = new PendingMidiCommands(4);
    const led = (note, color) => ({ target: 'NATIVE_MIDI', command: { type: 'SEND_CONTROLLER', name: 'LP', message: [0x90, note, color] } });
    for (let i = 0; i < 1000; i++) assert.equal(queue.enqueue(led(i % 8, i)), true);
    assert.equal(queue.size, 4);
    queue.enqueue(led(7, 99)); assert.equal(queue.size, 4);
    assert.equal(queue.enqueue({ target: 'NATIVE_MIDI', command: { type: 'SEND_NOTES', message: [0x90, 60, 100] } }), false);
    assert.equal(queue.enqueue({ type: 'SEND_MIDI', message: [0x90, 60, 100] }), false);
    assert.equal(queue.enqueue({ type: 'MIDI_REALTIME_THRU', value: 0xf8 }), false);
    const commands = queue.drain();
    assert.equal(queue.size, 0);
    assert.equal(commands.at(-1).command.message[2], 99);
});

test('MIDI startup overload never evicts requests silently; final transport replaces stale start', () => {
    const queue = new PendingMidiCommands(2);
    const first = { target: 'NATIVE_MIDI', requestId: 1, command: { type: 'LIST_PORTS' } };
    assert.equal(queue.enqueue(first), true);
    assert.equal(queue.enqueue({ type: 'TRANSPORT', action: 'START' }), true);
    assert.equal(queue.enqueue({ type: 'TRANSPORT', action: 'STOP' }), true);
    assert.equal(queue.enqueue({ target: 'NATIVE_MIDI', requestId: 2, command: { type: 'LIST_PORTS' } }), false);
    assert.deepEqual(queue.drain(), [first, { type: 'TRANSPORT', action: 'STOP' }]);
});

test('main process rejects overloaded MIDI requests and does not grow a queue after utility failure', async () => {
    const main = await fs.readFile(new URL('../main.js', import.meta.url), 'utf8');
    const body = main.slice(main.indexOf('function sendMidiClockCommand(command) {'), main.indexOf('function sendNativeMidiCommand(command) {'));
    const queue = new PendingMidiCommands(1), requests = new Map();
    queue.enqueue({ target: 'NATIVE_MIDI', requestId: 1, command: { type: 'LIST_PORTS' } });
    let rejected = false, reports = 0;
    requests.set(2, { reject: () => { rejected = true; } });
    const make = failed => new Function('midiClockUtility', 'midiClockUtilityReady', 'midiClockUtilityFailed',
        'midiClockCommandQueue', 'nativeMidiRequests', 'mainWindow', 'console',
        'let midiUnavailableReported = false;\n' + body + '; return sendMidiClockCommand;')(
        null, false, failed, queue, requests, null, { error() { reports++; } });
    make(false)({ target: 'NATIVE_MIDI', requestId: 2, command: { type: 'LIST_PORTS' } });
    assert.equal(rejected, true); assert.equal(requests.has(2), false);
    queue.drain();
    const failed = make(true);
    for (let i = 0; i < 1000; i++) failed({ type: 'SET_TEMPO', bpm: i });
    assert.equal(queue.size, 0);
    assert.equal(reports, 2); // one overloaded startup report, one failure report
});

test('portable smoke and release validation require an explicit artifact path', () => {
    for (const script of ['scripts/test-windows-portable.mjs', 'scripts/validate-windows-release.mjs']) {
        const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
        assert.equal(run.status, 1);
        assert.match(run.stderr, /portable-build-directory/);
    }
});

async function dispatcher(type = 'KEY GROUP') {
    const { state, clock, actions } = setup(), notes = [], timers = [];
    state.padConfiguration.voices[0] = { id: 0, type, channel: 1, note: 60, gate: 100, output: { mode: 'DEFAULT' } };
    state.motif[0][0] = state.motif[0][1] = true;
    const app = await source('app.js');
    const body = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const selector = { options: [{ textContent: 'Synth' }], selectedIndex: 0 };
    const midi = { send: (port, message) => notes.push({ port, m: message }), findOutput: () => ({}) };
    const trigger = new Function('state', 'midiOutputSelector', 'midiManager', 'launchpad', 'setTimeout', body + '; return triggerMotifStep;')(
        state, selector, midi, { pulseInstrument() {} }, fn => timers.push(fn));
    return { state, clock, actions, notes, timers, trigger, selector, midi };
}

for (const type of ['KEY GROUP', 'MIDI DRUM']) test(`late old Note Off cannot cut a retrigger in the next Step: ${type}`, async () => {
    const d = await dispatcher(type);
    d.state.transportState = 'PLAY';
    d.trigger(0); d.trigger(1);
    assert.deepEqual(d.notes.map(n => n.m), [[0x90, 60, 100], [0x90, 60, 0], [0x90, 60, 100]]);
    const count = d.notes.length;
    d.timers[0](); assert.equal(d.notes.length, count);
    d.state.transportState = 'STOP';
    d.timers[1]();
    assertReleasedNotes(d.notes);
    assert.equal(d.midi.noteReleases.size, 0);
});

test('note ownership follows physical port/channel/pitch across Voices and captures old routing', async () => {
    const d = await dispatcher('MIDI DRUM');
    d.state.padConfiguration.voices[1] = structuredClone(d.state.padConfiguration.voices[0]);
    d.state.motif[1][0] = true;
    d.trigger(0);
    assert.deepEqual(d.notes.map(n => n.m[2]), [100, 0, 100]);
    d.state.motif[1][1] = true;
    d.state.padConfiguration.voices[1].channel = 2;
    d.selector.options[0].textContent = 'Other';
    d.trigger(1);
    d.timers.forEach(fn => fn());
    assertReleasedNotes(d.notes);
    assert.ok(d.notes.some(n => n.port === 'Synth' && n.m[0] === 0x90 && n.m[2] === 0));
    assert.ok(d.notes.some(n => n.port === 'Other' && n.m[0] === 0x91 && n.m[2] === 0));
});

test('project snapshots retain validation, provisional A/T exclusion and independent banks', () => {
    const { state, actions } = setup();
    initializeProjectBook(state, actions);
    state.motif[0][0] = true;
    state.projects.select(1);
    state.motif[1][1] = true;
    actions.at.begin(0); actions.at.apply(0);
    const bank = snapshotMotifBank(state);
    assert.deepEqual(bank, validateMotifBank(bank));
    assert.equal(bank.motifs[0].velocities, undefined);
    bank.projects.slots[0].bank.motifs[0].events[0][0] = false;
    assert.equal(state.projectBook.slots[0].bank.motifs[0].events[0][0], true);
    bank.projects.slots[1].bank.motifs[0].events[1][1] = false;
    assert.equal(bank.motifs[0].events[1][1], true);
    assert.equal(state.motif[1][1], true);
    state.projectBook.slots[0].name = '';
    assert.throws(() => snapshotMotifBank(state), /Invalid Project/);
});

test('unchanged GATE rendering does not reassign text or color', () => {
    const { state, clock } = setup();
    state.selectedInstrument = 0;
    state.padConfiguration.voices[0] = { type: 'KEY GROUP', gate: 12.5 };
    let text = '', color, textWrites = 0, colorWrites = 0;
    const gate = { style: {} };
    Object.defineProperty(gate, 'textContent', { get: () => text, set: value => { text = value; textWrites++; } });
    Object.defineProperty(gate.style, 'color', { get: () => color, set: value => { color = value; colorWrites++; } });
    const elements = new Map(['selected', 'state', 'bpm', 'source', 'gate'].map(id => [`play-${id}`, { textContent: '' }]));
    elements.set('play-gate-current', gate);
    const ui = initializePlayStatusUI({ state, clock, midiManager: {}, document: { getElementById: id => elements.get(id) },
        window: { requestAnimationFrame() {}, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} } });
    for (let i = 0; i < 1000; i++) ui.render();
    assert.equal(textWrites, 1); assert.equal(colorWrites, 1);
    state.padConfiguration.voices[0].gate = 100; ui.render();
    assert.equal(textWrites, 2); assert.equal(colorWrites, 2);
    ui.dispose();
});

test('GROOVE MORPH freezes its entry including Step zero; sources refresh on the next actual entry', () => {
    const { state } = setup();
    state.chainEnabled = true; state.chain = [0, 1, 2]; state.chainPlayingIndex = 1; state.chainPlayingDetached = false;
    state.playingMotifId = 1; state.transportState = 'PLAY';
    state.getMotif(1).grooveMorph = { level: 0 }; state.getMotif(1).motifLength = 2;
    state.getMotif(0).events[0][0] = state.getMotif(2).events[0][0] = true;
    const first = state.getOccurrenceMotif();
    state.getMotif(0).events[0][0] = state.getMotif(2).events[0][0] = false;
    for (let voice = 0; voice < 16; voice++) assert.equal(state.getPlaybackMotifForVoice(voice), first);
    state.advanceLiveLengthCycle(); state.advanceLiveLengthCycle();
    assert.notEqual(state.getOccurrenceMotif(), first);
    assert.equal(state.getOccurrenceMotif().events[0][0], false);
});
