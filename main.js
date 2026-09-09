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
    dialog,
    utilityProcess
} = require("electron");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { readConfiguration, writeConfiguration } = require("./src/PadConfigurationStorage.cjs");
const padFiles = new Map();
let padFileBusy = false;

// Only native-dialog-selected paths can be read or overwritten by this API.
ipcMain.handle("pad-configuration-file", async (event, request) => {
    if (event.sender !== mainWindow?.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame) {
        throw new Error("Unauthorized Pad Configuration request");
    }
    if (padFileBusy) return { error: "Une opération de fichier est déjà en cours." };
    padFileBusy = true;
    try {
        const { parseConfiguration, serializeConfiguration, EXTENSION } = await import("./src/PadConfigurationFile.mjs");
        const filters = [{ name: "LiRythme Pad Configuration", extensions: ["lirythme-pads.json"] }];
        if (request?.action === "load") {
            const result = await dialog.showOpenDialog(mainWindow, { filters, properties: ["openFile"] });
            if (result.canceled || !result.filePaths.length) return { canceled: true };
            const file = result.filePaths[0];
            const text = await readConfiguration(file);
            parseConfiguration(text);
            const token = randomUUID();
            padFiles.set(token, file);
            return { text, file, token };
        }
        if (!["save", "saveAs"].includes(request?.action)) throw new Error("Opération de fichier inconnue.");
        const config = parseConfiguration(request.text);
        const text = serializeConfiguration(config);
        let file = request.action === "save" ? padFiles.get(request.token) : undefined;
        if (!file) {
            const safeName = config.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "") || "Pad Configuration";
            const result = await dialog.showSaveDialog(mainWindow, {
                filters,
                defaultPath: path.join(app.getPath("documents"), safeName + EXTENSION)
            });
            if (result.canceled || !result.filePath) return { canceled: true };
            file = result.filePath;
            if (!file.toLowerCase().endsWith(EXTENSION)) {
                file += EXTENSION;
                // The native dialog confirmed the original path, not this adjusted one.
                try {
                    await require("node:fs/promises").access(file);
                    const confirmation = await dialog.showMessageBox(mainWindow, {
                        type: "question", buttons: ["Annuler", "Remplacer"], defaultId: 0, cancelId: 0,
                        message: `Remplacer le fichier existant ?\n${file}`
                    });
                    if (confirmation.response !== 1) return { canceled: true };
                } catch (error) { if (error.code !== "ENOENT") throw error; }
            }
        }
        await writeConfiguration(file, text);
        const token = request.action === "save" && padFiles.get(request.token) === file ? request.token : randomUUID();
        padFiles.set(token, file);
        return { file, token };
    } catch (error) {
        return { error: error.message };
    } finally { padFileBusy = false; }
});

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
            preload: path.join(__dirname, "preload.js")
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
    if (event.sender !== mainWindow?.webContents) {
        return;
    }

    sendNativeMidiCommand(command);
});

ipcMain.handle("native-midi-request", (event, command) => {
    if (event.sender !== mainWindow?.webContents) {
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
