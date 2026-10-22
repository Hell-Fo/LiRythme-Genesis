import { initializeProjectBook, connectProjectController } from "./ProjectBook.mjs";
import { SwingTiming } from "./SwingTiming.mjs";
import { initializeKeyGroupOutput } from "./KeyGroupOutputUI.mjs";
import { LiRythmeState } from "./LiRythmeState.js";
import { LiRythmeClock } from "./LiRythmeClock.js";
import { MidiManager } from "./hardware/midi/MidiManager.js";
import { MidiClockInput } from "./hardware/midi/MidiClockInput.js";
import { MidiClockOutput } from "./hardware/midi/MidiClockOutput.js";
import { DrumBruteImpactProfile } from "./hardware/midi/profiles/DrumBruteImpactProfile.js";
import { LaunchpadMini } from "./hardware/launchpad/LaunchpadMini.js";
import { LiRythmeActions } from "./LiRythmeActions.js";
import { initializeSettingsUI } from "./SettingsUI.js";
import { initializeHelpUI } from "./HelpUI.mjs";
import { AudioVoicePlayer } from "./AudioVoicePlayer.mjs";
import { initializePlayStatusUI } from "./PlayStatusUI.mjs";
import { initializePlayMotifUI } from "./PlayMotifUI.mjs";
import { initializePlayCycleUI } from "./PlayCycleUI.mjs";
import { initializePlayChainUI } from "./PlayChainUI.mjs";
import { initializePlayFooterUI } from "./PlayFooterUI.mjs";
import { initializePlayATUI } from "./PlayATUI.mjs";
import { initializeMotifBankAutosave } from "./MotifBankAutosave.mjs";


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
const motifBankAutosave = await initializeMotifBankAutosave(state, window.motifBankFiles);
window.motifBankFiles.onClose(() => motifBankAutosave.flush());
window.motifBankFiles.ready();
const clock = new LiRythmeClock(state);
Object.defineProperty(state, "noteTiming", { value: new SwingTiming(state, clock) });
const motifUI = initializePlayMotifUI({ state });
const modulationUI = initializePlayMotifUI({ state, system: "MODULATION" });
const cycleUI = ["MOTIF", "MODULATION"].map(system => initializePlayCycleUI({ state, system }));
const atUI = initializePlayATUI({ state });
let footerUI = null;
const playStatusUI = initializePlayStatusUI({ state, clock, midiManager,
    renderMotif: () => { motifUI.render(); modulationUI.render(); cycleUI.forEach(ui => ui.render()); }, renderFooter: () => { footerUI?.render(); atUI.render(); } });

state.filterMode =
    focusStartupCheckbox.checked;

if (state.filterMode) {
    state.visibleInstrumentFilter.clear();
    state.selectedInstrument = null;
}

const actions = new LiRythmeActions(state, clock);
actions.onCancelDelayedNotes = () => state.noteTiming.reset();
const motifChainUI = initializePlayChainUI({ state, system: "MOTIF" });
const modulationChainUI = initializePlayChainUI({ state, system: "MODULATION" });
actions.onChainChange = () => { motifChainUI.render(); modulationChainUI.render(); };
const audioPlayer = new AudioVoicePlayer({ files: window.audioSampleFiles });
document.addEventListener("pointerdown", () => { void audioPlayer.resume(); });
initializeProjectBook(state, actions);
const settingsUI = initializeSettingsUI({ state, clock, actions, audioPlayer });
initializeHelpUI({ readGuide: () => window.usageGuide.read() });
// Restore before connecting transport/controller input handlers.
await settingsUI.ready;
state.projects.restorePads();
audioPlayer.sync(state.padConfiguration.voices);

console.log(
    "ACTIONS:",
    Object.getOwnPropertyNames(
        Object.getPrototypeOf(actions)
    )
);


// ============================================================
// MIDI
// ============================================================

await midiManager.initialize({
    webMidiEnabled: false,
    nativeBridge: globalThis.nativeMidi
});

const controllerSelector =
    document.getElementById("midi-controller");

initializeKeyGroupOutput({ state, midiManager, document, storage: localStorage });

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
const drumBruteClockOutputProfile =
    new DrumBruteImpactProfile(actions);
let activeClockOutputProfile = null;

midiClockOutput.setNativeStepHandler(
    event => clock.receiveInternalClockStep(event)
);

const savedMidiClockOutput =
    localStorage.getItem("midiClockOutput");

const savedMidiClockOutputIndex =
    [...midiClockOutputSelector.options]
        .findIndex(
            option =>
                option.textContent === savedMidiClockOutput
        );

if (savedMidiClockOutputIndex >= 0) {
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

    const outputName =
        selectedOption?.value === "NONE"
            ? "NONE"
            : selectedOption?.textContent;

    activeClockOutputProfile =
        outputName?.toLowerCase().includes("drumbrute impact")
            ? drumBruteClockOutputProfile
            : null;

    midiClockOutput.setOutput(outputName);
};

const syncMidiClockOutput = ({ clear = false } = {}) => {
    midiClockOutput.setSource(clock.source);
    midiClockOutput.setStepTransport(
        clock.source === "INTERNAL" &&
            state.transportState === "PLAY"
            ? "CONTINUE"
            : "STOP",
        clock.transportRevision
    );

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
    ({ from, to, origin, transportRevision }) => {
        playStatusUI.render();
        midiManager.invalidatePreviews();
        if (to === "PAUSE" || to === "STOP") {
            audioPlayer.stop();
            try {
                launchpad.cancelInstrumentPulses(true);
            } catch (error) {
                console.error("Instrument LED cleanup failed:", error);
            }
            launchpad.drawTransport();
        }

        if (
            origin === "MIDI_IN" ||
            clock.source !== "INTERNAL"
        ) {
            return;
        }

        const companionMessage =
            activeClockOutputProfile
                ?.getTransportOutputMessage(from, to) ?? null;

        if (from === "STOP" && to === "PLAY") {
            midiClockOutput.sendStart(
                transportRevision,
                companionMessage
            );
            return;
        }

        if (from === "PAUSE" && to === "PLAY") {
            midiClockOutput.sendContinue(
                transportRevision,
                companionMessage
            );
            return;
        }

        if (
            (from === "PLAY" && to === "PAUSE") ||
            (to === "STOP" && from !== "STOP")
        ) {
            midiClockOutput.sendStop(
                transportRevision,
                companionMessage
            );
        }
    }
);

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

connectProjectController(launchpad);

const handleControllerMessage =
    (data) => launchpad.handleMidiMessage(data);

footerUI = initializePlayFooterUI({ state, controller: launchpad });
actions.setMotifChangeHandler(() => {
    launchpad.drawSelectedMotif();
    playStatusUI.render();
});

function redrawLaunchpad() {
    launchpad.drawMotif();
    launchpad.drawPlayhead();
    launchpad.drawInstruments();
    launchpad.drawBooks();
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

// Remember a successfully connected automatic choice for Soundcheck.
// Keep a saved unavailable device so it can still be reported as missing.
if (switchMidiController(controllerName) && !savedMidiController?.trim()) {
    localStorage.setItem("midiController", controllerName);
}

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
    if (data[0] === 0xF8) state.noteTiming.observeMidiPulse();
    midiClockInput.handleMidiMessage(data);
    activeClockProfile?.handleMidiMessage(data);
};

function switchMidiClockInput(name) {
    if (name === "INTERNAL") {
        midiManager.disconnectClockInput();
        activeClockProfile = null;
        clock.resetMidiPhase();
        state.noteTiming.reset();
        clock.setSource("INTERNAL");

        if (state.transportState === "PLAY") {
            actions.startClock();
        }


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
    state.noteTiming.reset();
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


    return true;
}

switchMidiClockInput(initialClockInputName);
syncMidiClockOutput();

// Presence only: compare saved choices, never the selectors' fallback values.
function updateSoundCheck() {
    const checks = [
        ["controller", "midiController", null, name => {
            const ports = midiManager.findControllerPorts(name);
            return Boolean(ports.input && ports.output);
        }],
        ["clock-input", "midiClockInput", "INTERNAL", name => Boolean(midiManager.findInput(name))],
        ["clock-output", "midiClockOutput", "NONE", name => Boolean(midiManager.findOutput(name))],
        ["output", "midiOutput", null, name => Boolean(midiManager.findOutput(name))]
    ];
    settingsUI.updateSoundCheck(checks.map(([id, key, special, isAvailable]) => {
        const name = localStorage.getItem(key);
        const status = !name || !name.trim()
            ? "unconfigured"
            : name === special
                ? "special"
                : isAvailable(name) ? "available" : "missing";
        return { id, name, status };
    }));
}

// Registered after existing handlers, which save the user's explicit choices.
for (const selector of [controllerSelector, midiClockInputSelector,
    midiClockOutputSelector, midiOutputSelector]) {
    selector.addEventListener("change", updateSoundCheck);
}
updateSoundCheck();


// ============================================================
// CLOCK STEP
// ============================================================

function triggerMotifStep(step) {
    // Navigation supplies the editing Motif; clock calls retain temporal playback.
    const previewMotifId = arguments[1] ?? null;
    const previewSystem = arguments[2] ?? state.currentTimeline ?? "MOTIF";
    const previewState = state.forSystem?.(previewSystem) ?? state;
    state.noteTiming?.beginStep();
    const triggeredInstruments = [];
    const strikes = [];
    for (let voiceId = 0; voiceId < 16; voiceId++) {
        const playingMotif = previewMotifId !== null ? previewState.getMotif(previewMotifId).grooveMorph && previewMotifId === previewState.playingMotifId
            ? previewState.getOccurrenceMotif() : previewState.getMotif(previewMotifId)
            : state.getPlaybackMotifForVoice?.(voiceId) ?? state.getMotif(state.playingMotifId);
        const onsets = previewMotifId === null ? (state.getVoiceOnsets?.(voiceId, step) ?? [{ step: state.getVoiceStep?.(voiceId, step) ?? step, offset: 0, interval: 1 }]) : [{ step: step % 32, offset: 0, interval: 1 }];
        let releasePrevious = null;
        for (const [onsetIndex, onset] of onsets.entries()) {
            const steps = playingMotif.events[voiceId];
            const localStep = onset.step;
            const event = previewMotifId === null && state.getPlayingEvent ? state.getPlayingEvent(voiceId, step, localStep)
                : previewSystem !== "MODULATION" && steps[localStep] ? {
                    velocity: playingMotif.attributes?.VELOCITY?.[voiceId]?.[localStep] ?? playingMotif.velocities?.[voiceId]?.[localStep] ?? 100,
                    color: playingMotif.attributes?.COLOR?.[voiceId]?.[localStep] ?? playingMotif.colors?.[voiceId]?.[localStep] ?? false
                } : null;
            if (!event || state.isVoiceAudible?.(voiceId) === false) {
                continue;
            }

            const voice = structuredClone(state.padConfiguration.voices[voiceId]);
            const keyGroupNote = voice?.type === "KEY GROUP" ? state.getKeyGroupNote(voiceId,
                previewMotifId !== null ? { motif: playingMotif, step: localStep } : null, localStep) : null;
            const midiOutputName = ["MIDI DRUM", "MIDI CC", "KEY GROUP"].includes(voice?.type)
                ? (voice.type === "KEY GROUP" && state.keyGroupOutputName) || midiOutputSelector.options[midiOutputSelector.selectedIndex]?.textContent : null;
            const delay = previewMotifId === null ? state.noteTiming?.delayFor(voiceId) ?? 0 : 0;
            const plan = state.noteTiming?.planFor(voiceId, previewMotifId === null ? null
                : { system: previewSystem, motifId: previewMotifId, step }, previewMotifId === null && playingMotif.euclidean?.[voiceId]?.mode === "POLYRHYTHMIC" ? onset : null) ?? { offsets: [delay], interval: 0, gate: 50 };
            const feedback = delayed => {
                if (delayed) {
                    try { launchpad.pulseInstrument(voiceId); } catch (error) { console.error("Instrument LED feedback failed:", error); }
                } else triggeredInstruments.push(voiceId);
            };
            const emit = (delayed = false) => {
                if (state.isVoiceAudible?.(voiceId) === false) return;
                if (voice?.type === "AUDIO") {
                    if (audioPlayer.trigger(voice, event.velocity)) feedback(delayed);
                    return;
                }
                if (voice?.type === "MIDI CC") {
                    if (voice.output?.mode !== "DEFAULT" || !Number.isInteger(voice.channel) || voice.channel < 1 || voice.channel > 16 ||
                        ![voice.cc, voice.value].every(value => Number.isInteger(value) && value >= 0 && value <= 127)) return;
                    midiManager.send(midiOutputName, [0xB0 | (voice.channel - 1), voice.cc, voice.value],
                        undefined, { preview: previewMotifId !== null });
                    if (midiManager.findOutput(midiOutputName) !== null) feedback(delayed);
                    return;
                }
                if (!["MIDI DRUM", "KEY GROUP"].includes(voice?.type) || voice.output?.mode !== "DEFAULT" ||
                    !Number.isInteger(voice.channel) || voice.channel < 1 || voice.channel > 16 ||
                    (voice.type === "KEY GROUP" ? keyGroupNote === null : !Number.isInteger(voice.note) || voice.note < 0 || voice.note > 127)) {
                    return;
                }
                const note = voice.type === "KEY GROUP" ? keyGroupNote : event.color &&
                    Number.isInteger(voice.colorNote) && voice.colorNote >= 0 && voice.colorNote <= 127
                    ? voice.colorNote : voice.note;
                const status = 0x90 | (voice.channel - 1);
                // A delayed Note Off must never cut the following ratchet strike.
                releasePrevious?.();
                // Ownership spans Steps and Voices sharing a physical MIDI note.
                // Retrigger only after releasing its previous generation.
                const releases = midiManager.noteReleases ??= new Map();
                const noteKey = JSON.stringify([midiOutputName, status, note]);
                releases.get(noteKey)?.();
                midiManager.send(
                    midiOutputName,
                    [status, note, event.velocity],
                    undefined, { preview: previewMotifId !== null, keyGroup: voice.type === "KEY GROUP" }
                );

                let released = false;
                const release = () => {
                    if (released) return;
                    released = true;
                    if (releases.get(noteKey) !== release) return;
                    releases.delete(noteKey);
                    midiManager.send(
                        midiOutputName,
                        [status, note, 0], undefined, { keyGroup: voice.type === "KEY GROUP" }
                    );
                };
                releases.set(noteKey, release);
                releasePrevious = release;
                setTimeout(release, plan.gate);

                if (midiManager.findOutput(midiOutputName) !== null) {
                    feedback(delayed);
                }
            };
            strikes.push({ voiceId, step: localStep, plan, emit, deadline: Math.min(state.noteTiming?.duration ?? Infinity,
                onsets[onsetIndex + 1] ? onsets[onsetIndex + 1].offset * state.noteTiming.duration : Infinity) });
        }
    }
    if (previewMotifId === null) state.noteTiming?.applyFlamPlans(strikes);
    for (const { plan, emit, deadline } of strikes) {
        for (const [index, offset] of plan.offsets.entries()) {
            if (offset > 0) state.noteTiming.schedule(offset, () => emit(true),
                Math.min(plan.offsets[index + 1] ?? deadline, deadline), previewMotifId !== null);
            else emit();
        }
    }

    // Run visual feedback only after all musical sends and note-off scheduling.
    for (const voiceId of triggeredInstruments) {
        try {
            launchpad.pulseInstrument(voiceId);
        } catch (error) {
            console.error("Instrument LED feedback failed:", error);
        }
    }
}

actions.setStepPreviewHandler(triggerMotifStep);

actions.setClockStepHandler(() => {
    triggerMotifStep(state.playheadPosition);

    // A reset may jump from any physical pad to zero, not necessarily pad 32.
    launchpad.drawClockStep(launchpad.lastPlayheadStep ?? 0, launchpad.state.playheadPosition);
    launchpad.pulseMotifCycle();
});


// ============================================================
// CLOCK BEAT
// ============================================================

actions.setClockBeatHandler(() => {
    launchpad.pulseTransport();
    launchpad.pulseModulationBeat();
});


// ============================================================
// TEST DRUMBRUTE
// ============================================================

