/*
===============================================================================

LiRythme – Genesis

MidiManager

Responsible for MIDI device discovery and communication.

Author:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

===============================================================================
*/

export class MidiManager {
    constructor() {
        this.midiAccess = null;
        this.outputs = new Map();
        this.midiClockSendCounts = new Map();
        this.controllerInput = null;
        this.controllerMessageListener = null;
        this.clockInput = null;
        this.clockMessageListener = null;
        this.backend = "WEB_MIDI";
        this.nativeBridge = null;
        this.controllerOutputName = null;
        this.clockOutputName = null;
        this.notesOutputName = null;
        this.removeNativeStatusListener = null;

        this.controllerSelector =
            document.getElementById("midi-controller");

        this.clockInputSelector =
            document.getElementById("midi-clock-input");

        this.clockOutputSelector =
            document.getElementById("midi-clock-output");

        this.outputSelector =
            document.getElementById("midi-output");
    }

    async initialize({
        webMidiEnabled = true,
        nativeBridge = null
    } = {}) {
        if (webMidiEnabled) {
            this.backend = "WEB_MIDI";
            this.midiAccess = await navigator.requestMIDIAccess();
        } else if (nativeBridge) {
            this.backend = "NATIVE_MIDI";
            this.nativeBridge = nativeBridge;
            const ports = await nativeBridge.request({
                type: "LIST_PORTS"
            });

            this.midiAccess = {
                inputs: new Map(
                    ports.inputs.map(port => [
                        `native-input-${port.id}`,
                        {
                            id: `native-input-${port.id}`,
                            name: port.name
                        }
                    ])
                ),
                outputs: new Map(
                    ports.outputs
                        .map(port => [
                            `native-output-${port.id}`,
                            {
                                id: `native-output-${port.id}`,
                                name: port.name
                            }
                        ])
                )
            };

            this.removeNativeStatusListener =
                nativeBridge.onStatus(
                    message => this.handleNativeStatus(message)
                );
        } else {
            this.midiAccess = {
                inputs: new Map(),
                outputs: new Map()
            };
        }

        this.updateDeviceLists();

    }

    updateDeviceLists() {
        this.controllerSelector.innerHTML = "";
        this.clockInputSelector.innerHTML = "";
        this.clockOutputSelector.innerHTML = "";
        this.outputSelector.innerHTML = "";
        this.outputs.clear();

        const internalClockOption =
            document.createElement("option");

        internalClockOption.value = "INTERNAL";
        internalClockOption.textContent = "INTERNAL";

        this.clockInputSelector.appendChild(
            internalClockOption
        );

        const noClockOutputOption =
            document.createElement("option");

        noClockOutputOption.value = "NONE";
        noClockOutputOption.textContent = "NONE";

        this.clockOutputSelector.appendChild(
            noClockOutputOption
        );

        for (const input of this.midiAccess.inputs.values()) {
            const controllerOption =
                document.createElement("option");

            controllerOption.value = input.id;
            controllerOption.textContent = input.name;

            this.controllerSelector.appendChild(
                controllerOption
            );

            const clockInputOption =
                document.createElement("option");

            clockInputOption.value = input.id;
            clockInputOption.textContent = input.name;

            this.clockInputSelector.appendChild(
                clockInputOption
            );
        }

        for (const output of this.midiAccess.outputs.values()) {
            const option = document.createElement("option");

            option.value = output.id;
            option.textContent = output.name;

            const clockOutputOption = option.cloneNode(true);

            this.outputs.set(output.name, output);

            this.clockOutputSelector.appendChild(
                clockOutputOption
            );
            this.outputSelector.appendChild(option);
        }
    }

    findOutput(name) {
        return this.outputs.get(name) ?? null;
    }
    findInput(name) {
        for (const input of this.midiAccess.inputs.values()) {
            if (input.name === name) {
                return input;
            }
        }

        return null;
    }

    findControllerPorts(name) {
        return {
            input: this.findInput(name),
            output: this.findOutput(name)
        };
    }

    send(outputName, message, timestamp) {
        const output = this.findOutput(outputName);

        if (!output) {
            console.error("MIDI output not found:", outputName);
            return;
        }

        if (this.backend === "NATIVE_MIDI") {
            this.nativeBridge.send({
                type: outputName === this.controllerOutputName
                        ? "SEND_CONTROLLER"
                        : "SEND_NOTES",
                name: outputName,
                message: Array.from(message)
            });
            return;
        }

        if (timestamp === undefined) {
            output.send(message);
            return;
        }

        if (message.length === 1 && message[0] === 0xF8) {
            const count =
                this.midiClockSendCounts.get(output.id) ?? 0;

            this.midiClockSendCounts.set(
                output.id,
                count + 1
            );
        }

        output.send(message, timestamp);
    }

    getMidiClockSendSnapshot(outputName) {
        const output = this.findOutput(outputName);

        if (!output) {
            return {
                outputName,
                outputId: null,
                count: 0
            };
        }

        return {
            outputName: output.name,
            outputId: output.id,
            count:
                this.midiClockSendCounts.get(output.id) ?? 0
        };
    }

    setNotesOutput(outputName) {
        if (this.backend !== "NATIVE_MIDI") {
            return;
        }

        this.notesOutputName = outputName || null;
        this.syncOutputRouting();
    }

    setClockOutput(outputName) {
        if (this.backend !== "NATIVE_MIDI") {
            return;
        }

        this.clockOutputName = outputName || null;
        this.syncOutputRouting();
    }

    syncOutputRouting() {
        this.nativeBridge.send({
            type: "SET_OUTPUT_ROUTING",
            clockOutputName: this.clockOutputName,
            notesOutputName: this.notesOutputName
        });
    }

    clearOutput(outputName) {
        const output = this.findOutput(outputName);

        if (!output || typeof output.clear !== "function") {
            return;
        }

        try {
            output.clear();
        } catch (error) {
            console.warn(
                "Unable to clear pending MIDI output messages:",
                outputName,
                error
            );
        }
    }

    connectControllerInput(inputName, callback) {
        const input = this.findInput(inputName);

        if (!input) {
            return false;
        }

        if (this.backend === "NATIVE_MIDI") {
            const output = this.findOutput(inputName);

            if (!output) {
                return false;
            }

            this.controllerInput = input;
            this.controllerMessageListener = callback;
            this.controllerOutputName = output.name;
            this.nativeBridge.send({
                type: "OPEN_CONTROLLER",
                name: input.name
            });
            return true;
        }

        const listener = (event) => {
            callback(event.data);
        };

        input.addEventListener("midimessage", listener);

        this.controllerInput = input;
        this.controllerMessageListener = listener;

        return true;
    }

    disconnectControllerInput() {
        if (this.backend === "NATIVE_MIDI") {
            this.nativeBridge.send({
                type: "CLOSE_CONTROLLER"
            });
            this.controllerInput = null;
            this.controllerMessageListener = null;
            this.controllerOutputName = null;
            return;
        }

        if (
            this.controllerInput &&
            this.controllerMessageListener
        ) {
            this.controllerInput.removeEventListener(
                "midimessage",
                this.controllerMessageListener
            );
        }

        this.controllerInput = null;
        this.controllerMessageListener = null;
    }

    handleNativeStatus(message) {
        if (
            message.type === "INPUT_MESSAGE" &&
            message.role === "CONTROLLER" &&
            message.name === this.controllerInput?.name
        ) {
            this.controllerMessageListener?.(message.message);
            return;
        }

        if (message.type === "ERROR") {
            console.error("Native MIDI error:", message);
        }

        if (
            message.type === "INPUT_MESSAGE" &&
            message.role === "CLOCK" &&
            message.name === this.clockInput?.name &&
            this.clockMessageListener
        ) {
            this.clockMessageListener(message.message);
        }
    }

    connectClockInput(inputName, callback) {
        const input = this.findInput(inputName);

        if (!input) {
            return false;
        }

        if (this.backend === "NATIVE_MIDI") {
            this.clockInput = input;
            this.clockMessageListener = callback;
            this.nativeBridge.send({
                type: "OPEN_CLOCK_INPUT",
                name: input.name
            });
            return true;
        }

        const listener = (event) => {
            callback(event.data);
        };

        input.addEventListener("midimessage", listener);

        this.clockInput = input;
        this.clockMessageListener = listener;

        return true;
    }

    disconnectClockInput() {
        if (this.backend === "NATIVE_MIDI") {
            this.clockInput = null;
            this.clockMessageListener = null;
            this.nativeBridge.send({
                type: "CLOSE_CLOCK_INPUT"
            });
            return;
        }

        if (
            this.clockInput &&
            this.clockMessageListener
        ) {
            this.clockInput.removeEventListener(
                "midimessage",
                this.clockMessageListener
            );
        }

        this.clockInput = null;
        this.clockMessageListener = null;
    }
}
