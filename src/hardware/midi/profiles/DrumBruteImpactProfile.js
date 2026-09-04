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
            this.actions.togglePlayPause({ origin: "MIDI_IN" });
            return;
        }

        if (controller === 51) {
            this.actions.stop({ origin: "MIDI_IN" });
            this.onStop?.();
        }
    }

    getTransportOutputMessage(from, to) {
        if (to === "PLAY") {
            return [0xF0, 0x7F, 0x7F, 0x06, 0x02, 0xF7];
        }

        if (from === "PLAY" && to === "PAUSE") {
            return [0xF0, 0x7F, 0x7F, 0x06, 0x09, 0xF7];
        }

        if (to === "STOP" && from !== "STOP") {
            return [0xF0, 0x7F, 0x7F, 0x06, 0x01, 0xF7];
        }

        return null;
    }
}
