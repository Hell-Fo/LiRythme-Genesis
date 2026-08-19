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
launchpad.enableDoubleBuffering();

actions.setClockStepHandler(() => {
    const step = state.playheadPosition;

    if (state.motif.kick[step]) {
        midiManager.send(
            "Arturia DrumBrute Impact",
            [0x99, 36, 100]
        );

        setTimeout(() => {
            midiManager.send(
                "Arturia DrumBrute Impact",
                [0x99, 36, 0]
            );
        }, 50);
    }

    launchpad.drawMotif();
    launchpad.drawPlayhead();
    launchpad.swapBuffers();
});

actions.setClockBeatHandler(() => {
    console.log("BEAT");
    launchpad.pulseTransport();
});

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

launchpad.swapBuffers();

midiManager.send(
    "Arturia DrumBrute Impact",
    [0x99, 36, 100]
);