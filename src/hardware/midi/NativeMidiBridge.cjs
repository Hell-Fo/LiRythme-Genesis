const midi = require("@julusian/midi");

class NativeMidiBridge {
    constructor(postMessage) {
        this.postMessage = postMessage;
        this.controllerInput = null;
        this.controllerInputName = null;
        this.controllerOutput = null;
        this.controllerOutputName = null;
        this.notesOutput = null;
        this.notesOutputName = null;
        this.sharedClockOutputName = null;
    }

    listPorts() {
        const input = new midi.Input();
        const output = new midi.Output();

        try {
            return {
                inputs: this.getPorts(input),
                outputs: this.getPorts(output)
            };
        } finally {
            input.closePort();
            output.closePort();
        }
    }

    getPorts(port) {
        const ports = [];

        for (let index = 0; index < port.getPortCount(); index++) {
            ports.push({
                id: index,
                name: port.getPortName(index)
            });
        }

        return ports;
    }

    findPortIndex(port, name) {
        for (let index = 0; index < port.getPortCount(); index++) {
            if (port.getPortName(index) === name) {
                return index;
            }
        }

        return -1;
    }

    openController(name) {
        if (name === this.sharedClockOutputName) {
            throw new Error(
                `Native MIDI output is owned by the Clock worker: ${name}`
            );
        }

        if (
            name === this.controllerInputName &&
            name === this.controllerOutputName &&
            this.controllerInput &&
            this.controllerOutput
        ) {
            return;
        }

        this.closeController();

        if (!name) {
            return;
        }

        const input = new midi.Input();
        const output = new midi.Output();
        const inputIndex = this.findPortIndex(input, name);
        const outputIndex = this.findPortIndex(output, name);

        if (inputIndex < 0 || outputIndex < 0) {
            input.closePort();
            output.closePort();
            throw new Error(
                `Native MIDI controller ports not found: ${name}`
            );
        }

        try {
            input.ignoreTypes(false, false, false);
            input.on("message", (_deltaTime, message) => {
                this.postMessage({
                    target: "NATIVE_MIDI",
                    type: "INPUT_MESSAGE",
                    role: "CONTROLLER",
                    name,
                    message
                });
            });
            input.openPort(inputIndex);
            output.openPort(outputIndex);
        } catch (error) {
            input.closePort();
            output.closePort();
            throw error;
        }

        this.controllerInput = input;
        this.controllerInputName = name;
        this.controllerOutput = output;
        this.controllerOutputName = name;
    }

    closeController() {
        this.controllerInput?.closePort();
        this.controllerOutput?.closePort();
        this.controllerInput = null;
        this.controllerInputName = null;
        this.controllerOutput = null;
        this.controllerOutputName = null;
    }

    sendController(name, message) {
        if (name !== this.controllerOutputName) {
            this.openController(name);
        }

        this.controllerOutput.sendMessage(message);
    }

    sendNotes(name, message) {
        this.openNotesOutput(name);
        this.notesOutput.sendMessage(message);
    }

    openNotesOutput(name) {
        if (name === this.sharedClockOutputName) {
            throw new Error(
                `Native MIDI output is owned by the Clock worker: ${name}`
            );
        }

        if (name === this.notesOutputName && this.notesOutput) {
            return;
        }

        this.closeNotesOutput();

        if (!name) {
            return;
        }

        const output = new midi.Output();
        const outputIndex = this.findPortIndex(output, name);

        if (outputIndex < 0) {
            output.closePort();
            throw new Error(
                `Native MIDI notes output not found: ${name}`
            );
        }

        try {
            output.openPort(outputIndex);
        } catch (error) {
            output.closePort();
            throw error;
        }

        this.notesOutput = output;
        this.notesOutputName = name;
    }

    selectSharedNotesOutput(name) {
        this.closeNotesOutput();
        this.sharedClockOutputName = name || null;
    }

    closeNotesOutput() {
        this.notesOutput?.closePort();
        this.notesOutput = null;
        this.notesOutputName = null;
    }

    close() {
        this.closeController();
        this.closeNotesOutput();
    }

    handleCommand(command) {
        switch (command?.type) {
            case "LIST_PORTS":
                this.sharedClockOutputName =
                    command.sharedClockOutputName || null;
                return this.listPorts();

            case "OPEN_CONTROLLER":
                this.openController(command.name);
                return { opened: true, name: command.name };

            case "CLOSE_CONTROLLER":
                this.closeController();
                return { closed: true };

            case "OPEN_NOTES_OUTPUT":
                this.openNotesOutput(command.name);
                return { opened: true, name: command.name };

            case "SEND_CONTROLLER":
                this.sendController(command.name, command.message);
                return null;

            case "SEND_NOTES":
                this.sendNotes(command.name, command.message);
                return null;

            default:
                throw new Error(
                    `Unknown native MIDI command: ${command?.type}`
                );
        }
    }
}

module.exports = { NativeMidiBridge };
