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

        this.inputSelector = document.getElementById("midi-inputs");
        this.outputSelector = document.getElementById("midi-outputs");
    }

    async initialize() {
        this.midiAccess = await navigator.requestMIDIAccess();

        this.updateDeviceLists();
    }

    updateDeviceLists() {
        this.inputSelector.innerHTML = "";
        this.outputSelector.innerHTML = "";
        this.outputs.clear();

        for (const input of this.midiAccess.inputs.values()) {
            const option = document.createElement("option");

            option.value = input.id;
            option.textContent = input.name;

            this.inputSelector.appendChild(option);
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

    send(outputName, message) {
        const output = this.findOutput(outputName);

        if (!output) {
            console.error("MIDI output not found:", outputName);
            return;
        }

        output.send(message);
    }

    listenToInput(inputName, callback) {
        for (const input of this.midiAccess.inputs.values()) {
            if (input.name === inputName) {
                input.onmidimessage = (event) => {
                    callback(event.data);
                };

                return;
            }
        }

        console.error("MIDI input not found:", inputName);
    }
}