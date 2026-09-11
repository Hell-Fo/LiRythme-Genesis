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
        this.motif = Array.from({ length: 16 }, () => new Array(32).fill(false));
        this.motifLength = null;
        this.voiceLengths = new Array(16).fill(null);
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
        return position % this.getVoiceLength(voiceId);
    }

    setTargetLength(length) {
        if (length !== null && (!Number.isInteger(length) || length < 1 || length > 32)) {
            return false;
        }
        const id = this.selectedInstrument;
        if (id !== null && (!Number.isInteger(id) || id < 0 || id >= 16)) return false;
        const previous = id === null ? this.motifLength : this.voiceLengths[id];
        if (previous === length) return false;
        if (id === null) this.motifLength = length;
        else this.voiceLengths[id] = length;
        // Atomic phase reset; note data and pending Note Offs remain untouched.
        this.playheadPosition = 0;
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
