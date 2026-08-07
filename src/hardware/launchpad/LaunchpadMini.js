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

export class LaunchpadMini {
    constructor(midiManager) {
        this.midiManager = midiManager;
        this.deviceName = "Launchpad Mini";
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