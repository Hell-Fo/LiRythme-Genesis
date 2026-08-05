import { MidiManager } from "./hardware/midi/MidiManager.js";

const midiManager = new MidiManager();

await midiManager.initialize();