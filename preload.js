const { contextBridge, ipcRenderer } = require("electron");
const nativeMidiTestArgument = process.argv.find(
    argument => argument.startsWith("--native-midi-test=")
);

contextBridge.exposeInMainWorld(
    "liRythmeRuntime",
    {
        nativeMidiTestOutputName:
            nativeMidiTestArgument?.slice(
                "--native-midi-test=".length
            ) ?? null
    }
);

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

if (nativeMidiTestArgument) {
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
}
