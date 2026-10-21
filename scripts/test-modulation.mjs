import { readSwing } from "../src/SwingTiming.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createAttributeRows, createVelocities, createColors } from '../src/ATTransaction.mjs';
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from '../src/MotifBankFormat.mjs';
import { readATPanel } from '../src/PlayATUI.mjs';
import { readPlayMotif } from '../src/PlayMotifUI.mjs';
import { readPlayFooter } from '../src/PlayFooterUI.mjs';

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
async function load(file, imports = {}) {
    let text = await source(file);
    text = text.replace('"./LaunchpadATInput.mjs"', JSON.stringify(new URL("../src/hardware/launchpad/LaunchpadATInput.mjs", import.meta.url).href));
    imports['./ATTransaction.mjs'] = new URL('../src/ATTransaction.mjs', import.meta.url).href;
    for (const [name, value] of Object.entries(imports)) text = text.replace(JSON.stringify(name), JSON.stringify(value));
    return `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
}
const { LiRythmeState } = await import(await load('LiRythmeState.js', { './PadConfiguration.js': await load('PadConfiguration.js') }));
const { LiRythmeActions } = await import(await load('LiRythmeActions.js'));
const { LiRythmeClock } = await import(await load('LiRythmeClock.js'));
const imports = {};
for (const file of ['LaunchpadMapping.js', 'LaunchpadColors.js', 'GenesisLayout.js']) imports[`./${file}`] = await load(`hardware/launchpad/${file}`);
const { LaunchpadMini } = await import(await load('hardware/launchpad/LaunchpadMini.js', imports));
function setup(t) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const state = new LiRythmeState(), clock = new LiRythmeClock(state), actions = new LiRythmeActions(state, clock);
    const messages = [];
    const controller = new LaunchpadMini({ send: (_, message) => messages.push(message) }, state, actions, 'LP');
    t.after(() => { actions.stop(); controller.resetInputState(); });
    const modulation = state.forSystem('MODULATION');
    const press = (number, status = 0x90) => controller.handleMidiMessage([status, number, 127]);
    const release = (number, status = 0x90) => controller.handleMidiMessage([status, number, 0]);
    const tap = (number, status = 0x90) => { press(number, status); release(number, status); };
    const tick = () => {
        if (clock.source === 'MIDI') for (let i = 0; i < 6; i++) clock.receiveMidiClockPulse();
        else assert.equal(clock.receiveInternalClockStep({ sequence: (clock.lastAcceptedNativeStepSequence ?? 0) + 1,
            transportRevision: clock.transportRevision }).accepted, true);
    };
    return { state, modulation, clock, actions, controller, messages, press, release, tap, tick };
}
function attribute(motif, key, voice, step, value) {
    (motif.attributes[key] ??= createAttributeRows())[voice][step] = value;
}
function played(state) { return Array.from({ length: 16 }, (_, voice) => state.getPlayingEvent(voice)); }

for (const voices of [[], [12]]) for (const steps of [[], [0, 2]]) {
    test(`A/T-only Modulation: ${voices.length ? 'Kick' : 'all Voices'} × ${steps.length ? 'Steps 1+3' : 'whole cycle'} across 8/6 cycles`, t => {
        const { state, modulation, actions, tick } = setup(t);
        state.motifLength = 8; modulation.motifLength = 6;
        for (const voice of [12, 13]) for (let step = 0; step < 8; step++) state.motif[voice][step] = step % 3 !== 1;
        const original = structuredClone(state.motifs);
        actions.selectModulationTimeline(); state.colorEnabled = true;
        actions.at.begin(1);
        for (const voice of voices) actions.at.select('instruments', voice, true);
        for (const step of steps) actions.at.select('steps', step, true);
        actions.at.apply(0); actions.at.finish(true);
        actions.toggleModulation(); actions.startPlayback();
        for (let i = 0; i < 24; i++) {
            for (const voice of [12, 13, 14]) {
                const event = state.getPlayingEvent(voice);
                const exists = original[0].events[voice][i % 8];
                assert.equal(Boolean(event), exists, `${voice} at tick ${i}`);
                if (exists) assert.equal(event.color, (!voices.length || voices.includes(voice)) && (!steps.length || steps.includes(i % 6)));
            }
            tick();
        }
        assert.deepEqual(state.motifs, original);
        assert.ok(modulation.motifs.every(m => m.events.every(row => row.every(v => !v))));
    });
}

test('A/T-only Modulation: Kick SWING affects only Motif Kick; note entry is inert through hardware', t => {
    const { state, modulation, actions, tap, controller: c } = setup(t);
    state.motif[12][1] = state.motif[13][1] = true;
    actions.selectModulationTimeline(); state.selectedInstrument = 12;
    const before = structuredClone(modulation.motifs);
    tap(c.mapping.MOTIF[1]); assert.deepEqual(modulation.motifs, before);
    actions.at.begin(2); actions.at.select('instruments', 12); actions.at.apply(0); actions.at.finish(true);
    state.modulationActive = true; state.playheadPosition = modulation.playheadPosition = 1;
    assert.equal(readSwing(state, 12).fraction, .5); assert.equal(readSwing(state, 13).fraction, 0);
    assert.equal(state.getPlayingEvent(14), null);
    assert.equal(modulation.motif[12][1], false);
});

test('legacy Modulation note migration removes notes only, preserving A/T, geometry, Chain and source document', t => {
    const { state, modulation, actions } = setup(t);
    state.motif[12][0] = true; modulation.motifLength = 6; modulation.voiceLengths[12] = 3;
    attribute(modulation.getMotif(0), 'COLOR', 12, 2, true);
    actions.selectModulationTimeline(); actions.toggleChain(); actions.requestMotif(0); actions.requestMotif(2);
    const saved = snapshotMotifBank(state);
    saved.modulation.motifs[0].events[13][1] = true; // Previous release's note-bearing layer.
    const original = structuredClone(saved), fresh = new LiRythmeState();
    restoreMotifBank(fresh, saved);
    assert.deepEqual(saved, original);
    assert.equal(fresh.modulation.motif[13][1], false);
    assert.equal(fresh.modulation.motifLength, 6); assert.equal(fresh.modulation.voiceLengths[12], 3);
    assert.equal(fresh.modulation.motifs[0].attributes.COLOR[12][2], true);
    assert.deepEqual(fresh.modulation.chain, [0, 2]); assert.equal(fresh.motif[12][0], true);
    assert.equal(snapshotMotifBank(fresh).modulation.motifs[0].events[13][1], false);
});

test('PLAY context arrows coalesce controller redraws without synchronous MIDI bursts or musical changes', t => {
    const { state, modulation, actions, controller, messages, tap, tick } = setup(t);
    state.motif[12][0] = true; modulation.motif[13][0] = true;
    actions.startPlayback(); tick();
    const snapshot = () => JSON.stringify([state.playheadPosition, modulation.playheadPosition,
        state.playingMotifId, modulation.playingMotifId, state.motifs, modulation.motifs, played(state)]);
    const before = snapshot();
    let previews = 0; actions.setStepPreviewHandler(() => previews++);
    messages.length = 0;
    tap(111, 0xB0);
    assert.equal(state.currentTimeline, 'MODULATION');
    assert.equal(messages.length, 0, 'context switch must not synchronously flood controller IPC');
    tap(110, 0xB0); tap(111, 0xB0);
    assert.equal(snapshot(), before); assert.equal(previews, 0);
    t.mock.timers.tick(4);
    assert.ok(messages.length <= 4, 'controller output is bounded per drain');
    assert.ok(messages.every(m => m[0] !== 0xB0 || m[1] !== 0), 'no hardware buffer command in merged LED queue');
    assert.equal(snapshot(), before);
    assert.ok(controller.atLEDQueue.size <= 80);
});

test('MOD Chain beat palette follows requested activity, independently of editing context', t => {
    const { state, modulation, controller, messages } = setup(t);
    const color = () => (messages.filter(m => m[0] === 0xB0 && m[1] === 105).at(-1)[2] & 0x33) | 12;
    modulation.chainEnabled = true;
    state.transportState = 'PLAY';
    for (const context of ['MOTIF', 'MODULATION']) for (const active of [false, true]) {
        state.currentTimeline = context;
        state.modulationActive = !active;
        state.modulationRequested = active; // LED follows intent before the cycle applies it.
        controller.drawModulationStatus();
        assert.equal(color(), active ? controller.colors.RED : controller.colors.DIM_RED);
        controller.pulseModulationBeat();
        assert.equal(color(), active ? controller.colors.YELLOW : controller.colors.DIM_AMBER);
        controller.drawModulationStatus();
        assert.equal(color(), active ? controller.colors.YELLOW : controller.colors.DIM_AMBER);
        t.mock.timers.tick(80);
        assert.equal(color(), active ? controller.colors.RED : controller.colors.DIM_RED);
    }
    controller.pulseModulationBeat();
    state.transportState = 'PAUSE'; controller.drawTransport();
    assert.equal(color(), controller.colors.RED);
    t.mock.timers.tick(80); assert.equal(color(), controller.colors.RED);
    state.transportState = 'PLAY'; controller.pulseModulationBeat();
    modulation.chainEnabled = false; controller.drawModulationStatus();
    assert.equal(controller.modulationBeatTimer, null);
    assert.equal(color(), controller.colors.RED);
    controller.pulseModulationBeat(); assert.equal(controller.modulationBeatTimer, null);
});

for (const [name, baseNotes, overlayNotes, velocity, color, expectedNotes] of [
    ['Kick + Hat, legacy Snare cannot add a note', [12, 14], [13], null, null, [12, 14]],
    ['Snare and Hat remain Motif-owned, velocity 100% and COLOR', [13, 14], [13], 127, true, [13, 14]],
    ['velocity only preserves Kick COLOR', [12, 13, 14], [], 127, null, [12, 13, 14]],
    ['COLOR only targets all resulting notes', [12, 13, 14], [], null, true, [12, 13, 14]]
]) test(`MODULATION normative composition: ${name}`, t => {
    const { state, modulation } = setup(t);
    const base = state.getMotif(0), overlay = modulation.getMotif(0);
    for (const voice of baseNotes) base.events[voice][0] = true;
    for (const voice of overlayNotes) overlay.events[voice][0] = true;
    base.colors = createColors(); base.colors[12][0] = true;
    for (let voice = 0; voice < 16; voice++) {
        if (velocity !== null) attribute(overlay, 'VELOCITY', voice, 0, velocity);
        if (color !== null) attribute(overlay, 'COLOR', voice, 0, color);
    }
    const original = structuredClone([base, overlay]);
    state.modulationActive = true;
    assert.deepEqual(played(state).flatMap((event, voice) => event ? [voice] : []), expectedNotes);
    for (const voice of expectedNotes) {
        assert.equal(state.getPlayingEvent(voice).velocity, velocity ?? 100);
        assert.equal(state.getPlayingEvent(voice).color, color ?? (voice === 12));
    }
    assert.deepEqual([base, overlay], original);
    state.modulationActive = false;
    assert.deepEqual(played(state).flatMap((event, voice) => event ? [voice] : []), baseNotes);
});

test('explicit neutral VELOCITY and COLOR OFF override individually; absence preserves all other Voices/attributes', t => {
    const { state, modulation } = setup(t);
    const base = state.getMotif(0), overlay = modulation.getMotif(0);
    base.events[12][0] = base.events[13][0] = true;
    base.velocities = createVelocities(); base.velocities[12][0] = 16; base.velocities[13][0] = 48;
    base.colors = createColors(); base.colors[12][0] = base.colors[13][0] = true;
    attribute(overlay, 'VELOCITY', 12, 0, 100); attribute(overlay, 'COLOR', 12, 0, false);
    state.modulationActive = true;
    assert.deepEqual(state.getPlayingEvent(12), { velocity: 100, color: false });
    assert.deepEqual(state.getPlayingEvent(13), { velocity: 48, color: true });
    overlay.attributes.COLOR[12][0] = null;
    assert.deepEqual(state.getPlayingEvent(12), { velocity: 100, color: true });
});

test('A/T alone is editable in MODULATION, does not create notes, CANCEL restores presence and COMMIT persists OFF', t => {
    const { state, modulation, actions } = setup(t);
    actions.selectModulationTimeline(); state.colorEnabled = true;
    assert.equal(actions.at.begin(1), true);
    actions.at.select('steps', 3); actions.at.select('instruments', 12);
    assert.equal(actions.at.apply(0), true); assert.equal(actions.at.apply(0), true);
    const motif = modulation.getMotif(0);
    assert.equal(motif.attributes.COLOR[12][3], false);
    assert.equal(motif.events.some(row => row.some(Boolean)), false);
    state.modulationActive = true; modulation.playheadPosition = 3;
    assert.deepEqual(played(state), Array(16).fill(null));
    assert.equal(snapshotMotifBank(state).modulation.motifs[0].attributes.COLOR, undefined);
    actions.at.finish(false); assert.deepEqual(motif.attributes, {});
    actions.at.begin(1); actions.at.select('steps', 3); actions.at.apply(0); actions.at.apply(0); actions.at.finish(true);
    assert.equal(snapshotMotifBank(state).modulation.motifs[0].attributes.COLOR[12][3], false);
    actions.selectMotifTimeline(); actions.at.begin(0);
    assert.equal(actions.at.apply(0), false); assert.equal(state.getMotif(0).velocities, undefined);
});

for (const mode of ['INTERNAL', 'MIDI']) test(`independent phase, OFF progression and last ON/OFF intention at MODULATION entry (${mode})`, t => {
    const { state, modulation, actions, clock, tick } = setup(t);
    clock.setSource(mode); state.motifLength = 5; modulation.motifLength = 3;
    actions.startPlayback(); tick();
    assert.deepEqual([state.playheadPosition, modulation.playheadPosition], [1, 1]);
    actions.toggleModulation(); assert.equal(state.modulationRequested, true); assert.equal(state.modulationActive, false);
    actions.toggleModulation(); actions.toggleModulation();
    const revision = clock.transportRevision;
    tick(); assert.equal(state.modulationActive, false);
    tick(); assert.equal(state.modulationActive, true);
    assert.deepEqual([state.playheadPosition, modulation.playheadPosition], [3, 0]);
    actions.toggleModulation(); tick(); tick();
    assert.equal(state.modulationActive, true); assert.equal(state.playheadPosition, 0); assert.equal(modulation.playheadPosition, 2);
    tick(); assert.equal(state.modulationActive, false); assert.equal(state.playheadPosition, 1);
    tick(); assert.equal(modulation.playheadPosition, 1);
    assert.equal(clock.transportRevision, revision);
});

test('STOP starts both layers at zero; PAUSE/CONTINUE preserve independent positions and pending requests', t => {
    const { state, modulation, actions, tick } = setup(t);
    state.motifLength = 5; modulation.motifLength = 3;
    actions.startPlayback(); tick(); actions.toggleModulation(); actions.pausePlayback();
    assert.deepEqual([state.playheadPosition, modulation.playheadPosition], [1, 1]);
    assert.equal(state.modulationActive, false);
    actions.continuePlayback(); tick(); assert.equal(state.modulationActive, false);
    tick(); assert.equal(state.modulationActive, true);
    actions.stop(); assert.deepEqual([state.playheadPosition, modulation.playheadPosition], [0, 0]);
    actions.continuePlayback(); tick(); assert.deepEqual([state.playheadPosition, modulation.playheadPosition], [1, 1]);
});

test('independent Chains cross one another, repeated occurrences and Loop Point reuse the same rules', t => {
    const { state, modulation, actions, tick } = setup(t);
    state.motifs[0].motifLength = 2; state.motifs[1].motifLength = 2;
    modulation.motifs[0].motifLength = 3; modulation.motifs[1].motifLength = 4;
    actions.toggleChain(); actions.requestMotif(0); actions.requestMotif(1);
    actions.toggleModulationChain(); actions.selectModulationTimeline();
    actions.requestMotif(0); actions.requestMotif(1); actions.requestMotif(1);
    actions.startPlayback(); tick(); tick();
    assert.deepEqual([state.playingMotifId, modulation.playingMotifId, modulation.playheadPosition], [1, 0, 2]);
    tick(); assert.deepEqual([state.playheadPosition, modulation.playingMotifId, modulation.chainPlayingIndex], [1, 1, 1]);
    actions.toggleChainLoopPoint(1);
    tick(); tick(); tick(); tick();
    assert.equal(modulation.playingMotifId, 0); assert.equal(modulation.chainPlayingIndex, 0);
    assert.equal(state.playheadPosition, 1);
    const saved = snapshotMotifBank(state).modulation;
    assert.deepEqual(saved.chain, [0, 1, 1]); assert.equal(saved.loopPoint, 1);
});

test('requesting another Modulation waits for its own boundary and does not reset Motif', t => {
    const { state, modulation, actions, tick } = setup(t);
    state.motifLength = 7; modulation.motifLength = 3;
    actions.startPlayback(); tick(); actions.selectModulationTimeline(); actions.requestMotif(4);
    assert.equal(modulation.playingMotifId, 0); assert.equal(modulation.nextMotifId, 4);
    tick(); tick(); assert.equal(modulation.playingMotifId, 4); assert.equal(state.playheadPosition, 3);
});

for (const mode of ['INTERNAL', 'MIDI']) test(`Modulation local length/edits activate at entry, without rephase (${mode})`, t => {
    const { state, modulation, actions, clock, tick } = setup(t);
    clock.setSource(mode); state.motifLength = 11; modulation.motifLength = 8; modulation.voiceLengths[12] = 4;
    actions.toggleModulation(); actions.startPlayback(); tick();
    actions.selectModulationTimeline(); state.selectedInstrument = 12;
    actions.setSelectedLength(2);
    state.motif[12][4] = true;
    actions.at.begin(0); actions.at.select('instruments', 12); actions.at.select('steps', 0); actions.at.apply(7); actions.at.finish(true);
    assert.equal(modulation.getVoiceStep(12), 1);
    assert.equal(modulation.getPlaybackMotifForVoice(12).events[12][0], false);
    tick(); tick(); assert.equal(modulation.getVoiceStep(12), 3);
    tick(); assert.equal(modulation.getVoiceStep(12), 0);
    assert.equal(state.playheadPosition, 4); assert.equal(state.getPlayingEvent(12)?.velocity, 16);
    assert.equal(modulation.getVoiceLength(12), 2);
    state.selectedInstrument = null; actions.setSelectedLength(3);
    tick(); tick(); tick(); assert.equal(modulation.playheadPosition, 7);
    tick(); assert.equal(modulation.playheadPosition, 0); assert.equal(state.playheadPosition, 8);
    tick(); tick(); tick(); assert.equal(modulation.playheadPosition, 0);
});

test('absence of explicit length uses existing 32/LCM rules independently', t => {
    const { state, modulation, actions, tick } = setup(t);
    assert.equal(modulation.getMotifDuration(), 32);
    modulation.voiceLengths[12] = 3; modulation.voiceLengths[13] = 5;
    assert.equal(modulation.getMotifDuration(), 15); assert.equal(state.getMotifDuration(), 32);
    actions.startPlayback(); for (let i = 0; i < 15; i++) tick();
    assert.equal(modulation.playheadPosition, 0); assert.equal(state.playheadPosition, 15);
    assert.equal(modulation.getVoiceStep(12), 0); assert.equal(modulation.getVoiceStep(13), 0);
});

test('ROTATION moves eventless explicit OFF/neutral values, swaps occupied cells, preserves absence and CANCEL', t => {
    const { state, modulation, actions } = setup(t);
    actions.selectModulationTimeline(); modulation.voiceLengths[12] = 4;
    const motif = modulation.getMotif(0);
    attribute(motif, 'COLOR', 12, 3, false); attribute(motif, 'VELOCITY', 12, 0, 100);
    motif.events[12][0] = true;
    const before = structuredClone(motif);
    actions.at.begin(8); actions.at.select('instruments', 12); actions.at.select('steps', 3);
    assert.equal(actions.at.rotate(1), true);
    assert.equal(motif.events[12][0], false); assert.equal(motif.attributes.COLOR[12][0], false);
    assert.equal(motif.attributes.VELOCITY[12][0], null);
    assert.equal(motif.events[12][3], true); assert.equal(motif.attributes.VELOCITY[12][3], 100);
    assert.equal(motif.attributes.COLOR[12][3], null);
    actions.at.finish(false); assert.deepEqual(motif, before);
});

test('ROTATION A/T alone follows each Voice cycle and waits for local activation during PLAY', t => {
    const { state, modulation, actions, tick } = setup(t);
    actions.selectModulationTimeline(); modulation.motifLength = 8;
    modulation.voiceLengths[12] = 3; modulation.voiceLengths[13] = 4;
    const motif = modulation.getMotif(0);
    attribute(motif, 'COLOR', 12, 2, false); attribute(motif, 'COLOR', 13, 2, true);
    actions.startPlayback(); tick(); actions.at.begin(8); actions.at.select('steps', 2); actions.at.rotate(1);
    assert.equal(motif.attributes.COLOR[12][0], false); assert.equal(motif.attributes.COLOR[13][3], true);
    assert.equal(modulation.getPlaybackMotifForVoice(12).attributes.COLOR[12][2], false);
    tick(); tick(); assert.equal(modulation.getPlaybackMotifForVoice(12).attributes.COLOR[12][0], false);
    assert.equal(modulation.getPlaybackMotifForVoice(13).attributes.COLOR[13][2], true);
    tick(); assert.equal(modulation.getPlaybackMotifForVoice(13).attributes.COLOR[13][3], true);
    assert.equal(motif.events.some(row => row.some(Boolean)), false);
});

for (const system of ['MOTIF', 'MODULATION']) test(`A/T transaction captures ${system}, context switching retains Book and protects save/CANCEL`, t => {
    const { state, modulation, actions } = setup(t);
    state.motif[12][0] = true; modulation.motif[12][0] = true;
    if (system === 'MODULATION') actions.selectModulationTimeline();
    actions.at.begin(0); actions.at.select('instruments', 12); actions.at.select('steps', 0);
    const tx = state.atTransaction;
    system === 'MOTIF' ? actions.selectModulationTimeline() : actions.selectMotifTimeline();
    assert.equal(state.atTransaction, tx); assert.equal(state.currentView, 'PLAY');
    actions.at.apply(7);
    assert.equal(tx.system, system); assert.equal(readATPanel(state).motif, 1);
    assert.equal(system === 'MOTIF' ? state.motifs[0].velocities[12][0] : modulation.motifs[0].attributes.VELOCITY[12][0], 16);
    assert.equal(system === 'MOTIF' ? modulation.motifs[0].attributes.VELOCITY : state.motifs[0].velocities, undefined);
    const saved = snapshotMotifBank(state);
    assert.equal(saved.motifs[0].velocities, undefined); assert.equal(saved.modulation.motifs[0].attributes.VELOCITY, undefined);
    actions.at.finish(false); assert.equal(state.motifs[0].velocities, undefined);
    assert.deepEqual(modulation.motifs[0].attributes, {});
    // The following transaction uses the newly selected system.
    actions.at.begin(0); assert.notEqual(state.atTransaction.system, system);
});

test('Launchpad MODULATION/SHIFT+MODULATION are exclusive; context changes do not move playback', t => {
    const { state, modulation, actions, controller: c, tap, press, release, tick } = setup(t);
    tap(105, 0xB0); assert.equal(state.modulationRequested, true); assert.equal(state.modulationActive, true);
    press(104, 0xB0); tap(105, 0xB0); release(104, 0xB0);
    assert.equal(modulation.chainEnabled, true); assert.equal(state.chainEnabled, false); assert.equal(state.modulationRequested, true);
    actions.startPlayback(); tick(); state.currentView = 'MOTIF_LIBRARY';
    const phases = [state.playheadPosition, modulation.playheadPosition, state.playingMotifId, modulation.playingMotifId];
    tap(111, 0xB0); assert.equal(state.currentTimeline, 'MODULATION'); assert.equal(state.currentView, 'MOTIF_LIBRARY');
    tap(110, 0xB0); assert.equal(state.currentTimeline, 'MOTIF');
    assert.deepEqual([state.playheadPosition, modulation.playheadPosition, state.playingMotifId, modulation.playingMotifId], phases);
    press(110, 0xB0); press(111, 0xB0); release(110, 0xB0); release(111, 0xB0);
    assert.equal(state.currentTimeline, 'MOTIF'); // FOCUS chord cannot execute either single gesture.
    assert.equal(c.focusNavigationHeld.size, 0);
});

test('Modulation DOUBLE and COPY include explicit A/T-only cells; DELETE clears its own bank', t => {
    const { state, modulation, actions } = setup(t);
    actions.selectModulationTimeline(); state.selectedInstrument = 12; modulation.voiceLengths[12] = 2;
    const motif = modulation.getMotif(0); attribute(motif, 'COLOR', 12, 0, false);
    assert.equal(actions.doubleSelected(), true); assert.equal(modulation.voiceLengths[12], 4);
    assert.equal(modulation.getMotif(0).attributes.COLOR[12][2], false);
    const copy = actions.captureMusicalCopy('VOICE', 12); assert.equal(actions.applyVoiceCopy(copy, 13), true);
    assert.equal(modulation.getMotif(0).attributes.COLOR[13][2], false);
    const bankCopy = actions.captureMotifCopy(0); assert.equal(actions.applyMotifCopy(bankCopy, 1), true);
    assert.equal(modulation.getMotif(1).attributes.COLOR[13][2], false);
    const original = structuredClone(state.motifs); actions.clearMotifEvents(13);
    assert.equal(modulation.getMotif(0).attributes.COLOR[13][2], null); assert.deepEqual(state.motifs, original);
    actions.selectMotifTimeline(); assert.equal(actions.applyVoiceCopy(copy, 12), false);
});

test('Modulation STOP/PAUSE navigation previews only the captured system; FOCUS/VIEW use its bank', t => {
    const { state, modulation, actions } = setup(t);
    const previews = []; actions.onStepPreview = (...args) => previews.push(args);
    actions.selectModulationTimeline(); modulation.motifLength = 3;
    actions.navigate(1); assert.deepEqual(previews.at(-1), [1, 0, 'MODULATION']); assert.equal(state.playheadPosition, 0);
    actions.toggleChain(); actions.requestMotif(0); actions.requestMotif(4);
    actions.navigate(1); actions.navigate(1); assert.equal(modulation.currentMotifId, 4); assert.equal(state.currentMotifId, 0);
    actions.toggleChainFocus(); actions.selectFocusMotif(0); assert.equal(modulation.currentMotifId, 0);
    assert.equal(state.chainFocus, false);
});

test('Modulation palette uses independent data, DIM/FULL RED cursor and GREEN boundary without added blink', t => {
    const { state, modulation, actions, controller: c } = setup(t);
    state.motif[12][0] = true; actions.selectModulationTimeline();
    const leds = new Map(); c.setLed = (note, color) => leds.set(note, color);
    c.drawPlayhead(0); assert.equal(leds.get(c.mapping.MOTIF[0]), c.colors.DIM_RED);
    attribute(modulation.getMotif(0), 'COLOR', 13, 0, true);
    c.drawPlayhead(0); assert.equal(leds.get(c.mapping.MOTIF[0]), c.colors.RED);
    modulation.voiceLengths[12] = 4; attribute(modulation.getMotif(0), 'COLOR', 12, 3, false);
    c.drawPlayhead(3); assert.equal(leds.get(c.mapping.MOTIF[3]), c.colors.GREEN);
    assert.equal(c.getLibraryMotifColor(0), 'RED');
    attribute(modulation.getMotif(1), 'COLOR', 12, 0, false);
    assert.equal(c.getLibraryMotifColor(1), 'DIM_RED');
    assert.equal(c.getLibraryMotifColor(2), 'OFF');
    assert.equal(readPlayMotif(state).title, 'MODULATION 01');
    state.modulationRequested = true;
    assert.match(readPlayFooter(state, c).states, /MODULATION OFF → ON/);
});

test('save/reload preserves explicit presence, lengths, independent Chain, and loads legacy bank empty/inactive', t => {
    const { state, modulation, actions } = setup(t);
    state.motif[12][2] = true; actions.selectModulationTimeline(); modulation.motifLength = 7; modulation.voiceLengths[13] = 3;
    attribute(modulation.getMotif(0), 'COLOR', 12, 2, false); attribute(modulation.getMotif(0), 'VELOCITY', 12, 2, 100);
    actions.toggleModulation(); actions.toggleChain(); actions.requestMotif(0); actions.requestMotif(4);
    const saved = JSON.parse(JSON.stringify(snapshotMotifBank(state))), fresh = new LiRythmeState();
    restoreMotifBank(fresh, saved); assert.deepEqual(snapshotMotifBank(fresh), saved);
    assert.equal(fresh.modulationActive, true); assert.equal(fresh.modulation.playheadPosition, 0);
    const legacy = { ...saved }; delete legacy.modulation;
    restoreMotifBank(fresh, legacy);
    assert.deepEqual(fresh.motifs, saved.motifs); assert.equal(fresh.modulationActive, false); assert.equal(fresh.modulationRequested, false);
    assert.equal(fresh.modulation.chain.length, 0); assert.deepEqual(fresh.modulation.motifs[0].attributes, {});
    for (const mutate of [m => m.motifs[0].attributes.COLOR[12][2] = 0, m => m.motifs[0].attributes.VELOCITY[12][2] = 0,
        m => m.chain.push(16), m => m.loopPoint = 9, m => m.requested = 1]) {
        const bad = structuredClone(saved); mutate(bad.modulation);
        assert.throws(() => validateMotifBank(bad));
    }
});

test('actual MIDI dispatch merges once per Voice, uses its COLOR routing and captures exact Note Off across OFF/reset', async t => {
    const { state, modulation, actions } = setup(t);
    state.motif[12][0] = state.motif[13][0] = true; modulation.motif[12][0] = true;
    attribute(modulation.getMotif(0), 'COLOR', 12, 0, true); attribute(modulation.getMotif(0), 'COLOR', 13, 0, true);
    attribute(modulation.getMotif(0), 'VELOCITY', 12, 0, 127);
    state.padConfiguration.voices[12].colorNote = 70; state.padConfiguration.voices[13].colorNote = 71;
    state.padConfiguration.voices[13].channel = 11;
    state.modulationActive = true;
    const app = await source('app.js'), code = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const messages = [], offs = [], pulses = [];
    const trigger = new Function('state', 'midiOutputSelector', 'midiManager', 'launchpad', 'setTimeout', `${code}; return triggerMotifStep;`)(state,
        { options: [{ textContent: 'Machine' }], selectedIndex: 0 },
        { send: (output, data) => messages.push([output, data]), findOutput: () => 0 },
        { pulseInstrument: voice => pulses.push(voice) }, callback => offs.push(callback));
    trigger(0); assert.deepEqual(messages.map(([, data]) => data), [[0x99, 70, 127], [0x9a, 71, 100]]);
    assert.deepEqual(pulses, [12, 13]); state.modulationActive = false; actions.stop();
    state.padConfiguration.voices[12].note = 99; state.padConfiguration.voices[13].channel = 1;
    offs.forEach(callback => callback());
    assert.deepEqual(messages.slice(2), [['Machine', [0x99, 70, 0]], ['Machine', [0x9a, 71, 0]]]);
});

test('whole MODULATION A/T edits and CANCEL after activation are immediate without changing phase', t => {
    const { state, modulation, actions, tick } = setup(t);
    state.motif[12].fill(true); state.motifLength = 7; modulation.motifLength = 3;
    actions.toggleModulation(); actions.startPlayback(); tick(); actions.selectModulationTimeline();
    actions.at.begin(0); actions.at.apply(7);
    assert.equal(state.getPlayingEvent(12).velocity, 16);
    tick(); assert.equal(state.getPlayingEvent(12).velocity, 16);
    tick(); assert.equal(state.getPlayingEvent(12).velocity, 16);
    actions.at.finish(false); assert.equal(state.getPlayingEvent(12).velocity, 100);
    tick(); tick(); assert.equal(state.getPlayingEvent(12).velocity, 100);
    tick(); assert.equal(state.getPlayingEvent(12).velocity, 100);
    assert.equal(state.playheadPosition, 6); assert.deepEqual(modulation.getMotif(0).attributes, {});
});

test('all requests before a boundary collapse to the last intention, including cancellation and length-one cycles', t => {
    const { state, modulation, actions, tick } = setup(t);
    modulation.motifLength = 1; actions.startPlayback();
    actions.toggleModulation(); actions.toggleModulation();
    assert.equal(state.modulationRequested, false); tick(); assert.equal(state.modulationActive, false);
    actions.toggleModulation(); assert.equal(state.modulationActive, false);
    tick(); assert.equal(state.modulationActive, true); assert.equal(state.playheadPosition, 2);
    actions.toggleModulation(); actions.toggleModulation(); tick(); assert.equal(state.modulationActive, true);
});

test('CANCEL immediately restores every Voice edited during the transaction, even after its selection changes', t => {
    const { state, modulation, actions, tick } = setup(t);
    state.motif[12].fill(true); state.motif[13].fill(true); modulation.motifLength = 8;
    modulation.voiceLengths[12] = 3; modulation.voiceLengths[13] = 4;
    actions.toggleModulation(); actions.startPlayback(); tick(); actions.selectModulationTimeline();
    actions.at.begin(0); actions.at.select('instruments', 12); actions.at.apply(7);
    actions.at.select('instruments', 13); actions.at.apply(7);
    tick(); tick(); tick();
    assert.equal(state.getPlayingEvent(12).velocity, 16); assert.equal(state.getPlayingEvent(13).velocity, 16);
    actions.at.select('instruments', 14); actions.at.finish(false);
    assert.equal(state.getPlayingEvent(12).velocity, 100); assert.equal(state.getPlayingEvent(13).velocity, 100);
    tick(); assert.equal(state.getPlayingEvent(12).velocity, 100);
    tick(); assert.equal(state.getPlayingEvent(12).velocity, 100); assert.equal(state.getPlayingEvent(13).velocity, 100);
    tick(); assert.equal(state.getPlayingEvent(13).velocity, 100);
    tick(); assert.equal(state.getPlayingEvent(13).velocity, 100);
});

test('deleting a playing Modulation preserves its attributes until its boundary and leaves the other layer untouched', t => {
    const { state, modulation, actions, tick } = setup(t);
    modulation.motifLength = 3; state.motif[12][2] = state.motif[12][3] = true;
    attribute(modulation.getMotif(0), 'VELOCITY', 12, 2, 48);
    actions.toggleModulation(); actions.startPlayback(); tick(); actions.selectModulationTimeline();
    assert.equal(actions.deleteMotif(0), true);
    assert.equal(modulation.getMotif(0).events[12][2], false);
    tick(); assert.equal(state.getPlayingEvent(12).velocity, 48);
    tick(); assert.equal(state.getPlayingEvent(12).velocity, 100);
    assert.equal(state.playheadPosition, 3); assert.equal(modulation.getMotifDuration(), 32);
});

test('event toggling does not erase independent Modulation attributes or their destination metadata', t => {
    const { state, modulation, actions } = setup(t);
    actions.selectModulationTimeline(); actions.at.begin(0); actions.at.apply(7); actions.at.finish(true);
    state.selectedInstrument = 12; const before = structuredClone(modulation.getMotif(0).attributes);
    const destinations = structuredClone(modulation.getMotif(0).atDestinations);
    actions.toggleInstrumentStep(0); actions.toggleInstrumentStep(0);
    assert.deepEqual(modulation.getMotif(0).attributes, before);
    assert.deepEqual(modulation.getMotif(0).atDestinations, destinations);
    assert.equal(modulation.motif[12][0], false);
});

for (const long of [false, true]) test(`Modulation Chain hardware DELETE ${long ? 'long' : 'short'} uses the existing grammar`, t => {
    const { state, modulation, actions, controller: c, press, release, tap } = setup(t);
    actions.selectModulationTimeline(); actions.toggleChain(); state.currentView = 'MOTIF_LIBRARY';
    actions.requestMotif(0); actions.requestMotif(4); actions.requestMotif(4);
    modulation.motifs[4].events[12][0] = true; modulation.motifs[4].motifLength = 3;
    attribute(modulation.motifs[4], 'COLOR', 12, 0, false);
    const base = structuredClone(state.motifs);
    tap(c.mapping.VALUE_CONTROLS.DELETE);
    press(c.mapping.BOOKS[4]); t.mock.timers.tick(long ? 300 : 299); release(c.mapping.BOOKS[4]);
    assert.deepEqual(modulation.chain, long ? [0] : [0, 4]);
    assert.equal(modulation.motifs[4].events[12][0], !long);
    assert.equal(modulation.motifs[4].attributes.COLOR?.[12][0], long ? undefined : false);
    assert.deepEqual(state.motifs, base); assert.equal(c.deleteArmed, false);
});

test('SHIFT + >> doubles Modulation without switching context; the two-arrow chord wins in both orders', t => {
    const { state, modulation, actions, press, release, tap } = setup(t);
    actions.selectModulationTimeline(); state.selectedInstrument = 12; modulation.voiceLengths[12] = 2;
    attribute(modulation.getMotif(0), 'COLOR', 12, 0, false);
    press(104, 0xB0); tap(111, 0xB0); release(104, 0xB0);
    assert.equal(modulation.voiceLengths[12], 4); assert.equal(state.currentTimeline, 'MODULATION');
    actions.toggleChain(); actions.requestMotif(0);
    for (const order of [[110, 111], [111, 110]]) {
        const phase = [state.playheadPosition, modulation.playheadPosition];
        press(104, 0xB0); press(order[0], 0xB0); press(order[1], 0xB0);
        release(order[0], 0xB0); release(order[1], 0xB0); release(104, 0xB0);
        assert.equal(modulation.voiceLengths[12], 4); assert.equal(state.currentTimeline, 'MODULATION');
        assert.deepEqual([state.playheadPosition, modulation.playheadPosition], phase);
    }
    assert.equal(modulation.chainFocus, false);
});

test('context switching during A/T keeps deferred, fused differential LED rendering', t => {
    const { state, actions, controller: c, messages, tap } = setup(t);
    state.motif[12][0] = true; state.transportState = 'PLAY'; actions.at.begin(0);
    const drain = () => { for (let i = 0; (c.atLEDQueue.size || c.instrumentFeedbackPending) && i < 64; i++) t.mock.timers.tick(4); };
    drain(); messages.length = 0;
    tap(111, 0xB0); assert.equal(messages.length, 0); assert.equal(state.currentTimeline, 'MODULATION');
    const tx = state.atTransaction; assert.equal(tx.system, 'MOTIF');
    drain(); messages.length = 0; c.drawATChange('context'); drain();
    assert.equal(messages.length, 0); assert.equal(state.atTransaction, tx);
});

test('Modulation Chain shares amber/yellow grammar while retaining COPY/FOCUS priorities', t => {
    const { state, actions, controller: c, modulation } = setup(t);
    actions.selectModulationTimeline(); actions.toggleChain(); [0, 4, 2].forEach(id => actions.requestMotif(id));
    actions.startPlayback();
    assert.equal(c.getLibraryMotifColor(0), 'YELLOW'); assert.equal(c.getLibraryMotifColor(2), 'DIM_AMBER');
    c.nextMotifLit = true; assert.equal(c.getLibraryMotifColor(4), 'YELLOW');
    c.nextMotifLit = false; assert.equal(c.getLibraryMotifColor(4), 'DIM_AMBER');
    c.copySuccessPad = 2; assert.equal(c.getLibraryMotifColor(2), 'YELLOW'); c.copySuccessPad = null;
    actions.toggleChainFocus(); actions.selectFocusMotif(2); assert.equal(c.getLibraryMotifColor(2), 'YELLOW');
    assert.equal(modulation.chainFocus, true); assert.equal(state.chainFocus, false);
});

test('Modulation Chain emits slow amber/yellow NEXT blink while OFF and ON without changing either timeline', t => {
    const { state, actions, controller: c, modulation, messages } = setup(t);
    actions.selectModulationTimeline(); actions.toggleChain(); [0, 4, 2].forEach(id => actions.requestMotif(id));
    state.currentView = 'MOTIF_LIBRARY';
    actions.startPlayback();
    const color = id => messages.filter(([status, note]) => status === 0x90 && note === c.mapping.BOOKS[id]).at(-1)?.[2];
    const value = name => (c.colors[name] & 0x33) | 4;
    for (const active of [false, true]) {
        state.modulationActive = active;
        const before = JSON.stringify(state);
        c.drawBooks();
        assert.equal(color(0), value('YELLOW')); assert.equal(color(2), value('DIM_AMBER'));
        assert.equal(color(4), value('YELLOW'));
        t.mock.timers.tick(499); assert.equal(color(4), value('YELLOW'));
        t.mock.timers.tick(1); assert.equal(color(4), value('DIM_AMBER'));
        assert.equal(color(0), value('YELLOW'));
        t.mock.timers.tick(500); assert.equal(color(4), value('YELLOW'));
        assert.equal(JSON.stringify(state), before);
    }
    modulation.chainLoopMasterIndex = 1;
    c.nextMotifLit = true; assert.equal(c.getLibraryMotifColor(4), 'RED');
    c.nextMotifLit = false; assert.equal(c.getLibraryMotifColor(4), 'DIM_RED');
    c.copyDeniedPads.add(2); assert.equal(c.getLibraryMotifColor(2), 'RED');
});

for (const system of ['MOTIF', 'MODULATION']) {
    test(`${system} Book keeps stored nonmembers in its family color and only Chain members amber`, t => {
        const { state, actions, controller: c } = setup(t);
        if (system === 'MODULATION') actions.selectModulationTimeline();
        const layer = state.forSystem(system);
        layer.motifs[11].events[0][0] = true;
        actions.toggleChain(); [0, 4, 2].forEach(id => actions.requestMotif(id));
        actions.startPlayback();
        assert.equal(c.getLibraryMotifColor(11), system === 'MOTIF' ? 'DIM_GREEN' : 'DIM_RED');
        assert.equal(c.getLibraryMotifColor(15), 'OFF');
        assert.equal(c.getLibraryMotifColor(2), 'DIM_AMBER');
        assert.equal(c.getLibraryMotifColor(0), 'YELLOW');
        actions.clearChain();
        assert.equal(c.getLibraryMotifColor(11), system === 'MOTIF' ? 'DIM_GREEN' : 'DIM_RED');
    });
    for (const mode of ['NORMAL', 'CHAIN', 'CHAIN_FOCUS']) for (const transport of ['STOP', 'PAUSE', 'PLAY']) {
        test(`${system} DELETE+sequence button ${mode} ${transport} targets only its system`, t => {
            const chain = mode !== 'NORMAL';
            const { state, actions, controller: c, tap } = setup(t);
            if (system === 'MODULATION') actions.selectModulationTimeline();
            const layer = state.forSystem(system), other = state.forSystem(system === 'MOTIF' ? 'MODULATION' : 'MOTIF');
            layer.motifs[0].events[0][0] = true; layer.motifs[0].motifLength = 8;
            other.chain = [3, 7]; other.motifs[3].events[1][1] = true;
            const otherBank = structuredClone(other.motifs);
            if (chain) { actions.toggleChain(); [0, 4, 2].forEach(id => actions.requestMotif(id)); }
            if (mode === 'CHAIN_FOCUS') { actions.toggleChainFocus(); actions.selectFocusMotif(4); }
            const bank = structuredClone(layer.motifs);
            state.transportState = transport; layer.playheadPosition = 3;
            tap(c.mapping.VALUE_CONTROLS.DELETE);
            tap(system === 'MOTIF' ? c.mapping.TOP_CONTROLS.PLAY_STOP : c.mapping.TOP_CONTROLS.MODULATION, 0xB0);
            assert.equal(c.deleteArmed, false); assert.equal(state.transportState, transport);
            assert.equal(layer.playheadPosition, 3);
            if (chain) { assert.deepEqual(layer.chain, []); assert.deepEqual(layer.motifs, bank); }
            else { assert.equal(layer.motifs[0].events[0][0], false); assert.equal(layer.motifs[0].motifLength, 8); }
            assert.deepEqual(other.chain, [3, 7]); assert.deepEqual(other.motifs, otherBank);
        });
    }
}

for (const system of ['MOTIF', 'MODULATION']) for (const chain of [false, true]) {
    test(`DELETE+${system} ignores displayed system, held repeats and SHIFT; chain=${chain}`, t => {
        const { state, actions, controller: c, tap, press, release, clock } = setup(t);
        const layer = state.forSystem(system), otherName = system === 'MOTIF' ? 'MODULATION' : 'MOTIF';
        const other = state.forSystem(otherName);
        for (const bank of [layer, other]) {
            bank.motifs[0].motifLength = 8;
            if (bank.systemName === 'MODULATION') attribute(bank.motifs[0], 'COLOR', 12, 0, true);
            else bank.motifs[0].events[12][0] = true;
            bank.chain = [0, 4, 4, 2]; bank.chainEnabled = chain;
        }
        state.currentTimeline = otherName; state.transportState = 'PLAY';
        state.modulationActive = state.modulationRequested = true;
        const original = structuredClone(layer.motifs), otherBank = structuredClone(other.motifs);
        const before = [state.currentTimeline, state.transportState, clock.transportRevision,
            state.playheadPosition, state.modulation.playheadPosition, state.modulationActive, state.modulationRequested];
        const button = system === 'MOTIF' ? c.mapping.TOP_CONTROLS.PLAY_STOP : c.mapping.TOP_CONTROLS.MODULATION;
        tap(c.mapping.VALUE_CONTROLS.DELETE); press(c.mapping.TOP_CONTROLS.SHIFT, 0xB0);
        press(button, 0xB0); press(button, 0xB0); t.mock.timers.tick(600);
        release(button, 0xB0); release(c.mapping.TOP_CONTROLS.SHIFT, 0xB0);
        assert.equal(c.deleteArmed, false); assert.equal(layer.chainEnabled, chain);
        assert.deepEqual([state.currentTimeline, state.transportState, clock.transportRevision,
            state.playheadPosition, state.modulation.playheadPosition, state.modulationActive, state.modulationRequested], before);
        assert.deepEqual(other.motifs, otherBank); assert.deepEqual(other.chain, [0, 4, 4, 2]);
        if (chain) { assert.deepEqual(layer.chain, []); assert.deepEqual(layer.motifs, original); }
        else if (system === 'MODULATION') assert.deepEqual(layer.motifs[0].attributes, {});
        else assert.equal(layer.motifs[0].events[12][0], false);
        // The release is consumed, but a new press resumes the ordinary button behavior.
        if (system === 'MODULATION') { tap(button, 0xB0); assert.equal(state.modulationRequested, false); }
    });
}

test('SHIFT+PLAY and SHIFT+MOD toggle only their own Chain from either displayed Book', t => {
    const { state, controller: c, tap, press, release } = setup(t);
    for (const view of ['MOTIF', 'MODULATION']) {
        state.currentTimeline = view;
        state.chainEnabled = state.modulation.chainEnabled = false;
        press(c.mapping.TOP_CONTROLS.SHIFT, 0xB0);
        tap(c.mapping.TOP_CONTROLS.PLAY_STOP, 0xB0);
        assert.equal(state.chainEnabled, true); assert.equal(state.modulation.chainEnabled, false);
        tap(c.mapping.TOP_CONTROLS.MODULATION, 0xB0);
        assert.equal(state.chainEnabled, true); assert.equal(state.modulation.chainEnabled, true);
        release(c.mapping.TOP_CONTROLS.SHIFT, 0xB0);
        assert.equal(state.currentTimeline, view);
    }
});

for (const slot of [0, 1, 2]) test(`Modulation Timeline displays selected A/T cells like Motif events (slot ${slot})`, t => {
    const { state, actions, controller: c, modulation, messages } = setup(t);
    actions.selectModulationTimeline(); state.colorEnabled = true; state.selectedInstrument = 12;
    modulation.motif[12][3] = true;
    assert.equal(actions.at.begin(slot), true); assert.equal(actions.at.apply(0), true); actions.at.finish(true);
    for (let step = 0; step < 32; step++) {
        assert.equal(c.getMotifStepColor(step), c.colors.YELLOW);
        assert.equal(modulation.motif[12][step], step === 3);
    }
    state.selectedInstrument = null;
    assert.equal(c.getMotifStepColor(0), c.colors.DIM_AMBER);
    state.selectedInstrument = 12;
    state.transportState = 'PLAY'; modulation.playheadPosition = 1;
    c.drawClockStep(0, 1);
    const color = step => messages.filter(([status, note]) => status === 0x90 && note === c.mapping.MOTIF[step]).at(-1)?.[2];
    assert.equal(color(0), c.colors.YELLOW & 0x33);
    assert.equal(color(1), c.colors.RED & 0x33);
    modulation.voiceLengths[12] = 8;
    assert.equal(c.getMotifStepColor(7), c.colors.GREEN); // Existing explicit boundary priority.
});

for (const selected of [12, null]) test(`Modulation DELETE+Timeline Step clears all A/T families, selected=${selected}`, t => {
    const { state, modulation, actions, controller: c, tap, press, release } = setup(t);
    actions.selectModulationTimeline(); state.selectedInstrument = selected;
    const motif = modulation.getMotif(0);
    for (const voice of [12, 13]) for (const step of [1, 2]) {
        attribute(motif, 'VELOCITY', voice, step, 100);
        attribute(motif, 'COLOR', voice, step, false);
        attribute(motif, 'SWING', voice, step, 50);
        motif.atDestinations ??= {};
        for (const key of ['VELOCITY', 'COLOR', 'SWING', 'ROTATION']) {
            motif.atDestinations[key] ??= createAttributeRows();
            motif.atDestinations[key][voice][step] = 'STEP';
        }
    }
    const base = structuredClone(state.motifs); let saves = 0; state.onBankChange = () => saves++;
    tap(c.mapping.VALUE_CONTROLS.DELETE);
    press(c.mapping.MOTIF[1]); press(c.mapping.MOTIF[1]); release(c.mapping.MOTIF[1]);
    assert.equal(c.deleteArmed, false); assert.equal(saves, 1);
    for (const rows of [...Object.values(motif.attributes), ...Object.values(motif.atDestinations)]) {
        assert.equal(rows[12][1], null);
        assert.equal(rows[13][1] === null, selected === null);
        assert.notEqual(rows[12][2], null); assert.notEqual(rows[13][2], null);
    }
    assert.ok(motif.events.every(row => row.every(v => !v))); assert.deepEqual(state.motifs, base);
    const saved = snapshotMotifBank(state); assert.equal(saved.modulation.motifs[0].attributes.COLOR[12][1], null);
    tap(c.mapping.VALUE_CONTROLS.DELETE); tap(c.mapping.MOTIF[0]);
    assert.equal(c.deleteArmed, false); assert.equal(saves, 1); // Empty target is a consumed no-op.
});

test('Modulation DELETE+Step respects FOCUS and removes playing attributes immediately', t => {
    const { state, modulation, actions, controller: c, tap, tick } = setup(t);
    actions.selectModulationTimeline(); state.selectedInstrument = 12;
    modulation.motifLength = 8; modulation.voiceLengths[12] = 3;
    attribute(modulation.getMotif(0), 'COLOR', 12, 0, true);
    actions.startPlayback(); tick();
    const revision = actions.clock.transportRevision;
    tap(c.mapping.VALUE_CONTROLS.DELETE); tap(c.mapping.MOTIF[0]);
    assert.equal(modulation.getMotif(0).attributes.COLOR[12][0], null);
    assert.equal(modulation.getPlaybackMotifForVoice(12).attributes.COLOR[12][0], null);
    tick(); tick(); assert.equal(modulation.getPlaybackMotifForVoice(12).attributes.COLOR[12][0], null);
    assert.equal(actions.clock.transportRevision, revision);
    modulation.chainEnabled = true; modulation.chain = [0, 1];
    actions.toggleChainFocus(); actions.selectFocusMotif(1);
    attribute(modulation.getMotif(1), 'COLOR', 12, 0, true);
    const playing = structuredClone(modulation.getMotif(0)), phase = modulation.playheadPosition;
    tap(c.mapping.VALUE_CONTROLS.DELETE); tap(c.mapping.MOTIF[0]);
    assert.equal(modulation.getMotif(1).attributes.COLOR[12][0], null);
    assert.deepEqual(modulation.getMotif(0), playing); assert.deepEqual(modulation.chain, [0, 1]);
    assert.equal(modulation.playheadPosition, phase);
});

test('Modulation Timeline uses Voice selection and filters to display A/T occupancy', t => {
    const { state, modulation, actions, controller: c } = setup(t);
    actions.selectModulationTimeline(); state.selectedInstrument = 12;
    attribute(modulation.getMotif(0), 'COLOR', 12, 1, false);
    attribute(modulation.getMotif(0), 'SWING', 13, 2, 50);
    assert.equal(c.getMotifStepColor(0), 0);
    assert.equal(c.getMotifStepColor(1), c.colors.YELLOW);
    assert.equal(c.getMotifStepColor(2), c.colors.DIM_AMBER);
    state.filterMode = true; state.visibleInstrumentFilter = new Set([12]);
    assert.equal(c.getMotifStepColor(2), 0);
    state.selectedInstrument = 13; assert.equal(c.getMotifStepColor(2), c.colors.YELLOW);
});

test('Modulation LED follows the button immediately while activation waits for the cycle', t => {
    const { state, modulation, actions, controller: c, messages, tap, tick } = setup(t);
    modulation.chainEnabled = true;
    state.motifLength = modulation.motifLength = 4;
    actions.startPlayback(); tick();
    const color = () => messages.filter(([status, note]) => status === 0xb0 && note === c.mapping.TOP_CONTROLS.MODULATION).at(-1)[2];
    const value = name => (c.colors[name] & 0x33) | 4;
    tap(c.mapping.TOP_CONTROLS.MODULATION, 0xb0);
    assert.equal(state.modulationRequested, true);
    assert.equal(state.modulationActive, false);
    assert.equal(color(), value('RED'));
    for (let i = 0; i < 4; i++) tick();
    assert.equal(state.modulationActive, true);
    c.cancelModulationBeat();
    tap(c.mapping.TOP_CONTROLS.MODULATION, 0xb0);
    assert.equal(state.modulationRequested, false);
    assert.equal(state.modulationActive, true);
    assert.equal(color(), value('DIM_RED'));
    for (let i = 0; i < 4; i++) tick();
    assert.equal(state.modulationActive, false);
});

test('controller initialization reflects restored requested activation instead of the reserved static palette', t => {
    const { state, actions, controller: c, messages } = setup(t);
    actions.toggleModulation(); messages.length = 0; c.drawTopControls();
    const modulationLED = messages.filter(([status, note]) => status === 0xb0 && note === 105);
    assert.equal(modulationLED.at(-1)[2], (c.colors.RED & 0x33) | 4);
    assert.equal(state.modulationActive, true);
});

test('Modulation preview is silent even for legacy notes; Audio only plays composed Motif notes', async t => {
    const { state, modulation, actions } = setup(t);
    state.motif[12][0] = true; modulation.motif[13][0] = true;
    attribute(modulation.getMotif(0), 'VELOCITY', 13, 0, 48); attribute(modulation.getMotif(0), 'COLOR', 14, 0, true);
    state.padConfiguration.voices[13] = { type: 'AUDIO', source: 'snare.wav', output: 'STEREO' };
    const app = await source('app.js'), code = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const audio = [], midi = [];
    const trigger = new Function('state', 'audioPlayer', 'midiOutputSelector', 'midiManager', 'launchpad', 'setTimeout', `${code}; return triggerMotifStep;`)(state,
        { trigger: (voice, velocity) => { audio.push([voice.output, velocity]); return true; } },
        { options: [{ textContent: 'Machine' }], selectedIndex: 0 },
        { send: (_, data) => midi.push(data), findOutput: () => 0 }, { pulseInstrument() {} }, () => {});
    trigger(0, 0, 'MODULATION'); assert.deepEqual(audio, []); assert.deepEqual(midi, []);
    state.motif[13][0] = true;
    state.modulationActive = true; trigger(0); assert.deepEqual(audio, [['STEREO', 48]]); assert.equal(midi.length, 1);
    state.muteActive = true; state.muteSelection.add(13); trigger(0); assert.equal(audio.length, 1);
    actions.selectModulationTimeline();
});

for (const transport of ['STOP', 'PAUSE']) test(`long presses select timelines in ${transport} without transport or activation changes`, t => {
    const { state, controller: c, press, release } = setup(t);
    state.transportState = transport;
    state.playheadPosition = 3;
    press(c.mapping.TOP_CONTROLS.MODULATION, 0xB0);
    t.mock.timers.tick(299);
    assert.equal(state.currentTimeline, 'MOTIF');
    t.mock.timers.tick(1);
    assert.equal(state.currentTimeline, 'MODULATION');
    release(c.mapping.TOP_CONTROLS.MODULATION, 0xB0);
    assert.equal(state.modulationRequested, false);
    press(c.mapping.TOP_CONTROLS.PLAY_STOP, 0xB0);
    t.mock.timers.tick(300);
    assert.equal(state.currentTimeline, 'MOTIF');
    release(c.mapping.TOP_CONTROLS.PLAY_STOP, 0xB0);
    assert.equal(state.transportState, transport);
    assert.equal(state.playheadPosition, 3);
});

for (const transport of ['STOP', 'PAUSE']) test(`long Play press in Motif performs STOP from ${transport}`, t => {
    const { state, controller: c, press, release } = setup(t);
    state.transportState = transport;
    state.playheadPosition = 3;
    press(c.mapping.TOP_CONTROLS.PLAY_STOP, 0xB0);
    t.mock.timers.tick(300);
    release(c.mapping.TOP_CONTROLS.PLAY_STOP, 0xB0);
    assert.equal(state.currentTimeline, 'MOTIF');
    assert.equal(state.transportState, 'STOP');
    assert.equal(state.playheadPosition, 0);
});
