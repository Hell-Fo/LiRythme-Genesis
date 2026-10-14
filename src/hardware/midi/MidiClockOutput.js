export class MidiClockOutput {
    constructor(midiManager) {
        this.midiManager = midiManager;
        this.outputName = null;
        this.getTempo = null;
        this.shouldRun = null;
        this.currentTempo = null;
        this.clockEnabled = false;
        this.tempoMonitor = null;
        this.nativeStepHandler = null;
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

        if (this.midiManager?.backend === "NATIVE_MIDI") {
            this.midiManager.setClockOutput(this.outputName);
        } else {
            this.sendCommand({
                type: "SET_DESTINATION",
                name: this.outputName
            });
        }
    }

    setSource(source) {
        this.sendCommand({
            type: "SET_SOURCE",
            source
        });
    }

    sendStart(transportRevision, companionMessage = null) {
        this.sendTransport(
            "START",
            transportRevision,
            companionMessage
        );
    }

    sendContinue(transportRevision, companionMessage = null) {
        this.sendTransport(
            "CONTINUE",
            transportRevision,
            companionMessage
        );
    }

    sendStop(transportRevision, companionMessage = null) {
        this.sendTransport(
            "STOP",
            transportRevision,
            companionMessage
        );
    }

    sendTransport(
        status,
        transportRevision,
        companionMessage = null
    ) {
        this.sendCommand({
            type: "TRANSPORT",
            status,
            transportRevision,
            companionMessage
        });
    }

    setStepTransport(status, transportRevision) {
        this.sendCommand({
            type: "SET_STEP_TRANSPORT",
            status,
            transportRevision
        });
    }

    setNativeStepHandler(handler) {
        this.nativeStepHandler = handler;
    }

    startClock(getTempo, shouldRun) {
        this.getTempo = getTempo;
        this.shouldRun = shouldRun;

        if (!this.shouldRun?.()) {
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
        if (message.type === "STEP") {
            this.nativeStepHandler?.(message);
            return;
        }


        if (message.type === "ERROR") {
            console.error(
                "Native MIDI Clock OUT error:",
                message
            );
            return;
        }

    }

}
