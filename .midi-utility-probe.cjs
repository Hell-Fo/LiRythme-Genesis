const { app, utilityProcess } = require("electron");
const path = require("node:path");

let child = null;
let finished = false;

function finish(exitCode) {
    if (finished) {
        return;
    }

    finished = true;
    process.exitCode = exitCode;
    app.quit();
}

app.whenReady().then(() => {
    child = utilityProcess.fork(
        path.join(__dirname, ".midi-utility-probe-child.cjs"),
        [],
        {
            serviceName: "LiRythme MIDI Utility Probe",
            stdio: "pipe"
        }
    );

    child.stdout?.on("data", data => {
        process.stdout.write(data);
    });

    child.stderr?.on("data", data => {
        process.stderr.write(data);
    });

    child.on("message", message => {
        process.stdout.write(
            `MIDI_UTILITY_PROBE_RESULT: ${JSON.stringify(message)}\n`
        );

        if (message.type === "PROBE_RESULT") {
            child.postMessage({ type: "SHUTDOWN" });
        }
    });

    child.on("exit", code => {
        process.stdout.write(
            `MIDI_UTILITY_PROBE_EXIT: ${code}\n`
        );
        finish(code === 0 ? 0 : 1);
    });

    setTimeout(() => {
        process.stderr.write("MIDI_UTILITY_PROBE_TIMEOUT\n");
        child.kill();
        finish(1);
    }, 15000);
});
