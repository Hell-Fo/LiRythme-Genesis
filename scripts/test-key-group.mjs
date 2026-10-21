import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { AT_SLOTS, RATCHET_VALUES } from "../src/ATTransaction.mjs";
import { SwingTiming, readSwing, readRatchet, ratchetPlan } from "../src/SwingTiming.mjs";
import { snapshotMotifBank, restoreMotifBank, validateMotifBank } from "../src/MotifBankFormat.mjs";
import { readATPanel } from "../src/PlayATUI.mjs";
import { initializeProjectBook, connectProjectController } from "../src/ProjectBook.mjs";

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
    assert.equal(actions.at.begin(4), true);
    for (const v of instruments) actions.at.select("instruments", v, true);
    for (const s of steps) actions.at.select("steps", s, true);
    const result = actions.at.apply(7 - index);
    actions.at.finish(true);
    return result;
}
function timer() {
    let now = 0, next = 0;
    const jobs = new Map();
    const api = { now: () => now, later(fn, ms) { const id = ++next; jobs.set(id, { at: now + ms, fn }); return id; }, cancel: id => jobs.delete(id) };
    return { api, jobs, jump: time => { now = time; }, run(time) {
        while (true) {
            const entry = [...jobs].filter(([, job]) => job.at <= time).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!entry) break;
            const [id, job] = entry; jobs.delete(id); now = Math.max(now, job.at); job.fn();
        }
        now = time;
    } };
}

import { SCALES, validateScales, keyNote, validKeyCell } from "../src/KeyGroup.mjs";
import { initializeKeyGroupSettings } from "../src/KeyGroupUI.mjs";
import { mutateMotif } from "../src/Mutation.mjs";
async function dispatcher({ count = 4, swing = 50, tempo = 120, type = 'MIDI DRUM' } = {}) {
    const { state, actions, clock } = setup(), time = timer();
    state.tempo = tempo; state.motifLength = 2; state.motif[0][1] = true;
    state.padConfiguration.voices[0] = type === 'AUDIO' ? { type, source: 'kick.wav', output: 'LEFT' }
        : { type, note: 36, colorNote: 40, channel: 2, output: { mode: 'DEFAULT' } };
    actions.at.begin(3); actions.at.select('instruments',0); actions.at.select('steps',1); actions.at.apply(8-count); actions.at.finish(true);
    state.motifs[0].swings = Array.from({ length: 16 }, () => Array(32).fill(null)); state.motifs[0].swings[0][1] = swing;
    state.motifs[0].colors = Array.from({ length: 16 }, () => Array(32).fill(false)); state.motifs[0].colors[0][1] = true;
    const timing = new SwingTiming(state, clock, time.api); Object.defineProperty(state, 'noteTiming', { value: timing });
    actions.onCancelDelayedNotes = () => timing.reset();
    const notes = [], audio = [], leds = [], app = await source('app.js');
    const body = app.slice(app.indexOf('function triggerMotifStep(step) {'), app.indexOf('actions.setStepPreviewHandler(triggerMotifStep)'));
    const trigger = new Function('state', 'audioPlayer', 'midiOutputSelector', 'midiManager', 'launchpad', 'setTimeout', body + ';return triggerMotifStep;')(
        state, { trigger: (voice, velocity) => { audio.push([time.api.now(), voice.source, velocity]); return true; } },
        { options: [{ textContent: 'Drums' }], selectedIndex: 0 },
        { send: (port, msg) => notes.push({ time: time.api.now(), port, msg }), findOutput: () => ({}) },
        { pulseInstrument: voice => leds.push([time.api.now(), voice]) }, time.api.later);
    state.transportState = 'PLAY'; state.playheadPosition = 1;
    return { state, actions, clock, time, timing, notes, audio, leds, trigger };
}


function melodic(state, ...voices) {
    for (const id of voices) state.padConfiguration.voices[id] = { id, name: 'Keys', type: 'KEY GROUP', output: {mode:'DEFAULT'}, channel: 2 };
}

test('Voice gate chord owns arrows in and outside Key Group, including staggered releases', t => {
    const { state, actions } = setup(); melodic(state, 0);
    const c = new LaunchpadMini({ send() {} }, state, actions, 'LP');
    t.after(() => c.resetInputState());
    const voice = c.mapping.INSTRUMENTS[0], next = c.mapping.TOP_CONTROLS.NEXT;
    const send = (status, number, value) => c.handleMidiMessage([status, number, value]);
    state.padConfiguration.voices[0].gate = 50;
    const position = state.playheadPosition;
    send(0x90, voice, 127); send(0xB0, next, 127);
    send(0x90, voice, 0); send(0xB0, next, 0);
    assert.equal(state.padConfiguration.voices[0].gate, 62.5);
    assert.equal(state.playheadPosition, position);
    actions.at.begin(4);
    send(0x90, voice, 127); send(0xB0, next, 127);
    send(0xB0, next, 0); send(0x90, voice, 0);
    assert.equal(state.padConfiguration.voices[0].gate, 75);
    assert.equal(state.motifs[0].keyGroups?.[0]?.[0] ?? null, null);
    actions.at.finish(false);
    assert.equal(state.padConfiguration.voices[0].gate, 75);
    assert.equal(parseConfiguration(serializeConfiguration(state.padConfiguration)).voices[0].gate, 75);
    state.padConfiguration.voices[0].gate = 101;
    assert.throws(() => serializeConfiguration(state.padConfiguration));
});

test('Voice gate extends synth Note Off, captures duration and scales ratchet subdivisions', async () => {
    const d = await dispatcher({ count: 1 }); melodic(d.state, 0);
    d.state.padConfiguration.voices[0].gate = 100;
    d.trigger(1);
    d.state.padConfiguration.voices[0].gate = 12.5;
    d.time.run(50); assert.equal(d.notes.length, 1);
    d.time.run(125); assert.equal(d.notes.length, 2);
    assert.equal(d.notes[1].time, 125);
    d.state.padConfiguration.voices[0].gate = 75;
    assert.equal(d.timing.planFor(0).gate, 93.75);
    assert.equal(d.timing.planFor(0, null, { interval: 0.5, offset: 0, step: 1 }).gate, 46.875);
    d.state.motifs[0].ratchets[0][1] = 4;
    assert.equal(d.timing.planFor(0).gate, 23.4375);
    assert.equal(d.timing.planFor(0, { system: 'MOTIF', motifId: 0, step: 1 }).gate, 23.4375);
});

test('GATE arrows show all eight colors while held and restore octave feedback on release', t => {
    const { state, actions } = setup(); melodic(state, 0);
    const leds = new Map();
    const c = new LaunchpadMini({ send: (_, [status, note, color]) => leds.set(`${status}:${note}`, color) }, state, actions, 'LP');
    t.after(() => c.resetInputState());
    const voice = c.mapping.INSTRUMENTS[0];
    const previous = c.mapping.TOP_CONTROLS.PREVIOUS, next = c.mapping.TOP_CONTROLS.NEXT;
    const color = note => leds.get(`176:${note}`) & 0x33;
    actions.at.begin(4);
    c.handleMidiMessage([0x90, voice, 127]);
    assert.equal(color(previous), c.colors.OFF & 0x33);
    assert.equal(color(next), c.colors.OFF & 0x33);
    assert.equal(new SwingTiming(state, { source: 'INTERNAL' }).planFor(0).gate, state.getStepDurationMs() / 8);
    const colors = ['DIM_AMBER', 'AMBER', 'YELLOW', 'DIM_GREEN', 'GREEN', 'DIM_RED', 'RED'];
    for (const name of colors) {
        c.handleMidiMessage([0xB0, next, 127]); c.handleMidiMessage([0xB0, next, 0]);
        assert.equal(color(previous), c.colors[name] & 0x33);
        assert.equal(color(next), c.colors[name] & 0x33);
    }
    c.handleMidiMessage([0x90, voice, 0]);
    assert.equal(color(previous), c.colors.DIM_RED & 0x33);
    assert.equal(color(next), c.colors.DIM_RED & 0x33);
    actions.at.finish(false);
});
test('editable catalogue: 36 supplied scales, custom names, strict intervals and absent degrees', () => {
    assert.equal(Object.keys(SCALES).length, 36);
    assert.deepEqual([...validateScales({scales:[{'my scale':[0,3,7]}]})['my scale']], [0,3,7]);
    for (const scales of [[], [{x:[1,3]}], [{x:[0,3,3]}], [{x:[0,12]}], [{x:[0,2]}, {x:[0,3]}], [{x:[0,1,2,3,4,5,6,7,8]}]]) assert.throws(()=>validateScales({scales}));
    for (const [scale, intervals] of Object.entries(SCALES)) for (let degree=0; degree<8; degree++) {
        assert.equal(keyNote({root:60,scale},{degree}), degree<intervals.length ? 60+intervals[degree] : null);
    }
    assert.equal(keyNote({root:60,scale:'ionian'},{degree:2,octave:2}),88);
    assert.equal(keyNote({root:120,scale:'ionian'},{octave:1}),null);
    assert.equal(keyNote({root:60,scale:'removed custom scale'}),null);
    assert.equal(validKeyCell({degree:undefined}),false);
});
test('invalid custom catalogue falls back without rewriting the user file', async t => {
    const os=await import('node:os'), path=await import('node:path'), {pathToFileURL}=await import('node:url');
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lirythme-scales-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    await fs.mkdir(path.join(dir,'src')); await fs.mkdir(path.join(dir,'assets'));
    await fs.copyFile(new URL('../src/KeyGroup.mjs',import.meta.url),path.join(dir,'src/KeyGroup.mjs'));
    const file=path.join(dir,'assets/scales.json'); await fs.writeFile(file,'invalid JSON');
    const mod=await import(pathToFileURL(path.join(dir,'src/KeyGroup.mjs')));
    assert.deepEqual(Object.keys(mod.SCALES),['ionian']); assert.match(mod.scaleLoadWarning,/scales.json/);
    assert.equal(await fs.readFile(file,'utf8'),'invalid JSON');
});
test('Key Group only edits existing melodic events; mixed targets, CANCEL and provisional save', () => {
    const {state,actions}=setup(); melodic(state,0,1);
    assert.equal(apply(actions,[],[2],2),false); assert.equal(state.motifs[0].keyGroups,undefined);
    state.motif[0][2]=state.motif[1][3]=state.motif[2][2]=true;
    actions.at.begin(4); actions.at.select('steps',2); actions.at.select('steps',3,true);
    assert.ok(actions.at.apply(5)); assert.ok(actions.at.transposeKeyGroup(1)); assert.ok(actions.at.transposeKeyGroup(1));
    assert.deepEqual(state.motifs[0].keyGroups[0][2],{degree:2,octave:2});
    assert.equal(state.motifs[0].keyGroups[0][3],null); assert.equal(state.motifs[0].keyGroups[2][2],null);
    assert.equal(snapshotMotifBank(state).motifs[0].keyGroups,undefined);
    actions.at.finish(false); assert.equal(state.motifs[0].keyGroups,undefined);
});
test('octave boundary refusal is atomic and absent degrees stay silent after scale change', () => {
    const {state,actions}=setup(); melodic(state,0,1); state.motif[0][0]=state.motif[1][0]=true;
    apply(actions,[0],[0],6); apply(actions,[1],[0],0);
    state.keyGroup.root=120; actions.at.begin(4);
    const before=structuredClone(state.motifs); assert.equal(actions.at.transposeKeyGroup(1),false); assert.deepEqual(state.motifs,before);
    actions.at.finish(true); state.keyGroup={root:60,scale:'major penta'};
    assert.equal(state.getKeyGroupNote(0),null); assert.equal(state.getKeyGroupNote(1),60);
    assert.equal(state.motifs[0].keyGroups[0][0].degree,6);
    actions.at.begin(4); assert.equal(actions.at.apply(0),false); actions.at.finish(false);
});
test('Modulation adds degree and octave independently without adding notes', () => {
    const {state,actions}=setup(); melodic(state,0); state.motif[0][0]=true; apply(actions,[0],[0],2);
    state.currentTimeline='MODULATION'; actions.at.begin(4); actions.at.select('instruments',0); actions.at.select('steps',0);
    actions.at.transposeKeyGroup(1); actions.at.finish(true); state.modulationActive=true;
    assert.equal(state.getKeyGroupNote(0),76); assert.ok(state.modulation.motif.every(row=>row.every(v=>!v)));
    assert.deepEqual(state.modulation.motifs[0].attributes.KEY_GROUP[0][0],{octave:1});
    actions.at.begin(4); actions.at.select('instruments',0); actions.at.select('steps',0); actions.at.apply(3); actions.at.finish(true);
    assert.equal(state.getKeyGroupNote(0),83); state.modulationActive=false; assert.equal(state.getKeyGroupNote(0),64);
});
for (const transform of ['DOUBLE','ROTATION']) test(`Key Group immediate edits and CANCEL preserve pending ${transform}`,()=>{
    const {state,actions,clock}=setup(); melodic(state,0); state.motif[0][0]=state.motif[0][2]=true;
    state.motifLength=8; state.motifs[0].voiceLengths[0]=4; state.transportState='PLAY'; state.playheadPosition=1;
    if(transform==='DOUBLE'){state.selectedInstrument=0; actions.doubleSelected();}
    else {actions.at.begin(8); actions.at.select('instruments',0); actions.at.rotate(1); actions.at.finish(true);}
    const temporal=state.getPlaybackMotifForVoice(0), before=structuredClone(temporal), cycle=state.liveLengthCycle, rev=clock.transportRevision;
    actions.at.begin(4); actions.at.select('instruments',0); assert.ok(actions.at.apply(5));
    assert.deepEqual(temporal.keyGroups[0][0],{degree:2}); assert.deepEqual(temporal.events,before.events);
    assert.equal(state.liveLengthCycle,cycle); assert.equal(clock.transportRevision,rev); assert.equal(state.playheadPosition,1);
    actions.at.finish(false); assert.deepEqual(temporal,before);
});
test('persistence, rotation, double, copies, mutation and deletion retain independent pitch cells',()=>{
    const {state,actions}=setup(); melodic(state,0); state.selectedInstrument=0; state.motifLength=8; state.motifs[0].voiceLengths[0]=4;
    state.motif[0][1]=true; apply(actions,[0],[1],2); const fresh=setup().state;
    restoreMotifBank(fresh,snapshotMotifBank(state)); assert.deepEqual(fresh.keyGroup,{root:60,scale:'ionian'});
    assert.deepEqual(fresh.motifs[0].keyGroups[0][1],{degree:2});
    actions.at.begin(8); actions.at.select('instruments',0); actions.at.rotate(1); actions.at.finish(true);
    assert.deepEqual(state.motifs[0].keyGroups[0][2],{degree:2}); assert.ok(actions.doubleSelected());
    assert.deepEqual(state.motifs[0].keyGroups[0][6],{degree:2}); assert.notEqual(state.motifs[0].keyGroups[0][6],state.motifs[0].keyGroups[0][2]);
    assert.ok(actions.applyVoiceCopy(actions.captureMusicalCopy('VOICE',0),1));
    assert.ok(actions.applyMotifCopy(actions.captureMotifCopy(0),2));
    assert.notEqual(state.motifs[2].keyGroups[0][2],state.motifs[0].keyGroups[0][2]);
    const mutation=mutateMotif(state.motifs[0],2); assert.deepEqual(mutation.keyGroups[0][3],{degree:2});
    actions.clearMotifEvents(1); assert.equal(state.motifs[0].keyGroups[1][2],null);
    actions.toggleInstrumentStep(2); assert.equal(state.motifs[0].keyGroups[0][2],null);
    const saved=snapshotMotifBank(state); saved.keyGroup.scale='custom removed'; assert.doesNotThrow(()=>validateMotifBank(saved));
});
test('Launchpad Book and A-H expose only existing degrees with octave arrows',t=>{
    t.mock.timers.enable({apis:['setTimeout']}); const {state,actions}=setup(); melodic(state,0); state.motif[0][0]=true;
    const leds=new Map(), c=new LaunchpadMini({send:(_,[status,note,color])=>leds.set(`${status}:${note}`,color)},state,actions,'LP');
    t.after(()=>c.resetInputState()); const tap=(note,status=0x90)=>{c.handleMidiMessage([status,note,127]);c.handleMidiMessage([status,note,0]);};
    tap(c.mapping.BOOKS[4]); assert.equal(state.atTransaction.slot,4);
    tap(c.mapping.AT_VALUE[5]); assert.deepEqual(state.motifs[0].keyGroups[0][0],{degree:2});
    for(let i=0;i<40;i++)t.mock.timers.tick(4); c.drawATValues();
    assert.equal(leds.get(`144:${c.mapping.AT_VALUE[5]}`),(c.colors.YELLOW&0x33)|4);
    assert.equal(leds.get(`144:${c.mapping.AT_VALUE[0]}`),(c.colors.OFF&0x33)|4);
    tap(c.mapping.AT_VALUE[0]); assert.equal(state.motifs[0].keyGroups[0][0].degree,2);
    tap(c.mapping.TOP_CONTROLS.NEXT,0xB0); tap(c.mapping.TOP_CONTROLS.NEXT,0xB0);
    assert.equal(state.motifs[0].keyGroups[0][0].octave,2);
    tap(c.mapping.TOP_CONTROLS.PREVIOUS,0xB0); assert.equal(state.motifs[0].keyGroups[0][0].octave,1);
    assert.equal(state.playheadPosition,0);
});
test('Settings lists the external catalogue, persists root and blocks changes during A/T',()=>{
    const fields=new Map(); for(const id of ['key-root','key-scale','key-status'])fields.set(id,{value:'',children:[],listeners:{},replaceChildren(){this.children=[];},appendChild(v){this.children.push(v);},addEventListener(k,v){this.listeners[k]=v;}});
    let saves=0; const state={onBankChange:()=>saves++},doc={getElementById:id=>fields.get(id),createElement:()=>({})};
    const refresh=initializeKeyGroupSettings(state,doc),root=fields.get('key-root'),scale=fields.get('key-scale');
    assert.equal(scale.children.length,36); root.valueAsNumber=62; scale.value='dorian'; root.listeners.change();
    assert.deepEqual(state.keyGroup,{root:62,scale:'dorian'}); assert.equal(saves,1);
    state.atTransaction={}; refresh(); assert.ok(root.disabled); root.valueAsNumber=64; root.listeners.change(); assert.equal(state.keyGroup.root,62);
});
test('real MIDI dispatcher captures melodic pitch for Note Off and delayed ratchet; STOP preview',async()=>{
    const d=await dispatcher(); melodic(d.state,0); apply(d.actions,[0],[1],2);
    d.trigger(1); d.state.keyGroup.root=72; d.time.run(200);
    assert.equal(d.notes.length,8); for(const n of d.notes) assert.equal(n.msg[1],64);
    d.actions.stop(); d.trigger(1,0,'MOTIF'); d.time.run(400);
    assert.equal(d.notes.at(-1).msg[1],76); assert.equal(d.notes.at(-1).msg[2],0);
    d.state.keyGroup.scale='major penta'; d.state.motifs[0].keyGroups[0][1].degree=7;
    const count=d.notes.length; d.trigger(1,0,'MOTIF');d.time.run(600);assert.equal(d.notes.length,count);
});
import { editPadVoice } from '../src/PadVoiceEditor.mjs';
import { parseConfiguration, serializeConfiguration } from '../src/PadConfigurationFile.mjs';
test('Key Group Voice configuration round-trips and rejects fixed notes and invalid channels',()=>{
    const {state}=setup(); editPadVoice(state,0,'type','KEY GROUP'); editPadVoice(state,0,'channel',3);
    assert.equal(state.padConfiguration.voices[0].note,undefined);
    const parsed=parseConfiguration(serializeConfiguration(state.padConfiguration)); assert.equal(parsed.voices[0].type,'KEY GROUP'); assert.equal(parsed.voices[0].channel,3);
    assert.throws(()=>editPadVoice(state,0,'note',60)); assert.throws(()=>editPadVoice(state,0,'channel',17));
    editPadVoice(state,0,'type','MIDI DRUM'); assert.equal(state.padConfiguration.voices[0].note,36);
});

import { initializeKeyGroupOutput } from '../src/KeyGroupOutputUI.mjs';
test('Key Group output preference: default, dedicated port, restart and missing port',()=>{
    const storage=new Map(), state={}, select={options:[],value:'',replaceChildren(){this.options=[];},appendChild(o){this.options.push(o);},addEventListener(_,fn){this.change=fn;}}, status={};
    const args={state,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>id==='key-group-output'?select:status,createElement:()=>({})},midiManager:{outputs:new Map([['Drums',{}],['Synth',{}]]),findOutput(name){return this.outputs.get(name);}}};
    initializeKeyGroupOutput(args); assert.equal(state.keyGroupOutputName,null);
    select.value='Synth'; select.change(); assert.equal(state.keyGroupOutputName,'Synth');
    initializeKeyGroupOutput(args); assert.equal(select.value,'Synth');
    args.midiManager.outputs.delete('Synth'); initializeKeyGroupOutput(args);
    assert.equal(state.keyGroupOutputName,'Synth'); assert.match(status.textContent,/absent/);
    select.value='';select.change();assert.equal(state.keyGroupOutputName,null);
});
test('dedicated Key Group port captures Note Off and ratchet routing across preference changes',async()=>{
    const d=await dispatcher(); melodic(d.state,0); d.state.keyGroupOutputName='Synth';
    d.trigger(1); d.state.keyGroupOutputName='Other'; d.time.run(200);
    assert.equal(d.notes.length,8); assert.ok(d.notes.every(n=>n.port==='Synth'));
    d.actions.stop(); d.trigger(1,0,'MOTIF'); d.time.run(400); assert.equal(d.notes.at(-1).port,'Other');
    d.state.padConfiguration.voices[0]={type:'MIDI DRUM',note:36,channel:10,output:{mode:'DEFAULT'}};
    d.trigger(1,0,'MOTIF');d.time.run(600);assert.equal(d.notes.at(-1).port,'Drums');
});
test('native bridge keeps two note ports open and reuses ownership on routing changes',async()=>{
    const code=await source('hardware/midi/NativeMidiBridge.cjs'), ports=[];
    class Output {constructor(){ports.push(this);this.messages=[];} getPortCount(){return 2;} getPortName(i){return ['Drums','Synth'][i];} openPort(i){this.index=i;} closePort(){this.closed=true;} sendMessage(m){assert.ok(!this.closed);this.messages.push(m);}}
    const module={exports:{}};new Function('require','module',code)(()=>({Output}),module);
    const bridge=new module.exports.NativeMidiBridge(()=>{});
    bridge.openNotesOutput('Drums'); bridge.sendAdditionalNotes('Synth',[144,60,100]); bridge.sendNotes('Drums',[153,36,100]); bridge.sendAdditionalNotes('Synth',[144,60,0]);
    assert.equal(ports.length,2);assert.equal(ports[1].messages.length,2);assert.ok(!ports[0].closed);
    bridge.openNotesOutput('Synth');assert.equal(ports.length,2);assert.equal(bridge.notesOutput,ports[1]);
    bridge.setWorkerOutputName('Drums');assert.throws(()=>bridge.sendAdditionalNotes('Drums',[144,60,1]));
    bridge.close();assert.ok(ports.every(p=>p.closed));
});
test('native Key Group routing shares Clock-owned ports and sends other ports independently',async()=>{
    const code=await source('hardware/midi/MidiClockUtility.cjs');
    const body=code.slice(code.indexOf('function routeNotesMessage('),code.indexOf('function reconcileOutputRouting('));
    const f=new Function(`let previewEpoch=0, workerDestinationName='Clock', pendingWorkerDestinationName=null,notesDestinationName='Drums';
      const pendingNotesMessages=[], sent=[], clockWorker={postMessage:m=>sent.push(['clock',m])},nativeMidiBridge={notesOutputName:'Drums',sendNotes:(n,m)=>sent.push([n,m]),sendAdditionalNotes:(n,m)=>sent.push([n,m])};
      function getDesiredWorkerDestination(){return 'Clock';}
      ${body}
      return {route:routeNotesMessage,sent};`)();
    for(const name of ['Synth','Drums','Clock'])assert.equal(f.route(name,[144,60,100],{keyGroup:true}),true);
    assert.deepEqual(f.sent.map(s=>s[0]),['Synth','Drums','clock']);
    assert.equal(f.route('Synth',[144,60,100],{keyGroup:true,previewEpoch:0,previewExpiresAt:0}),true);assert.equal(f.sent.length,3);
});

for (const system of ['MOTIF', 'MODULATION']) for (const dedicated of [false,true]) {
    test(`Key Group VELOCITY A-H reaches MIDI from Launchpad: ${system}, ${dedicated?'dedicated':'default'} port`,async t=>{
        t.mock.timers.enable({apis:['setTimeout']});
        const d=await dispatcher(); melodic(d.state,0);
        d.state.keyGroupOutputName=dedicated?'Synth':null;
        d.state.currentTimeline=system; d.state.modulationActive=system==='MODULATION';
        const c=new LaunchpadMini({send(){}},d.state,d.actions,'LP'); t.after(()=>c.resetInputState());
        const tap=note=>{c.handleMidiMessage([0x90,note,127]);c.handleMidiMessage([0x90,note,0]);};
        tap(c.mapping.BOOKS[0]);assert.equal(d.state.atTransaction.slot,0);
        for (let index=0;index<8;index++) {
            tap(c.mapping.AT_VALUE[index]);const velocity=AT_SLOTS[0].values[index];
            assert.equal(d.state.getPlayingEvent(0,1).velocity,velocity);
            const start=d.notes.length;d.trigger(1);d.time.run((index+1)*200);
            const notes=d.notes.slice(start);assert.equal(notes.length,8);
            assert.ok(notes.filter(n=>n.msg[2]).every(n=>n.msg[2]===velocity));
            assert.ok(notes.every(n=>n.port===(dedicated?'Synth':'Drums')));
        }
    });
}

test('relative scale transposition wraps degrees, adds octaves and preserves missing-base silence',()=>{
    assert.equal(keyNote({root:60,scale:'ionian'},{degree:2},{degree:1}),65); // Mi -> Fa
    assert.equal(keyNote({root:60,scale:'ionian'},{degree:6},{degree:1}),72); // Si -> Do
    assert.equal(keyNote({root:60,scale:'ionian'},{degree:2,octave:1},{degree:1,octave:-1}),65);
    for (const [scale,intervals] of Object.entries(SCALES)) for(let base=0;base<intervals.length;base++)for(let offset=0;offset<8;offset++) {
        const n=base+offset;assert.equal(keyNote({root:60,scale},{degree:base},{degree:offset}),60+intervals[n%intervals.length]+12*Math.floor(n/intervals.length));
    }
    assert.equal(keyNote({root:60,scale:'major penta'},{degree:6},{degree:1}),null);
    assert.equal(keyNote({root:120,scale:'ionian'},{degree:0},{degree:7}),null);
    assert.equal(keyNote({root:0,scale:'ionian'},{degree:0},{octave:-1}),null);
});
for(const system of ['MOTIF','MODULATION'])test(`inverted physical A-H and UI labels: ${system}`,t=>{
    t.mock.timers.enable({apis:['setTimeout']});const {state,actions}=setup();melodic(state,0);state.motif[0][0]=true;
    state.currentTimeline=system;state.keyGroup.scale='major penta';const leds=new Map();
    const c=new LaunchpadMini({send:(_,[status,note,color])=>leds.set(`${status}:${note}`,color)},state,actions,'LP');t.after(()=>c.resetInputState());
    const tap=note=>{c.handleMidiMessage([0x90,note,127]);c.handleMidiMessage([0x90,note,0]);};
    tap(c.mapping.BOOKS[4]);
    for(let index=7;index>=0;index--){
        tap(c.mapping.AT_VALUE[index]);const degree=7-index,valid=system==='MODULATION'||degree<5;
        const motif=state.forSystem(system).motifs[0],cell=system==='MODULATION'?motif.attributes.KEY_GROUP[0][0]:motif.keyGroups[0][0];
        if(valid)assert.equal(cell.degree,degree);
        const panel=readATPanel(state);assert.equal(panel.selected,valid?index:3);
        assert.equal(panel.values[index],valid?system==='MODULATION'?`+${degree} degré${degree===1?'':'s'}`:`Degré ${degree+1} · +${SCALES['major penta'][degree]}`:undefined);
        c.drawATValues();assert.equal(leds.get(`144:${c.mapping.AT_VALUE[index]}`),((valid?c.colors.YELLOW:c.colors.OFF)&0x33)|4);
    }
});
test('Modulation transposition is immediate, cancellable, captured per ratchet and leaves sources unchanged',async()=>{
    const d=await dispatcher();melodic(d.state,0);apply(d.actions,[0],[1],6); // Si
    const original=structuredClone(d.state.motifs);d.state.currentTimeline='MODULATION';d.state.modulationActive=true;
    d.actions.at.begin(4);d.actions.at.select('instruments',0);d.actions.at.apply(6); // G = +1
    assert.equal(d.state.getKeyGroupNote(0),72);d.trigger(1);
    d.actions.at.apply(7);assert.equal(d.state.getKeyGroupNote(0),71); // H = 0
    d.time.run(200);assert.ok(d.notes.every(n=>n.msg[1]===72));
    d.actions.at.finish(false);assert.equal(d.state.modulation.motifs[0].attributes.KEY_GROUP,undefined);
    assert.deepEqual(d.state.motifs,original);assert.equal(d.state.getKeyGroupNote(0),71);
});

for (const transport of ['STOP', 'PLAY']) test(`successive Key Group step selections preserve independent pitches in ${transport}`, t => {
    t.mock.timers.enable({apis:['setTimeout']});
    const {state,actions}=setup(); melodic(state,0);
    state.transportState=transport; state.motif[0][1]=state.motif[0][3]=true;
    const c=new LaunchpadMini({send:()=>{}},state,actions,'LP');t.after(()=>c.resetInputState());
    const tap=note=>{c.handleMidiMessage([0x90,note,127]);c.handleMidiMessage([0x90,note,0]);};
    tap(c.mapping.BOOKS[4]);
    tap(c.mapping.MOTIF[1]); tap(c.mapping.AT_VALUE[6]);
    assert.deepEqual([...state.atTransaction.steps],[1]);
    assert.equal(state.motifs[0].keyGroups[0][1].degree,1);
    tap(c.mapping.MOTIF[3]); tap(c.mapping.AT_VALUE[3]);
    assert.deepEqual([...state.atTransaction.steps],[3]);
    assert.equal(state.motifs[0].keyGroups[0][1].degree,1);
    assert.equal(state.motifs[0].keyGroups[0][3].degree,4);
    state.playheadPosition=1; assert.equal(state.getKeyGroupNote(0),62);
    state.playheadPosition=3; assert.equal(state.getKeyGroupNote(0),67);
});

test('Project Book preserves banks, chains and keys across switching, copy and persistence', () => {
    const { state, actions } = setup();
    initializeProjectBook(state, actions);
    state.motifs[0].events[0][0] = true;
    state.chain = [0, 2, 0]; state.chainEnabled = true; state.chainLoopMasterIndex = 2;
    state.keyGroup.root = 65;
    state.padConfiguration.voices[8].note = 50;
    state.projects.select(1);
    assert.equal(state.motifs[0].events[0][0], false);
    assert.equal(state.projectBook.slots[1].name, 'Projet 02');
    assert.equal(state.padConfiguration.voices[8].note, 50);
    state.padConfiguration.voices[8].note = 51;
    state.projects.select(0);
    assert.equal(state.motifs[0].events[0][0], true);
    assert.deepEqual(state.chain, [0, 2, 0]);
    assert.equal(state.keyGroup.root, 65);
    assert.equal(state.padConfiguration.voices[8].note, 50);
    state.projectBook.slots[0].description = "Ambiance nocturne\nPartie B";
    state.projects.copy(0, 3);
    const saved = snapshotMotifBank(state);
    const fresh = setup(); restoreMotifBank(fresh.state, saved); initializeProjectBook(fresh.state, fresh.actions);
    fresh.state.projects.restorePads();
    assert.equal(fresh.state.padConfiguration.voices[8].note, 50);
    fresh.state.projects.select(3);
    assert.equal(fresh.state.padConfiguration.voices[8].note, 50);
    assert.equal(fresh.state.projectBook.slots[3].description, "Ambiance nocturne\nPartie B");
    assert.equal(fresh.state.motifs[0].events[0][0], true);
    fresh.state.motifs[0].events[0][0] = false;
    fresh.state.projects.select(0);
    assert.equal(fresh.state.motifs[0].events[0][0], true);
    fresh.state.projects.remove(3);
    assert.equal(fresh.state.projectBook.slots[3], null);
    assert.throws(() => validateMotifBank({ ...saved, projects: { active: 0, slots: [] } }));
});

test('Project controller uses reference keyboard and blocks Voices, MOD and Shift+Play chain', t => {
    const { state, actions } = setup(); initializeProjectBook(state, actions);
    const c = new LaunchpadMini({ send() {} }, state, actions, 'LP');
    t.after(() => c.resetInputState()); connectProjectController(c);
    const press = (status, note) => { c.handleControllerMessage([status, note, 127]); c.handleControllerMessage([status, note, 0]); };
    c.handleControllerMessage([0xB0, 104, 127]); press(0x90, 120); c.handleControllerMessage([0xB0, 104, 0]);
    assert.equal(state.projectMode, true); assert.equal(c.shiftPressed, false);
    const voice = state.selectedInstrument;
    press(0x90, 64); press(0xB0, 105);
    assert.equal(state.selectedInstrument, voice); assert.equal(state.modulationRequested, false);
    press(0x90, 1); assert.equal(state.keyGroup.root, 61);
    press(0x90, 69); assert.equal(state.projectBook.active, 1);
    assert.equal(readATPanel(state).name, 'PROJETS');
    c.handleControllerMessage([0xB0, 104, 127]); press(0x90, 120); c.handleControllerMessage([0xB0, 104, 0]);
    assert.equal(state.projectMode, false); assert.equal(c.shiftPressed, false);
});
