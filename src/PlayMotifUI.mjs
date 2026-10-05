// Read-only projection of the selected bank entry.
export function readPlayMotif(state, system) {
    state = system ? (state.forSystem?.(system) ?? state) : (state.editingState ?? state);
    const rows = state.motif;
    const available = Array.isArray(rows) && rows.length === 16 &&
        rows.every(row => Array.isArray(row) && row.length === 32);
    const id = state.selectedInstrument;
    const validTarget = id === null || (Number.isInteger(id) && id >= 0 && id < rows?.length);
    return {
        title: available ? `${state.systemName === "MODULATION" ? "MODULATION" : "MOTIF"} ${String(state.currentMotifId + 1).padStart(2, "0")}` : "MOTIF —",
        duration: available ? `${state.getMotifDuration()} STEPS` : "Non disponible",
        step: available && validTarget
            ? String(id === null ? state.getMotifDuration() : state.getVoiceLength(id))
            : "Non disponible",
        mode: "Non disponible"
    };
}

export function initializePlayMotifUI({ state, system = "MOTIF", document = globalThis.document }) {
    const prefix = system === "MODULATION" ? "play-modulation" : "play-motif";
    const fields = Object.fromEntries(["title", "duration", "step", "mode"]
        .map(key => [key, document.getElementById(`${prefix}-${key}`)]));
    const activity = system === "MODULATION" ? document.getElementById("play-modulation-active") : null;
    function render() {
        const status = readPlayMotif(state, system);
        for (const [key, element] of Object.entries(fields)) {
            if (element.textContent !== status[key]) element.textContent = status[key];
        }
        if (activity) {
            const active = Boolean(state.modulationActive);
            const requested = Boolean(state.modulationRequested);
            const label = `${active ? "ON" : "OFF"}${active !== requested ? ` → ${requested ? "ON" : "OFF"} (en attente)` : ""}`;
            if (activity.textContent !== label) activity.textContent = label;
            activity.classList?.toggle("is-active", active);
        }
    }
    render();
    return { render };
}
