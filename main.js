/*
===============================================================================

LiRythme – Genesis

Linear Parallel Hybrid Rhythm Companion

LiRythme extends the creative capabilities of your drum machine.

It is not a drum machine.
It is not a DAW.

It is a rhythmic composition instrument designed to work alongside
the instruments you already love.

-------------------------------------------------------------------------------

Main Process

This file is the conductor of the application.

It creates the main window, starts Electron and coordinates the
application lifecycle.

-------------------------------------------------------------------------------

Created by:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

Project:
Genesis

===============================================================================
*/
const {
    app,
    BrowserWindow,
    ipcMain,
    utilityProcess
} = require("electron");
const path = require("node:path");
const nativeMidiTestArgument = process.argv.find(
    argument => argument.startsWith("--native-midi-test=")
);

let mainWindow;
let midiClockUtility;
let midiClockUtilityReady = false;
let midiClockCommandQueue = [];
let nextNativeMidiRequestId = 1;
const nativeMidiRequests = new Map();

function startMidiClockUtility() {
    midiClockUtility = utilityProcess.fork(
        path.join(
            __dirname,
            "src/hardware/midi/MidiClockUtility.cjs"
        ),
        [],
        {
            serviceName: "LiRythme MIDI Clock OUT",
            stdio: "pipe"
        }
    );

    midiClockUtility.stdout?.on(
        "data",
        data => process.stdout.write(data)
    );
    midiClockUtility.stderr?.on(
        "data",
        data => process.stderr.write(data)
    );

    midiClockUtility.on("spawn", () => {
        midiClockUtilityReady = true;

        for (const command of midiClockCommandQueue) {
            midiClockUtility.postMessage(command);
        }

        midiClockCommandQueue = [];
    });

    midiClockUtility.on("message", message => {
        if (message?.target === "NATIVE_MIDI") {
            if (message.type === "RESPONSE") {
                const request = nativeMidiRequests.get(
                    message.requestId
                );

                if (!request) {
                    return;
                }

                nativeMidiRequests.delete(message.requestId);

                if (message.error) {
                    request.reject(
                        new Error(message.error.message)
                    );
                } else {
                    request.resolve(message.result);
                }

                return;
            }

            if (
                mainWindow &&
                !mainWindow.isDestroyed() &&
                !mainWindow.webContents.isDestroyed()
            ) {
                mainWindow.webContents.send(
                    "native-midi-status",
                    message
                );
            }

            return;
        }

        if (
            !mainWindow ||
            mainWindow.isDestroyed() ||
            mainWindow.webContents.isDestroyed()
        ) {
            return;
        }

        mainWindow.webContents.send(
            "midi-clock-status",
            message
        );
    });

    midiClockUtility.on("exit", code => {
        midiClockUtility = null;
        midiClockUtilityReady = false;

        for (const request of nativeMidiRequests.values()) {
            request.reject(
                new Error("Native MIDI utility exited")
            );
        }

        nativeMidiRequests.clear();

        if (code !== 0) {
            console.error(
                "MIDI Clock utility exited with code:",
                code
            );
        }
    });
}

function sendMidiClockCommand(command) {
    if (!midiClockUtility || !midiClockUtilityReady) {
        midiClockCommandQueue.push(command);
        return;
    }

    midiClockUtility.postMessage(command);
}

function sendNativeMidiCommand(command) {
    sendMidiClockCommand({
        target: "NATIVE_MIDI",
        command
    });
}

function requestNativeMidi(command) {
    return new Promise((resolve, reject) => {
        const requestId = nextNativeMidiRequestId++;

        nativeMidiRequests.set(requestId, { resolve, reject });
        sendMidiClockCommand({
            target: "NATIVE_MIDI",
            requestId,
            command
        });
    });
}

function shutdownMidiClockUtility() {
    if (!midiClockUtility) {
        return Promise.resolve();
    }

    return new Promise(resolve => {
        const utility = midiClockUtility;
        const timeout = setTimeout(() => {
            utility.kill();
            resolve();
        }, 1000);

        utility.once("exit", () => {
            clearTimeout(timeout);
            resolve();
        });

        utility.postMessage({ type: "SHUTDOWN" });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,

        webPreferences: {
            backgroundThrottling: false,
            preload: path.join(__dirname, "preload.js"),
            additionalArguments: nativeMidiTestArgument
                ? [nativeMidiTestArgument]
                : []
        }
    });

    mainWindow.loadFile("index.html");
}

ipcMain.on("midi-clock-command", (event, command) => {
    if (event.sender !== mainWindow?.webContents) {
        return;
    }

    sendMidiClockCommand(command);
});

ipcMain.on("native-midi-command", (event, command) => {
    if (
        !nativeMidiTestArgument ||
        event.sender !== mainWindow?.webContents
    ) {
        return;
    }

    sendNativeMidiCommand(command);
});

ipcMain.handle("native-midi-request", (event, command) => {
    if (
        !nativeMidiTestArgument ||
        event.sender !== mainWindow?.webContents
    ) {
        throw new Error("Unauthorized native MIDI request");
    }

    return requestNativeMidi(command);
});

app.whenReady().then(() => {
    startMidiClockUtility();
    createWindow();
});

app.on("window-all-closed", async () => {
    await shutdownMidiClockUtility();
    app.quit();
});
