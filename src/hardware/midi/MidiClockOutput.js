export class MidiClockOutput {
    constructor(midiManager) {
        this.midiManager = midiManager;
        this.outputName = null;
        this.getTempo = null;
        this.shouldRun = null;
        this.currentTempo = null;
        this.clockEnabled = false;
        this.tempoMonitor = null;
        this.nativeStepsReceived = 0;
        this.lastNativeStepSequence = null;
        this.lostNativeSteps = 0;
        this.outOfOrderNativeSteps = 0;
        this.nativeStepsAccepted = 0;
        this.nativeStepsRejected = 0;
        this.nativeStepRejectionReasons = {};
        this.nativeStepDiagnosticTimer = null;
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

    sendStart(transportRevision) {
        this.sendTransport("START", transportRevision);
    }

    sendContinue(transportRevision) {
        this.sendTransport("CONTINUE", transportRevision);
    }

    sendStop(transportRevision) {
        this.sendTransport("STOP", transportRevision);
    }

    sendTransport(status, transportRevision) {
        this.sendCommand({
            type: "TRANSPORT",
            status,
            transportRevision
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
            this.recordNativeStep(message);
            return;
        }

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

    recordNativeStep(message) {
        const sequence = Number(message.sequence);

        this.nativeStepsReceived += 1;

        if (Number.isInteger(sequence)) {
            if (
                this.lastNativeStepSequence !== null &&
                sequence > this.lastNativeStepSequence + 1
            ) {
                this.lostNativeSteps +=
                    sequence - this.lastNativeStepSequence - 1;
            } else if (
                this.lastNativeStepSequence !== null &&
                sequence <= this.lastNativeStepSequence
            ) {
                this.outOfOrderNativeSteps += 1;
            }

            if (
                this.lastNativeStepSequence === null ||
                sequence > this.lastNativeStepSequence
            ) {
                this.lastNativeStepSequence = sequence;
            }
        }

        const result = this.nativeStepHandler?.(message) ?? {
            accepted: false,
            reason: "NO_HANDLER"
        };

        if (result.accepted) {
            this.nativeStepsAccepted += 1;
        } else {
            const reason = result.reason ?? "UNKNOWN";

            this.nativeStepsRejected += 1;
            this.nativeStepRejectionReasons[reason] =
                (this.nativeStepRejectionReasons[reason] ?? 0) + 1;
        }

        if (this.nativeStepDiagnosticTimer === null) {
            this.nativeStepDiagnosticTimer = setInterval(
                () => this.reportNativeStepDiagnostic(),
                10_000
            );
        }
    }

    reportNativeStepDiagnostic() {
        console.log(
            "NATIVE STEP OBSERVATION:",
            JSON.stringify({
                nativeStepsReceived: this.nativeStepsReceived,
                nativeStepsAccepted: this.nativeStepsAccepted,
                nativeStepsRejected: this.nativeStepsRejected,
                lastNativeStepSequence:
                    this.lastNativeStepSequence,
                lostNativeSteps: this.lostNativeSteps,
                outOfOrderNativeSteps:
                    this.outOfOrderNativeSteps,
                rejectionReasons:
                    this.nativeStepRejectionReasons
            })
        );
    }
}
