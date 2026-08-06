import { MidiManager } from "./hardware/midi/MidiManager.js";

const midiManager = new MidiManager();

await midiManager.initialize();

midiManager.send("Launchpad Mini", [0x90, 0, 127]);