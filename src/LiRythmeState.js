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
