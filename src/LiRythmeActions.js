/*
===============================================================================

LiRythme – Genesis

LiRythme Actions

Hardware-independent application actions.

Author:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

===============================================================================
*/
console.log("LOADED: src/LiRythmeActions.js");
export class LiRythmeActions {
    constructor(state, clock) {
        this.state = state;
        this.clock = clock;
        this.onStepPreview = null;
    }
    setClockStepHandler(handler) {
        this.clock.setClockStepHandler(handler);
    }
    setClockBeatHandler(handler) {
        this.clock.setClockBeatHandler(handler);
    }
    setStepPreviewHandler(handler) {
        this.onStepPreview = handler;
    }

    togglePlayPause() {
        if (this.state.transportState === "PLAY") {
            this.pausePlayback();
        } else {
            this.continuePlayback();
        }
    }

    startPlayback({ origin = "LOCAL" } = {}) {
        this.stopClock();

        this.state.playheadPosition = 0;
        this.clock.resetMidiPhase();
        this.state.transportState = "PLAY";
        this.startClock();

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "ORIGIN:",
            origin,
            "POSITION:",
            this.state.playheadPosition
        );
    }

    continuePlayback({ origin = "LOCAL" } = {}) {
        if (this.state.transportState === "PLAY") {
            return;
        }

        this.state.transportState = "PLAY";
        this.startClock();

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "ORIGIN:",
            origin
        );
    }

    pausePlayback({ origin = "LOCAL" } = {}) {
        if (this.state.transportState === "PAUSE") {
            return;
        }

        this.state.transportState = "PAUSE";
        this.stopClock();

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "ORIGIN:",
            origin
        );
    }
    stop() {
        this.stopClock();

        this.state.transportState = "STOP";
        this.state.lockMode = false;
        this.state.playheadPosition = 0;
        this.clock.resetMidiPhase();

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "POSITION:",
            this.state.playheadPosition
        );
    }
    startClock() {
        this.clock.start(() => this.nextStep());
    }

    toggleInstrumentStep(stepIndex) {
        if (this.state.selectedInstrument === null) {
            console.log("EDIT LOCKED: NO INSTRUMENT SELECTED");
            return;
        }
        const instrument =
            this.state.instrumentMap[
            this.state.selectedInstrument
            ];

        if (!instrument) {
            console.log(
                "NO INSTRUMENT MAPPED:",
                this.state.selectedInstrument
            );
            return;
        }

        this.state.motif[instrument][stepIndex] =
            !this.state.motif[instrument][stepIndex];

        console.log(
            instrument.toUpperCase(),
            "STEP:",
            stepIndex,
            this.state.motif[instrument][stepIndex]
                ? "ON"
                : "OFF"
        );
    }
    toggleSelectedInstrument(instrumentPosition) {
        this.state.selectedInstrument =
            this.state.selectedInstrument === instrumentPosition
                ? null
                : instrumentPosition;
    }
    enterFocusMode() {
        this.state.filterMode = true;
        this.state.visibleInstrumentFilter.clear();
        this.state.selectedInstrument = null;

        console.log("FILTER MODE: ON");
    }
    exitFocusMode() {
        this.state.visibleInstrumentFilter.clear();
        this.state.filterMode = false;
        this.state.selectedInstrument = null;

        console.log("FILTER MODE: OFF");
    }
    activateFocusMode() {
        this.state.filterMode = true;

        console.log("FILTER MODE: ON");
    }

    toggleInstrumentFilter(instrumentPosition) {
        const filter = this.state.visibleInstrumentFilter;

        if (filter.has(instrumentPosition)) {
            filter.delete(instrumentPosition);
        } else {
            filter.add(instrumentPosition);
        }

        console.log(
            "VISIBLE FILTER:",
            [...filter]
        );
    }

    stopClock() {
        this.clock.stop();
    }

    selectMotifTimeline() {
        this.state.currentTimeline = "MOTIF";

        console.log("TIMELINE: MOTIF");
    }

    selectModulationTimeline() {
        this.state.currentTimeline = "MODULATION";

        console.log("TIMELINE: MODULATION");
    }
    toggleFreezeMode() {
        this.state.freezeMode = !this.state.freezeMode;

        console.log(
            "FREEZE:",
            this.state.freezeMode ? "ON" : "OFF"
        );
    }
    toggleLockMode() {
        this.state.lockMode = !this.state.lockMode;

        console.log(
            "LOCK:",
            this.state.lockMode ? "ON" : "OFF"
        );
    }
    previousStep({ preview = false } = {}) {
        this.state.playheadPosition =
            (this.state.playheadPosition + 31) % 32;

        console.log(
            "PLAYHEAD:",
            this.state.playheadPosition
        );

        if (
            preview &&
            (
                this.state.transportState === "STOP" ||
                this.state.transportState === "PAUSE"
            ) &&
            this.onStepPreview
        ) {
            this.onStepPreview(this.state.playheadPosition);
        }
    }

    nextStep({ preview = false } = {}) {
        this.state.playheadPosition =
            (this.state.playheadPosition + 1) % 32;

        console.log(
            "PLAYHEAD:",
            this.state.playheadPosition
        );

        if (
            preview &&
            (
                this.state.transportState === "STOP" ||
                this.state.transportState === "PAUSE"
            ) &&
            this.onStepPreview
        ) {
            this.onStepPreview(this.state.playheadPosition);
        }
    }
    nextBook() {
        const books = [
            "MOTIF",
            "ATTRIBUTES_TRANSFORMATIONS",
            "EXTENSIONS"
        ];

        const currentIndex =
            books.indexOf(this.state.currentBook);

        const nextIndex =
            (currentIndex + 1) % books.length;

        this.state.currentBook =
            books[nextIndex];

        console.log(
            "BOOK:",
            this.state.currentBook
        );
    }
}
