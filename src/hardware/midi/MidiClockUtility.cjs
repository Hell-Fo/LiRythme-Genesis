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
    message => process.parentPort.postMessage(message)
);

const clockWorker = new Worker(
    path.join(__dirname, "MidiClockWorker.cjs")
);

clockWorker.on("message", message => {
    process.parentPort.postMessage(message);

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

            if (command.command?.type === "SEND_SHARED_MIDI") {
                clockWorker.postMessage({
                    type: "SEND_MIDI",
                    message: command.command.message
                });
                result = null;
            } else if (
                command.command?.type ===
                    "SELECT_SHARED_NOTES_OUTPUT"
            ) {
                nativeMidiBridge.selectSharedNotesOutput(
                    command.command.name
                );
                result = {
                    selected: true,
                    name: command.command.name
                };
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

    clockWorker.postMessage(command);
});
