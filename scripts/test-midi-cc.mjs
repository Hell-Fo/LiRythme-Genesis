import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { editPadVoice } from '../src/PadVoiceEditor.mjs';
import { parseConfiguration, serializeConfiguration } from '../src/PadConfigurationFile.mjs';

const text = await fs.readFile(new URL('../docs/examples/DrumBrute Impact.lirythme-pads.json', import.meta.url), 'utf8');
test('MIDI CC editing, validation and preset round trip', () => {
    const state = { transportState: 'STOP', padConfiguration: parseConfiguration(text) };
    editPadVoice(state, 0, 'type', 'MIDI CC');
    for (const [field, value] of [['channel',16], ['cc',127], ['value',0]]) editPadVoice(state,0,field,value);
    const voice = state.padConfiguration.voices[0];
    assert.deepEqual(parseConfiguration(serializeConfiguration(state.padConfiguration)).voices[0], voice);
    for (const [field,value] of [['channel',0],['channel',17],['cc',-1],['cc',128],['value',128],['value',0.5]]) {
        assert.throws(() => editPadVoice(state,0,field,value));
        assert.deepEqual(state.padConfiguration.voices[0], voice);
    }
    state.transportState = 'PLAY';
    assert.throws(() => editPadVoice(state,0,'value',100));
});
test('MIDI CC dispatch sends configured value without a Note Off, including preview', async () => {
    const app = await fs.readFile(new URL('../src/app.js', import.meta.url),'utf8');
    const body = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const motif = { events: Array.from({length:16},(_,id) => [id === 0]) };
    const state = { padConfiguration: parseConfiguration(text), playingMotifId:0, getMotif:()=>motif };
    state.padConfiguration.voices[0] = { type:'MIDI CC', channel:16, cc:74, value:0, output:{mode:'DEFAULT'} };
    const messages=[], timers=[];
    const trigger = new Function('state','midiOutputSelector','midiManager','launchpad','setTimeout',body+';return triggerMotifStep;')(
        state,{options:[{textContent:'Synth'}],selectedIndex:0},
        {send:(output,message,timestamp,options)=>messages.push({output,message,options}),findOutput:()=>({})},
        {pulseInstrument(){}},(...args)=>timers.push(args));
    trigger(0); trigger(0,0,'MOTIF');
    assert.deepEqual(messages.map(m=>m.message),[[0xBF,74,0],[0xBF,74,0]]);
    assert.equal(messages[0].output,'Synth');
    assert.equal(messages[1].options.preview,true);
    assert.equal(timers.length,0);
});
