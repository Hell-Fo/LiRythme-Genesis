import { LiRythmeState } from "./LiRythmeState.js";
import { MidiManager } from "./hardware/midi/MidiManager.js";
import { LaunchpadMini } from "./hardware/launchpad/LaunchpadMini.js";
import { LiRythmeActions } from "./LiRythmeActions.js";

const midiManager = new MidiManager();

const state = new LiRythmeState();
const actions = new LiRythmeActions(state);
console.log(
    "ACTIONS:",
    Object.getOwnPropertyNames(
        Object.getPrototypeOf(actions)
    )
);

await midiManager.initialize();

const launchpad = new LaunchpadMini(
    midiManager,
    state,
    actions
);

midiManager.listenToInput(
    "Launchpad Mini",
    (data) => launchpad.handleMidiMessage(data)
);

launchpad.drawMotif();
launchpad.drawPlayhead();
launchpad.drawInstruments();
launchpad.drawAttributesTransformations();
launchpad.drawTopControls();
launchpad.drawTransport();