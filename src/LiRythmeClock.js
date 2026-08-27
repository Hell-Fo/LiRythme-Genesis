/*
===============================================================================

LiRythme – Genesis

LiRythme Clock

Internal clock scheduler.

===============================================================================
*/

export class LiRythmeClock {
    constructor(state) {
        this.state = state;
        this.timer = null;
        this.nextClockTime = 0;
        this.onClockStep = null;
        this.onClockBeat = null;
    }

    setClockStepHandler(handler) {
        this.onClockStep = handler;
    }

    setClockBeatHandler(handler) {
        this.onClockBeat = handler;
    }

    start(advanceStep) {
        if (this.timer !== null) {
            return;
        }

        const stepDuration = this.state.getStepDurationMs();

        this.nextClockTime =
            performance.now() + stepDuration;

        const tick = () => {
            const now = performance.now();

            while (now >= this.nextClockTime) {
                advanceStep();

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
        if (this.timer === null) {
            return;
        }

        clearInterval(this.timer);
        this.timer = null;

        console.log("CLOCK: STOP");
    }
}
