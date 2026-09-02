export class MidiClockOutput {
    constructor() {
        this.outputName = null;
        this.getTempo = null;
        this.shouldRun = null;
        this.currentTempo = null;
        this.clockEnabled = false;
        this.tempoMonitor = null;
        this.nativeBridge =
            globalThis.midiClockOutputNative ?? null;

        if (!this.nativeBridge) {
            console.error(
                "Native MIDI Clock OUT bridge unavailable"
            );
            return;
        }

        this.removeStatusListener =
            this.nativeBridge.onStatus(
                message => this.handleStatus(message)
            );
    }

    setOutput(name) {
        const nextOutputName =
            name === "NONE" ? null : name;

        if (nextOutputName === this.outputName) {
            return;
        }

        this.outputName = nextOutputName;
        this.sendCommand({
            type: "SET_DESTINATION",
            name: this.outputName
        });
    }

    setSource(source) {
        this.sendCommand({
            type: "SET_SOURCE",
            source
        });
    }

    sendStart() {
        this.sendTransport("START");
    }

    sendContinue() {
        this.sendTransport("CONTINUE");
    }

    sendStop() {
        this.sendTransport("STOP");
    }

    sendTransport(status) {
        this.sendCommand({
            type: "TRANSPORT",
            status
        });
    }

    startClock(getTempo, shouldRun) {
        this.getTempo = getTempo;
        this.shouldRun = shouldRun;

        if (!this.outputName || !this.shouldRun?.()) {
            return;
        }

        const tempo = this.getValidTempo();

        if (tempo === null) {
            return;
        }

        this.updateTempo(tempo);

        if (!this.clockEnabled) {
            this.clockEnabled = true;
            this.sendCommand({
                type: "SET_ENABLED",
                enabled: true
            });
        }

        this.startTempoMonitor();
    }

    stopClock() {
        this.stopTempoMonitor();

        if (!this.clockEnabled) {
            return;
        }

        this.clockEnabled = false;
        this.sendCommand({
            type: "SET_ENABLED",
            enabled: false
        });
    }

    startTempoMonitor() {
        if (this.tempoMonitor !== null) {
            return;
        }

        this.tempoMonitor = setInterval(() => {
            if (!this.shouldRun?.()) {
                this.stopClock();
                return;
            }

            const tempo = this.getValidTempo();

            if (tempo !== null) {
                this.updateTempo(tempo);
            }
        }, 100);
    }

    stopTempoMonitor() {
        if (this.tempoMonitor === null) {
            return;
        }

        clearInterval(this.tempoMonitor);
        this.tempoMonitor = null;
    }

    updateTempo(tempo) {
        if (tempo === this.currentTempo) {
            return;
        }

        this.currentTempo = tempo;
        this.sendCommand({
            type: "SET_TEMPO",
            bpm: tempo
        });
    }

    getValidTempo() {
        const tempo = Number(this.getTempo?.());

        return Number.isFinite(tempo) && tempo > 0
            ? tempo
            : null;
    }

    sendCommand(command) {
        this.nativeBridge?.sendCommand(command);
    }

    handleStatus(message) {
        if (message.type === "DIAGNOSTIC") {
            console.log(
                "NATIVE MIDI CLOCK OUT DIAGNOSTIC COPY:",
                JSON.stringify(message)
            );
            console.table(message);
            return;
        }

        if (message.type === "ERROR") {
            console.error(
                "Native MIDI Clock OUT error:",
                message
            );
            return;
        }

        console.log("Native MIDI Clock OUT:", message);
    }
}
