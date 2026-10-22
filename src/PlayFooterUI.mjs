// Read-only indicators: performance activation belongs to state; gesture stages
// belong to the controller. No commands or additional animation loop.
export function readPlayFooter(state, controller, { page = "PLAY" } = {}) {
    const project = (state.rootState ?? state).projectBook;
    state = state.editingState ?? state;
    return {
        zone1: `${state.systemName === "MODULATION" ? "MODULATION" : "MOTIF"} ${String(state.currentMotifId + 1).padStart(2, "0")}`,
        project: project?.slots[project.active]?.name ?? "Non disponible",
        states: [state.soloActive && "SOLO", state.muteActive && "MUTE",
            state.freezeMode && "FREEZE", state.lockMode && "LOCK",
            controller.copyStage && "COPY", controller.deleteArmed && "DELETE"]
            .filter(Boolean).join("  "),
        book: page === "SETTINGS" ? "Settings"
            : state.currentView === "MOTIF_LIBRARY"
                ? state.systemName === "MODULATION" ? "Modulation" : "Motif"
                : (state.atTransaction?.system ?? state.systemName) === "MODULATION" ? "A/T Modulation" : "A/T Motifs"
    };
}

export function initializePlayFooterUI({ state, controller, document = globalThis.document }) {
    const fields = Object.fromEntries(["zone1", "project", "states", "book"]
        .map(key => [key, document.getElementById(`play-footer-${key}`)]));
    function render() {
        const settings = document.getElementById("settings-page");
        const status = readPlayFooter(state, controller, { page: settings?.hidden === false ? "SETTINGS" : "PLAY" });
        for (const [key, element] of Object.entries(fields)) {
            if (element.textContent !== status[key]) element.textContent = status[key];
        }
    }
    render();
    return { render };
}
