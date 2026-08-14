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
    constructor(state) {
        this.state = state;
    }

    togglePlayPause() {
        this.state.isPlaying = !this.state.isPlaying;

        console.log(
            "TRANSPORT:",
            this.state.isPlaying ? "PLAY" : "PAUSE"
        );
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
}