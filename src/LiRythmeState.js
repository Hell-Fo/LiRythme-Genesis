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

        this.selectedInstrument = 12;
        this.instrumentMap = {
            8: "tomH",
            9: "tomL",
            10: "closedHat",
            11: "openHat",
            12: "kick",
            13: "snare1",
            14: "snare2",
            15: "cymbal"
        };

        this.motif = {
            tomH: new Array(32).fill(false),
            tomL: new Array(32).fill(false),
            closedHat: new Array(32).fill(false),
            openHat: new Array(32).fill(false),
            kick: new Array(32).fill(false),
            snare1: new Array(32).fill(false),
            snare2: new Array(32).fill(false),
            cymbal: new Array(32).fill(false)
        };
    }

    getStepDurationMs() {
        const beatDuration = 60000 / this.tempo;

        return beatDuration * (4 / this.stepDivision);
    }
}