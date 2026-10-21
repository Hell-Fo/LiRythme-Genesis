import { noteOns, assertReleasedNotes } from './midi-assertions.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from "../src/MotifBankFormat.mjs";
import { readATPanel } from "../src/PlayATUI.mjs";

const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
async function load(file, imports = {}) {
    let text = await source(file);
    text = text.replace('"./LaunchpadATInput.mjs"', JSON.stringify(new URL("../src/hardware/launchpad/LaunchpadATInput.mjs", import.meta.url).href));
    imports["./ATTransaction.mjs"] = new URL("../src/ATTransaction.mjs", import.meta.url).href;
    for (const [key, value] of Object.entries(imports)) text = text.replace(JSON.stringify(key), JSON.stringify(value));
    return `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
}
const { LiRythmeState } = await import(await load("LiRythmeState.js", { "./PadConfiguration.js": await load("PadConfiguration.js") }));
const { LiRythmeActions } = await import(await load("LiRythmeActions.js"));
const { LiRythmeClock } = await import(await load("LiRythmeClock.js"));
const imports = {};
for (const file of ["LaunchpadMapping.js", "LaunchpadColors.js", "GenesisLayout.js"]) imports[`./${file}`] = await load(`hardware/launchpad/${file}`);
const { LaunchpadMini } = await import(await load("hardware/launchpad/LaunchpadMini.js", imports));
function setup() {
    const state = new LiRythmeState(), clock = new LiRythmeClock(state), actions = new LiRythmeActions(state, clock);
    return { state, clock, actions };
}
function apply(actions, instruments = [], steps = [], index = 0) {
    assert.equal(actions.at.begin(5), true);
    for (const v of instruments) actions.at.select("instruments", v, true);
    for (const s of steps) actions.at.select("steps", s, true);
    const result = actions.at.apply(index);
    actions.at.finish(true);
    return result;
}

const { readCycle, createCycles } = await import('../src/Cycle.mjs');
const tick = (actions, count = 1) => { for (let i=0; i<count; i++) actions.nextStep(); };

test('CYCLE hardware entry, scale, empty targets, display and CANCEL/COMMIT', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { state, actions } = setup(), leds = new Map();
    const c = new LaunchpadMini({ send: (_, [, note, color]) => leds.set(note, color) }, state, actions, 'LP');
    t.after(() => c.resetInputState());
    const tap = note => { c.handleMidiMessage([0x90,note,127]); c.handleMidiMessage([0x90,note,0]); };
    assert.equal(c.getATBookColor(5), 'RED');
    tap(c.mapping.BOOKS[5]);
    assert.equal(state.atTransaction.slot,5);
    assert.deepEqual(actions.at.definition(5).values,[8,7,6,5,4,3,2,1]);
    tap(c.mapping.AT_VALUE[5]);
    assert.equal(state.motifs[0].cycles.motif,3);
    assert.equal(readATPanel(state).values[5],'1 / 3');
    assert.equal(readATPanel(state).selected,5);
    tap(c.mapping.BOOKS[5]);
    assert.equal(state.motifs[0].cycles,undefined);
    apply(actions,[],[],6);
    state.motif[0][0]=true;
    assert.equal(readCycle(state.motifs[0],0,0).value,2);
    actions.at.begin(5); actions.at.apply(0);
    assert.equal(snapshotMotifBank(state).motifs[0].cycles.motif,2);
    actions.at.finish(false);
    assert.equal(state.motifs[0].cycles.motif,2);
});

test('CYCLE true priority survives broader edits and explicit 1 overrides', () => {
    const {state,actions}=setup();
    apply(actions,[0],[0],7); // STEP 1
    apply(actions,[0],[],5); // VOICE 3
    apply(actions,[],[],6); // MOTIF 2
    assert.deepEqual(readCycle(state.motifs[0],0,0),{value:1,scope:'STEP'});
    assert.deepEqual(readCycle(state.motifs[0],0,1),{value:3,scope:'INSTRUMENT'});
    assert.deepEqual(readCycle(state.motifs[0],1,0),{value:2,scope:'MOTIF'});
    apply(actions,[],[],0);
    assert.equal(readCycle(state.motifs[0],0,0).value,1);
    assert.equal(readCycle(state.motifs[0],0,1).value,3);
    assert.equal(readCycle(state.motifs[0],1,0).value,8);
});

for (let period=1;period<=8;period++) test(`CYCLE 1/${period}: first passage and every nth passage`, () => {
    const {state,actions}=setup(); state.motifLength=2; state.motif[0][0]=true;
    apply(actions,[],[],8-period); state.transportState='PLAY';
    const heard=[];
    for (let pass=0;pass<period*2+1;pass++) {
        heard.push(state.getPlayingEvent(0)!==null);
        tick(actions,2);
    }
    assert.deepEqual(heard,heard.map((_,pass)=>pass%period===0));
});

test('CYCLE local Voice/Step loops, Motif duration, mute and repeated reads', () => {
    const {state,actions}=setup(); state.motifLength=8; state.voiceLengths[0]=2;
    state.motif[0][0]=true; state.motif[1][0]=true;
    apply(actions,[],[],6); apply(actions,[0],[],5);
    state.transportState='PLAY';
    const heard=[];
    for(let pass=0;pass<7;pass++) {
        const first=state.getPlayingEvent(0);
        assert.deepEqual(state.getPlayingEvent(0),first);
        heard.push(first!==null); tick(actions,2);
    }
    assert.deepEqual(heard,[true,false,false,true,false,false,true]);
    assert.equal(state.getCyclePass(1,'MOTIF'),1);
    state.muteActive=true; state.muteSelection.add(0); tick(actions,2);
    assert.equal(state.getCyclePass(0,'INSTRUMENT'),8);
});

test('CYCLE PAUSE preserves phase, STOP and START reset both timelines', () => {
    const {state,actions}=setup(); state.motifLength=2; state.motif[0][0]=true;
    apply(actions,[],[],6); state.transportState='PLAY'; tick(actions,2);
    assert.equal(state.getPlayingEvent(0),null);
    actions.pausePlayback(); tick(actions,2);
    assert.equal(state.getCyclePass(0,'MOTIF'),1);
    actions.continuePlayback(); assert.equal(state.getPlayingEvent(0),null);
    actions.stop(); assert.equal(state.getPlayingEvent(0)?.velocity,100);
    assert.deepEqual(state.cyclePasses,[]); assert.deepEqual(state.modulation.cyclePasses,[]);
    state.cyclePasses[0]={motif:1,voices:Array(16).fill(1)};
    actions.startPlayback(); assert.equal(state.getCyclePass(0,'MOTIF'),0); actions.stop();
});

test('CYCLE Chain keeps separate counters for motifs and repeated occurrences', () => {
    const {state,actions}=setup();
    for(const id of [0,1]) { state.motifs[id].motifLength=1; state.motifs[id].events[0][0]=true; state.motifs[id].cycles=createCycles(); state.motifs[id].cycles.motif=2; }
    state.chainEnabled=true; state.chain=[0,1,0]; state.chainPlayingIndex=0; state.chainPlayingDetached=false;
    state.transportState='PLAY';
    const heard=[];
    for(let i=0;i<6;i++){ heard.push([state.playingMotifId,state.getPlayingEvent(0)!==null]); tick(actions); }
    assert.deepEqual(heard,[[0,true],[1,true],[0,false],[0,true],[1,false],[0,false]]);
});

test('CYCLE Modulation override uses its own phase; polyrhythm counts only full loops', () => {
    const {state,actions}=setup(); state.motifLength=4; state.motif[0][0]=true;
    apply(actions,[],[],0); state.currentTimeline='MODULATION';
    apply(actions,[0],[],7); state.currentTimeline='MOTIF';
    state.modulationActive=true; state.transportState='PLAY'; tick(actions,4);
    assert.equal(state.getPlayingEvent(0)?.velocity,100);
    state.modulationActive=false; assert.equal(state.getPlayingEvent(0),null);
    const motif=state.motifs[0]; motif.euclidean=Array(16).fill(null);
    motif.euclidean[0]={resolution:2,hits:1,mode:'POLYRHYTHMIC'}; motif.voiceLengths[0]=2;
    state.resetCyclePasses(); state.playheadPosition=0;
    tick(actions,3); assert.equal(state.getCyclePass(0,'INSTRUMENT'),0);
    tick(actions); assert.equal(state.getCyclePass(0,'INSTRUMENT'),1);
});

test('CYCLE persistence, strict validation, copy, double, rotation, clear and reset', () => {
    const {state,actions}=setup(); state.motifLength=4; state.voiceLengths[0]=4;
    state.motif[0][0]=true; apply(actions,[],[],6); apply(actions,[0],[],5); apply(actions,[0],[0],4);
    const saved=snapshotMotifBank(state), fresh=setup().state;
    restoreMotifBank(fresh,saved); assert.deepEqual(fresh.motifs[0].cycles,state.motifs[0].cycles);
    for(const invalid of [0,9,1.5,'2']) { const bad=structuredClone(saved); bad.motifs[0].cycles.steps[0][0]=invalid; assert.throws(()=>validateMotifBank(bad)); }
    assert.ok(actions.applyVoiceCopy(actions.captureMusicalCopy('VOICE',0),1));
    assert.equal(state.motifs[0].cycles.voices[1],3);
    assert.equal(state.motifs[0].cycles.steps[1][0],4);
    state.selectedInstrument=0; assert.ok(actions.doubleSelected());
    assert.equal(state.motifs[0].cycles.steps[0][4],4);
    actions.at.begin(8); actions.at.select('instruments',0); actions.at.select('steps',0); actions.at.rotate(1); actions.at.finish(true);
    assert.equal(state.motifs[0].cycles.steps[0][1],4);
    assert.equal(state.motifs[0].cycles.steps[0][0],null);
    actions.clearMotifEvents(0); assert.equal(state.motifs[0].cycles.voices[0],null);
    assert.equal(readCycle(state.motifs[0],0,1).value,2);
    actions.at.resetMotif(); assert.equal(state.motifs[0].cycles,undefined);
});
for (const type of ['MIDI DRUM','MIDI CC','AUDIO']) test(`CYCLE real ${type} dispatch suppresses skipped passages and permits preview`, async () => {
    const {state,actions}=setup(); state.motifLength=1; state.motif[0][0]=true;
    state.padConfiguration.voices[0]={type,channel:1,note:36,cc:74,value:42,output:type==='AUDIO'?'LEFT':{mode:'DEFAULT'},source:'kick.wav'};
    apply(actions,[],[],6); state.transportState='PLAY';
    const app=await source('app.js');
    const body=app.slice(app.indexOf('function triggerMotifStep(step) {'),app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const messages=[],audio=[],timers=[];
    const trigger=new Function('state','midiOutputSelector','midiManager','launchpad','audioPlayer','setTimeout',body+';return triggerMotifStep;')(
        state,{options:[{textContent:'Synth'}],selectedIndex:0},
        {send:(_,message)=>messages.push(message),findOutput:()=>({})},
        {pulseInstrument(){}},{trigger:voice=>{audio.push(voice.source);return true;}},fn=>timers.push(fn));
    trigger(0);
    const first=type==='AUDIO'?audio.length:type==='MIDI CC'?messages.length:noteOns(messages).length;
    assert.equal(first,1);
    tick(actions); trigger(0);
    assert.equal(type==='AUDIO'?audio.length:type==='MIDI CC'?messages.length:noteOns(messages).length,first);
    trigger(0,0,'MOTIF');
    assert.equal(type==='AUDIO'?audio.length:type==='MIDI CC'?messages.length:noteOns(messages).length,2);
    tick(actions); trigger(0);
    assert.equal(type==='AUDIO'?audio.length:type==='MIDI CC'?messages.length:noteOns(messages).length,3);
    if(type==='MIDI CC') assert.equal(timers.length,0);
});

test('CYCLE live CANCEL restores deferred playback snapshots without resetting counters', () => {
    const {state,actions}=setup(); state.motifLength=4; state.voiceLengths[0]=4; state.motif[0][0]=true;
    apply(actions,[],[],6); state.transportState='PLAY';
    state.deferDouble([0],true);
    const snapshot=state.getPlaybackMotifForVoice(0);
    actions.at.begin(5); actions.at.apply(5);
    assert.equal(snapshot.cycles.motif,3);
    actions.at.finish(false);
    assert.equal(snapshot.cycles.motif,2);
    assert.equal(state.getCyclePass(0,'MOTIF'),0);
});

test('CYCLE Step assignment survives adding its future event; Modulation Step deletion removes override', () => {
    const {state,actions}=setup();
    apply(actions,[0],[1],5);
    state.selectedInstrument=0; actions.toggleInstrumentStep(1);
    assert.equal(readCycle(state.motifs[0],0,1).value,3);
    state.currentTimeline='MODULATION';
    apply(actions,[0],[1],6);
    assert.equal(readCycle(state.modulation.motifs[0],0,1).value,2);
    assert.equal(actions.deleteModulationStep(1),true);
    assert.equal(readCycle(state.modulation.motifs[0],0,1),null);
});
