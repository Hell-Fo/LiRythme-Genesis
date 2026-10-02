/*
===============================================================================

LiRythme – Genesis

Launchpad Mini Mk1

Responsible for Launchpad Mini Mk1 communication and LED control.

Author:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

===============================================================================
*/

import { LaunchpadMapping } from "./LaunchpadMapping.js";
import { LaunchpadColors } from "./LaunchpadColors.js";
import { GenesisLayout } from "./GenesisLayout.js";

const TEMPO_HOLD_DELAY_MS = 300;
const TEMPO_MODERATE_THRESHOLD_MS = 1_500;
const TEMPO_FAST_THRESHOLD_MS = 3_000;
const TEMPO_INITIAL_REPEAT_MS = 120;
const TEMPO_MODERATE_REPEAT_MS = 100;
const TEMPO_FAST_REPEAT_MS = 80;
const TRANSPORT_PULSE_MS = 80;
const INSTRUMENT_PULSE_MS = 80;

export class LaunchpadMini {
    constructor(
        midiManager,
        state,
        actions,
        deviceName
    ) {
        this.midiManager = midiManager;
        this.state = state;
        this.actions = actions;
        this.deviceName = deviceName;
        this.mapping = LaunchpadMapping;
        this.colors = LaunchpadColors;
        this.layout = GenesisLayout;
        this.actions.setViewChangeHandler?.(() => this.drawView());
        this.actions.setMotifChangeHandler?.(() => this.drawSelectedMotif());
        this.actions.setNextMotifChangeHandler?.(() => this.drawBooks());
        this.chainConfirmations = new Map();
        this.chainNavigationFlashColor = null;
        this.chainNavigationFlashTimer = null;
        this.actions.onChainOccurrence = () => {
            this.pulseTransport(this.colors.RED, 2);
            this.drawBooks();
        };
        this.nextMotifBlinkTimer = null;
        this.chainMotifHolds = new Map();
        this.nextMotifBlinkId = null;
        this.nextMotifLit = true;

        this.performanceHolds = new Map();
        this.switchPressed = false;
        this.performanceBlinks = new Map();
        this.copyStage = null;
        this.copySourceBlinkTimer = null;
        this.copySourceLit = true;
        this.copyDeniedPads = new Set();
        this.copySuccessPad = null;
        this.copySuccessTimer = null;
        this.copyLit = true;
        this.deleteLit = true;
        this.copySource = null;
        this.copyTimer = null;
        this.copyGeneration = 0;
        this.deleteArmed = false;
        this.deleteBlinkTimer = null;
        this.deleteBlinkGeneration = 0;
        this.deleteConsumedInputs = new Set();
        this.shiftPressed = false;
        this.doubleNavigationHeld = false;
        this.previousPressed = false;
        this.nextPressed = false;
        this.navigationCombo = false;

        this.playStopTimer = null;
        this.transportPulseTimer = null;
        this.transportPulseGeneration = 0;
        this.transportPulseColor = null;
        this.transportPulsePriority = 0;
        this.transportPulseRevision = null;
        this.instrumentPulses = new Map();
        this.playStopLongPressTriggered = false;
        this.playStopPressed = false;
        this.tempoChordConsumed = false;
        this.previousTempoMode = false;
        this.nextTempoMode = false;
        this.tempoDirection = null;
        this.tempoRepeatTimer = null;
        this.tempoRepeatGeneration = 0;
        this.tempoGestureStartedAt = null;
        this.previousHoldTimer = null;
        this.previousRepeatTimer = null;
        this.nextRepeatTimer = null;
        this.displayBuffer = 1;
        this.updateBuffer = 0;
        this.nextHoldTimer = null;

        this.filterSelectionMode = false;
        this.filterSelectionChanged = false;
        this.filterWasActive = false;

        this.instrumentFeedbackPending = false;
        this.atLEDQueue = new Map();
        this.atLEDKnown = new Map();
        this.atLEDTimer = null;
        this.collectATLEDs = false;
        this.atHeld = new Set();
        this.atPadHold = null;
        this.atBlinkTimer = null;
        this.atLit = true;
        this.actions.onATChange = reason => this.drawATChange(reason);
    }

    // Derived selection/A/T LEDs only. Musical MIDI never passes through here.
    sendController(device, message) {
        const [status, note, value] = message;
        const key = status + ':' + note;
        if (this.collectATLEDs && (status === 0x90 || status === 0xB0)) {
            const bothBuffers = [status, note, (value & 0x33) | 4];
            if (this.atLEDKnown.get(key) === bothBuffers[2]) this.atLEDQueue.delete(key);
            else this.atLEDQueue.set(key, bothBuffers);
            this.scheduleATLEDs();
            return;
        }
        // A newer clock/view/pulse render supersedes any pending A/T colour.
        this.atLEDQueue.delete(key);
        if ((status === 0x90 || status === 0xB0) && (value & 4)) this.atLEDKnown.set(key, value);
        else this.atLEDKnown.delete(key);
        this.midiManager.send(device, message);
    }

    requestInstrumentFeedback() {
        this.instrumentFeedbackPending = true;
        this.scheduleATLEDs();
    }

    scheduleATLEDs() {
        if (this.atLEDTimer !== null || (!this.atLEDQueue.size && !this.instrumentFeedbackPending)) return;
        this.atLEDTimer = setTimeout(() => {
            if (this.instrumentFeedbackPending) {
                this.instrumentFeedbackPending = false;
                this.collectATLEDs = true;
                try {
                    this.drawInstruments();
                    this.drawMotif();
                    this.drawPlayhead();
                    if (this.state.atTransaction) this.drawATValues();
                } finally { this.collectATLEDs = false; }
            }
            this.atLEDTimer = null;
            // Bound controller traffic per turn; never enqueue a whole redraw in IPC.
            for (let n = 0; n < 4 && this.atLEDQueue.size; n++) {
                const [key, message] = this.atLEDQueue.entries().next().value;
                this.atLEDQueue.delete(key);
                this.sendController(this.deviceName, message);
            }
            this.scheduleATLEDs();
        }, 4);
    }

    setDeviceName(deviceName) {
        clearTimeout(this.atLEDTimer);
        this.atLEDTimer = null;
        this.instrumentFeedbackPending = false;
        this.atLEDQueue.clear();
        this.atLEDKnown.clear();
        this.deviceName = deviceName;
    }

    resetInputState() {
        clearTimeout(this.atPadHold?.timer);
        this.atPadHold = null;
        this.atHeld.clear();
        clearTimeout(this.atBlinkTimer);
        this.atBlinkTimer = null;
        this.actions.at.finish(false);
        clearTimeout(this.atLEDTimer);
        this.atLEDTimer = null;
        this.instrumentFeedbackPending = false;
        this.atLEDQueue.clear();
        this.atLEDKnown.clear();
        this.cancelStepNavigationHold();
        this.stepNavigationRepeated = false;
        this.stepInstrumentFeedback = false;
        this.focusNavigationHeld?.clear();
        this.focusNavigationConsumed = false;
        clearTimeout(this.chainNavigationFlashTimer);
        this.chainNavigationFlashTimer = null;
        this.chainNavigationFlashColor = null;
        for (const hold of this.chainMotifHolds.values()) clearTimeout(hold.timer);
        this.chainMotifHolds.clear();
        for (const timer of this.chainConfirmations.values()) clearTimeout(timer);
        this.chainConfirmations.clear();
        clearTimeout(this.nextMotifBlinkTimer);
        this.nextMotifBlinkTimer = null;
        this.nextMotifBlinkId = null;
        this.switchPressed = false;
        this.performanceHolds.clear();
        for (const blink of this.performanceBlinks.values()) clearTimeout(blink.timer);
        this.performanceBlinks.clear();
        this.setCopyStage(null, null, { redraw: false });
        this.setDeleteArmed(false);
        this.deleteConsumedInputs.clear();
        this.cancelInstrumentPulses();
        this.cancelTransportPulse();
        clearTimeout(this.playStopTimer);
        this.stopTempoRepeat();
        clearTimeout(this.previousHoldTimer);
        clearInterval(this.previousRepeatTimer);
        clearTimeout(this.nextHoldTimer);
        clearInterval(this.nextRepeatTimer);

        this.playStopTimer = null;
        this.previousHoldTimer = null;
        this.previousRepeatTimer = null;
        this.nextHoldTimer = null;
        this.nextRepeatTimer = null;

        this.playStopLongPressTriggered = false;
        this.playStopPressed = false;
        this.tempoChordConsumed = false;
        this.previousTempoMode = false;
        this.nextTempoMode = false;
        this.shiftPressed = false;
        this.doubleNavigationHeld = false;
        this.previousPressed = false;
        this.nextPressed = false;
        this.navigationCombo = false;
        this.filterSelectionMode = false;
        this.filterSelectionChanged = false;
        this.filterWasActive = false;
    }

    setLed(note, value) {
        const bufferedValue = value & 0x33;

        this.sendController(
            this.deviceName,
            [0x90, note, bufferedValue]
        );
    }

    setTopLed(controller, value) {
        const bufferedValue = value & 0x33;

        this.sendController(
            this.deviceName,
            [0xB0, controller, bufferedValue]
        );
    }
    enableDoubleBuffering() {
        this.sendController(
            this.deviceName,
            [0xB0, 0, 49]
        );

        this.displayBuffer = 1;
        this.updateBuffer = 0;
    }
    swapBuffers() {
        if (this.displayBuffer === 1) {
            this.sendController(
                this.deviceName,
                [0xB0, 0, 52]
            );

            this.displayBuffer = 0;
            this.updateBuffer = 1;
        } else {
            this.sendController(
                this.deviceName,
                [0xB0, 0, 49]
            );

            this.displayBuffer = 1;
            this.updateBuffer = 0;
        }
    }

    testColors() {
        const colors = [
            this.colors.DIM_RED,
            this.colors.RED,
            this.colors.DIM_GREEN,
            this.colors.GREEN,
            this.colors.DIM_AMBER,
            this.colors.AMBER,
            this.colors.YELLOW
        ];

        for (let i = 0; i < colors.length; i++) {
            this.setLed(i, colors[i]);
        }
    }

    cancelStepNavigationHold() {
        clearTimeout(this.stepNavigationTimer);
        this.stepNavigationTimer = null;
    }

    startStepNavigationHold(controlName) {
        this.cancelStepNavigationHold();
        this.stepNavigationRepeated = false;
        const tick = () => {
            this.stepNavigationTimer = null;
            if (this.focusNavigationConsumed || this.focusNavigationHeld?.size !== 1 ||
                !this.focusNavigationHeld.has(controlName) || this.state.transportState === "PLAY" ||
                this.actions.resolveContext().navigation !== "STEP") return;
            this.stepNavigationRepeated = true;
            this.stepInstrumentFeedback = true;
            this.cancelInstrumentPulses();
            this.actions.navigate(controlName === "PREVIOUS" ? -1 : 1);
            this.drawMotif();
            this.drawPlayhead();
            this.drawInstruments();
            this.swapBuffers();
            // One UI step per callback: never catch up missed ticks or enqueue music.
            this.stepNavigationTimer = setTimeout(tick, this.state.getStepDurationMs());
        };
        this.stepNavigationTimer = setTimeout(tick, this.state.getStepDurationMs());
    }

    hasAssignedAT(voice, step, destination = "STEP") {
        const tx = this.state.atTransaction;
        if (!tx) return false;
        const motif = this.state.getMotif(this.actions.at.getEditingMotifId());
        const definition = this.actions.at.definition(tx.slot);
        // Older banks contain event values only; show these at their known step location.
        const assignedDestination = motif.atDestinations?.[definition?.id]?.[voice]?.[step] ?? "STEP";
        return Boolean(assignedDestination === destination && motif.events[voice]?.[step] &&
            this.actions.at.definition(tx.slot)?.isAssigned?.(motif, voice, step));
    }

    hasMotifAT() {
        return Boolean(this.state.atTransaction && this.state.getMotif(this.actions.at.getEditingMotifId())
            .events.some((row, voice) => row.some((event, step) => event && this.hasAssignedAT(voice, step, "MOTIF"))));
    }

    getMotifStepColor(step) {
        const target = this.state.atTransaction;
        const selectedVoiceId = target ? null : this.state.selectedInstrument;

        const filter =
            target ? target.instruments : this.state.visibleInstrumentFilter;

        let hasAnyVoice = false;
        let hasSelectedVoice = false;

        const motif = this.state.getMotif(this.actions.at.getEditingMotifId()).events;
        for (const [voiceId, steps] of motif.entries()) {
            const isInFilter = filter.has(voiceId);
            const isSelectedInstrument = voiceId === selectedVoiceId;

            const selecting = !target && this.filterSelectionMode;
            const filtering = target ? filter.size > 0 : this.state.filterMode;
            const isVisible = selecting
                    ? isInFilter
                    : (
                        !filtering ||
                        isInFilter ||
                        isSelectedInstrument
                    );

            if (!isVisible) {
                continue;
            }

            if (steps[step]) {
                if (target && this.hasAssignedAT(voiceId, step)) return this.colors.DIM_RED;
                hasAnyVoice = true;
                if (isSelectedInstrument) hasSelectedVoice = true;
            }
        }

        // Selection remains visible on empty Steps without implying a note.
        // Occupancy is resolved within the selected Voices, not hidden Voices.
        if (target) return target.steps.has(step) ? (hasAnyVoice ? this.colors.YELLOW : this.colors.DIM_GREEN)
            : hasAnyVoice ? this.colors.DIM_AMBER : this.colors.OFF;

        const explicitLength = selectedVoiceId === null
            ? this.state.motifLength : this.state.voiceLengths?.[selectedVoiceId];
        if (Number.isInteger(explicitLength) && step === explicitLength - 1) {
            return hasAnyVoice ? this.colors.RED : this.colors.DIM_RED;
        }

        if (hasSelectedVoice) return this.colors.YELLOW;
        if (hasAnyVoice) return this.colors.DIM_AMBER;

        return 0;
    }

    drawMotifStep(step) {
        this.setLed(
            this.mapping.MOTIF[step],
            this.getMotifStepColor(step)
        );
    }

    drawMotif() {
        for (let step = 0; step < this.mapping.MOTIF.length; step++) {
            this.drawMotifStep(step);
        }
    }

    drawTimelineSelection() {
        const previous = this.mapping.TOP_CONTROLS.PREVIOUS;
        const next = this.mapping.TOP_CONTROLS.NEXT;
        if (this.state.atTransaction?.slot === 8) {
            this.setTopLed(previous, this.atLit ? this.colors.RED : this.colors.OFF);
            this.setTopLed(next, this.atLit ? this.colors.RED : this.colors.OFF);
            return;
        }

        const isMotif = this.state.currentTimeline === "MOTIF";
        if (this.state.chainFocus) {
            this.setTopLed(previous, isMotif ? this.colors.GREEN : this.colors.DIM_GREEN);
            this.setTopLed(next, isMotif ? this.colors.DIM_GREEN : this.colors.GREEN);
            return;
        }

        // LOCK + FREEZE
        if (
            this.state.lockMode &&
            this.state.freezeMode
        ) {
            this.setTopLed(
                previous,
                isMotif ? this.colors.RED : this.colors.DIM_GREEN
            );

            this.setTopLed(
                next,
                isMotif ? this.colors.DIM_GREEN : this.colors.RED
            );

            return;
        }

        // LOCK
        if (this.state.lockMode) {
            this.setTopLed(
                previous,
                isMotif ? this.colors.RED : this.colors.DIM_RED
            );

            this.setTopLed(
                next,
                isMotif ? this.colors.DIM_RED : this.colors.RED
            );

            return;
        }

        // FREEZE
        if (this.state.freezeMode) {
            this.setTopLed(
                previous,
                isMotif ? this.colors.GREEN : this.colors.DIM_GREEN
            );

            this.setTopLed(
                next,
                isMotif ? this.colors.DIM_GREEN : this.colors.GREEN
            );

            return;
        }

        // NORMAL
        this.setTopLed(
            previous,
            isMotif ? this.colors.AMBER : this.colors.DIM_AMBER
        );

        this.setTopLed(
            next,
            isMotif ? this.colors.DIM_AMBER : this.colors.AMBER
        );
    }

    getInstrumentColor(i) {
        if (this.state.atTransaction) {
            const events = this.state.getMotif(this.actions.at.getEditingMotifId()).events[i];
            const event = events?.[this.state.playheadPosition % 32];
            if (events?.some((occupied, step) => occupied && this.hasAssignedAT(i, step, "INSTRUMENT"))) {
                return event ? this.colors.RED : this.colors.DIM_RED;
            }
            const selected = this.state.atTransaction.instruments.has(i);
            return selected ? (event ? this.colors.YELLOW : this.colors.DIM_AMBER)
                : event ? this.colors.GREEN : this.colors.DIM_GREEN;
        }
        const hold = [...this.performanceHolds.values()].at(-1);
        if (hold) return hold.selection.has(i) ? this.colors.YELLOW : this.colors.DIM_GREEN;
        const isSelected =
            i === this.state.selectedInstrument;

        const isInFilter =
            this.state.visibleInstrumentFilter.has(i);

        if (this.filterSelectionMode && isInFilter) return this.colors.YELLOW;
        if (this.stepInstrumentFeedback && this.state.transportState !== "PLAY") {
            return this.state.getMotif(this.actions.at.getEditingMotifId()).events[i]?.[this.state.playheadPosition]
                ? this.colors.GREEN : this.colors.DIM_GREEN;
        }
        const hasEvent = this.instrumentPulses.get(i)?.timer != null;
        if (isSelected) return hasEvent ? this.colors.YELLOW : this.colors.DIM_AMBER;
        return hasEvent ? this.colors.GREEN : this.colors.DIM_GREEN;
    }

    drawInstruments() {
        for (let i = 0; i < this.mapping.INSTRUMENTS.length; i++) {
            const note = this.mapping.INSTRUMENTS[i];
            const colorValue = this.getInstrumentColor(i);

            this.setLed(
                note,
                colorValue
            );
        }
    }

    setInstrumentEventLed(position, color) {
        try {
            this.sendController(
                this.deviceName,
                [0x90, this.mapping.INSTRUMENTS[position],
                    (color & 0x33) | 0x04]
            );
        } catch (error) {
            console.error("Instrument LED feedback failed:", error);
        }
    }

    cancelInstrumentPulse(position, restore = false) {
        const pulse = this.instrumentPulses.get(position);
        if (!pulse) {
            return;
        }

        const wasActive = pulse.timer !== null;
        clearTimeout(pulse.timer);
        pulse.timer = null;
        pulse.generation += 1;

        if (restore && wasActive) {
            this.setInstrumentEventLed(position, this.getInstrumentColor(position));
        }
    }

    cancelInstrumentPulses(restore = false) {
        for (const position of this.instrumentPulses.keys()) {
            this.cancelInstrumentPulse(position, restore);
        }
    }

    pulseInstrument(position) {
        // A/T holds the current Step's feedback until the next cursor update.
        if (this.state.atTransaction) return;
        if (this.stepInstrumentFeedback && this.state.transportState !== "PLAY") return;
        if (this.performanceHolds.size) return;
        if (!Number.isInteger(position) || position < 0 || position >= 16 ||
            this.state.padConfiguration.voices[position]?.type !== "MIDI DRUM") {
            return;
        }

        if (!this.instrumentPulses.has(position)) {
            this.instrumentPulses.set(position, { timer: null, generation: 0 });
        }
        this.cancelInstrumentPulse(position);
        const pulse = this.instrumentPulses.get(position);
        const generation = pulse.generation;

        pulse.timer = setTimeout(() => {
            if (generation !== pulse.generation) {
                return;
            }

            pulse.timer = null;
            this.setInstrumentEventLed(position, this.getInstrumentColor(position));
        }, INSTRUMENT_PULSE_MS);

        this.setInstrumentEventLed(position, this.getInstrumentColor(position));
    }

    drawView() {
        this.drawBooks();
        this.drawPersistentControls();
        this.drawViewStatus();
    }

    drawSelectedMotif() {
        this.cancelInstrumentPulses();
        this.drawMotif();
        this.drawPlayhead();
        this.drawInstruments();
        this.drawView();
        if (!this.collectATLEDs) this.swapBuffers();
    }

    getLibraryMotifColor(id) {
        if (this.copyDeniedPads.has(id)) return "RED";
        if (id === this.copySuccessPad) return "YELLOW";
        if (this.copyStage === "TARGET" && this.copySource?.kind === "BANK_MOTIF" &&
            id === this.copySource.sourceId) {
            return this.copySourceLit
                ? (id === this.state.currentMotifId ? "GREEN" : "DIM_GREEN") : "OFF";
        }
        if (this.state.chainEnabled) {
            if (this.state.chainFocus && id === this.state.currentMotifId) return "YELLOW";
            if (this.chainConfirmations.has(id)) return "GREEN";
            const master = this.state.chainLoopMasterIndex;
            // Shared pads represent PLAYING first, including an identical NEXT.
            if ((this.state.chainFocus || this.state.transportState !== "STOP") && id === this.state.playingMotifId) {
                if (this.state.transportState === "PLAY" && master !== null &&
                    !this.state.chainPlayingDetached && this.state.chainPlayingIndex === master) {
                    return this.nextMotifLit ? "GREEN" : "DIM_RED";
                }
                return "GREEN";
            }
            if (id === this.state.nextMotifId) {
                if (master !== null && this.state.getChainNextIndex() === master) {
                    return this.nextMotifLit ? "RED" : "DIM_RED";
                }
                return this.state.chainFocus ? (this.nextMotifLit ? "GREEN" : "DIM_GREEN")
                    : (this.nextMotifLit ? "YELLOW" : "DIM_AMBER");
            }
            if (master !== null && id === this.state.chain[master]) return "DIM_RED";
            if (this.state.chain.includes(id)) return this.state.chainFocus ? "DIM_GREEN" : "YELLOW";
        } else {
            if (id === this.state.currentMotifId) return this.layout.BOOKS.MOTIF_LIBRARY;
            if (id === this.state.nextMotifId) return this.nextMotifLit ? "GREEN" : "DIM_GREEN";
        }
        const motif = this.state.getMotif(id);
        const hasData = motif && (motif.motifLength !== null ||
            motif.voiceLengths.some(length => length !== null) ||
            motif.events.some(row => row.some(Boolean)));
        return hasData ? (this.state.chainEnabled ? "DIM_AMBER" : this.layout.BOOKS.MOTIF_LIBRARY_IDLE) : "OFF";
    }

    flashChainNavigationBoundary(controlName) {
        clearTimeout(this.chainNavigationFlashTimer);
        this.chainNavigationFlashTimer = null;
        this.chainNavigationFlashColor = null;
        if (this.state.chainEnabled && ["STOP", "PAUSE"].includes(this.state.transportState) &&
            this.state.chain.length && !this.state.chainPlayingDetached) {
            const index = this.state.chainPlayingIndex;
            if (controlName === "PREVIOUS" && index === 0) this.chainNavigationFlashColor = "YELLOW";
            if (controlName === "NEXT" && index === this.state.chain.length - 1) this.chainNavigationFlashColor = "RED";
        }
        if (this.chainNavigationFlashColor !== null) {
            this.chainNavigationFlashTimer = setTimeout(() => {
                this.chainNavigationFlashTimer = null;
                this.chainNavigationFlashColor = null;
                this.drawBooks();
            }, 120);
        }
        this.drawBooks();
    }

    drawBooks() {
        if (!this.state.chainEnabled || !["STOP", "PAUSE"].includes(this.state.transportState)) {
            clearTimeout(this.chainNavigationFlashTimer);
            this.chainNavigationFlashTimer = null;
            this.chainNavigationFlashColor = null;
        }
        const next = this.state.currentView !== "MOTIF_LIBRARY" ? null : this.state.nextMotifId;
        if (this.nextMotifBlinkId !== next) {
            clearTimeout(this.nextMotifBlinkTimer);
            this.nextMotifBlinkTimer = null;
            this.nextMotifBlinkId = next;
            this.nextMotifLit = true;
        }
        if (next !== null && this.nextMotifBlinkTimer === null) {
            this.nextMotifBlinkTimer = setTimeout(() => {
                this.nextMotifBlinkTimer = null;
                this.nextMotifLit = !this.nextMotifLit;
                this.drawBooks();
            }, this.state.chainEnabled ? 500 : 160);
        }
        const books = this.mapping.BOOKS;

        for (let i = 0; i < books.length; i++) {
            const colorName = this.state.atTransaction ? this.getATBookColor(i)
                : this.chainNavigationFlashColor ?? (this.state.currentView === "MOTIF_LIBRARY"
                ? this.getLibraryMotifColor(i) : this.getATBookColor(i));

            // Keep the view in both buffers without swapping the musical surface.
            this.sendController(this.deviceName,
                [0x90, books[i], (this.colors[colorName] & 0x33) | 0x04]);
        }
    }
    getATBookColor(slot) {
        const implemented = Boolean(this.actions.at.definition(slot));
        if (slot === 1 && !this.state.colorEnabled) return "DIM_RED";
        const familyColor = slot < 8 ? "RED" : "YELLOW";
        if (!implemented) return slot < 8 ? "DIM_RED" : "DIM_AMBER";
        return this.state.atTransaction?.slot === slot && !this.atLit ? "OFF" : familyColor;
    }

    drawTopControls() {
        this.drawPersistentControls();
        this.drawViewStatus();
        for (const [name, controller] of Object.entries(
            this.mapping.TOP_CONTROLS
        )) {
            const colorName = this.layout.TOP_CONTROLS[name];
            const colorValue = this.colors[colorName];

            this.setTopLed(controller, colorValue);
        }
    }

    drawTransport() {
        if (this.state.transportState === "PLAY") {
            this.cancelStepNavigationHold();
            if (this.focusNavigationHeld?.size) this.focusNavigationConsumed = true;
            this.stepInstrumentFeedback = false;
        }
        if (this.hasMotifAT()) {
            if (this.state.transportState !== "PLAY") this.cancelTransportPulse();
            this.setTransportPulseLed(this.transportPulseTimer !== null ? this.colors.RED : this.colors.DIM_RED);
            return;
        }
        const playStop = this.mapping.TOP_CONTROLS.PLAY_STOP;

        if (this.state.transportState === "PLAY") {
            this.setTopLed(
                playStop,
                this.transportPulseTimer !== null &&
                    this.transportPulseRevision ===
                        this.actions.clock.transportRevision
                    ? this.transportPulseColor
                    : (this.state.chainEnabled ? this.colors.DIM_AMBER : this.colors.DIM_GREEN)
            );
        } else {
            this.cancelTransportPulse();
            this.setTransportPulseLed(this.state.transportState === "PAUSE"
                ? this.colors.DIM_GREEN : this.colors.OFF);
        }
    }
    drawFilterStatus() {
        for (const kind of ["solo", "mute"]) this.drawPerformanceStatus(kind);
    }

    drawPerformanceStatus(kind) {
        const active = this.state[kind + "Active"];
        const focus = kind === "solo" && (this.filterSelectionMode || this.state.filterMode);
        const old = this.performanceBlinks.get(kind);
        if (old && old.active === active && old.focus === focus) return;
        if (old) clearTimeout(old.timer);
        const blink = { active, focus, timer: null, lit: true };
        this.performanceBlinks.set(kind, blink);
        const draw = () => {
            if (this.performanceBlinks.get(kind) !== blink) return;
            const normal = focus ? this.colors.GREEN : this.colors[this.layout.TOP_CONTROLS[kind.toUpperCase()]];
            this.sendController(this.deviceName, [0xB0, this.mapping.TOP_CONTROLS[kind.toUpperCase()],
                ((active && !blink.lit ? this.colors.OFF : normal) & 0x33) | 4]);
            if (active) {
                blink.lit = !blink.lit;
                blink.timer = setTimeout(draw, 160);
            }
        };
        draw();
    }

    cancelTransportPulse() {
        clearTimeout(this.transportPulseTimer);
        this.transportPulseTimer = null;
        this.transportPulseRevision = null;
        this.transportPulseGeneration += 1;
        this.transportPulseColor = null;
        this.transportPulsePriority = 0;
    }

    setTransportPulseLed(color) {
        if (this.hasMotifAT()) color = this.state.transportState === "PLAY" &&
            [this.colors.GREEN, this.colors.YELLOW, this.colors.RED].includes(color)
            ? this.colors.RED : this.colors.DIM_RED;
        // Copy only PLAY/STOP to both buffers without swapping the surface.
        this.sendController(
            this.deviceName,
            [0xB0, this.mapping.TOP_CONTROLS.PLAY_STOP, (color & 0x33) | 0x04]
        );
    }

    pulseMotifCycle() {
        if (this.state.chainEnabled) return;
        // Called only after a musical clock advancement, never by UI redraws.
        if (this.state.currentTimeline !== "MOTIF" || this.state.playheadPosition !== 0) return;
        if (this.state.motifLength !== null) {
            this.pulseTransport(this.colors.YELLOW, 1);
        } else if (this.state.voiceLengths.some(length => length !== null)) {
            this.pulseTransport(this.colors.RED, 1);
        }
    }

    pulseTransport(color = this.colors.GREEN, priority = 0) {
        if (this.state.chainEnabled && priority < 2) color = this.colors.YELLOW;
        // Cycle feedback wins over the coincident beat; one timer owns the LED.
        if (this.state.transportState === "PLAY" &&
            this.transportPulseRevision === this.actions.clock.transportRevision &&
            this.transportPulseTimer !== null && this.transportPulsePriority > priority) return;
        this.cancelTransportPulse();

        if (this.state.transportState !== "PLAY") {
            return;
        }

        const generation = this.transportPulseGeneration;
        const revision = this.actions.clock.transportRevision;
        this.transportPulseRevision = revision;
        this.transportPulseColor = color;
        this.transportPulsePriority = priority;
        this.setTransportPulseLed(color);

        this.transportPulseTimer = setTimeout(() => {
            if (generation !== this.transportPulseGeneration) {
                return;
            }

            this.transportPulseTimer = null;
            this.transportPulseRevision = null;

            if (
                this.state.transportState !== "PLAY" ||
                revision !== this.actions.clock.transportRevision
            ) {
                return;
            }

            this.setTransportPulseLed(this.state.chainEnabled ? this.colors.DIM_AMBER : this.colors.DIM_GREEN);
        }, TRANSPORT_PULSE_MS);
    }

    drawPlayhead(step = this.state.playheadPosition) {
        if (this.state.atTransaction) {
            step %= this.mapping.MOTIF.length;
            const collecting = this.collectATLEDs;
            this.collectATLEDs = true;
            try {
                if (this.lastPlayheadStep !== undefined && this.lastPlayheadStep !== step) this.drawMotifStep(this.lastPlayheadStep);
                this.lastPlayheadStep = step;
                const motif = this.state.getMotif(this.actions.at.getEditingMotifId());
                const voices = this.state.atTransaction.instruments;
                const occupied = motif.events.some((row, id) => (!voices.size || voices.has(id)) && row[step]);
                this.setLed(this.mapping.MOTIF[step], this.getMotifStepColor(step) === this.colors.DIM_RED
                    ? this.colors.RED : occupied ? this.colors.GREEN : this.colors.DIM_GREEN);
                this.drawInstruments();
                this.drawATValues();
            } finally { this.collectATLEDs = collecting; }
            return;
        }
        if (this.state.transportState === "PLAY" && this.state.chainFocus &&
            this.state.currentMotifId !== this.state.playingMotifId) return;
        // The physical timeline has 32 pads, even when the global LCM is longer.
        step %= this.mapping.MOTIF.length;
        this.lastPlayheadStep = step;
        const note = this.mapping.MOTIF[step];

        // Explicit boundaries retain priority; ordinary MOTIF cells show the cursor.
        const motifColor = this.getMotifStepColor(step);
        if (motifColor === this.colors.RED || motifColor === this.colors.DIM_RED) {
            this.setLed(note, motifColor);
            return;
        }

        const selectedVoiceId = this.state.selectedInstrument;

        const hasSelectedVoice =
            selectedVoiceId !== null &&
            this.state.motif[selectedVoiceId]?.[step];

        if (this.state.currentTimeline === "MOTIF") {
            this.setLed(
                note,
                motifColor === this.colors.YELLOW || motifColor === this.colors.DIM_AMBER
                    ? this.colors.GREEN
                    : this.colors.DIM_GREEN
            );
        } else {
            this.setLed(
                note,
                hasSelectedVoice
                    ? this.colors.RED
                    : this.colors.DIM_RED
            );
        }
    }

    drawClockStep(previousStep, currentStep) {
        this.drawMotifStep(previousStep);
        this.drawPlayhead(currentStep);
        this.swapBuffers();
    }

    getControlType(status, number) {
        if (status === 0xB0) {
            if (this.mapping.TOP_BUTTONS.includes(number)) {
                return "TOP_BUTTON";
            }
        }

        if (status === 0x90) {
            if (this.mapping.MOTIF.includes(number)) {
                return "MOTIF";
            }

            if (this.mapping.INSTRUMENTS.includes(number)) {
                return "INSTRUMENT";
            }

            if (this.mapping.BOOKS.includes(number)) {
                return "BOOK";
            }

            if (this.mapping.VALUE.includes(number)) {
                return "VALUE";
            }
        }

        return "UNKNOWN";
    }

    getControlPosition(controlType, number) {
        let controls;

        if (controlType === "MOTIF") {
            controls = this.mapping.MOTIF;
        } else if (controlType === "INSTRUMENT") {
            controls = this.mapping.INSTRUMENTS;
        } else if (controlType === "BOOK") {
            controls = this.mapping.BOOKS;
        } else if (controlType === "VALUE") {
            controls = this.mapping.VALUE;
        } else if (controlType === "TOP_BUTTON") {
            controls = this.mapping.TOP_BUTTONS;
        } else {
            return null;
        }

        return controls.indexOf(number);
    }

    getControlName(status, number) {
        if (status === 0xB0) {
            for (const [name, midiNumber] of Object.entries(
                this.mapping.TOP_CONTROLS
            )) {
                if (midiNumber === number) {
                    return name;
                }
            }
        }

        if (status === 0x90) {
            for (const [name, midiNumber] of Object.entries(
                this.mapping.VALUE_CONTROLS
            )) {
                if (midiNumber === number) {
                    return name;
                }
            }
        }

        return null;
    }
    consumeNavigationCombo() {
        if (!this.navigationCombo) {
            return false;
        }

        console.log("NAV: combo consumed");

        if (!this.previousPressed && !this.nextPressed) {
            this.navigationCombo = false;
            console.log("NAV: combo reset");
        }

        return true;
    }

    stopTempoRepeat(direction = null) {
        if (
            direction !== null &&
            direction !== this.tempoDirection
        ) {
            return;
        }

        this.tempoRepeatGeneration += 1;
        clearTimeout(this.tempoRepeatTimer);
        this.tempoRepeatTimer = null;
        this.tempoDirection = null;
        this.tempoGestureStartedAt = null;
    }

    isTempoGestureActive(direction) {
        return Boolean(
            this.playStopPressed &&
            this.actions.clock.source === "INTERNAL" &&
            (
                direction < 0
                    ? this.previousPressed
                    : this.nextPressed
            )
        );
    }

    scheduleTempoRepeat(generation, direction, delay) {
        this.tempoRepeatTimer = setTimeout(() => {
            if (
                generation !== this.tempoRepeatGeneration ||
                direction !== this.tempoDirection ||
                !this.isTempoGestureActive(direction)
            ) {
                return;
            }

            const heldDuration =
                performance.now() - this.tempoGestureStartedAt;
            let tempoStep = 1;
            let repeatDelay = TEMPO_INITIAL_REPEAT_MS;

            if (heldDuration >= TEMPO_FAST_THRESHOLD_MS) {
                tempoStep = 5;
                repeatDelay = TEMPO_FAST_REPEAT_MS;
            } else if (
                heldDuration >= TEMPO_MODERATE_THRESHOLD_MS
            ) {
                tempoStep = 2;
                repeatDelay = TEMPO_MODERATE_REPEAT_MS;
            }

            this.actions.adjustInternalTempo(
                direction * tempoStep
            );

            if (
                generation !== this.tempoRepeatGeneration ||
                direction !== this.tempoDirection ||
                !this.isTempoGestureActive(direction)
            ) {
                return;
            }

            this.scheduleTempoRepeat(
                generation,
                direction,
                repeatDelay
            );
        }, delay);
    }

    startTempoAdjustment(direction) {
        if (!this.isTempoGestureActive(direction)) {
            return false;
        }

        clearTimeout(this.playStopTimer);
        this.playStopTimer = null;
        this.playStopLongPressTriggered = false;
        this.tempoChordConsumed = true;

        clearTimeout(this.previousHoldTimer);
        clearInterval(this.previousRepeatTimer);
        clearTimeout(this.nextHoldTimer);
        clearInterval(this.nextRepeatTimer);
        this.previousHoldTimer = null;
        this.previousRepeatTimer = null;
        this.nextHoldTimer = null;
        this.nextRepeatTimer = null;

        this.stopTempoRepeat();
        this.tempoDirection = direction;
        this.tempoGestureStartedAt = performance.now();
        const generation = this.tempoRepeatGeneration;

        if (direction < 0) {
            this.previousTempoMode = true;
        } else {
            this.nextTempoMode = true;
        }

        this.actions.adjustInternalTempo(direction);
        this.scheduleTempoRepeat(
            generation,
            direction,
            TEMPO_HOLD_DELAY_MS
        );

        return true;
    }

    setCopyStage(stage, source = null, { redraw = true } = {}) {
        clearTimeout(this.copySourceBlinkTimer);
        clearTimeout(this.copySuccessTimer);
        this.copySourceBlinkTimer = null;
        this.copySuccessTimer = null;
        this.copySuccessPad = null;
        this.copyDeniedPads.clear();
        this.copySourceLit = true;
        clearTimeout(this.copyTimer);
        this.copyTimer = null;
        const generation = ++this.copyGeneration;
        this.copyStage = stage;
        this.copySource = source;
        if (stage === "TARGET" && source?.kind === "BANK_MOTIF") {
            const blink = () => {
                if (generation !== this.copyGeneration) return;
                this.copySourceLit = !this.copySourceLit;
                this.drawBooks();
                this.copySourceBlinkTimer = setTimeout(blink, 160);
            };
            this.copySourceBlinkTimer = setTimeout(blink, 160);
        }
        if (redraw) this.drawBooks();
        this.copyLit = true;
        const draw = () => {
            if (generation !== this.copyGeneration) return;
            this.drawCopyStatus();
            if (stage === "SOURCE") {
                this.copyTimer = setTimeout(() => {
                    if (generation !== this.copyGeneration) return;
                    this.copyLit = !this.copyLit;
                    draw();
                }, 160);
            }
        };
        draw();
    }

    setDeleteArmed(armed) {
        if (!armed) for (const hold of this.chainMotifHolds.values()) {
            if (hold.deleteIntent) { clearTimeout(hold.timer); hold.fired = true; }
        }
        clearTimeout(this.deleteBlinkTimer);
        this.deleteBlinkTimer = null;
        const generation = ++this.deleteBlinkGeneration;
        this.deleteArmed = armed;
        this.deleteLit = true;
        const draw = () => {
            if (generation !== this.deleteBlinkGeneration) return;
            this.drawDeleteStatus();
            if (armed) {
                this.deleteBlinkTimer = setTimeout(() => {
                    if (generation !== this.deleteBlinkGeneration) return;
                    this.deleteLit = !this.deleteLit;
                    draw();
                }, 160);
            }
        };
        draw();
    }

    drawPersistentControls() {
        this.drawCopyStatus();
        this.drawDeleteStatus();
    }

    drawCopyStatus() {
        if (this.state.atTransaction) return this.drawATValues();
        const color = this.copyStage && this.copyLit ? this.colors.YELLOW : this.colors.OFF;
        this.sendController(this.deviceName,
            [0x90, this.mapping.VALUE_CONTROLS.COPY, (color & 0x33) | 0x04]);
    }

    drawDeleteStatus() {
        if (this.state.atTransaction) return this.drawATValues();
        const color = this.deleteArmed && this.deleteLit ? this.colors.RED : this.colors.OFF;
        this.sendController(this.deviceName,
            [0x90, this.mapping.VALUE_CONTROLS.DELETE, (color & 0x33) | 0x04]);
    }

    drawViewStatus() {
        if (this.state.atTransaction) return this.drawATValues();
        const color = this.colors.OFF;
        // BOOK indicates the view; keep SWITCH off in both buffers.
        this.sendController(this.deviceName,
            [0x90, this.mapping.VALUE_CONTROLS.SWITCH, (color & 0x33) | 0x04]);
    }

    drawATValues() {
        const tx = this.state.atTransaction;
        const velocities = new Set();
        let colorCount = 0;
        if (tx) {
            const motif = this.state.getMotif(this.actions.at.getEditingMotifId());
            const step = this.state.playheadPosition % 32;
            if (!tx.steps.size || tx.steps.has(step)) {
                for (let voice = 0; voice < 16; voice++) {
                    if ((!tx.instruments.size || tx.instruments.has(voice)) &&
                        motif.events[voice][step]) {
                        if (motif.colors?.[voice]?.[step]) colorCount++;
                        if (motif.velocities?.[voice]?.[step] !== undefined) velocities.add(motif.velocities[voice][step]);
                    }
                }
            }
        }
        for (const [index, note] of this.mapping.AT_VALUE.entries()) {
            const color = tx?.slot === 8 ? this.colors.OFF : tx?.slot === 1
                ? index !== 0 || !colorCount ? this.colors.OFF : this.colors.RED
                : tx ? (velocities.has(this.actions.at.definition(tx.slot).values[index]) ? this.colors.RED : this.colors.DIM_AMBER)
                : this.colors.OFF;
            this.sendController(this.deviceName, [0x90, note, (color & 0x33) | 4]);
        }
    }

    drawATChange(reason) {
        if (reason === "availability") {
            this.collectATLEDs = true;
            try { this.drawBooks(); }
            finally { this.collectATLEDs = false; }
            return;
        }
        const active = Boolean(this.state.atTransaction);
        // VALUE/TARGET must not restart the blink phase on every press.
        if (active && this.atBlinkTimer === null) {
            const blink = () => {
                this.atBlinkTimer = setTimeout(() => {
                    this.atLit = !this.atLit;
                    this.collectATLEDs = true;
                    try {
                        this.drawBooks();
                        if (this.state.atTransaction?.slot === 8) this.drawTimelineSelection();
                    }
                    finally { this.collectATLEDs = false; }
                    blink();
                }, 160);
            };
            blink();
        } else if (!active) {
            clearTimeout(this.atBlinkTimer);
            this.atBlinkTimer = null;
            this.atLit = true;
        }
        if (reason === "instruments") {
            this.requestInstrumentFeedback();
            return;
        }
        this.collectATLEDs = true;
        try {
            this.drawATValues();
            if (reason === "steps" || reason === "value") { this.drawMotif(); this.drawPlayhead(); }
            else if (reason !== "value") this.drawSelectedMotif();
            this.drawTransport();
            this.drawTimelineSelection();
        } finally { this.collectATLEDs = false; }
    }

    // Contextual layer owns A/T inputs; held releases remain consumed after exit.
    handleATInput(status, number, value, key) {
        if (value === 0 && (this.state.atTransaction || this.atHeld.has(key))) {
            this.deleteConsumedInputs.delete(key);
            if (status === 0x90 && number === this.mapping.VALUE_CONTROLS.SWITCH) this.switchPressed = false;
        }
        if (this.atHeld.has(key)) {
            if (value === 0) {
                this.atHeld.delete(key);
                if (this.atPadHold?.key === key) {
                    const hold = this.atPadHold;
                    clearTimeout(hold.timer);
                    this.atPadHold = null;
                    if (!hold.fired) {
                        if (hold.active) this.actions.at.finish(false);
                        else this.actions.at.begin(hold.slot);
                    }
                }
            }
            return true;
        }
        if (this.state.atTransaction?.slot === 8 && status === 0xB0 &&
            [this.mapping.TOP_CONTROLS.PREVIOUS, this.mapping.TOP_CONTROLS.NEXT].includes(number)) {
            if (value > 0) {
                this.atHeld.add(key);
                this.actions.at.rotate(number === this.mapping.TOP_CONTROLS.PREVIOUS ? -1 : 1);
            }
            return true;
        }
        if (status !== 0x90) return false;
        const context = this.actions.resolveContext();
        const slot = this.mapping.BOOKS.indexOf(number);
        if (this.state.currentView === "PLAY" && slot >= 0) {
            if (!context.atActive && this.deleteArmed) {
                if (value > 0) {
                    this.atHeld.add(key);
                    if (this.actions.at.resetMotif()) this.setDeleteArmed(false);
                }
                return true;
            }
            // Preserve existing contextual commands on the original BOOK surface.
            if (!context.atActive && this.shiftPressed && this.state.chainEnabled) return false;
            if (value > 0) {
                this.atHeld.add(key);
                if ((context.atActive ? this.state.atTransaction.slot === slot : this.actions.at.isEnabled(slot)) && !this.atPadHold) {
                    const hold = { key, slot, active: context.atActive, fired: false, timer: null };
                    this.atPadHold = hold;
                    hold.timer = setTimeout(() => {
                        hold.fired = true;
                        if (hold.active) this.actions.at.finish(true);
                    }, TEMPO_HOLD_DELAY_MS);
                }
            }
            return true;
        }
        if (!context.atActive) return false;
        const index = this.mapping.AT_VALUE.indexOf(number);
        const instrument = this.mapping.INSTRUMENTS.indexOf(number);
        const step = this.mapping.MOTIF.indexOf(number);
        if (index < 0 && instrument < 0 && step < 0) return false;
        if (value > 0) {
            this.atHeld.add(key);
            if (index >= 0) this.actions.at.apply(index);
            else this.actions.at.select(instrument >= 0 ? "instruments" : "steps",
                instrument >= 0 ? instrument : step, this.shiftPressed);
        }
        return true;
    }

    handleMidiMessage(data) {
        const [rawStatus, number, rawValue] = data;
        const status = rawStatus === 0x80 ? 0x90 : rawStatus;
        const value = rawStatus === 0x80 ? 0 : rawValue;
        const inputKey = status + ":" + number;
        if (this.handleATInput(status, number, value, inputKey)) return;
        const chainHold = this.chainMotifHolds.get(inputKey);
        if (chainHold) {
            if (value === 0) {
                clearTimeout(chainHold.timer);
                this.chainMotifHolds.delete(inputKey);
                if (chainHold.deleteIntent) {
                    if (!chainHold.fired && this.deleteArmed && this.actions.resolveContext().structural &&
                        this.state.chain[chainHold.index] === chainHold.id &&
                        this.actions.removeChainOccurrence(chainHold.index)) {
                        this.setDeleteArmed(false);
                        this.drawBooks();
                    }
                } else if (!chainHold.fired && this.state.chainFocus) this.actions.selectFocusMotif(chainHold.id);
            }
            return;
        }
        if (value === 0 && status === 0x90) {
            const id = this.mapping.BOOKS.indexOf(number);
            if (this.copyDeniedPads.delete(id)) this.drawBooks();
        }
        if (this.deleteConsumedInputs.has(inputKey)) {
            if (value === 0) this.deleteConsumedInputs.delete(inputKey);
            return;
        }

        const controlType = this.getControlType(status, number);
        const atActive = this.actions.resolveContext().atActive;
        const controlPosition = this.getControlPosition(
            controlType,
            number
        );

        const controlName = this.getControlName(
            status,
            number
        );
        if (controlName === "PLAY_STOP" && value > 0) {
            this.cancelStepNavigationHold();
            if (this.focusNavigationHeld?.size) this.focusNavigationConsumed = true;
        }
        // Short taps resolve on release; a lone Step hold resolves at UI tempo ticks.
        if (["PREVIOUS", "NEXT"].includes(controlName) &&
            (!this.deleteArmed || atActive) && !this.playStopPressed) {
            this.focusNavigationHeld ??= new Set();
            if (value > 0) {
                if (this.focusNavigationHeld.has(controlName)) return;
                this.focusNavigationHeld.add(controlName);
                if (controlName === "NEXT") this.doubleNavigationHeld = this.shiftPressed && !atActive;
                if (controlName === "PREVIOUS") this.previousPressed = true;
                else this.nextPressed = true;
                if (this.focusNavigationHeld.size === 2 && !this.focusNavigationConsumed) {
                    this.focusNavigationConsumed = true;
                    this.cancelStepNavigationHold();
                    clearTimeout(this.chainNavigationFlashTimer);
                    this.chainNavigationFlashTimer = null;
                    this.chainNavigationFlashColor = null;
                    this.actions.toggleChainFocus();
                    this.drawTimelineSelection();
                    this.drawBooks();
                } else if (!this.focusNavigationConsumed && this.state.transportState !== "PLAY" &&
                    this.actions.resolveContext().navigation === "STEP" &&
                    !this.doubleNavigationHeld && !(this.shiftPressed && !this.state.chainEnabled)) {
                    this.startStepNavigationHold(controlName);
                }
            } else {
                this.cancelStepNavigationHold();
                if (controlName === "PREVIOUS") this.previousPressed = false;
                else this.nextPressed = false;
                const wasHeld = this.focusNavigationHeld.delete(controlName);
                if (wasHeld && !this.focusNavigationConsumed && !this.stepNavigationRepeated) {
                    if (controlName === "NEXT" && this.doubleNavigationHeld) {
                        if (this.actions.doubleSelected()) this.requestInstrumentFeedback();
                        this.doubleNavigationHeld = false;
                        return;
                    } else if (this.shiftPressed && !this.state.chainEnabled && this.state.transportState !== "PLAY") {
                        if (controlName === "PREVIOUS") this.actions.selectMotifTimeline();
                        else this.actions.selectModulationTimeline();
                    } else {
                        this.stepInstrumentFeedback = this.actions.resolveContext().navigation === "STEP";
                        if (this.stepInstrumentFeedback) this.cancelInstrumentPulses();
                        this.actions.navigate(controlName === "PREVIOUS" ? -1 : 1);
                    }
                    if (this.actions.resolveContext().navigation === "CHAIN_OCCURRENCE") this.flashChainNavigationBoundary(controlName);
                    this.drawMotif();
                    this.drawPlayhead();
                    this.drawInstruments();
                    this.swapBuffers();
                    this.drawTimelineSelection();
                }
                if (!this.focusNavigationHeld.size) {
                    this.doubleNavigationHeld = false;
                    this.focusNavigationConsumed = false;
                    this.stepNavigationRepeated = false;
                }
            }
            return;
        }
        if (controlName === "PLAY_STOP" && value > 0 && this.shiftPressed) {
            this.deleteConsumedInputs.add(inputKey);
            for (const hold of this.chainMotifHolds.values()) {
                clearTimeout(hold.timer);
                hold.fired = true;
            }
            this.actions.toggleChain();
            this.cancelTransportPulse();
            this.drawTransport();
            this.swapBuffers();
            return;
        }
        if (controlName === "SWITCH") {
            if (value > 0 && !this.switchPressed) {
                this.actions.toggleView();
            }
            this.switchPressed = value > 0;
            return;
        }
        // STOP/PAUSE selection is contextual in both views; PLAY keeps its library routing.
        if (controlType === "BOOK" && this.state.chainEnabled && this.shiftPressed &&
            !this.copyStage && !this.deleteArmed && value > 0 &&
            (this.state.currentView === "MOTIF_LIBRARY" || ["STOP", "PAUSE"].includes(this.state.transportState))) {
            this.deleteConsumedInputs.add(inputKey);
            this.actions.toggleChainLoopPoint(controlPosition);
            return;
        }
        if (controlType === "BOOK" && this.state.currentView === "MOTIF_LIBRARY") {
            if (value > 0 && this.deleteArmed && this.actions.resolveContext().structural) {
                const hold = { id: controlPosition, index: this.actions.getDeleteOccurrenceIndex(controlPosition),
                    deleteIntent: true, fired: false, timer: null };
                this.chainMotifHolds.set(inputKey, hold);
                hold.timer = setTimeout(() => {
                    hold.fired = true;
                    if (this.deleteArmed && this.actions.resolveContext().structural &&
                        this.actions.deleteChainMotif(hold.id)) {
                        this.setDeleteArmed(false);
                        this.drawBooks();
                    }
                }, TEMPO_HOLD_DELAY_MS);
                return;
            }
            if (this.state.chainEnabled && !this.copyStage && !this.deleteArmed && !this.performanceHolds.size && value > 0) {
                const hold = { id: controlPosition, fired: false, timer: null };
                this.chainMotifHolds.set(inputKey, hold);
                hold.timer = setTimeout(() => {
                    hold.fired = true;
                    if (this.actions.holdChainMotif(hold.id)) {
                        clearTimeout(this.chainConfirmations.get(hold.id));
                        this.chainConfirmations.set(hold.id, setTimeout(() => {
                            this.chainConfirmations.delete(hold.id);
                            this.drawBooks();
                        }, 120));
                        this.drawBooks();
                    }
                }, TEMPO_HOLD_DELAY_MS);
                return;
            }
            if (value > 0) {
                this.deleteConsumedInputs.add(inputKey);
                if (this.copyStage === "SOURCE") {
                    this.setCopyStage("TARGET", this.actions.captureMotifCopy(controlPosition));
                } else if (this.copyStage === "TARGET") {
                    if (this.actions.applyMotifCopy(this.copySource, controlPosition)) {
                        this.setCopyStage(null);
                        this.copySuccessPad = controlPosition;
                        this.copySuccessTimer = setTimeout(() => {
                            this.copySuccessPad = null;
                            this.copySuccessTimer = null;
                            this.drawBooks();
                        }, 120);
                        this.drawBooks();
                    } else {
                        this.copyDeniedPads.add(controlPosition);
                        this.drawBooks();
                    }
                } else if (this.deleteArmed) {
                    if (this.actions.deleteTarget("BOOK", controlPosition)) {
                        this.setDeleteArmed(false);
                        this.drawBooks();
                    }
                } else if (!this.performanceHolds.size) {
                    this.actions.requestMotif(controlPosition);
                }
            }
            return;
        }
        if (controlName === "COPY") {
            if (value > 0) {
                this.deleteConsumedInputs.add(inputKey);
                if (this.copyStage) this.setCopyStage(null);
                else if (!this.shiftPressed && (this.state.currentTimeline === "MOTIF" || this.state.currentView === "MOTIF_LIBRARY")) {
                    this.setDeleteArmed(false);
                    this.setCopyStage("SOURCE");
                }
            }
            return;
        }
        if (controlName === "DELETE") {
            if (value > 0) {
                this.deleteConsumedInputs.add(inputKey);
                if (this.deleteArmed || this.state.currentTimeline === "MOTIF" || this.state.currentView === "MOTIF_LIBRARY" || this.state.currentView === "PLAY") {
                    this.setCopyStage(null);
                    this.setDeleteArmed(!this.deleteArmed);
                }
            }
            return;
        }
        if (!atActive && this.copyStage && value > 0) {
            this.deleteConsumedInputs.add(inputKey);
            if (controlType === "INSTRUMENT" && this.state.currentTimeline === "MOTIF") {
                if (this.copyStage === "SOURCE") {
                    this.setCopyStage("TARGET", this.actions.captureMusicalCopy("VOICE", controlPosition));
                } else if (this.actions.applyVoiceCopy(this.copySource, controlPosition)) {
                    this.setCopyStage(null);
                    this.drawMotif();
                    this.drawPlayhead();
                    this.swapBuffers();
                }
            }
            return;
        }
        if (!atActive && this.deleteArmed && value > 0) {
            this.deleteConsumedInputs.add(inputKey);
            const performance = ["SOLO", "MUTE"].includes(controlName);
            const valid = performance || controlType === "INSTRUMENT" || controlName === "PLAY_STOP";
            if ((valid || controlName === "NEXT") && (performance
                    ? this.actions.clearPerformanceSelection(controlName.toLowerCase())
                    : this.actions.deleteTarget(controlType === "INSTRUMENT" ? "INSTRUMENT"
                        : controlName === "PLAY_STOP" ? "PLAY" : "NEXT", controlPosition))) {
                if (performance) {
                    this.performanceHolds.delete(controlName.toLowerCase());
                    this.drawPerformanceStatus(controlName.toLowerCase());
                }
                this.setDeleteArmed(false);
                this.drawMotif();
                this.drawPlayhead();
                this.swapBuffers();
            }
            return;
        }
        // Route the whole focus gesture here, even when SHIFT is released first.
        // A SOLO hold that began without SHIFT remains a performance gesture.
        if (controlName === "SOLO" && (this.filterSelectionMode ||
            (value > 0 && this.shiftPressed && !this.performanceHolds.has("solo")))) {
            if (value > 0) {
                this.filterWasActive = this.state.filterMode;
                this.filterSelectionMode = true;
                this.filterSelectionChanged = false;
                if (!this.state.filterMode) this.actions.enterFocusMode();
            } else {
                this.filterSelectionMode = false;
                if (this.filterSelectionChanged) this.actions.activateFocusMode();
                else if (this.filterWasActive) this.actions.exitFocusMode();
                else this.actions.activateFocusMode();
            }
            this.drawInstruments();
            this.drawMotif();
            this.drawPlayhead();
            this.drawFilterStatus();
            this.swapBuffers();
            return;
        }
        if (["SOLO", "MUTE"].includes(controlName)) {
            const kind = controlName.toLowerCase();
            if (value > 0) {
                if (!this.performanceHolds.has(kind)) {
                    this.performanceHolds.set(kind, { selection: new Set(this.state[kind + "Selection"]), edited: false });
                    this.cancelInstrumentPulses();
                }
            } else {
                const hold = this.performanceHolds.get(kind);
                if (hold) {
                    this.actions.setPerformanceSelection(kind, hold.selection, hold.edited);
                    this.performanceHolds.delete(kind);
                    this.drawPerformanceStatus(kind);
                }
            }
            this.drawInstruments();
            this.swapBuffers();
            return;
        }
        if (this.performanceHolds.size && controlType === "INSTRUMENT") {
            if (value > 0) {
                this.deleteConsumedInputs.add(inputKey);
                const hold = [...this.performanceHolds.values()].at(-1);
                if (hold.selection.has(controlPosition)) hold.selection.delete(controlPosition);
                else hold.selection.add(controlPosition);
                hold.edited = true;
                this.drawInstruments();
                this.swapBuffers();
            }
            return;
        }
        if (controlName === "SHIFT") {
            this.shiftPressed = value > 0;

            console.log("SHIFT:", this.shiftPressed);

            return;
        }
        if (["PREVIOUS", "NEXT"].includes(controlName) && this.state.chainEnabled &&
            this.state.transportState !== "PLAY") {
            if (value > 0) {
                this.deleteConsumedInputs.add(inputKey);
                this.actions.navigateContext(controlName === "PREVIOUS" ? -1 : 1);
                this.flashChainNavigationBoundary(controlName);
            }
            return;
        }
        if (controlName === "PREVIOUS") {
            if (value > 0) {
                this.previousPressed = true;

                if (this.startTempoAdjustment(-1)) {
                    return;
                }

                if (this.state.transportState !== "PLAY") {

                    // Shift + [<<] = Timeline MOTIF
                    if (this.shiftPressed) {
                        this.actions.selectMotifTimeline();
                        this.drawTimelineSelection();
                        this.drawMotif();
                        this.drawPlayhead();
                        this.swapBuffers();
                        return;
                    }

                    // [<<] = recule immédiatement
                    this.actions.navigate(-1);
                    this.drawMotif();
                    this.drawPlayhead();
                    this.drawInstruments();
                    this.swapBuffers();

                    const stepDuration = this.state.getStepDurationMs();

                    this.previousHoldTimer = setTimeout(() => {
                        this.previousRepeatTimer = setInterval(() => {
                            this.actions.navigate(-1);
                            this.drawMotif();
                            this.drawPlayhead();
                            this.drawInstruments();
                            this.swapBuffers();
                        }, stepDuration);
                    }, stepDuration);

                    return;
                }

                if (this.nextPressed) {
                    this.navigationCombo = true;

                    if (this.state.transportState === "PLAY") {
                        if (this.shiftPressed) {
                            this.actions.toggleLockMode();
                        } else {
                            this.actions.toggleFreezeMode();
                        }

                        this.drawTimelineSelection();
                    }
                }

                return;
            }

            // RELEASE [<<]

            this.previousPressed = false;

            if (this.previousTempoMode) {
                this.previousTempoMode = false;
                this.stopTempoRepeat(-1);

                if (!this.playStopPressed && !this.nextTempoMode) {
                    this.tempoChordConsumed = false;
                }

                return;
            }

            clearTimeout(this.previousHoldTimer);
            clearInterval(this.previousRepeatTimer);

            this.previousHoldTimer = null;
            this.previousRepeatTimer = null;

            if (this.consumeNavigationCombo()) {
                return;
            }

            if (this.state.transportState === "PLAY") {
                this.actions.selectMotifTimeline();
                this.drawTimelineSelection();
                this.drawMotif();
                this.drawPlayhead();

            }

            return;
        }

        if (controlName === "NEXT") {
            if (value > 0) {
                this.nextPressed = true;

                if (this.startTempoAdjustment(1)) {
                    return;
                }

                if (this.state.transportState !== "PLAY") {

                    // Shift + [>>] = Timeline MODULATION
                    if (this.shiftPressed) {
                        this.actions.selectModulationTimeline();
                        this.drawTimelineSelection();
                        this.drawMotif();
                        this.drawPlayhead();
                        this.swapBuffers();
                        return;
                    }

                    // [>>] = avance immédiatement
                    this.actions.navigate(1);
                    this.drawMotif();
                    this.drawPlayhead();
                    this.drawInstruments();
                    this.swapBuffers();

                    const stepDuration = this.state.getStepDurationMs();

                    this.nextHoldTimer = setTimeout(() => {
                        this.nextRepeatTimer = setInterval(() => {
                            this.actions.navigate(1);
                            this.drawMotif();
                            this.drawPlayhead();
                            this.drawInstruments();
                            this.swapBuffers();
                        }, stepDuration);
                    }, stepDuration);

                    return;
                }

                if (this.previousPressed) {
                    this.navigationCombo = true;

                    if (this.state.transportState === "PLAY") {
                        if (this.shiftPressed) {
                            this.actions.toggleLockMode();
                        } else {
                            this.actions.toggleFreezeMode();
                        }

                        this.drawTimelineSelection();
                    }
                }

                return;
            }

            // RELEASE [>>]
            this.nextPressed = false;

            if (this.nextTempoMode) {
                this.nextTempoMode = false;
                this.stopTempoRepeat(1);

                if (!this.playStopPressed && !this.previousTempoMode) {
                    this.tempoChordConsumed = false;
                }

                return;
            }

            clearTimeout(this.nextHoldTimer);
            clearInterval(this.nextRepeatTimer);

            this.nextHoldTimer = null;
            this.nextRepeatTimer = null;

            if (this.consumeNavigationCombo()) {
                return;
            }

            if (this.state.transportState === "PLAY") {
                this.actions.selectModulationTimeline();
                this.drawTimelineSelection();
                this.drawMotif();
                this.drawPlayhead();
            }

            return;
        }
        if (
            controlType === "MOTIF" &&
            value > 0
        ) {
            if (this.shiftPressed) {
                this.actions.toggleSelectedLength(controlPosition + 1);
            } else {
                this.actions.toggleInstrumentStep(controlPosition);
            }
            this.drawMotif();
            this.drawPlayhead();
            this.swapBuffers();

            return;
        }
        if (
            controlType === "INSTRUMENT" &&
            value > 0
        ) {
            // Pendant Filter Selection :
            // le pad ajoute / retire une voix du filtre
            if (this.filterSelectionMode) {
                this.actions.toggleInstrumentFilter(
                    controlPosition
                );

                this.filterSelectionChanged = true;

                this.requestInstrumentFeedback();

                return;
            }

            // Instrument seul = sélection / désélection pour l'édition
            this.actions.toggleSelectedInstrument(
                controlPosition
            );

            this.requestInstrumentFeedback();

            return;
        }
        if (controlName === "PLAY_STOP") {
            if (value > 0) {
                this.playStopPressed = true;
                this.playStopLongPressTriggered = false;
                this.tempoChordConsumed =
                    this.previousTempoMode || this.nextTempoMode;

                if (
                    this.nextPressed &&
                    this.startTempoAdjustment(1)
                ) {
                    return;
                }

                if (
                    this.previousPressed &&
                    this.startTempoAdjustment(-1)
                ) {
                    return;
                }

                this.playStopTimer = setTimeout(() => {
                    if (
                        !this.playStopPressed ||
                        this.tempoChordConsumed
                    ) {
                        return;
                    }

                    this.playStopLongPressTriggered = true;
                    this.actions.stop();
                    this.drawTransport();
                    this.drawTimelineSelection();
                    this.drawMotif();
                    this.drawPlayhead();
                    this.swapBuffers();
                }, 300);

                return;
            }

            const tempoChordConsumed =
                this.tempoChordConsumed;

            this.playStopPressed = false;
            this.stopTempoRepeat();
            clearTimeout(this.playStopTimer);
            this.playStopTimer = null;

            if (tempoChordConsumed) {
                this.playStopLongPressTriggered = false;

                if (
                    !this.previousTempoMode &&
                    !this.nextTempoMode
                ) {
                    this.tempoChordConsumed = false;
                }

                return;
            }

            if (!this.playStopLongPressTriggered) {
                this.actions.togglePlayPause();
                this.drawTransport();
                this.drawTimelineSelection();
            }

            return;
        }

    }
}
