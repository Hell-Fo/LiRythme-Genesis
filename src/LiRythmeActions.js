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
        if (this.state.transportState === "PLAY") {
            this.state.transportState = "PAUSE";
        } else {
            this.state.transportState = "PLAY";
        }

        console.log(
            "TRANSPORT:",
            this.state.transportState
        );
    }
    stop() {
        this.state.transportState = "STOP";
        this.state.playheadPosition = 0;

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "POSITION:",
            this.state.playheadPosition
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
    toggleLockMode() {
        this.state.lockMode = !this.state.lockMode;

        console.log(
            "LOCK:",
            this.state.lockMode ? "ON" : "OFF"
        );
    }
    previousStep() {
        this.state.playheadPosition =
            (this.state.playheadPosition + 31) % 32;

        console.log(
            "PLAYHEAD:",
            this.state.playheadPosition
        );
    }

    nextStep() {
        this.state.playheadPosition =
            (this.state.playheadPosition + 1) % 32;

        console.log(
            "PLAYHEAD:",
            this.state.playheadPosition
        );
    }
}