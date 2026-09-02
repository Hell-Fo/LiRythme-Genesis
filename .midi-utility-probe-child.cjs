const { parentPort } = process;

let output = null;

function serializeError(error) {
    return {
        name: error?.name ?? null,
        message: error?.message ?? String(error),
        code: error?.code ?? null,
        stack: error?.stack ?? null
    };
}

function closeOutput() {
    if (!output) {
        return false;
    }

    output.closePort();
    output = null;
    return true;
}

async function runProbe() {
    const result = {
        type: "PROBE_RESULT",
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
        architecture: process.arch,
        moduleLoaded: false,
        outputs: [],
        drumBruteMatches: [],
        opened: false,
        testMessage: null,
        closed: false,
        error: null
    };

    try {
        const midi = require("@julusian/midi");
        result.moduleLoaded = true;

        output = new midi.Output();

        for (let index = 0; index < output.getPortCount(); index++) {
            const name = output.getPortName(index);

            result.outputs.push({ index, name });

            if (name.toLowerCase().includes("drumbrute")) {
                result.drumBruteMatches.push({ index, name });
            }
        }

        if (result.drumBruteMatches.length === 0) {
            throw new Error("No native DrumBrute MIDI output found");
        }

        const destination = result.drumBruteMatches[0];

        output.openPort(destination.index);
        result.opened = true;
        result.openedPort = destination;

        output.sendMessage([0xFE]);
        result.testMessage = {
            bytes: [0xFE],
            description: "MIDI Active Sensing"
        };

        result.closed = closeOutput();
    } catch (error) {
        result.error = serializeError(error);

        try {
            result.closed = closeOutput();
        } catch (closeError) {
            result.closeError = serializeError(closeError);
        }
    }

    parentPort.postMessage(result);
}

parentPort.on("message", event => {
    if (event.data?.type !== "SHUTDOWN") {
        return;
    }

    try {
        closeOutput();
        parentPort.postMessage({ type: "SHUTDOWN_ACK" });
        process.exit(0);
    } catch (error) {
        parentPort.postMessage({
            type: "SHUTDOWN_ERROR",
            error: serializeError(error)
        });
        process.exit(1);
    }
});

runProbe();
