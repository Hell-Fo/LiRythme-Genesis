const fs = require("node:fs/promises");
const path = require("node:path");
const { readConfiguration, writeConfiguration } = require("./PadConfigurationStorage.cjs");

class PadConfigurationPreferences {
    constructor(directory, defaultDirectory) {
        this.file = path.join(directory, "pad-configuration-preferences.json");
        this.defaultDirectory = defaultDirectory;
        this.values = {};
    }
    async load() {
        try {
            const values = JSON.parse(await readConfiguration(this.file));
            if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Préférences invalides");
            for (const key of ["lastDirectory", "lastActiveFile"]) {
                if (typeof values[key] === "string" && path.isAbsolute(values[key])) this.values[key] = values[key];
            }
        } catch (error) {
            if (error.code !== "ENOENT") return "Préférences Pad Configuration illisibles ; valeurs par défaut utilisées.";
        }
    }
    async update(values) {
        Object.assign(this.values, values);
        try {
            await fs.mkdir(path.dirname(this.file), { recursive: true });
            await writeConfiguration(this.file, JSON.stringify(this.values, null, 2) + "\n");
        } catch (error) {
            return `Préférence non sauvegardée : ${error.message}`;
        }
    }
    async dialogDirectory() {
        try {
            if (this.values.lastDirectory && (await fs.stat(this.values.lastDirectory)).isDirectory()) return this.values.lastDirectory;
        } catch { /* Missing/inaccessible directory: use Documents. */ }
        return this.defaultDirectory;
    }
    async restore() {
        if (!this.values.lastActiveFile) return { empty: true };
        try {
            const text = await readConfiguration(this.values.lastActiveFile);
            const { parseConfiguration } = await import("./PadConfigurationFile.mjs");
            parseConfiguration(text);
            return { text, file: this.values.lastActiveFile };
        } catch (error) {
            return { warning: `Dernière Pad Configuration indisponible ou invalide ; configuration de compatibilité conservée.\n${this.values.lastActiveFile}\n${error.message}` };
        }
    }
}
module.exports = { PadConfigurationPreferences };
