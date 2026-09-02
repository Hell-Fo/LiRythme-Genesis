import { LiRythmeState } from "./LiRythmeState.js";
import { LiRythmeClock } from "./LiRythmeClock.js";
import { MidiManager } from "./hardware/midi/MidiManager.js";
import { MidiClockInput } from "./hardware/midi/MidiClockInput.js";
import { MidiClockOutput } from "./hardware/midi/MidiClockOutput.js";
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

const nativeMidiTestOutputName =
    globalThis.liRythmeRuntime?.nativeMidiTestOutputName ?? null;

await midiManager.initialize({
    webMidiEnabled:
        !nativeMidiTestOutputName,
    nativeClockOutputName:
        nativeMidiTestOutputName,
    nativeBridge:
        nativeMidiTestOutputName
            ? globalThis.nativeMidi
            : null
});

const controllerSelector =
    document.getElementById("midi-controller");

const savedMidiController =
    localStorage.getItem("midiController");

const savedMidiControllerIndex =
    [...controllerSelector.options]
        .findIndex(
            option =>
                option.textContent === savedMidiController
        );

if (savedMidiControllerIndex >= 0) {
    controllerSelector.selectedIndex =
        savedMidiControllerIndex;
} else if (controllerSelector.options.length > 0) {
    controllerSelector.selectedIndex = 0;
}

controllerSelector.addEventListener(
    "change",
    () => {
        const selectedController =
            controllerSelector.options[
                controllerSelector.selectedIndex
            ]?.textContent;

        if (selectedController) {
            localStorage.setItem(
                "midiController",
                selectedController
            );

            switchMidiController(selectedController);
        }
    }
);

const controllerName =
    controllerSelector.options[
        controllerSelector.selectedIndex
    ]?.textContent;
const midiOutputSelector =
    document.getElementById("midi-output");

const savedMidiOutput =
    localStorage.getItem("midiOutput");

const savedMidiOutputIndex =
    [...midiOutputSelector.options]
        .findIndex(
            option =>
                option.textContent === savedMidiOutput
        );

if (savedMidiOutputIndex >= 0) {
    midiOutputSelector.selectedIndex =
        savedMidiOutputIndex;
} else if (midiOutputSelector.options.length > 0) {
    midiOutputSelector.selectedIndex = 0;
}

const setMidiNotesOutputFromSelection = () => {
    const selectedOutput =
        midiOutputSelector.options[
            midiOutputSelector.selectedIndex
        ]?.textContent;

    midiManager.setNotesOutput(selectedOutput ?? null);
};

setMidiNotesOutputFromSelection();

midiOutputSelector.addEventListener(
    "change",
    () => {
        const selectedOutput =
            midiOutputSelector.options[
                midiOutputSelector.selectedIndex
            ]?.textContent;

        if (selectedOutput) {
            localStorage.setItem(
                "midiOutput",
                selectedOutput
            );
        }

        setMidiNotesOutputFromSelection();
    }
);

const midiClockOutputSelector =
    document.getElementById("midi-clock-output");

const midiClockOutput =
    new MidiClockOutput(midiManager);

const savedMidiClockOutput =
    localStorage.getItem("midiClockOutput");

const savedMidiClockOutputIndex =
    [...midiClockOutputSelector.options]
        .findIndex(
            option =>
                option.textContent === savedMidiClockOutput
        );

if (nativeMidiTestOutputName) {
    midiClockOutputSelector.selectedIndex =
        [...midiClockOutputSelector.options]
            .findIndex(
                option =>
                    option.textContent === nativeMidiTestOutputName
            );
} else if (savedMidiClockOutputIndex >= 0) {
    midiClockOutputSelector.selectedIndex =
        savedMidiClockOutputIndex;
} else {
    midiClockOutputSelector.selectedIndex = 0;
}

const setMidiClockOutputFromSelection = () => {
    const selectedOption =
        midiClockOutputSelector.options[
            midiClockOutputSelector.selectedIndex
        ];

    midiClockOutput.setOutput(
        selectedOption?.value === "NONE"
            ? "NONE"
            : selectedOption?.textContent
    );
};

const syncMidiClockOutput = ({ clear = false } = {}) => {
    midiClockOutput.setSource(clock.source);

    if (clock.source === "INTERNAL") {
        midiClockOutput.startClock(
            () => state.tempo,
            () => clock.source === "INTERNAL"
        );
        return;
    }

    midiClockOutput.stopClock({ clear });
};

setMidiClockOutputFromSelection();

midiClockOutputSelector.addEventListener(
    "change",
    () => {
        const selectedOption =
            midiClockOutputSelector.options[
                midiClockOutputSelector.selectedIndex
            ];

        if (selectedOption) {
            localStorage.setItem(
                "midiClockOutput",
                selectedOption.value === "NONE"
                    ? "NONE"
                    : selectedOption.textContent
            );
        }

        setMidiClockOutputFromSelection();
        syncMidiClockOutput();
    }
);

actions.setTransportTransitionHandler(
    ({ from, to, origin }) => {
        if (
            origin === "MIDI_IN" ||
            clock.source !== "INTERNAL"
        ) {
            return;
        }

        if (from === "STOP" && to === "PLAY") {
            midiClockOutput.sendStart();
            return;
        }

        if (from === "PAUSE" && to === "PLAY") {
            midiClockOutput.sendContinue();
            return;
        }

        if (
            (from === "PLAY" && to === "PAUSE") ||
            (to === "STOP" && from !== "STOP")
        ) {
            midiClockOutput.sendStop();
        }
    }
);

if (nativeMidiTestOutputName) {
    const controls = document.createElement("div");
    const playButton = document.createElement("button");
    const stopButton = document.createElement("button");

    playButton.textContent = "PLAY";
    stopButton.textContent = "STOP";

    playButton.addEventListener(
        "click",
        () => midiClockOutput.sendStart()
    );
    stopButton.addEventListener(
        "click",
        () => midiClockOutput.sendStop()
    );

    controls.append(playButton, stopButton);
    midiClockOutputSelector.insertAdjacentElement(
        "afterend",
        controls
    );
}

console.log(
    "MIDI CONTROLLER:",
    controllerName
);

const midiClockInputSelector =
    document.getElementById("midi-clock-input");

const savedMidiClockInput =
    localStorage.getItem("midiClockInput");

const defaultClockInput =
    savedMidiClockInput === null
        ? [...midiManager.midiAccess.inputs.values()]
            .find(input =>
                input.name
                    ?.toLowerCase()
                    .includes("drumbrute impact")
            )
        : null;

const initialClockInputName =
    savedMidiClockInput === "INTERNAL"
        ? "INTERNAL"
        : midiManager.findInput(savedMidiClockInput)?.name
            ?? (
                savedMidiClockInput === null
                    ? defaultClockInput?.name ?? "INTERNAL"
                    : "INTERNAL"
            );

const initialClockInputIndex =
    [...midiClockInputSelector.options]
        .findIndex(
            option =>
                initialClockInputName === "INTERNAL"
                    ? option.value === "INTERNAL"
                    : option.textContent === initialClockInputName
        );

if (initialClockInputIndex >= 0) {
    midiClockInputSelector.selectedIndex =
        initialClockInputIndex;
}

midiClockInputSelector.addEventListener(
    "change",
    () => {
        const selectedOption =
            midiClockInputSelector.options[
                midiClockInputSelector.selectedIndex
            ];

        const selectedClockInput =
            selectedOption?.value === "INTERNAL"
                ? "INTERNAL"
                : selectedOption?.textContent;

        if (selectedClockInput) {
            const previousClockSource = clock.source;

            localStorage.setItem(
                "midiClockInput",
                selectedClockInput
            );

            switchMidiClockInput(selectedClockInput);
            syncMidiClockOutput({
                clear:
                    previousClockSource === "INTERNAL" &&
                    clock.source === "MIDI"
            });
        }
    }
);


// ============================================================
// CONTROLLER
// ============================================================

const launchpad = new LaunchpadMini(
    midiManager,
    state,
    actions,
    controllerName
);

const handleControllerMessage =
    (data) => launchpad.handleMidiMessage(data);

function redrawLaunchpad() {
    launchpad.drawMotif();
    launchpad.drawPlayhead();
    launchpad.drawInstruments();
    launchpad.drawAttributesTransformations();
    launchpad.drawTopControls();
    launchpad.drawTransport();
    launchpad.drawFilterStatus();
    launchpad.swapBuffers();
}

function switchMidiController(name) {
    const ports = midiManager.findControllerPorts(name);

    if (!ports.input || !ports.output) {
        console.warn(
            "MIDI controller unavailable:",
            name
        );

        return false;
    }

    const previousDeviceName = launchpad.deviceName;

    launchpad.resetInputState();
    midiManager.disconnectControllerInput();
    launchpad.setDeviceName(name);

    const connected = midiManager.connectControllerInput(
        name,
        handleControllerMessage
    );

    if (!connected) {
        launchpad.setDeviceName(previousDeviceName);
        midiManager.connectControllerInput(
            previousDeviceName,
            handleControllerMessage
        );

        return false;
    }

    launchpad.enableDoubleBuffering();
    redrawLaunchpad();

    return true;
}

switchMidiController(controllerName);

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
let activeClockProfile = null;

midiClockInput.onStart = () => {
    if (activeClockProfile === drumBruteProfile) {
        return;
    }

    actions.startPlayback({ origin: "MIDI_IN" });
    redrawLaunchpad();
};

midiClockInput.onContinue = () => {
    if (activeClockProfile === drumBruteProfile) {
        return;
    }

    actions.continuePlayback({ origin: "MIDI_IN" });
    redrawLaunchpad();
};

midiClockInput.onStop = () => {
    if (activeClockProfile === drumBruteProfile) {
        return;
    }

    actions.stop({ origin: "MIDI_IN" });
    redrawLaunchpad();
};

const handleClockMessage = (data) => {
    midiClockInput.handleMidiMessage(data);
    activeClockProfile?.handleMidiMessage(data);
};

function switchMidiClockInput(name) {
    if (name === "INTERNAL") {
        midiManager.disconnectClockInput();
        activeClockProfile = null;
        clock.resetMidiPhase();
        clock.setSource("INTERNAL");

        if (state.transportState === "PLAY") {
            actions.startClock();
        }

        console.log("CLOCK SOURCE: INTERNAL");

        return true;
    }

    const input = midiManager.findInput(name);

    if (!input) {
        console.warn("MIDI Clock input unavailable:", name);
        return false;
    }

    const previousSource = clock.source;
    const previousInputName = midiManager.clockInput?.name;
    const previousClockProfile = activeClockProfile;

    midiManager.disconnectClockInput();
    clock.resetMidiPhase();
    clock.setSource("MIDI");

    activeClockProfile =
        name.toLowerCase().includes("drumbrute impact")
            ? drumBruteProfile
            : null;

    const connected = midiManager.connectClockInput(
        name,
        handleClockMessage
    );

    if (!connected) {
        activeClockProfile = previousClockProfile;
        clock.setSource(previousSource);

        if (previousInputName) {
            midiManager.connectClockInput(
                previousInputName,
                handleClockMessage
            );
        } else if (
            previousSource === "INTERNAL" &&
            state.transportState === "PLAY"
        ) {
            actions.startClock();
        }

        return false;
    }

    console.log("CLOCK SOURCE: MIDI", name);

    return true;
}

switchMidiClockInput(initialClockInputName);
syncMidiClockOutput();


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
// TEST DRUMBRUTE
// ============================================================

