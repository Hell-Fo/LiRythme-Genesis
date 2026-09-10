import { activateConfiguration, serializeConfiguration } from "./PadConfigurationFile.mjs";

// Renderer-side musical state; the filesystem service never owns the Motif.
export class PadLibrarySession {
    constructor(state, api) {
        this.state = state;
        this.api = api;
        this.active = null;
        this.entries = [];
        this.directory = "";
        this.busy = false;
    }
    get dirty() {
        if (!this.active) return false;
        try { return serializeConfiguration(this.state.padConfiguration) !== this.active.text; }
        catch { return true; }
    }
    async checked(promise) {
        const result = await promise;
        if (result.error) throw new Error(result.error);
        return result;
    }
    async run(action, { token, name, discard = false } = {}) {
        if (this.busy) throw new Error("Une opération de bibliothèque est déjà en cours.");
        this.busy = true;
        try {
            if (action === "list") {
                const result = await this.checked(this.api.list());
                this.entries = result.entries;
                this.directory = result.directory;
                return result;
            }
            if (action !== "save" && !["STOP", "PAUSE"].includes(this.state.transportState)) throw new Error("Changement de configuration refusé pendant PLAY. Passez en STOP ou PAUSE.");
            if (this.dirty && !discard && !["save", "duplicate"].includes(action)) throw new Error("Configuration modifiée (*) : utilisez SAVE, DUPLICATE ou Recharger la version sauvegardée avant de changer de preset.");
            let result;
            switch (action) {
                case "restore": result = await this.checked(this.api.restore()); break;
                case "select": result = await this.checked(this.api.select(token)); break;
                case "new": result = await this.checked(this.api.create(name)); break;
                case "duplicate": result = await this.checked(this.api.duplicate(serializeConfiguration(this.state.padConfiguration), name)); break;
                case "import": result = await this.checked(this.api.import()); break;
                case "save":
                    if (!this.active) throw new Error("Aucun preset sauvegardé actif. Utilisez DUPLICATE pour créer un fichier.");
                    result = await this.checked(this.api.save(serializeConfiguration(this.state.padConfiguration), this.active.token, this.active.text));
                    break;
                default: throw new Error("Opération inconnue.");
            }
            if (result.canceled) return result;
            // Recheck transport after asynchronous reads/dialogs/writes, then assign once.
            if (action !== "save") activateConfiguration(this.state, result.text);
            this.active = result;
            try {
                const remembered = await this.checked(this.api.activated(result.token));
                result.warning = [result.warning, remembered.warning].filter(Boolean).join("\n");
            } catch (error) {
                result.warning = [result.warning, `Préférence non sauvegardée : ${error.message}`].filter(Boolean).join("\n");
            }
            return result;
        } finally { this.busy = false; }
    }
}
