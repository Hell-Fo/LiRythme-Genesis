export class MidiClockInput {
    constructor(clock) {
        this.clock = clock;
        this.onStart = null;
        this.onContinue = null;
        this.onStop = null;
    }

    handleMidiMessage(data) {
        const status = data[0];

        if (status === 0xF8) {
            this.clock.receiveMidiClockPulse();
            return;
        }

        if (status === 0xFA) {
            this.onStart?.();
            return;
        }

        if (status === 0xFB) {
            this.onContinue?.();
            return;
        }

        if (status === 0xFC) {
            this.onStop?.();
        }
    }
}
