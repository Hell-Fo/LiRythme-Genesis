const { Worker } = require("node:worker_threads");
const path = require("node:path");
const { NativeMidiBridge } = require("./NativeMidiBridge.cjs");

function serializeError(error) {
    return {
        name: error?.name ?? null,
        message: error?.message ?? String(error),
        code: error?.code ?? null,
        stack: error?.stack ?? null
    };
}

const nativeMidiBridge = new NativeMidiBridge(
    handleNativeMidiMessage
);

const clockWorker = new Worker(
    path.join(__dirname, "MidiClockWorker.cjs")
);

let clockDestinationName = null;
let notesDestinationName = null;
let workerDestinationName = null;
let pendingWorkerDestinationName = null;
let workerDestinationChangePending = false;
const pendingNotesMessages = [];
const MAX_PENDING_NOTES_MESSAGES = 256;

function handleNativeMidiMessage(message) {
    process.parentPort.postMessage(message);

    if (
        message.type !== "INPUT_MESSAGE" ||
        message.role !== "CLOCK" ||
        message.name === clockDestinationName
    ) {
        return;
    }

    const status = message.message?.[0];

    if (
        status !== 0xF8 &&
        status !== 0xFA &&
        status !== 0xFB &&
        status !== 0xFC
    ) {
        return;
    }

    clockWorker.postMessage({
        type: "MIDI_REALTIME_THRU",
        status
    });
}

function getDesiredWorkerDestination() {
    return clockDestinationName || notesDestinationName || null;
}

function getDesiredBridgeNotesDestination() {
    const workerDestination = getDesiredWorkerDestination();

    return notesDestinationName !== workerDestination
        ? notesDestinationName
        : null;
}

function syncClockOutputPermission() {
    clockWorker.postMessage({
        type: "SET_CLOCK_OUTPUT_SELECTED",
        selected: Boolean(clockDestinationName)
    });
}

function routeNotesMessage(name, message) {
    if (name === workerDestinationName) {
        clockWorker.postMessage({
            type: "SEND_MIDI",
            message
        });
        return true;
    }

    if (name === nativeMidiBridge.notesOutputName) {
        nativeMidiBridge.sendNotes(name, message);
        return true;
    }

    return false;
}

function flushPendingNotesMessages() {
    const pending = pendingNotesMessages.splice(0);

    for (const entry of pending) {
        if (
            entry.name === notesDestinationName &&
            !routeNotesMessage(entry.name, entry.message)
        ) {
            pendingNotesMessages.push(entry);
        }
    }
}

function reconcileOutputRouting() {
    syncClockOutputPermission();

    if (workerDestinationChangePending) {
        return;
    }

    const desiredWorkerDestination =
        getDesiredWorkerDestination();
    const desiredBridgeNotesDestination =
        getDesiredBridgeNotesDestination();

    if (
        nativeMidiBridge.notesOutputName &&
        nativeMidiBridge.notesOutputName !==
            desiredBridgeNotesDestination
    ) {
        nativeMidiBridge.closeNotesOutput();
    }

    if (workerDestinationName !== desiredWorkerDestination) {
        if (
            nativeMidiBridge.notesOutputName ===
            desiredWorkerDestination
        ) {
            nativeMidiBridge.closeNotesOutput();
        }

        workerDestinationChangePending = true;
        pendingWorkerDestinationName =
            desiredWorkerDestination;
        clockWorker.postMessage({
            type: "SET_DESTINATION",
            name: desiredWorkerDestination
        });
        return;
    }

    nativeMidiBridge.setWorkerOutputName(
        desiredWorkerDestination
    );

    if (
        desiredBridgeNotesDestination &&
        nativeMidiBridge.notesOutputName !==
            desiredBridgeNotesDestination
    ) {
        nativeMidiBridge.openNotesOutput(
            desiredBridgeNotesDestination
        );
    }

    flushPendingNotesMessages();
}

function handleWorkerDestination(message) {
    workerDestinationName = message.opened
        ? message.name
        : null;
    nativeMidiBridge.setWorkerOutputName(
        workerDestinationName
    );

    if (
        workerDestinationChangePending &&
        workerDestinationName ===
            pendingWorkerDestinationName
    ) {
        workerDestinationChangePending = false;
        pendingWorkerDestinationName = null;
    }

    reconcileOutputRouting();
}

clockWorker.on("message", message => {
    process.parentPort.postMessage(message);

    if (message.type === "DESTINATION") {
        try {
            handleWorkerDestination(message);
        } catch (error) {
            process.parentPort.postMessage({
                target: "NATIVE_MIDI",
                type: "ERROR",
                operation: "SET_OUTPUT_ROUTING",
                error: serializeError(error)
            });
        }
    }

    if (
        message.type === "ERROR" &&
        workerDestinationChangePending &&
        (
            message.operation === "SET_DESTINATION" ||
            message.operation === "OPEN_DESTINATION"
        )
    ) {
        workerDestinationChangePending = false;
        pendingWorkerDestinationName = null;
        workerDestinationName = null;
        nativeMidiBridge.setWorkerOutputName(null);
    }

    if (message.type === "SHUTDOWN_ACK") {
        process.exit(0);
    }
});

clockWorker.on("error", error => {
    process.parentPort.postMessage({
        type: "ERROR",
        operation: "CLOCK_WORKER",
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        }
    });
    process.exit(1);
});

clockWorker.on("exit", code => {
    if (code !== 0) {
        process.parentPort.postMessage({
            type: "ERROR",
            operation: "CLOCK_WORKER_EXIT",
            error: {
                message: `MIDI Clock worker exited with code ${code}`
            }
        });
        process.exit(1);
    }
});

process.parentPort.on("message", event => {
    const command = event.data;

    if (command?.target === "NATIVE_MIDI") {
        try {
            let result;

            if (command.command?.type === "SET_OUTPUT_ROUTING") {
                clockDestinationName =
                    command.command.clockOutputName || null;
                notesDestinationName =
                    command.command.notesOutputName || null;
                reconcileOutputRouting();
                result = {
                    clockOutputName: clockDestinationName,
                    notesOutputName: notesDestinationName
                };
            } else if (command.command?.type === "SEND_NOTES") {
                if (
                    !routeNotesMessage(
                        command.command.name,
                        command.command.message
                    )
                ) {
                    if (
                        pendingNotesMessages.length >=
                        MAX_PENDING_NOTES_MESSAGES
                    ) {
                        pendingNotesMessages.shift();
                    }

                    pendingNotesMessages.push({
                        name: command.command.name,
                        message: command.command.message
                    });
                }
                result = null;
            } else {
                result = nativeMidiBridge.handleCommand(
                    command.command
                );
            }

            if (command.requestId !== undefined) {
                process.parentPort.postMessage({
                    target: "NATIVE_MIDI",
                    type: "RESPONSE",
                    requestId: command.requestId,
                    result
                });
            }
        } catch (error) {
            process.parentPort.postMessage({
                target: "NATIVE_MIDI",
                type: command.requestId === undefined
                    ? "ERROR"
                    : "RESPONSE",
                requestId: command.requestId,
                operation: command.command?.type ?? "UNKNOWN",
                error: serializeError(error)
            });
        }

        return;
    }

    if (command?.type === "SHUTDOWN") {
        nativeMidiBridge.close();
    }

    if (command?.type === "SET_DESTINATION") {
        clockWorker.postMessage({
            type: "SET_CLOCK_OUTPUT_SELECTED",
            selected: Boolean(command.name)
        });
    }

    clockWorker.postMessage(command);
});
