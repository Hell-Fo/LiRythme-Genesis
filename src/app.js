import { LiRythmeState } from "./LiRythmeState.js";
import { LiRythmeClock } from "./LiRythmeClock.js";
import { MidiManager } from "./hardware/midi/MidiManager.js";
import { MidiClockInput } from "./hardware/midi/MidiClockInput.js";
import { DrumBruteImpactProfile } from "./hardware/midi/profiles/DrumBruteImpactProfile.js";
import { LaunchpadMini } from "./hardware/launchpad/LaunchpadMini.js";
import { LiRythmeActions } from "./LiRythmeActions.js";


// ============================================================
// SETTINGS
// ============================================================

const focusStartupCheckbox =
    document.getElementById("focus-startup");

const savedFocusStartup =
    localStorage.getItem("focusStartup");

focusStartupCheckbox.checked =
    savedFocusStartup === "true";

focusStartupCheckbox.addEventListener(
    "change",
    () => {
        localStorage.setItem(
            "focusStartup",
            focusStartupCheckbox.checked
        );

        console.log(
            "SETTING: Focus at startup =",
            focusStartupCheckbox.checked
        );
    }
);


// ============================================================
// CORE
// ============================================================

const midiManager = new MidiManager();

const state = new LiRythmeState();
const clock = new LiRythmeClock(state);

state.filterMode =
    focusStartupCheckbox.checked;

if (state.filterMode) {
    state.visibleInstrumentFilter.clear();
    state.selectedInstrument = null;
}

const actions = new LiRythmeActions(state, clock);

console.log(
    "ACTIONS:",
    Object.getOwnPropertyNames(
        Object.getPrototypeOf(actions)
    )
);


// ============================================================
// MIDI
// ============================================================

await midiManager.initialize();

const controllerSelector =
    document.getElementById("midi-controller");

const controllerName =
    controllerSelector.options[
        controllerSelector.selectedIndex
    ]?.textContent;
const midiOutputSelector =
    document.getElementById("midi-output");

console.log(
    "MIDI CONTROLLER:",
    controllerName
);

const drumBruteInput =
    [...midiManager.midiAccess.inputs.values()]
        .find(input =>
            input.name
                ?.toLowerCase()
                .includes("drumbrute impact")
        );

if (drumBruteInput) {
    const midiClockInput = new MidiClockInput(clock);
    const drumBruteProfile =
        new DrumBruteImpactProfile(
            actions,
            () => {
                launchpad.drawMotif();
                launchpad.drawPlayhead();
                launchpad.swapBuffers();
            }
        );

    clock.setSource("MIDI");

    drumBruteInput.addEventListener(
        "midimessage",
        (event) => {
            midiClockInput.handleMidiMessage(event.data);
            drumBruteProfile.handleMidiMessage(event.data);
        }
    );

    console.log(
        "CLOCK SOURCE: MIDI",
        drumBruteInput.name
    );
}


// ============================================================
// CONTROLLER
// ============================================================

const launchpad = new LaunchpadMini(
    midiManager,
    state,
    actions,
    controllerName
);

launchpad.enableDoubleBuffering();

midiManager.listenToInput(
    controllerName,
    (data) => launchpad.handleMidiMessage(data)
);


// ============================================================
// CLOCK STEP
// ============================================================

function triggerMotifStep(step) {
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
        const midiOutputName =
            midiOutputSelector.options[
                midiOutputSelector.selectedIndex
            ]?.textContent;
        midiManager.send(
            midiOutputName,
            [0x99, note, 100]
        );

        setTimeout(() => {
            midiManager.send(
                midiOutputName,
                [0x99, note, 0]
            );
        }, 50);
    }
}

actions.setStepPreviewHandler(triggerMotifStep);

actions.setClockStepHandler(() => {
    triggerMotifStep(state.playheadPosition);

    launchpad.drawMotif();
    launchpad.drawPlayhead();
    launchpad.drawInstruments();
    launchpad.swapBuffers();
});


// ============================================================
// CLOCK BEAT
// ============================================================

actions.setClockBeatHandler(() => {
    console.log("BEAT");
    launchpad.pulseTransport();
});


// ============================================================
// INITIAL DRAW
// ============================================================

launchpad.drawMotif();
launchpad.drawPlayhead();
launchpad.drawInstruments();
launchpad.drawAttributesTransformations();
launchpad.drawTopControls();
launchpad.drawTransport();
launchpad.drawFilterStatus();
launchpad.swapBuffers();


// ============================================================
// TEST DRUMBRUTE
// ============================================================

