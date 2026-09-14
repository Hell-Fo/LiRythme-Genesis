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
        this.currentMotifId = 0;
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

    getMotif(id) {
        return Number.isInteger(id) && id >= 0 && id < this.motifs.length
            ? this.motifs[id] : null;
    }

    isVoiceAudible(voiceId) {
        return (!this.soloActive || this.soloSelection.has(voiceId)) &&
            (!this.muteActive || !this.muteSelection.has(voiceId));
    }

    getVoiceLength(voiceId) {
        return this.voiceLengths[voiceId] ?? 32;
    }

    getMotifDuration() {
        if (this.motifLength !== null) return this.motifLength;
        const lengths = this.voiceLengths.filter(length => length !== null);
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
        return position % this.getVoiceLength(voiceId);
    }

    advanceLiveLengthCycle() {
        const cycle = this.liveLengthCycle;
        if (!cycle) {
            this.playheadPosition = (this.playheadPosition + 1) % this.getMotifDuration();
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
                cycle.lengths[id] = this.getVoiceLength(id);
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
        if (defer && !this.liveLengthCycle) {
            this.liveLengthCycle = {
                duration: this.getMotifDuration(),
                lengths: Array.from({ length: 16 }, (_, voice) => this.getVoiceLength(voice)),
                steps: Array.from({ length: 16 }, (_, voice) => this.getVoiceStep(voice))
            };
        }
        if (id === null) this.motifLength = length;
        else this.voiceLengths[id] = length;
        if (!defer) {
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
