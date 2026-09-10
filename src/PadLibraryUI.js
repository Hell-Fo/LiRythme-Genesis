import { PadLibrarySession } from "./PadLibrarySession.mjs";

export function initializePadLibraryUI({ state, onActivated = () => {}, onBusyChanged = () => {} }) {
    const get = id => document.getElementById(id);
    const session = new PadLibrarySession(state, window.padConfigurationFiles);
    const select = get("pads-library");
    const controls = [select, ...["new", "duplicate", "import", "save", "refresh", "revert", "create"].map(id => get(`pads-${id}`))];
    let namingAction = "new";
    let signature = "";
    let busy = false;
    function refresh() {
        const active = session.active;
        const dirty = session.dirty;
        const available = session.entries.find(entry => entry.token === active?.token);
        const changed = active && available && available.text !== active.text;
        const label = `${state.padConfiguration.name.trim() || "(Sans nom)"}${dirty ? " *" : ""}`;
        const nextSignature = JSON.stringify([session.entries, active?.token, label, changed]);
        if (signature !== nextSignature) {
            signature = nextSignature;
            select.replaceChildren();
            const add = (value, text) => {
                const option = document.createElement("option");
                option.value = value; option.textContent = text; select.appendChild(option);
            };
            if (!active) add("", `${label} — secours en mémoire, non sauvegardé`);
            else if (!available) add(active.token, `${label} — fichier non disponible dans la liste`);
            for (const entry of session.entries) {
                const sameNames = session.entries.filter(other => other.name === entry.name).length > 1;
                const suffix = sameNames ? ` (${entry.file.split(/[\\/]/).at(-1)})` : "";
                add(entry.token, (entry.token === active?.token ? label : entry.name.trim() || "(Sans nom)") + suffix + (entry.token === active?.token && changed ? " — fichier modifié sur disque" : ""));
            }
        }
        select.value = active?.token || "";
        get("pads-file").textContent = active?.file || "Configuration de compatibilité en mémoire — bibliothèque indisponible.";
        get("pads-directory").textContent = session.directory || "Documents/LiRythme/Pad Configurations";
        get("pads-dirty").textContent = dirty ? "* Modifications non sauvegardées." : "";
        controls.forEach(control => { control.disabled = busy; });
        get("pads-save").hidden = !dirty;
    }
    async function operate(action, options) {
        if (busy) return;
        busy = true; refresh(); onBusyChanged();
        try {
            const result = await session.run(action, options);
            if (action !== "list" && !result.canceled) onActivated();
            let warning = result.warning;
            if (action !== "list") {
                try { warning = [warning, (await session.run("list")).warning].filter(Boolean).join("\n"); }
                catch (error) { warning = [warning, `Bibliothèque : ${error.message}`].filter(Boolean).join("\n"); }
            }
            get("pads-status").textContent = [result.canceled ? "Opération annulée." : action === "list" ? "Bibliothèque actualisée." : action === "save" ? "Configuration sauvegardée." : "Configuration active chargée.", warning].filter(Boolean).join("\n");
            if (!result.canceled) get("pads-naming").hidden = true;
        } catch (error) { get("pads-status").textContent = error.message; }
        finally { busy = false; refresh(); onBusyChanged(); }
    }
    select.addEventListener("change", () => {
        const token = select.value;
        // The select must represent the active preset even while loading or on failure.
        select.value = session.active?.token || "";
        return operate("select", { token });
    });
    for (const action of ["new", "duplicate"]) get(`pads-${action}`).addEventListener("click", () => {
        namingAction = action;
        get("pads-naming").hidden = false;
        get("pads-new-name").value = action === "duplicate" ? `${state.padConfiguration.name} COPY` : "";
        get("pads-new-name").focus();
    });
    get("pads-create").addEventListener("click", () => operate(namingAction, { name: get("pads-new-name").value }));
    get("pads-cancel").addEventListener("click", () => { get("pads-naming").hidden = true; });
    get("pads-import").addEventListener("click", () => operate("import"));
    get("pads-save").addEventListener("click", () => operate("save"));
    get("pads-refresh").addEventListener("click", () => operate("list"));
    async function confirmDiscard(reason) {
        if (busy) return false;
        busy = true; refresh(); onBusyChanged();
        try {
            const result = await window.padConfigurationFiles.confirmDiscard(reason);
            if (result.error) throw new Error(result.error);
            return result.confirmed === true;
        } catch (error) { get("pads-status").textContent = error.message; return false; }
        finally { busy = false; refresh(); onBusyChanged(); }
    }
    get("pads-revert").addEventListener("click", async () => {
        if (!session.active || busy) return;
        if (!["STOP", "PAUSE"].includes(state.transportState)) return operate("select", { token: session.active.token });
        if (!session.dirty || await confirmDiscard("reload")) return operate("select", { token: session.active.token, discard: true });
    });
    get("pads-edit").addEventListener("click", () => {
        get("voices-title").scrollIntoView({ block: "nearest" });
        get("voice-name").focus();
        get("pads-status").textContent = "Sélectionnez un pad pour éditer ses paramètres. SAVE conserve les modifications.";
    });
    let allowClose = false;
    window.addEventListener("beforeunload", async event => {
        if (!allowClose && (session.dirty || busy)) {
            event.preventDefault();
            event.returnValue = false;
            if (await confirmDiscard("close")) {
                allowClose = true;
                window.close();
            }
        }
    });
    return { ready: Promise.resolve().then(() => operate("restore")), refresh, get busy() { return busy; }, get hasActivePreset() { return session.active !== null; } };
}
