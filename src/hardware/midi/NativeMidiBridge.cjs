const midi = require("@julusian/midi");

class NativeMidiBridge {
    constructor(postMessage) {
        this.postMessage = postMessage;
        this.controllerInput = null;
        this.controllerInputName = null;
        this.controllerOutput = null;
        this.controllerOutputName = null;
        this.clockInput = null;
        this.clockInputName = null;
        this.notesOutput = null;
        this.notesOutputName = null;
        this.workerOutputName = null;
        this.additionalNotesOutputs = new Map();
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
        if (name === this.workerOutputName) {
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

    openClockInput(name) {
        if (
            name === this.clockInputName &&
            this.clockInput
        ) {
            return;
        }

        this.closeClockInput();

        if (!name) {
            return;
        }

        const input = new midi.Input();
        const inputIndex = this.findPortIndex(input, name);

        if (inputIndex < 0) {
            input.closePort();
            throw new Error(
                `Native MIDI Clock input not found: ${name}`
            );
        }

        try {
            input.ignoreTypes(false, false, false);
            input.on("message", (_deltaTime, message) => {
                this.postMessage({
                    target: "NATIVE_MIDI",
                    type: "INPUT_MESSAGE",
                    role: "CLOCK",
                    name,
                    message
                });
            });
            input.openPort(inputIndex);
        } catch (error) {
            input.closePort();
            throw error;
        }

        this.clockInput = input;
        this.clockInputName = name;
    }

    closeClockInput() {
        this.clockInput?.closePort();
        this.clockInput = null;
        this.clockInputName = null;
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

    sendAdditionalNotes(name, message) {
        if (name === this.workerOutputName) throw new Error("MIDI port owned by Clock worker");
        if (name === this.controllerOutputName && this.controllerOutput) {
            this.controllerOutput.sendMessage(message);
            return;
        }
        let output = this.additionalNotesOutputs.get(name);
        if (!output) {
            output = new midi.Output();
            try {
                const index = this.findPortIndex(output, name);
                if (index < 0) throw new Error(`Native MIDI output not found: ${name}`);
                output.openPort(index);
            } catch (error) { output.closePort(); throw error; }
            this.additionalNotesOutputs.set(name, output);
        }
        output.sendMessage(message);
    }

    closeAdditionalNotesOutput(name) {
        this.additionalNotesOutputs.get(name)?.closePort();
        this.additionalNotesOutputs.delete(name);
    }

    openNotesOutput(name) {
        if (name === this.workerOutputName) {
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

        if (this.additionalNotesOutputs.has(name)) {
            this.notesOutput = this.additionalNotesOutputs.get(name);
            this.notesOutputName = name;
            this.additionalNotesOutputs.delete(name);
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

    setWorkerOutputName(name) {
        this.workerOutputName = name || null;
    }

    closeNotesOutput() {
        this.notesOutput?.closePort();
        this.notesOutput = null;
        this.notesOutputName = null;
    }

    close() {
        for (const name of this.additionalNotesOutputs.keys()) this.closeAdditionalNotesOutput(name);
        this.closeController();
        this.closeClockInput();
        this.closeNotesOutput();
    }

    handleCommand(command) {
        switch (command?.type) {
            case "LIST_PORTS":
                return this.listPorts();

            case "OPEN_CONTROLLER":
                this.openController(command.name);
                return { opened: true, name: command.name };

            case "CLOSE_CONTROLLER":
                this.closeController();
                return { closed: true };

            case "OPEN_CLOCK_INPUT":
                this.openClockInput(command.name);
                return { opened: true, name: command.name };

            case "CLOSE_CLOCK_INPUT":
                this.closeClockInput();
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
