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

export class LiRythmeState {
    constructor() {
        this.transportState = "STOP";
        this.playheadPosition = 0;
        this.tempo = 120;
        this.stepDivision = 16;
        this.clockTimer = null;
        this.nextClockTime = 0;

        this.currentTimeline = "MOTIF";

        this.modulationActive = false;
        this.modulationChainMode = false;

        this.freezeMode = false;
        this.lockMode = false;
        
        this.motif = {
            kick: new Array(32).fill(false)
        };
    }

    getStepDurationMs() {
        const beatDuration = 60000 / this.tempo;

        return beatDuration * (4 / this.stepDivision);
    }
}