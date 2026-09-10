const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("padConfigurationFiles", {
    confirmDiscard: reason => ipcRenderer.invoke("pad-configuration-file", { action: "confirmDiscard", reason }),
    restore: () => ipcRenderer.invoke("pad-configuration-file", { action: "restore" }),
    list: () => ipcRenderer.invoke("pad-configuration-file", { action: "list" }),
    select: token => ipcRenderer.invoke("pad-configuration-file", { action: "select", token }),
    activated: token => ipcRenderer.invoke("pad-configuration-file", { action: "activated", token }),
    create: name => ipcRenderer.invoke("pad-configuration-file", { action: "new", name }),
    duplicate: (text, name) => ipcRenderer.invoke("pad-configuration-file", { action: "duplicate", text, name }),
    import: () => ipcRenderer.invoke("pad-configuration-file", { action: "import" }),
    save: (text, token, expectedText) => ipcRenderer.invoke("pad-configuration-file", { action: "save", text, token, expectedText })
});

contextBridge.exposeInMainWorld(
    "midiClockOutputNative",
    {
        sendCommand(command) {
            ipcRenderer.send(
                "midi-clock-command",
                command
            );
        },

        onStatus(callback) {
            const listener = (_event, message) => {
                callback(message);
            };

            ipcRenderer.on("midi-clock-status", listener);

            return () => {
                ipcRenderer.removeListener(
                    "midi-clock-status",
                    listener
                );
            };
        }
    }
);

contextBridge.exposeInMainWorld(
    "nativeMidi",
    {
        request(command) {
            return ipcRenderer.invoke(
                "native-midi-request",
                command
            );
        },

        send(command) {
            ipcRenderer.send(
                "native-midi-command",
                command
            );
        },

        onStatus(callback) {
            const listener = (_event, message) => {
                callback(message);
            };

            ipcRenderer.on("native-midi-status", listener);

            return () => {
                ipcRenderer.removeListener(
                    "native-midi-status",
                    listener
                );
            };
        }
    }
);
