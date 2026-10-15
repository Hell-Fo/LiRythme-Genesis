// Read-only indicators: performance activation belongs to state; gesture stages
// belong to the controller. No commands or additional animation loop.
export function readPlayFooter(state, controller) {
    const project = (state.rootState ?? state).projectBook;
    state = state.editingState ?? state;
    return {
        zone1: `${state.systemName === "MODULATION" ? "MODULATION" : "MOTIF"} ${String(state.currentMotifId + 1).padStart(2, "0")}`,
        project: project?.slots[project.active]?.name ?? "Non disponible",
        states: [state.soloActive && "SOLO", state.muteActive && "MUTE",
            controller.copyStage && "COPY", controller.deleteArmed && "DELETE",
            (state.modulationRequested || state.modulationActive) &&
                `MODULATION ${state.modulationActive ? "ON" : "OFF"}${state.modulationRequested !== state.modulationActive ? ` → ${state.modulationRequested ? "ON" : "OFF"}` : ""}`]
            .filter(Boolean).join("  "),
        resolution: `${state.getMotifDuration()} STEPS · 1/${state.stepDivision}`
    };
}

export function initializePlayFooterUI({ state, controller, document = globalThis.document }) {
    const fields = Object.fromEntries(["zone1", "project", "states", "resolution"]
        .map(key => [key, document.getElementById(`play-footer-${key}`)]));
    function render() {
        const status = readPlayFooter(state, controller);
        for (const [key, element] of Object.entries(fields)) {
            if (element.textContent !== status[key]) element.textContent = status[key];
        }
    }
    render();
    return { render };
}
