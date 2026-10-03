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
const { readWav } = require("./src/AudioSampleFiles.cjs");
ipcMain.handle("audio-sample", async (event, request) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("Unauthorized audio request");
    try {
        if (request?.action === "pick") {
            const result = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: [{ name: "Audio WAV", extensions: ["wav"] }] });
            if (result.canceled || !result.filePaths.length) return { canceled: true };
            await readWav(result.filePaths[0]);
            return { path: result.filePaths[0] };
        }
        if (request?.action === "read") return { bytes: await readWav(request.path) };
        throw new Error("Opération audio inconnue.");
    } catch (error) { return { error: error.message }; }
});
// Chromium otherwise places debug.log beside the Windows executable.
app.setAppLogsPath();
// Musical playback may be started from hardware without a browser mouse gesture.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("log-file", path.join(app.getPath("userData"), "electron.log"));
const { PadConfigurationPreferences } = require("./src/PadConfigurationPreferences.cjs");
const { PadConfigurationLibrary } = require("./src/PadConfigurationLibrary.cjs");
let padPreferences;
let padLibrary;
let padPreferencesWarning;
let padFileBusy = false;

ipcMain.handle("pad-configuration-file", async (event, request) => {
    if (event.sender !== mainWindow?.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame) {
        throw new Error("Unauthorized Pad Configuration request");
    }
    if (padFileBusy) return { error: "Une opération de bibliothèque est déjà en cours." };
    padFileBusy = true;
    try {
        switch (request?.action) {
            case "confirmDiscard": {
                if (!["close", "reload"].includes(request.reason)) throw new Error("Confirmation inconnue.");
                const result = await dialog.showMessageBox(mainWindow, {
                    type: "question", buttons: ["Annuler", "Abandonner les modifications"], defaultId: 0, cancelId: 0,
                    message: request.reason === "close" ? "Quitter sans sauvegarder les modifications de la Pad Configuration ?" : "Abandonner les modifications non sauvegardées et recharger le fichier ?"
                });
                return { confirmed: result.response === 1 };
            }
            case "restore": {
                const result = await padLibrary.restore();
                result.warning = [result.warning, padPreferencesWarning].filter(Boolean).join("\n");
                return result;
            }
            case "list": return await padLibrary.list();
            case "select": return await padLibrary.select(request.token);
            case "activated": return await padLibrary.activated(request.token);
            case "new": return await padLibrary.newConfiguration(request.name);
            case "duplicate":
                if (typeof request.name !== "string") throw new Error("Le nom est obligatoire.");
                return await padLibrary.create(request.text, request.name);
            case "save": return await padLibrary.save(request.token, request.text, request.expectedText);
            case "import": {
                const result = await dialog.showOpenDialog(mainWindow, {
                    filters: [{ name: "LiRythme Pad Configuration", extensions: ["lirythme-pads.json"] }],
                    properties: ["openFile"], defaultPath: await padPreferences.dialogDirectory()
                });
                if (result.canceled || !result.filePaths.length) return { canceled: true };
                const warning = await padPreferences.update({ lastDirectory: path.dirname(result.filePaths[0]) });
                return { ...await padLibrary.importFile(result.filePaths[0]), warning };
            }
            default: throw new Error("Opération de bibliothèque inconnue.");
        }
    } catch (error) { return { error: error.message }; }
    finally { padFileBusy = false; }
});

let mainWindow;
let motifBankStorage;
let motifBankReady = false;
let motifBankClosing = false;
let motifBankCloseAllowed = false;
ipcMain.handle("motif-bank", async (event, request) => {
    if (event.sender !== mainWindow?.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("Unauthorized Motif Bank request");
    if (request?.action === "load") return motifBankStorage.load();
    if (request?.action === "save") return motifBankStorage.save(request.bank);
    throw new Error("Unknown Motif Bank operation");
});
ipcMain.on("motif-bank-ready", event => {
    if (event.sender === mainWindow?.webContents) motifBankReady = true;
});
ipcMain.on("motif-bank-flushed", (event, ok) => {
    if (event.sender !== mainWindow?.webContents || !motifBankClosing) return;
    motifBankClosing = false;
    if (ok === true) { motifBankCloseAllowed = true; mainWindow.close(); }
    else console.error("Motif Bank save failed: close cancelled to preserve edits");
});
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
    mainWindow.on("close", event => {
        if (motifBankCloseAllowed) { motifBankCloseAllowed = false; return; }
        if (!motifBankReady) return;
        event.preventDefault();
        if (!motifBankClosing) {
            motifBankClosing = true;
            mainWindow.webContents.send("motif-bank-flush");
        }
    });
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

app.whenReady().then(async () => {
    const { MotifBankStorage } = await import("./src/MotifBankStorage.mjs");
    motifBankStorage = new MotifBankStorage(path.join(app.getPath("userData"), "motif-bank.json"));
    padPreferences = new PadConfigurationPreferences(app.getPath("userData"), app.getPath("documents"));
    padPreferencesWarning = await padPreferences.load();
    padLibrary = new PadConfigurationLibrary(path.join(app.getPath("documents"), "LiRythme", "Pad Configurations"), padPreferences, path.join(__dirname, "docs/examples/DrumBrute Impact.lirythme-pads.json"));
    startMidiClockUtility();
    createWindow();
});

app.on("window-all-closed", async () => {
    await shutdownMidiClockUtility();
    app.quit();
});
