/*
===============================================================================

LiRythme – Genesis

Launchpad Mini Mk1

Responsible for Launchpad Mini Mk1 communication and LED control.

Author:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

===============================================================================
*/

import { LaunchpadMapping } from "./LaunchpadMapping.js";

export class LaunchpadMini {
    constructor(midiManager) {
        this.midiManager = midiManager;
        this.deviceName = "Launchpad Mini";
        this.mapping = LaunchpadMapping;
    }

    setLed(note, value) {
        this.midiManager.send(
            this.deviceName,
            [0x90, note, value]
        );
    }

    setTopLed(controller, value) {
        this.midiManager.send(
            this.deviceName,
            [0xB0, controller, value]
        );
    }

    getControlType(status, number) {
        if (status === 0xB0) {
            if (this.mapping.TOP_BUTTONS.includes(number)) {
                return "TOP_BUTTON";
            }
        }

        if (status === 0x90) {
            if (this.mapping.MOTIF.includes(number)) {
                return "MOTIF";
            }

            if (this.mapping.INSTRUMENTS.includes(number)) {
                return "INSTRUMENT";
            }

            if (this.mapping.BOOKS.includes(number)) {
                return "BOOK";
            }

            if (this.mapping.VALUE.includes(number)) {
                return "VALUE";
            }
        }

        return "UNKNOWN";
    }

    getControlPosition(controlType, number) {
        let controls;

        if (controlType === "MOTIF") {
            controls = this.mapping.MOTIF;
        } else if (controlType === "INSTRUMENT") {
            controls = this.mapping.INSTRUMENTS;
        } else if (controlType === "BOOK") {
            controls = this.mapping.BOOKS;
        } else if (controlType === "VALUE") {
            controls = this.mapping.VALUE;
        } else if (controlType === "TOP_BUTTON") {
            controls = this.mapping.TOP_BUTTONS;
        } else {
            return null;
        }

        return controls.indexOf(number);
    }

    handleMidiMessage(data) {
        const [status, number, value] = data;

        if (status === 0x90) {
            this.setLed(
                number,
                value > 0 ? 127 : 0
            );

            return;
        }

        if (status === 0xB0) {
            this.setTopLed(
                number,
                value > 0 ? 127 : 0
            );
        }
    }
}