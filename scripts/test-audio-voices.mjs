import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AudioVoicePlayer } from '../src/AudioVoicePlayer.mjs';
import { readWav } from '../src/AudioSampleFiles.cjs';
import { editPadVoice } from '../src/PadVoiceEditor.mjs';
import { parseConfiguration, serializeConfiguration } from '../src/PadConfigurationFile.mjs';

const example = await fs.readFile(new URL('../docs/examples/DrumBrute Impact.lirythme-pads.json', import.meta.url), 'utf8');
test('Audio preset edits, transitions, validation and persistence', () => {
    const state = { transportState: 'STOP', padConfiguration: parseConfiguration(example) };
    editPadVoice(state, 12, 'type', 'AUDIO');
    editPadVoice(state, 12, 'source', 'C:\\Samples\\Kick.wav');
    editPadVoice(state, 12, 'audioOutput', 'RIGHT');
    const next = parseConfiguration(serializeConfiguration(state.padConfiguration));
    assert.deepEqual(next.voices[12], { id: 12, name: 'Kick', type: 'AUDIO', output: 'RIGHT', source: 'C:\\Samples\\Kick.wav' });
    const before = state.padConfiguration;
    assert.throws(() => editPadVoice(state, 12, 'source', 'bad.mp3'));
    assert.throws(() => editPadVoice(state, 12, 'audioOutput', 'STEREO'));
    assert.equal(state.padConfiguration, before);
    state.transportState = 'PLAY'; assert.throws(() => editPadVoice(state, 12, 'source', 'x.wav'));
    state.transportState = 'PAUSE'; editPadVoice(state, 12, 'type', 'MIDI DRUM');
    assert.equal(state.padConfiguration.voices[12].source, undefined);
});

function context() {
    const nodes = [];
    const node = kind => {
        const n = { kind, connections: [], gain: {}, connect(...args) { this.connections.push(args); }, disconnect() {},
            start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
        nodes.push(n); return n;
    };
    return { nodes, state: 'running', destination: {},
        async decodeAudioData() { return { length: 2, sampleRate: 48000, numberOfChannels: 2,
            getChannelData: c => new Float32Array(c ? [0, 1] : [1, 0]) }; },
        createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; },
        createBufferSource: () => node('source'), createGain: () => node('gain'), createChannelMerger: () => node('merger') };
}
for (const side of ['LEFT', 'RIGHT']) test(`Audio ${side}: preloaded mono mix, velocity, overlapping hits and stop`, async () => {
    const ctx = context(); let reads = 0;
    const player = new AudioVoicePlayer({ files: { read: async () => { reads++; return { bytes: [1] }; } }, createContext: () => ctx });
    const voice = { type: 'AUDIO', source: 'kick.wav', output: side };
    assert.equal(player.trigger(voice), false);
    await player.load(voice.source); await player.load(voice.source); assert.equal(reads, 1);
    assert.deepEqual([...player.samples.get(voice.source).buffer.getChannelData(0)], [0.5, 0.5]);
    assert.equal(player.trigger(voice, 64), true); assert.equal(player.trigger(voice, 127), true);
    const gain = ctx.nodes.find(n => n.kind === 'gain');
    assert.equal(gain.gain.value, 64 / 127);
    assert.equal(gain.connections[0][2], side === 'LEFT' ? 0 : 1);
    assert.equal(player.active.size, 2); player.stop(); assert.equal(player.active.size, 0);
    assert.ok(ctx.nodes.filter(n => n.kind === 'source').every(n => n.stopped));
    player.sync([]); assert.equal(player.samples.size, 0);
});
test('Missing WAV reports error and never schedules delayed notes', async () => {
    const player = new AudioVoicePlayer({ files: { read: async () => ({ error: 'Introuvable' }) }, createContext: context });
    await player.load('missing.wav');
    assert.match(player.status('missing.wav'), /Introuvable/);
    assert.equal(player.trigger({ source: 'missing.wav', output: 'LEFT' }), false);
});
test('WAV reader restricts file type and detects bad headers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lirythme-audio-'));
    try {
        const file = path.join(dir, 'source.wav');
        await fs.writeFile(file, Buffer.from('RIFF0000WAVE'));
        assert.equal((await readWav(file)).length, 12);
        await fs.writeFile(file, Buffer.from('not a wave file'));
        await assert.rejects(readWav(file), /RIFF/);
        await assert.rejects(readWav(path.join(dir, 'source.mp3')), /wav/);
        await assert.rejects(readWav('relative.wav'), /absolu/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Sequencer dispatches Audio with playback snapshot velocity, mute and LED feedback without MIDI', async () => {
    const app = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
    const code = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const motif = { events: Array.from({ length: 16 }, () => Array(32).fill(false)), velocities: Array.from({ length: 16 }, () => Array(32).fill(100)) };
    motif.events[0][0] = true; motif.velocities[0][0] = 32;
    let muted = false; const hits = [], pulses = [];
    const state = { padConfiguration: { voices: [{ type: 'AUDIO', source: 'kick.wav', output: 'RIGHT' }] },
        getPlaybackMotifForVoice: () => motif, getVoiceStep: () => 0, isVoiceAudible: () => !muted };
    const trigger = new Function('state', 'audioPlayer', 'launchpad', 'midiManager', code + '; return triggerMotifStep;')(state,
        { trigger: (voice, velocity) => { hits.push([voice.output, velocity]); return true; } },
        { pulseInstrument: id => pulses.push(id) }, { send: () => assert.fail('Audio dispatched MIDI') });
    trigger(9); assert.deepEqual(hits, [['RIGHT', 32]]); assert.deepEqual(pulses, [0]);
    muted = true; trigger(10); assert.equal(hits.length, 1);
});
