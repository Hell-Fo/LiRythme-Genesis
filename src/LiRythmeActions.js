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
        this.onClockStep = null;
        this.onClockBeat = null;
    }
    setClockStepHandler(handler) {
        this.onClockStep = handler;
    }
    setClockBeatHandler(handler) {
        this.onClockBeat = handler;
    }

    togglePlayPause() {
        if (this.state.transportState === "PLAY") {
            this.state.transportState = "PAUSE";
            this.stopClock();
        } else {
            this.state.transportState = "PLAY";
            this.startClock();
        }

        console.log(
            "TRANSPORT:",
            this.state.transportState
        );
    }
    stop() {
        this.stopClock();

        this.state.transportState = "STOP";
        this.state.lockMode = false;
        this.state.playheadPosition = 0;

        console.log(
            "TRANSPORT:",
            this.state.transportState,
            "POSITION:",
            this.state.playheadPosition
        );
    }
    startClock() {
        if (this.state.clockTimer !== null) {
            return;
        }

        const stepDuration = this.state.getStepDurationMs();

        this.state.nextClockTime =
            performance.now() + stepDuration;

        const tick = () => {
            const now = performance.now();

            while (now >= this.state.nextClockTime) {
                this.nextStep();

                if (this.onClockStep) {
                    this.onClockStep();
                }

                const stepsPerBeat =
                    this.state.stepDivision / 4;

                if (
                    this.state.playheadPosition % stepsPerBeat === 0 &&
                    this.onClockBeat
                ) {
                    this.onClockBeat();
                }

                this.state.nextClockTime += stepDuration;
            }

            this.state.clockTimer = setTimeout(
                tick,
                10
            );
        };

        this.state.clockTimer = setTimeout(
            tick,
            10
        );

        console.log(
            "CLOCK: START",
            stepDuration,
            "ms"
        );
    }
    
    toggleKickStep(stepIndex) {
        this.state.motif.kick[stepIndex] =
            !this.state.motif.kick[stepIndex];

        console.log(
            "KICK STEP:",
            stepIndex,
            this.state.motif.kick[stepIndex] ? "ON" : "OFF"
        );
    }

    stopClock() {
        if (this.state.clockTimer === null) {
            return;
        }

        clearInterval(this.state.clockTimer);
        this.state.clockTimer = null;

        console.log("CLOCK: STOP");
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