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

        this.inputList = document.getElementById("midi-inputs");
        this.outputList = document.getElementById("midi-outputs");

    }

    async initialize() {

        this.midiAccess = await navigator.requestMIDIAccess();
    
        this.updateDeviceLists();

    }

    updateDeviceLists() {

        this.inputList.innerHTML = "";
        this.outputList.innerHTML = "";

        for (const input of this.midiAccess.inputs.values()) {

            const option = document.createElement("option");

            option.value = input.id;
            option.textContent = input.name;

            this.inputList.appendChild(option);

        }

        for (const output of this.midiAccess.outputs.values()) {

            const option = document.createElement("option");

            option.value = output.id;
            option.textContent = output.name;

            this.outputList.appendChild(option);

        }

    }

}