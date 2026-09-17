/*
LiRythme – Genesis

Global state of the LiRythme engine.

Hardware independent.

Author:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

===============================================================================
*/

import { PadConfiguration } from "./PadConfiguration.js";

export class LiRythmeState {
    constructor() {
        Object.defineProperty(this, "onBankChange", { value: null, writable: true });
        // Navigation is independent of the musical timeline and transport.
        this.currentView = "PLAY";
        this.transportState = "STOP";
        this.playheadPosition = 0;
        this.minimumTempo = 20;
        this.maximumTempo = 300;
        this.tempo = 120;
        this.stepDivision = 16;

        this.currentBook = "MOTIF";
        this.currentTimeline = "MOTIF";

        this.modulationActive = false;
        this.modulationChainMode = false;

        this.freezeMode = false;
        this.lockMode = false;

        this.selectedInstrument = 12;
        this.visibleInstrumentFilter = new Set();
        this.filterMode = false;

        this.padConfiguration = new PadConfiguration();
        this.playingMotifId = 0;
        this.nextMotifId = null;
        // Phase A session-only occurrence list (IDs are references into motifs).
        this.chainEnabled = false;
        this.chain = [];
        this.chainPlayingIndex = -1;
        this.chainPlayingDetached = true;
        // Session-only occurrence reference, shifted by structural edits.
        this.chainLoopMasterIndex = null;
        this.chainFocus = false;
        this.viewMotifId = 0;
        this.chainViewIndex = -1;
        Object.defineProperty(this, "currentMotifId", {
            enumerable: true,
            get: () => this.chainFocus ? this.viewMotifId : this.playingMotifId,
            set: id => {
                if (id === this.currentMotifId) return;
                if (this.chainFocus) this.viewMotifId = id;
                else this.playingMotifId = id;
                this.onBankChange?.();
            }
        });
        this.motifs = Array.from({ length: 16 }, () => ({
            events: Array.from({ length: 16 }, () => new Array(32).fill(false)),
            motifLength: null,
            voiceLengths: new Array(16).fill(null)
        }));
        // Compatibility projections; the bank owns the musical data, not a copy.
        for (const [property, field] of Object.entries({
            motif: "events", motifLength: "motifLength", voiceLengths: "voiceLengths"
        })) {
            Object.defineProperty(this, property, {
                enumerable: true,
                get: () => this.getMotif(this.currentMotifId)[field],
                set: value => { this.getMotif(this.currentMotifId)[field] = value; }
            });
        }
        this.soloSelection = new Set();
        this.muteSelection = new Set();
        this.soloActive = false;
        this.muteActive = false;
        this.liveLengthCycle = null;
    }

    getChainNextIndex() {
        if (!this.chain.length) return -1;
        if (!this.chainPlayingDetached && this.chainPlayingIndex === this.chainLoopMasterIndex) return 0;
        return (this.chainPlayingIndex + 1) % this.chain.length;
    }

    getMotif(id) {
        return Number.isInteger(id) && id >= 0 && id < this.motifs.length
            ? this.motifs[id] : null;
    }

    isVoiceAudible(voiceId) {
        return (!this.soloActive || this.soloSelection.has(voiceId)) &&
            (!this.muteActive || !this.muteSelection.has(voiceId));
    }

    getVoiceLength(voiceId, motifId = this.currentMotifId) {
        return this.getMotif(motifId).voiceLengths[voiceId] ?? 32;
    }

    getMotifDuration(motifId = this.currentMotifId) {
        const motif = this.getMotif(motifId);
        if (motif.motifLength !== null) return motif.motifLength;
        const lengths = motif.voiceLengths.filter(length => length !== null);
        if (lengths.length === 0) return 32;
        const gcd = (a, b) => {
            while (b !== 0) [a, b] = [b, a % b];
            return a;
        };
        // LCM(1..32) is below Number.MAX_SAFE_INTEGER; no truncation or cap.
        return lengths.reduce((a, b) => (a / gcd(a, b)) * b, 1);
    }

    getVoiceStep(voiceId, position = this.playheadPosition) {
        if (this.liveLengthCycle && position === this.playheadPosition) {
            return this.liveLengthCycle.steps[voiceId];
        }
        return position % this.getVoiceLength(voiceId, this.playingMotifId);
    }

    advanceLiveLengthCycle() {
        const cycle = this.liveLengthCycle;
        if (!cycle) {
            this.playheadPosition = (this.playheadPosition + 1) % this.getMotifDuration(this.playingMotifId);
            return;
        }
        this.playheadPosition++;
        if (this.playheadPosition >= cycle.duration) {
            this.playheadPosition = 0;
            // The global boundary still resets incomplete local cycles.
            this.liveLengthCycle = null;
            return;
        }
        for (let id = 0; id < 16; id++) {
            cycle.steps[id]++;
            if (cycle.steps[id] >= cycle.lengths[id]) {
                cycle.steps[id] = 0;
                if (!cycle.untilEntry) cycle.lengths[id] = this.getVoiceLength(id, this.playingMotifId);
            }
        }
    }

    setTargetLength(length, { defer = false, target = this.selectedInstrument } = {}) {
        if (length !== null && (!Number.isInteger(length) || length < 1 || length > 32)) {
            return false;
        }
        const id = target;
        if (id !== null && (!Number.isInteger(id) || id < 0 || id >= 16)) return false;
        const previous = id === null ? this.motifLength : this.voiceLengths[id];
        if (previous === length) return false;
        const editingPlaying = this.currentMotifId === this.playingMotifId;
        defer = editingPlaying && (defer || this.chainEnabled && this.transportState === "PLAY");
        if (defer && !this.liveLengthCycle) {
            this.liveLengthCycle = {
                untilEntry: this.chainEnabled,
                duration: this.getMotifDuration(this.playingMotifId),
                lengths: Array.from({ length: 16 }, (_, voice) => this.getVoiceLength(voice, this.playingMotifId)),
                steps: Array.from({ length: 16 }, (_, voice) => this.getVoiceStep(voice))
            };
        }
        if (id === null) this.motifLength = length;
        else this.voiceLengths[id] = length;
        this.onBankChange?.();
        if (!defer && (!this.chainFocus || editingPlaying && this.transportState !== "PLAY")) {
            this.liveLengthCycle = null;
            this.playheadPosition = 0;
        }
        return true;
    }

    getStepDurationMs() {
        const beatDuration = 60000 / this.tempo;

        return beatDuration * (4 / this.stepDivision);
    }

    setTempo(tempo) {
        const nextTempo = Number(tempo);

        if (!Number.isFinite(nextTempo)) {
            return this.tempo;
        }

        this.tempo = Math.min(
            this.maximumTempo,
            Math.max(this.minimumTempo, nextTempo)
        );

        return this.tempo;
    }
}
