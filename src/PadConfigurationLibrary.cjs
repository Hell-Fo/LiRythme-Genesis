const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { readConfiguration, writeConfiguration } = require("./PadConfigurationStorage.cjs");

class PadConfigurationLibrary {
    constructor(directory, preferences, compatibilityFile) {
        this.directory = directory;
        this.preferences = preferences;
        this.compatibilityFile = compatibilityFile;
        this.files = new Map();
    }
    async codec() { return import("./PadConfigurationFile.mjs"); }
    tokenFor(file) {
        for (const [token, existing] of this.files) if (existing === file) return token;
        const token = randomUUID();
        this.files.set(token, file);
        return token;
    }
    async readFile(file) {
        if (path.dirname(file) !== this.directory || !(await fs.lstat(file)).isFile()) throw new Error("Fichier de bibliothèque inaccessible ou non régulier.");
        const { parseConfiguration, serializeConfiguration } = await this.codec();
        const text = serializeConfiguration(parseConfiguration(await readConfiguration(file)));
        return { token: this.tokenFor(file), file, text, name: parseConfiguration(text).name };
    }
    async select(token) {
        const file = this.files.get(token);
        if (!file) throw new Error("Configuration inconnue. Actualisez la bibliothèque.");
        return this.readFile(file);
    }
    async list() {
        await fs.mkdir(this.directory, { recursive: true });
        const { EXTENSION } = await this.codec();
        const entries = [], warnings = [];
        for (const item of await fs.readdir(this.directory, { withFileTypes: true })) {
            if (!item.name.toLowerCase().endsWith(EXTENSION)) continue;
            try { entries.push(await this.readFile(path.join(this.directory, item.name))); }
            catch (error) { warnings.push(`${item.name} : ${error.message}`); }
        }
        entries.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
        return { entries, warning: warnings.join("\n"), directory: this.directory };
    }
    async create(text, name) {
        const { parseConfiguration, serializeConfiguration, EXTENSION } = await this.codec();
        const config = parseConfiguration(text);
        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim() || name.trim().length > 120) throw new Error("Le nom doit contenir de 1 à 120 caractères.");
            config.name = name.trim();
        }
        const canonical = serializeConfiguration(config);
        const stem = Array.from(config.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")).slice(0, 64).join("").replace(/[. ]+$/, "") || "Configuration";
        await fs.mkdir(this.directory, { recursive: true });
        // Unique names + exclusive publication: never replace an existing preset.
        const file = path.join(this.directory, `${stem}-${randomUUID()}${EXTENSION}`);
        await writeConfiguration(file, canonical, { exclusive: true });
        return this.readFile(file);
    }
    async newConfiguration(name) {
        if (typeof name !== "string") throw new Error("Le nom est obligatoire.");
        const { serializeConfiguration } = await this.codec();
        return this.create(serializeConfiguration({ name: "New", voices: Array.from({ length: 16 }, (_, id) => ({ id, name: "", type: "NONE" })) }), name);
    }
    async importFile(file) {
        const { parseConfiguration } = await this.codec();
        const text = await readConfiguration(file);
        parseConfiguration(text);
        // IMPORT preserves every Phase B name, including empty or long strings.
        return this.create(text);
    }
    async save(token, text, expectedText) {
        const previous = await this.select(token);
        if (previous.text !== expectedText) throw new Error("Le fichier a changé sur disque. Sauvegarde refusée pour protéger les changements externes ; utilisez DUPLICATE ou rechargez la configuration.");
        const { parseConfiguration, serializeConfiguration } = await this.codec();
        await writeConfiguration(previous.file, serializeConfiguration(parseConfiguration(text)));
        return this.select(token);
    }
    async activated(token) {
        const file = this.files.get(token);
        if (!file) throw new Error("Configuration inconnue.");
        return { warning: await this.preferences.update({ lastActiveFile: file }) };
    }
    async restore() {
        await fs.mkdir(this.directory, { recursive: true });
        const previous = this.preferences.values.lastActiveFile;
        let warning;
        if (previous) {
            try {
                return path.dirname(previous) === this.directory ? await this.readFile(previous) : await this.importFile(previous);
            } catch (error) { warning = `Dernière configuration indisponible : ${error.message}\nConfiguration de compatibilité utilisée.`; }
        }
        const fallback = path.join(this.directory, "DrumBrute Impact.lirythme-pads.json");
        try { return { ...await this.readFile(fallback), warning }; }
        catch (error) {
            const text = await readConfiguration(this.compatibilityFile);
            const { parseConfiguration, serializeConfiguration } = await this.codec();
            const config = parseConfiguration(text);
            try {
                await writeConfiguration(fallback, serializeConfiguration(config), { exclusive: true });
                return { ...await this.readFile(fallback), warning };
            } catch (writeError) {
                if (writeError.code !== "EEXIST") throw writeError;
                // Keep a corrupt existing file available for the user to repair.
                return { ...await this.create(text), warning: [warning, `Fichier de base inutilisable : ${error.message}`].filter(Boolean).join("\n") };
            }
        }
    }
}
module.exports = { PadConfigurationLibrary };
