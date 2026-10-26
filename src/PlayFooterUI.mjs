import { SCALES, defaultKeyGroup } from "./KeyGroup.mjs";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function readPlayKeyGroup(state) {
    const settings = (state.editingState ?? state).keyGroup ?? defaultKeyGroup();
    const root = settings.root % 12;
    const notes = new Set((SCALES[settings.scale] ?? []).map(interval => (root + interval) % 12));
    return { root: NOTE_NAMES[root], midi: settings.root, scale: settings.scale,
        keys: NOTE_NAMES.map((name, pitch) => ({ name, active: notes.has(pitch), root: pitch === root })) };
}

// Read-only indicators: performance activation belongs to state; gesture stages
// belong to the controller. No commands or additional animation loop.
export function readPlayFooter(state, controller, { page = "PLAY" } = {}) {
    const project = (state.rootState ?? state).projectBook;
    state = state.editingState ?? state;
    return {
        zone1: `${state.systemName === "MODULATION" ? "MODULATION" : "MOTIF"} ${String(state.currentMotifId + 1).padStart(2, "0")}`,
        project: project?.slots[project.active]?.name ?? "Non disponible",
        description: project?.slots[project.active]?.description ?? "",
        states: [state.soloActive && "SOLO", state.muteActive && "MUTE",
            state.freezeMode && "FREEZE", state.lockMode && "LOCK",
            controller.copyStage && "COPY", controller.deleteArmed && "DELETE",
            state.atTransaction?.kind === "MUTATION" && "MUTATION",
            state.atTransaction?.kind === "GROOVE_MORPH" && "GROOVE MORPH",
            state.atTransaction?.kind === "EUCLIDEAN" && "EUCLIDIEN"]
            .filter(Boolean).join("  "),
        book: page === "SETTINGS" ? "Settings"
            : state.currentView === "MOTIF_LIBRARY"
                ? state.systemName === "MODULATION" ? "Modulation" : "Motif"
                : (state.atTransaction?.system ?? state.systemName) === "MODULATION" ? "A/T Modulation" : "A/T Motifs"
    };
}

export function initializePlayFooterUI({ state, controller, document = globalThis.document }) {
    const fields = Object.fromEntries(["zone1", "project", "description", "states", "book"]
        .map(key => [key, document.getElementById(`play-footer-${key}`)]));
    const root = document.getElementById("play-key-root");
    const scale = document.getElementById("play-key-scale");
    const keyboard = document.getElementById("play-keyboard");
    const keys = [];
    if (keyboard) {
        keyboard.replaceChildren();
        let white = 0;
        for (const name of NOTE_NAMES) {
            const key = document.createElement("span");
            const black = name.includes("#");
            key.className = `play-piano-key ${black ? "is-black" : "is-white"}`;
            key.style.left = `${(black ? white - .31 : white) * 100 / 7}%`;
            key.textContent = name;
            key.setAttribute("aria-hidden", "true");
            keyboard.appendChild(key);
            keys.push(key);
            if (!black) white++;
        }
    }
    let keySignature;
    function render() {
        const settings = document.getElementById("settings-page");
        const status = readPlayFooter(state, controller, { page: settings?.hidden === false ? "SETTINGS" : "PLAY" });
        for (const [key, element] of Object.entries(fields)) {
            if (element && element.textContent !== status[key]) element.textContent = status[key];
        }
        if (fields.description) fields.description.hidden = !status.description.trim();
        if (keyboard) {
            const group = readPlayKeyGroup(state);
            const signature = `${group.midi}:${group.scale}`;
            if (signature !== keySignature) {
                keySignature = signature;
                root.textContent = `${group.root} · MIDI ${group.midi}`;
                scale.textContent = group.scale;
                keyboard.setAttribute("aria-label", `Clavier C–B · Root note ${group.root} · Scale ${group.scale} · Notes : ${group.keys.filter(key => key.active).map(key => key.name).join(", ")}`);
                group.keys.forEach((note, index) => {
                    keys[index].classList.toggle("is-in-scale", note.active);
                    keys[index].classList.toggle("is-root", note.root && note.active);
                });
            }
        }
    }
    render();
    return { render };
}
