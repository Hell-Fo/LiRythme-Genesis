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
        this.controllerInput = null;
        this.controllerMessageListener = null;

        this.controllerSelector =
            document.getElementById("midi-controller");

        this.outputSelector =
            document.getElementById("midi-output");
    }

    async initialize() {
        this.midiAccess = await navigator.requestMIDIAccess();

        this.updateDeviceLists();
    }

    updateDeviceLists() {
        this.controllerSelector.innerHTML = "";
        this.outputSelector.innerHTML = "";
        this.outputs.clear();

        for (const input of this.midiAccess.inputs.values()) {
            const option = document.createElement("option");

            option.value = input.id;
            option.textContent = input.name;

            this.controllerSelector.appendChild(option);
        }

        for (const output of this.midiAccess.outputs.values()) {
            const option = document.createElement("option");

            option.value = output.id;
            option.textContent = output.name;

            this.outputs.set(output.name, output);

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

    send(outputName, message) {
        const output = this.findOutput(outputName);

        if (!output) {
            console.error("MIDI output not found:", outputName);
            return;
        }

        output.send(message);
    }

    connectControllerInput(inputName, callback) {
        const input = this.findInput(inputName);

        if (!input) {
            return false;
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
}
