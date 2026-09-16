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
        this.onNextMotifChange = null;
        this.motifTransitionPending = false;
        this.onChainChange = null;
        this.onChainOccurrence = null;
        this.chainOccurrencePending = false;
    }
    setClockStepHandler(handler) {
        this.clock.setClockStepHandler(() => {
            handler();
            this.flushChainOccurrence();
            if (this.motifTransitionPending) {
                this.motifTransitionPending = false;
                this.onMotifChange?.(this.state.playingMotifId);
            }
        });
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
    setNextMotifChangeHandler(handler) {
        this.onNextMotifChange = handler;
    }
    requestMotif(id) {
        if (this.state.chainEnabled) return this.appendChainMotif(id);
        if (!this.state.getMotif(id)) return false;
        if (this.state.transportState !== "PLAY") return this.selectMotif(id);
        const next = id === this.state.playingMotifId ? null : id;
        if (next === this.state.nextMotifId) return false;
        this.state.nextMotifId = next;
        this.onNextMotifChange?.();
        return true;
    }
    clearNextMotif() {
        if (this.state.nextMotifId === null) return;
        this.state.nextMotifId = null;
        this.onNextMotifChange?.();
    }
    captureMotifCopy(id) {
        const motif = this.state.getMotif(id);
        return motif ? { kind: "BANK_MOTIF", sourceId: id,
            events: motif.events.map(row => row.slice()),
            voiceLengths: motif.voiceLengths.slice(), motifLength: motif.motifLength } : null;
    }
    canWriteMotif(id) {
        return Boolean(this.state.getMotif(id)) &&
            (this.state.transportState !== "PLAY" ||
                (id !== this.state.playingMotifId && id !== this.state.nextMotifId));
    }
    replaceMotif(id, motif) {
        this.state.motifs[id] = motif;
        this.state.onBankChange?.();
        if (id === this.state.currentMotifId) {
            this.state.liveLengthCycle = null;
            this.state.playheadPosition = 0;
            this.onMotifChange?.(id);
        }
    }
    applyMotifCopy(copy, id) {
        if (copy?.kind !== "BANK_MOTIF" || !this.state.getMotif(copy.sourceId) ||
            !this.state.getMotif(id)) return false;
        // Destination protection never applies to source capture. Check it here,
        // even for self-copy, so a protected destination keeps COPY armed.
        if (!this.canWriteMotif(id)) return false;
        if (copy.sourceId === id) return true;
        const validLength = n => n === null || Number.isInteger(n) && n >= 1 && n <= 32;
        if (!Array.isArray(copy.events) || copy.events.length !== 16 ||
            !copy.events.every(row => Array.isArray(row) && row.length === 32 && row.every(v => typeof v === "boolean")) ||
            !Array.isArray(copy.voiceLengths) || copy.voiceLengths.length !== 16 ||
            !copy.voiceLengths.every(validLength) || !validLength(copy.motifLength)) return false;
        this.replaceMotif(id, { events: copy.events.map(row => row.slice()),
            voiceLengths: copy.voiceLengths.slice(), motifLength: copy.motifLength });
        return true;
    }
    deleteMotif(id) {
        if (this.state.chainEnabled) return this.removeChainOccurrence(this.state.chain.lastIndexOf(id));
        // Explicit deletion of CURRENT is allowed; COPY destination guards and
        // the protection of a different prepared NEXT remain unchanged.
        if (!this.state.getMotif(id) || (id !== this.state.currentMotifId && !this.canWriteMotif(id))) return false;
        this.replaceMotif(id, { events: Array.from({ length: 16 }, () => Array(32).fill(false)),
            voiceLengths: Array(16).fill(null), motifLength: null });
        return true;
    }
    setClockBeatHandler(handler) {
        this.clock.setClockBeatHandler(handler);
    }
    toggleChain() {
        this.state.chainEnabled = !this.state.chainEnabled;
        this.state.chainPlayingIndex = -1;
        this.state.chainPlayingDetached = true;
        this.chainOccurrencePending = false;
        this.clearNextMotif();
        this.refreshChainNext();
        if (!this.state.chainEnabled) this.onChainChange?.();
        return this.state.chainEnabled;
    }
    refreshChainNext(notify = true) {
        if (!this.state.chainEnabled) return;
        const nextIndex = this.state.getChainNextIndex();
        this.state.nextMotifId = nextIndex < 0 ? null : this.state.chain[nextIndex];
        if (notify) this.onNextMotifChange?.();
        if (notify) this.onChainChange?.();
    }
    appendChainMotif(id, { afterPlaying = false } = {}) {
        if (!this.state.chainEnabled || !this.state.getMotif(id)) return false;
        const index = afterPlaying ? this.state.chainPlayingIndex + 1 : this.state.chain.length;
        this.state.chain.splice(index, 0, id);
        if (this.state.chainLoopMasterIndex !== null && index <= this.state.chainLoopMasterIndex) {
            this.state.chainLoopMasterIndex++;
        }
        this.refreshChainNext();
        return true;
    }
    navigateContext(direction) {
        if (!this.state.chainEnabled || this.state.transportState === "PLAY") return false;
        if (!this.state.chain.length) return true;
        const index = this.state.chainPlayingIndex < 0 ? 0
            : Math.max(0, Math.min(this.state.chain.length - 1, this.state.chainPlayingIndex + direction));
        this.state.chainPlayingIndex = index;
        this.state.chainPlayingDetached = false;
        this.state.currentMotifId = this.state.chain[index];
        this.state.playheadPosition = 0;
        this.state.liveLengthCycle = null;
        this.refreshChainNext();
        this.onMotifChange?.(this.state.currentMotifId);
        return true;
    }
    holdChainMotif(id) {
        return this.appendChainMotif(id, { afterPlaying: this.state.transportState !== "PLAY" &&
            this.state.chainPlayingIndex >= 0 && !this.state.chainPlayingDetached });
    }
    toggleChainLoopPoint(id) {
        if (!this.state.chainEnabled || !this.state.chain.length) return false;
        const master = this.state.chainLoopMasterIndex;
        let index = this.state.chainPlayingIndex;
        if (this.state.transportState === "PLAY" && master !== null) {
            // LOOP OFF is available from the master's shared pad anywhere in PLAY.
            if (this.state.chain[master] !== id) return false;
            index = master;
        } else if (this.state.chainPlayingDetached || index < 0 || this.state.chain[index] !== id) {
            return false;
        }
        this.state.chainLoopMasterIndex = index === master ? null : index;
        this.refreshChainNext();
        return true;
    }
    removeChainOccurrence(index) {
        if (!this.state.chainEnabled || index < 0 || index >= this.state.chain.length) return false;
        this.state.chain.splice(index, 1);
        if (index === this.state.chainLoopMasterIndex) this.state.chainLoopMasterIndex = null;
        else if (this.state.chainLoopMasterIndex !== null && index < this.state.chainLoopMasterIndex) {
            this.state.chainLoopMasterIndex--;
        }
        if (index === this.state.chainPlayingIndex) this.state.chainPlayingDetached = true;
        // Removing PLAYING leaves a gap: finish its current cycle, then play
        // the element now at that slot. Removing earlier slots preserves identity.
        if (index <= this.state.chainPlayingIndex) this.state.chainPlayingIndex--;
        if (!this.state.chain.length) {
            this.state.chainPlayingIndex = -1;
            this.state.chainLoopMasterIndex = null;
        }
        this.refreshChainNext();
        return true;
    }
    deleteChainNext() {
        return this.removeChainOccurrence(this.state.getChainNextIndex());
    }
    clearChain() {
        if (!this.state.chainEnabled) return false;
        this.state.chain = [];
        this.state.chainLoopMasterIndex = null;
        this.state.chainPlayingIndex = -1;
        this.state.chainPlayingDetached = true;
        this.chainOccurrencePending = false;
        this.refreshChainNext();
        return true;
    }
    flushChainOccurrence() {
        if (!this.chainOccurrencePending) return;
        this.chainOccurrencePending = false;
        this.onChainOccurrence?.();
        this.onChainChange?.();
    }
    prepareChainStart() {
        if (!this.state.chainEnabled) return;
        this.state.chainPlayingIndex = this.state.chain.length ? 0 : -1;
        this.state.chainPlayingDetached = !this.state.chain.length;
        this.chainOccurrencePending = Boolean(this.state.chain.length);
        if (this.state.chain.length) {
            this.state.currentMotifId = this.state.chain[0];
            this.state.playheadPosition = 0;
            this.state.liveLengthCycle = null;
            this.onMotifChange?.(this.state.currentMotifId);
        }
        this.refreshChainNext();
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
        this.clearNextMotif();
        this.prepareChainStart();
        const previousState = this.state.transportState;

        this.stopClock();

        this.state.liveLengthCycle = null;
        this.state.playheadPosition = 0;
        this.clock.resetMidiPhase();
        this.state.transportState = "PLAY";
        this.startClock();
        this.notifyTransportTransition(previousState, origin);
        this.flushChainOccurrence();

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
        if (previousState === "STOP") this.prepareChainStart();
        else this.refreshChainNext();
        this.startClock();
        this.notifyTransportTransition(previousState, origin);
        this.flushChainOccurrence();

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "ORIGIN:",
            origin
        );
    }

    pausePlayback({ origin = "LOCAL" } = {}) {
        this.clearNextMotif();
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
        this.clearNextMotif();
        const previousState = this.state.transportState;

        this.stopClock();

        this.state.transportState = "STOP";
        if (this.state.chainEnabled) {
            this.state.chainPlayingIndex = -1;
            this.state.chainPlayingDetached = true;
            this.chainOccurrencePending = false;
        }
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
        this.onChainChange?.();
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
        this.state.onBankChange?.();

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
        this.state.onBankChange?.();
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
        this.state.onBankChange?.();
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
        if (this.state.chainEnabled && this.state.transportState === "PLAY" && this.state.playheadPosition === 0) {
            this.refreshChainNext(false);
            if (this.state.chain.length) {
                this.state.chainPlayingIndex = this.state.getChainNextIndex();
                this.state.chainPlayingDetached = false;
                this.chainOccurrencePending = true;
            }
        }
        if (this.state.transportState === "PLAY" && this.state.playheadPosition === 0 &&
            this.state.nextMotifId !== null) {
            this.state.playingMotifId = this.state.nextMotifId;
            this.state.onBankChange?.();
            this.state.nextMotifId = null;
            this.state.liveLengthCycle = null;
            this.motifTransitionPending = true;
            if (this.state.chainEnabled) {
                this.refreshChainNext(false);
            }
        }

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
