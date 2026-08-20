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

    const midiNotes = {
        tomH: 39,
        tomL: 40,
        closedHat: 43,
        openHat: 44,
        kick: 36,
        snare1: 37,
        snare2: 38,
        cymbal: 41
    };

    for (const [instrument, steps] of Object.entries(state.motif)) {
        if (!steps[step]) {
            continue;
        }

        const note = midiNotes[instrument];

        if (note === undefined) {
            continue;
        }

        midiManager.send(
            "Arturia DrumBrute Impact",
            [0x99, note, 100]
        );

        setTimeout(() => {
            midiManager.send(
                "Arturia DrumBrute Impact",
                [0x99, note, 0]
            );
        }, 50);
    }

    launchpad.drawMotif();
    launchpad.drawPlayhead();
    launchpad.drawInstruments();
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
