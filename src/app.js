import { MidiManager } from "./hardware/midi/MidiManager.js";
import { LaunchpadMini } from "./hardware/launchpad/LaunchpadMini.js";

const midiManager = new MidiManager();

await midiManager.initialize();

const launchpad = new LaunchpadMini(midiManager);

midiManager.listenToInput(
    "Launchpad Mini",
    (data) => launchpad.handleMidiMessage(data)
);