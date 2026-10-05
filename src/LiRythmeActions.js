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
import { ATTransaction, createVelocities, validVelocities, createColors, validColors, validATDestinations, validATDestinationRow, validExplicitAttributes } from "./ATTransaction.mjs";
console.log("LOADED: src/LiRythmeActions.js");
export class LiRythmeActions {
    constructor(state, clock) {
        this.rootState = state.rootState ?? state;
        this.state = this.rootState.editingState ?? state;
        this.clock = clock;
        this.onStepPreview = null;
        this.onTransportTransition = null;
        this.onViewChange = null;
        this.onMotifChange = null;
        this.onNextMotifChange = null;
        this.modulationTransitionPending = false;
        this.temporalFlags = { MOTIF: {}, MODULATION: {} };
        for (const key of ["motifTransitionPending", "chainOccurrencePending"]) Object.defineProperty(this, key, {
            get: () => this.temporalFlags[this.state.systemName ?? "MOTIF"][key] ?? false,
            set: value => { this.temporalFlags[this.state.systemName ?? "MOTIF"][key] = value; }
        });
        this.motifTransitionPending = false;
        this.onChainChange = null;
        this.onChainOccurrence = null;
        this.chainOccurrencePending = false;
        this.at = new ATTransaction(this.state, () => this.resolveContext(), reason => this.onATChange?.(reason));
    }
    inSystem(name, operation) {
        const previous = this.state;
        this.state = this.rootState.forSystem?.(name) ?? this.rootState;
        try { return operation(); } finally { this.state = previous; }
    }
    forEachSystem(operation) {
        for (const name of this.rootState.modulation ? ["MOTIF", "MODULATION"] : ["MOTIF"]) {
            this.inSystem(name, operation);
        }
    }
    toggleModulation() {
        this.rootState.modulationRequested = !this.rootState.modulationRequested;
        if (this.state.transportState !== "PLAY") this.rootState.modulationActive = this.rootState.modulationRequested;
        this.state.onBankChange?.();
        this.onModulationChange?.();
        return this.rootState.modulationRequested;
    }
    toggleModulationChain() {
        const result = this.inSystem("MODULATION", () => this.toggleChain());
        this.rootState.modulationChainMode = result;
        this.state.onBankChange?.();
        this.onModulationChange?.();
        return result;
    }
    deferModulationEdit(voices, whole = false, motifId = this.state.currentMotifId) {
        if (this.state.systemName === "MODULATION" && this.state.transportState === "PLAY" &&
            motifId === this.state.playingMotifId) this.state.deferDouble(voices, whole);
    }
    // Normative grammar shared by editing commands and hardware routing.
    resolveContext() {
        const mode = !this.state.chainEnabled ? "NORMAL" : this.state.chainFocus ? "CHAIN_FOCUS" : "CHAIN";
        const playing = this.state.transportState === "PLAY";
        return { system: this.state.systemName ?? "MOTIF", mode, editingMotifId: this.state.currentMotifId, atActive: Boolean(this.state.atTransaction), structural: mode === "CHAIN",
            navigation: !playing && this.state.atTransaction ? "STEP" : mode === "CHAIN_FOCUS" ? (playing ? "VIEW_OCCURRENCE" : "STEP")
                : mode === "CHAIN" && !playing ? "CHAIN_OCCURRENCE" : playing ? "FUTURE" : "STEP" };
    }
    deleteTarget(kind, id = null) {
        const context = this.resolveContext();
        if (kind === "BOOK") return this.deleteMotif(id);
        if (kind === "INSTRUMENT") return this.clearMotifEvents(id);
        if (kind === "PLAY") return context.structural ? this.clearChain()
            : context.mode === "CHAIN_FOCUS" ? this.deleteViewMotif() : this.clearMotifEvents();
        if (kind === "NEXT" && context.structural) return this.deleteChainNext();
        return false;
    }
    navigate(direction) {
        const tx = this.rootState.atTransaction;
        if (tx && this.state.systemName !== tx.system) return this.inSystem(tx.system, () => this.navigate(direction));
        const { navigation } = this.resolveContext();
        if (navigation === "FUTURE") return false;
        if (navigation === "STEP") {
            const motifId = this.at.getEditingMotifId();
            const duration = this.state.getMotifDuration(motifId);
            this.state.liveLengthCycle = null;
            this.state.playheadPosition = (this.state.playheadPosition + direction + duration) % duration;
            this.onStepPreview?.(this.state.playheadPosition, motifId, this.state.systemName);
            return true;
        }
        return this.navigateContext(direction);
    }
    setClockStepHandler(handler) {
        this.clock.setClockStepHandler(() => {
            handler();
            if (this.modulationTransitionPending) {
                this.modulationTransitionPending = false;
                this.onModulationChange?.();
            }
            this.forEachSystem(() => {
                this.flushChainOccurrence();
                if (this.motifTransitionPending) {
                    this.motifTransitionPending = false;
                    if (this.state.systemName === this.rootState.currentTimeline) this.onMotifChange?.(this.state.playingMotifId);
                }
            });
        });
    }
    toggleView() {
        if (this.resolveContext().atActive) return this.state.currentView;
        const views = ["PLAY", "MOTIF_LIBRARY"];
        this.state.currentView = views[(views.indexOf(this.state.currentView) + 1) % views.length];
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
        if (this.state.chainFocus) return this.selectFocusMotif(id);
        if (!["STOP", "PAUSE"].includes(this.state.transportState) ||
            !this.state.getMotif(id) || id === this.state.currentMotifId) return false;
        this.state.currentMotifId = id;
        this.state.liveLengthCycle = null;
        this.state.playheadPosition = 0;
        this.onMotifChange?.(id);
        return true;
    }
    toggleChainFocus() {
        if (!this.state.chainEnabled) return false;
        this.state.viewMotifId = this.state.playingMotifId;
        this.state.chainFocus = !this.state.chainFocus;
        this.state.chainViewIndex = this.state.chainPlayingDetached ? -1 : this.state.chainPlayingIndex;
        this.onMotifChange?.(this.state.currentMotifId);
        this.onChainChange?.();
        return true;
    }
    selectFocusMotif(id) {
        const motif = this.state.getMotif(id);
        if (!this.state.chainFocus || !motif || !(this.state.chain.includes(id) ||
            motif.motifLength !== null || motif.voiceLengths.some(n => n !== null) ||
            motif.events.some(row => row.some(Boolean)) || Object.values(motif.attributes ?? {}).some(rows => rows.some(row => row.some(value => value !== null))))) return false;
        this.state.chainViewIndex = this.state.chain.indexOf(id);
        this.state.currentMotifId = id;
        this.onMotifChange?.(id);
        this.onChainChange?.();
        return true;
    }
    setNextMotifChangeHandler(handler) {
        this.onNextMotifChange = handler;
    }
    requestMotif(id) {
        if (this.state.chainFocus) return this.selectFocusMotif(id);
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
            ...(this.state.systemName === "MODULATION" ? { system: "MODULATION" } : {}),
            ...(motif.attributes !== undefined ? { attributes: structuredClone(motif.attributes) } : {}),
            ...(motif.velocities ? { velocities: motif.velocities.map(row => row.slice()) } : {}),
            ...(motif.colors ? { colors: motif.colors.map(row => row.slice()) } : {}),
            ...(motif.atDestinations ? { atDestinations: structuredClone(motif.atDestinations) } : {}),
            events: motif.events.map(row => row.slice()),
            voiceLengths: motif.voiceLengths.slice(), motifLength: motif.motifLength } : null;
    }
    canWriteMotif(id) {
        return Boolean(this.state.getMotif(id)) &&
            (this.state.transportState !== "PLAY" ||
                (id !== this.state.playingMotifId && id !== this.state.nextMotifId));
    }
    replaceMotif(id, motif) {
        if (this.state.systemName === "MODULATION") motif.attributes ??= {};
        this.deferModulationEdit([], true, id);
        this.state.motifs[id] = motif;
        this.state.onBankChange?.();
        if (id === this.state.playingMotifId && !(this.state.systemName === "MODULATION" && this.state.transportState === "PLAY")) {
            this.state.liveLengthCycle = null;
            this.state.playheadPosition = 0;
        }
        if (id === this.state.currentMotifId) this.onMotifChange?.(id);
    }
    applyMotifCopy(copy, id) {
        if (copy?.kind !== "BANK_MOTIF" || !this.state.getMotif(copy.sourceId) ||
            (copy.system ?? "MOTIF") !== this.state.systemName ||
            !this.state.getMotif(id)) return false;
        // Destination protection never applies to source capture. Check it here,
        // even for self-copy, so a protected destination keeps COPY armed.
        if (!this.canWriteMotif(id)) return false;
        if (copy.sourceId === id) return true;
        const validLength = n => n === null || Number.isInteger(n) && n >= 1 && n <= 32;
        if (!Array.isArray(copy.events) || copy.events.length !== 16 ||
            !copy.events.every(row => Array.isArray(row) && row.length === 32 && row.every(v => typeof v === "boolean")) ||
            !Array.isArray(copy.voiceLengths) || copy.voiceLengths.length !== 16 ||
            !copy.voiceLengths.every(validLength) || !validLength(copy.motifLength) ||
            (copy.velocities !== undefined && !validVelocities(copy.velocities)) ||
            (copy.colors !== undefined && !validColors(copy.colors)) ||
            (copy.atDestinations !== undefined && !validATDestinations(copy.atDestinations)) ||
            (copy.attributes !== undefined && !validExplicitAttributes(copy.attributes))) return false;
        this.replaceMotif(id, { events: copy.events.map(row => row.slice()),
            ...(copy.attributes !== undefined ? { attributes: structuredClone(copy.attributes) } : {}),
            ...(copy.velocities ? { velocities: copy.velocities.map(row => row.slice()) } : {}),
            ...(copy.colors ? { colors: copy.colors.map(row => row.slice()) } : {}),
            ...(copy.atDestinations ? { atDestinations: structuredClone(copy.atDestinations) } : {}),
            voiceLengths: copy.voiceLengths.slice(), motifLength: copy.motifLength });
        return true;
    }
    getDeleteOccurrenceIndex(id) {
        const index = this.state.chainPlayingIndex;
        return !this.state.chainPlayingDetached && this.state.chain[index] === id
            ? index : this.state.chain.lastIndexOf(id);
    }
    deleteChainMotif(id) {
        if (!this.resolveContext().structural || !this.state.getMotif(id)) return false;
        const motif = this.state.getMotif(id);
        this.deferModulationEdit([], true, id);
        // Preserve the engaged geometry, using the same deferred cycle as FOCUS.
        if (id === this.state.playingMotifId && this.state.transportState === "PLAY") {
            this.state.setTargetLength(null, { target: null, defer: true });
            for (let voice = 0; voice < 16; voice++) {
                this.state.setTargetLength(null, { target: voice, defer: true });
            }
        } else {
            motif.motifLength = null;
            motif.voiceLengths.fill(null);
        }
        for (const row of motif.events) row.fill(false);
        delete motif.velocities;
        delete motif.colors;
        delete motif.atDestinations;
        if (motif.attributes !== undefined) motif.attributes = {};
        for (let index = this.state.chain.length - 1; index >= 0; index--) {
            if (this.state.chain[index] === id) this.removeChainOccurrence(index);
        }
        this.state.onBankChange?.();
        if (id === this.state.currentMotifId) this.onMotifChange?.(id);
        return true;
    }
    deleteMotif(id) {
        if (this.resolveContext().structural) return this.removeChainOccurrence(this.state.chain.lastIndexOf(id));
        if (this.resolveContext().mode === "CHAIN_FOCUS" && id === this.state.currentMotifId) return this.deleteViewMotif();
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
        if (this.state.chainFocus) this.toggleChainFocus();
        this.state.chainEnabled = !this.state.chainEnabled;
        this.state.chainPlayingIndex = -1;
        this.state.chainPlayingDetached = true;
        this.chainOccurrencePending = false;
        this.clearNextMotif();
        this.refreshChainNext();
        if (!this.state.chainEnabled) this.onChainChange?.();
        if (this.state.systemName === "MODULATION") {
            this.rootState.modulationChainMode = this.state.chainEnabled;
            this.state.onBankChange?.();
        }
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
        if (this.state.chainViewIndex >= index) this.state.chainViewIndex++;
        if (this.state.chainLoopMasterIndex !== null && index <= this.state.chainLoopMasterIndex) {
            this.state.chainLoopMasterIndex++;
        }
        this.refreshChainNext();
        if (this.state.systemName === "MODULATION") this.state.onBankChange?.();
        return true;
    }
    navigateContext(direction) {
        const { navigation: resolved, mode } = this.resolveContext();
        const navigation = mode === "CHAIN" && this.state.transportState !== "PLAY" ? "CHAIN_OCCURRENCE" : resolved;
        if (navigation === "VIEW_OCCURRENCE") {
            if (!this.state.chain.length) return true;
            const index = this.state.chainViewIndex < 0 ? 0 : Math.max(0,
                Math.min(this.state.chain.length - 1, this.state.chainViewIndex + direction));
            this.state.chainViewIndex = index;
            this.state.currentMotifId = this.state.chain[index];
            this.onMotifChange?.(this.state.currentMotifId);
            this.onChainChange?.();
            return true;
        }
        if (navigation !== "CHAIN_OCCURRENCE") return false;
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
        if (this.state.systemName === "MODULATION") this.state.onBankChange?.();
        this.refreshChainNext();
        return true;
    }
    removeChainOccurrence(index) {
        if (!this.state.chainEnabled || index < 0 || index >= this.state.chain.length) return false;
        this.state.chain.splice(index, 1);
        if (this.state.chainViewIndex === index) this.state.chainViewIndex = -1;
        else if (this.state.chainViewIndex > index) this.state.chainViewIndex--;
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
        if (this.state.systemName === "MODULATION") this.state.onBankChange?.();
        return true;
    }
    deleteChainNext() {
        return this.removeChainOccurrence(this.state.getChainNextIndex());
    }
    clearChain() {
        if (!this.state.chainEnabled) return false;
        this.state.chain = [];
        this.state.chainViewIndex = -1;
        this.state.chainLoopMasterIndex = null;
        this.state.chainPlayingIndex = -1;
        this.state.chainPlayingDetached = true;
        this.chainOccurrencePending = false;
        this.refreshChainNext();
        if (this.state.systemName === "MODULATION") this.state.onBankChange?.();
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
            this.state.playingMotifId = this.state.chain[0];
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
        this.modulationTransitionPending = false;
        this.forEachSystem(() => { this.clearNextMotif(); this.prepareChainStart(); });
        const previousState = this.state.transportState;

        this.stopClock();

        this.forEachSystem(() => { this.state.liveLengthCycle = null; this.state.playheadPosition = 0; });
        this.rootState.modulationActive = this.rootState.modulationRequested;
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
        if (previousState === "STOP") {
            this.forEachSystem(() => this.prepareChainStart());
            this.rootState.modulationActive = this.rootState.modulationRequested;
        } else this.forEachSystem(() => this.refreshChainNext());
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
        this.forEachSystem(() => this.clearNextMotif());
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
        this.modulationTransitionPending = false;
        this.forEachSystem(() => this.clearNextMotif());
        const previousState = this.state.transportState;

        this.stopClock();

        this.state.transportState = "STOP";
        this.forEachSystem(() => { if (this.state.chainEnabled) {
            this.state.chainPlayingIndex = -1;
            this.state.chainPlayingDetached = true;
            this.chainOccurrencePending = false;
        } });
        this.state.lockMode = false;
        this.forEachSystem(() => { this.state.liveLengthCycle = null; this.state.playheadPosition = 0; });
        this.rootState.modulationActive = this.rootState.modulationRequested;
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
        if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= 32) return;
        this.deferModulationEdit([voiceId]);

        this.state.motif[voiceId][stepIndex] =
            !this.state.motif[voiceId][stepIndex];
        const velocities = this.state.getMotif(this.state.currentMotifId).velocities;
        if (velocities) velocities[voiceId][stepIndex] = 100;
        const colors = this.state.getMotif(this.state.currentMotifId).colors;
        if (colors) colors[voiceId][stepIndex] = false;
        const editingMotif = this.state.getMotif(this.state.currentMotifId);
        if (editingMotif.attributes === undefined) for (const rows of Object.values(editingMotif.atDestinations ?? {})) rows[voiceId][stepIndex] = null;
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
        const motif = this.state.getMotif(this.resolveContext().editingMotifId);
        if (kind === "MOTIF") {
            return { kind, events: motif.events.map(row => row.slice()),
                ...(this.state.systemName === "MODULATION" ? { system: "MODULATION" } : {}),
                ...(motif.attributes !== undefined ? { attributes: structuredClone(motif.attributes) } : {}),
                ...(motif.velocities ? { velocities: motif.velocities.map(row => row.slice()) } : {}),
                ...(motif.colors ? { colors: motif.colors.map(row => row.slice()) } : {}),
                ...(motif.atDestinations ? { atDestinations: structuredClone(motif.atDestinations) } : {}),
                voiceLengths: motif.voiceLengths.slice(), motifLength: motif.motifLength };
        }
        if (kind !== "VOICE" || !Number.isInteger(voiceId) || voiceId < 0 || voiceId >= 16) return null;
        return { kind, events: motif.events[voiceId].slice(), length: motif.voiceLengths[voiceId],
            ...(this.state.systemName === "MODULATION" ? { system: "MODULATION" } : {}),
            ...(motif.attributes !== undefined ? { attributes: Object.fromEntries(Object.entries(motif.attributes).map(([key, rows]) => [key, rows[voiceId].slice()])) } : {}),
            ...(motif.velocities ? { velocities: motif.velocities[voiceId].slice() } : {}),
            ...(motif.colors ? { colors: motif.colors[voiceId].slice() } : {}),
            ...(motif.atDestinations ? { atDestinations: Object.fromEntries(Object.entries(motif.atDestinations)
                .map(([key, rows]) => [key, rows[voiceId].slice()])) } : {}) };
    }

    applyVoiceCopy(copy, target) {
        if (copy?.kind !== "VOICE" || (copy.system ?? "MOTIF") !== this.state.systemName ||
            !Number.isInteger(target) || target < 0 || target >= 16 ||
            !Array.isArray(copy.events) || copy.events.length !== 32 ||
            !copy.events.every(event => typeof event === "boolean") ||
            !(copy.length === null || Number.isInteger(copy.length) && copy.length >= 1 && copy.length <= 32) ||
            (copy.velocities !== undefined && (!Array.isArray(copy.velocities) || copy.velocities.length !== 32 ||
                !copy.velocities.every(n => Number.isInteger(n) && n >= 1 && n <= 127))) ||
            (copy.colors !== undefined && (!Array.isArray(copy.colors) || copy.colors.length !== 32 ||
                !copy.colors.every(n => typeof n === "boolean"))) ||
            (copy.atDestinations !== undefined && (!copy.atDestinations || typeof copy.atDestinations !== "object" ||
                Array.isArray(copy.atDestinations) || !Object.entries(copy.atDestinations).every(([key, row]) =>
                    ["VELOCITY", "COLOR", "ROTATION"].includes(key) && validATDestinationRow(row))))) return false;
        if (copy.attributes !== undefined && (!copy.attributes || typeof copy.attributes !== "object" || Array.isArray(copy.attributes) ||
            !validExplicitAttributes(Object.fromEntries(Object.entries(copy.attributes)
            .map(([key, row]) => [key, Array.from({ length: 16 }, () => row)]))))) return false;
        this.deferModulationEdit([target]);
        // COPY preserves live phase for either clock source, using the existing transition.
        this.state.setTargetLength(copy.length, { target, defer: this.state.transportState === "PLAY" });
        this.state.motif[target] = copy.events.slice();
        const motif = this.state.getMotif(this.state.currentMotifId);
        if (motif.attributes !== undefined) {
            for (const key of new Set([...Object.keys(motif.attributes), ...Object.keys(copy.attributes ?? {})])) {
                motif.attributes[key] ??= Array.from({ length: 16 }, () => Array(32).fill(null));
                motif.attributes[key][target] = copy.attributes?.[key]?.slice() ?? Array(32).fill(null);
            }
        }
        if (copy.velocities || motif.velocities) {
            motif.velocities ??= createVelocities();
            motif.velocities[target] = copy.velocities?.slice() ?? Array(32).fill(100);
        }
        if (copy.colors || motif.colors) {
            motif.colors ??= createColors();
            motif.colors[target] = copy.colors?.slice() ?? Array(32).fill(false);
        }
        for (const key of new Set([...Object.keys(motif.atDestinations ?? {}), ...Object.keys(copy.atDestinations ?? {})])) {
            motif.atDestinations ??= {};
            motif.atDestinations[key] ??= Array.from({ length: 16 }, () => Array(32).fill(null));
            motif.atDestinations[key][target] = copy.atDestinations?.[key]?.slice() ?? Array(32).fill(null);
        }
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

    deleteViewMotif() {
        if (!this.state.chainFocus) return false;
        const motif = this.state.getMotif(this.state.currentMotifId);
        this.deferModulationEdit([], true);
        // Keep the engaged geometry until its natural boundary, exactly as
        // other live temporal edits do. Scheduled Note Offs remain untouched.
        if (this.state.currentMotifId === this.state.playingMotifId && this.state.transportState === "PLAY") {
            this.state.setTargetLength(null, { target: null, defer: true });
            for (let voice = 0; voice < 16; voice++) {
                this.state.setTargetLength(null, { target: voice, defer: true });
            }
        } else {
            motif.motifLength = null;
            motif.voiceLengths.fill(null);
        }
        for (const row of motif.events) row.fill(false);
        delete motif.velocities;
        delete motif.colors;
        delete motif.atDestinations;
        if (motif.attributes !== undefined) motif.attributes = {};
        this.state.onBankChange?.();
        return true;
    }

    clearMotifEvents(voiceId = null) {
        if (voiceId !== null && (!Number.isInteger(voiceId) || voiceId < 0 || voiceId >= 16)) return false;
        this.deferModulationEdit(voiceId === null ? [] : [voiceId], voiceId === null);
        const rows = voiceId === null ? this.state.motif : [this.state.motif[voiceId]];
        // Existing scheduled Note Offs own active notes and remain untouched.
        for (const row of rows) row.fill(false);
        const motif = this.state.getMotif(this.state.currentMotifId);
        if (motif.attributes !== undefined) {
            if (voiceId === null) motif.attributes = {};
            else for (const rows of Object.values(motif.attributes)) rows[voiceId].fill(null);
        }
        if (voiceId === null) delete motif.velocities;
        else motif.velocities?.[voiceId].fill(100);
        if (voiceId === null) delete motif.atDestinations;
        else for (const rows of Object.values(motif.atDestinations ?? {})) rows[voiceId].fill(null);
        if (voiceId === null) delete motif.colors;
        else motif.colors?.[voiceId].fill(false);
        this.state.onBankChange?.();
        return true;
    }

    doubleSelected() {
        const context = this.resolveContext();
        if (context.atActive) return false;
        const motif = this.state.getMotif(context.editingMotifId);
        const target = this.state.selectedInstrument;
        const whole = target === null;
        const canDouble = n => Number.isInteger(n) && n >= 1 && n <= 16;
        if (!motif || !whole && (!Number.isInteger(target) || target < 0 || target >= 16)) return false;
        if (whole && !canDouble(motif.motifLength)) return false;
        const voices = whole ? motif.voiceLengths.flatMap((length, id) =>
            length !== null || motif.events[id].some(Boolean) || Object.values(motif.attributes ?? {}).some(rows => rows[id].some(v => v !== null)) ? [id] : []) : [target];
        if (voices.some(id => !canDouble(motif.voiceLengths[id]))) return false;
        // Prepare the entire replacement before touching the bank or live cycle.
        // Step-indexed attribute matrices share the event geometry, including future attributes.
        const next = structuredClone(motif);
        const matrices = Object.keys(next).filter(key => Array.isArray(next[key]) &&
            next[key].length === 16 && next[key].every(row => Array.isArray(row) && row.length === 32));
        for (const id of voices) {
            const length = motif.voiceLengths[id];
            for (const key of matrices) {
                for (let step = 0; step < length; step++) {
                    next[key][id][step + length] = structuredClone(motif[key][id][step]);
                }
            }
            for (const rows of Object.values(next.atDestinations ?? {})) {
                for (let step = 0; step < length; step++) rows[id][step + length] = rows[id][step];
            }
            for (const rows of Object.values(next.attributes ?? {})) {
                for (let step = 0; step < length; step++) rows[id][step + length] = rows[id][step];
            }
            next.voiceLengths[id] = length * 2;
        }
        if (whole) next.motifLength *= 2;
        const playing = context.editingMotifId === this.state.playingMotifId;
        if (playing && this.state.transportState === "PLAY") this.state.deferDouble(voices, whole);
        this.state.motifs[context.editingMotifId] = next;
        if (playing && this.state.transportState !== "PLAY") {
            this.state.liveLengthCycle = null;
            this.state.playheadPosition = 0;
        }
        this.state.onBankChange?.();
        return true;
    }

    setSelectedLength(length) {
        return this.state.setTargetLength(length, {
            defer: (this.state.systemName === "MODULATION" || this.state.chainEnabled || this.clock.source === "INTERNAL") && this.state.transportState === "PLAY"
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
        return this.selectTimeline("MOTIF");
    }

    selectModulationTimeline() {
        return this.selectTimeline("MODULATION");
    }
    selectTimeline(name) {
        if (this.rootState.currentTimeline === name) return false;
        this.rootState.currentTimeline = name;
        this.onContextChange?.();
        if (this.rootState.atTransaction) {
            this.onATChange?.("context");
            this.onChainChange?.();
            return true;
        }
        this.onMotifChange?.(this.state.currentMotifId);
        this.onChainChange?.();
        this.onViewChange?.(this.state.currentView);
        return true;
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
            this.onStepPreview(this.state.playheadPosition, this.at.getEditingMotifId(), this.state.systemName);
        }
    }

    nextStep({ preview = false } = {}) {
        if (this.state.transportState === "PLAY") {
            this.forEachSystem(() => this.advanceSystemStep());
            if (this.rootState.modulation?.playheadPosition === 0) {
                const changed = this.rootState.modulationActive !== this.rootState.modulationRequested;
                this.rootState.modulationActive = this.rootState.modulationRequested;
                if (changed) this.modulationTransitionPending = true;
            }
        } else this.advanceSystemStep({ preview });
    }
    advanceSystemStep({ preview = false } = {}) {
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
            this.onStepPreview(this.state.playheadPosition, this.at.getEditingMotifId(), this.state.systemName);
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
