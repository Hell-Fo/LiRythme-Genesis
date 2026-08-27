export class DrumBruteImpactProfile {
    constructor(actions, onStop = null) {
        this.actions = actions;
        this.onStop = onStop;
    }

    handleMidiMessage(data) {
        const [status, controller, value] = data;

        if ((status & 0xF0) !== 0xB0 || value === 0) {
            return;
        }

        if (controller === 54) {
            this.actions.togglePlayPause();
            return;
        }

        if (controller === 51) {
            this.actions.stop();
            this.onStop?.();
        }
    }
}
