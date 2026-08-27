/*
===============================================================================

LiRythme – Genesis

LiRythme Clock

Clock scheduler.

===============================================================================
*/

export class LiRythmeClock {
    constructor(state) {
        this.state = state;
        this.source = "INTERNAL";
        this.timer = null;
        this.nextClockTime = 0;
        this.midiPpqn = 24;
        this.midiPulseCount = 0;
        this.advanceStep = null;
        this.onClockStep = null;
        this.onClockBeat = null;
    }

    setSource(source) {
        if (source !== "INTERNAL" && source !== "MIDI") {
            return;
        }

        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.source = source;
    }

    setClockStepHandler(handler) {
        this.onClockStep = handler;
    }

    setClockBeatHandler(handler) {
        this.onClockBeat = handler;
    }

    start(advanceStep) {
        this.advanceStep = advanceStep;

        if (this.source === "MIDI") {
            return;
        }

        if (this.timer !== null) {
            return;
        }

        const stepDuration = this.state.getStepDurationMs();

        this.nextClockTime =
            performance.now() + stepDuration;

        const tick = () => {
            const now = performance.now();

            while (now >= this.nextClockTime) {
                this.advanceStepPipeline();

                this.nextClockTime += stepDuration;
            }

            this.timer = setTimeout(
                tick,
                10
            );
        };

        this.timer = setTimeout(
            tick,
            10
        );

        console.log(
            "CLOCK: START",
            stepDuration,
            "ms"
        );
    }

    stop() {
        if (this.source === "MIDI") {
            return;
        }

        if (this.timer === null) {
            return;
        }

        clearInterval(this.timer);
        this.timer = null;

        console.log("CLOCK: STOP");
    }

    receiveMidiClockPulse() {
        if (this.source !== "MIDI") {
            return;
        }

        if (this.state.transportState === "STOP") {
            return;
        }

        this.midiPulseCount++;

        const pulsesPerStep =
            this.midiPpqn * 4 / this.state.stepDivision;

        if (this.midiPulseCount < pulsesPerStep) {
            return;
        }

        this.midiPulseCount = 0;

        if (this.state.transportState === "PLAY") {
            this.advanceStepPipeline();
        }
    }

    resetMidiPhase() {
        this.midiPulseCount = 0;
    }

    advanceStepPipeline() {
        if (!this.advanceStep) {
            return;
        }

        this.advanceStep();

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
    }
}
