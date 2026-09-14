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
        this.onTransportTransition = null;
        this.onViewChange = null;
        this.onMotifChange = null;
    }
    setClockStepHandler(handler) {
        this.clock.setClockStepHandler(handler);
    }
    toggleView() {
        this.state.currentView = this.state.currentView === "PLAY"
            ? "MOTIF_LIBRARY" : "PLAY";
        this.onViewChange?.(this.state.currentView);
        return this.state.currentView;
    }
    setViewChangeHandler(handler) {
        this.onViewChange = handler;
    }
    setMotifChangeHandler(handler) {
        this.onMotifChange = handler;
    }
    selectMotif(id) {
        if (!["STOP", "PAUSE"].includes(this.state.transportState) ||
            !this.state.getMotif(id) || id === this.state.currentMotifId) return false;
        this.state.currentMotifId = id;
        this.state.liveLengthCycle = null;
        this.state.playheadPosition = 0;
        this.onMotifChange?.(id);
        return true;
    }
    setClockBeatHandler(handler) {
        this.clock.setClockBeatHandler(handler);
    }
    setStepPreviewHandler(handler) {
        this.onStepPreview = handler;
    }
    setTransportTransitionHandler(handler) {
        this.onTransportTransition = handler;
    }

    adjustInternalTempo(delta) {
        if (this.clock.source !== "INTERNAL") {
            return false;
        }

        const previousTempo = this.state.tempo;
        const nextTempo = this.state.setTempo(
            previousTempo + Number(delta)
        );
        const changed = nextTempo !== previousTempo;

        if (changed) {
            console.log("TEMPO:", nextTempo, "BPM");
        }

        return changed;
    }

    togglePlayPause({ origin = "LOCAL" } = {}) {
        if (this.state.transportState === "PLAY") {
            this.pausePlayback({ origin });
        } else {
            this.continuePlayback({ origin });
        }
    }

    startPlayback({ origin = "LOCAL" } = {}) {
        const previousState = this.state.transportState;

        this.stopClock();

        this.state.liveLengthCycle = null;
        this.state.playheadPosition = 0;
        this.clock.resetMidiPhase();
        this.state.transportState = "PLAY";
        this.startClock();
        this.notifyTransportTransition(previousState, origin);

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

        const previousState = this.state.transportState;

        this.state.transportState = "PLAY";
        this.startClock();
        this.notifyTransportTransition(previousState, origin);

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

        const previousState = this.state.transportState;

        this.state.transportState = "PAUSE";
        this.stopClock();
        this.notifyTransportTransition(previousState, origin);

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "ORIGIN:",
            origin
        );
    }
    stop({ origin = "LOCAL" } = {}) {
        const previousState = this.state.transportState;

        this.stopClock();

        this.state.transportState = "STOP";
        this.state.lockMode = false;
        this.state.liveLengthCycle = null;
        this.state.playheadPosition = 0;
        this.clock.resetMidiPhase();
        this.notifyTransportTransition(previousState, origin);

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "POSITION:",
            this.state.playheadPosition
        );
    }
    notifyTransportTransition(previousState, origin) {
        if (previousState === this.state.transportState) {
            return;
        }

        const transportRevision =
            this.clock.advanceTransportRevision();

        if (!this.onTransportTransition) {
            return;
        }

        this.onTransportTransition({
            from: previousState,
            to: this.state.transportState,
            origin,
            transportRevision
        });
    }
    startClock() {
        this.clock.start(() => this.nextStep());
    }

    toggleInstrumentStep(stepIndex) {
        if (this.state.selectedInstrument === null) {
            console.log("EDIT LOCKED: NO INSTRUMENT SELECTED");
            return;
        }
        const voiceId = this.state.selectedInstrument;
        if (!Number.isInteger(voiceId) || voiceId < 0 || voiceId >= 16) return;

        this.state.motif[voiceId][stepIndex] =
            !this.state.motif[voiceId][stepIndex];

        console.log(
            "VOICE " + (voiceId + 1),
            "STEP:",
            stepIndex,
            this.state.motif[voiceId][stepIndex]
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
    captureMusicalCopy(kind, voiceId) {
        if (this.state.currentTimeline !== "MOTIF") return null;
        if (kind === "MOTIF") {
            return { kind, events: this.state.motif.map(row => row.slice()),
                voiceLengths: this.state.voiceLengths.slice(), motifLength: this.state.motifLength };
        }
        if (kind !== "VOICE" || !Number.isInteger(voiceId) || voiceId < 0 || voiceId >= 16) return null;
        return { kind, events: this.state.motif[voiceId].slice(), length: this.state.voiceLengths[voiceId] };
    }

    applyVoiceCopy(copy, target) {
        if (this.state.currentTimeline !== "MOTIF" || copy?.kind !== "VOICE" ||
            !Number.isInteger(target) || target < 0 || target >= 16 ||
            !Array.isArray(copy.events) || copy.events.length !== 32 ||
            !copy.events.every(event => typeof event === "boolean") ||
            !(copy.length === null || Number.isInteger(copy.length) && copy.length >= 1 && copy.length <= 32)) return false;
        // COPY preserves live phase for either clock source, using the existing transition.
        this.state.setTargetLength(copy.length, { target, defer: this.state.transportState === "PLAY" });
        this.state.motif[target] = copy.events.slice();
        // Scheduled Note Offs remain owned by the existing dispatch callbacks.
        return true;
    }

    setPerformanceSelection(kind, selection, edited = false) {
        if (!["solo", "mute"].includes(kind) || !(selection instanceof Set) ||
            [...selection].some(id => !Number.isInteger(id) || id < 0 || id >= 16)) return false;
        this.state[kind + "Selection"] = new Set(selection);
        this.state[kind + "Active"] = selection.size > 0 && (edited || !this.state[kind + "Active"]);
        return true;
    }

    clearPerformanceSelection(kind) {
        if (!["solo", "mute"].includes(kind)) return false;
        this.state[kind + "Selection"].clear();
        this.state[kind + "Active"] = false;
        return true;
    }

    clearMotifEvents(voiceId = null) {
        if (this.state.currentTimeline !== "MOTIF") return false;
        if (voiceId !== null && (!Number.isInteger(voiceId) || voiceId < 0 || voiceId >= 16)) return false;
        const rows = voiceId === null ? this.state.motif : [this.state.motif[voiceId]];
        // Existing scheduled Note Offs own active notes and remain untouched.
        for (const row of rows) row.fill(false);
        return true;
    }

    setSelectedLength(length) {
        return this.state.setTargetLength(length, {
            defer: this.clock.source === "INTERNAL" && this.state.transportState === "PLAY"
        });
    }

    clearSelectedLength() {
        return this.setSelectedLength(null);
    }

    toggleSelectedLength(length) {
        if (!Number.isInteger(length) || length < 1 || length > 32) return false;
        const id = this.state.selectedInstrument;
        const current = id === null ? this.state.motifLength : this.state.voiceLengths[id];
        return this.setSelectedLength(current === length ? null : length);
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
        this.state.liveLengthCycle = null;
        this.state.playheadPosition =
            (this.state.playheadPosition + this.state.getMotifDuration() - 1) % this.state.getMotifDuration();

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
        this.state.advanceLiveLengthCycle();

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
