// Read-only projection of the selected bank entry.
export function readPlayMotif(state) {
    const rows = state.motif;
    const available = Array.isArray(rows) && rows.length === 16 &&
        rows.every(row => Array.isArray(row) && row.length === 32);
    const id = state.selectedInstrument;
    const validTarget = id === null || (Number.isInteger(id) && id >= 0 && id < rows?.length);
    return {
        title: available ? `MOTIF ${String(state.currentMotifId + 1).padStart(2, "0")}` : "MOTIF —",
        duration: available ? `${state.getMotifDuration()} STEPS` : "Non disponible",
        step: available && validTarget
            ? String(id === null ? state.getMotifDuration() : state.getVoiceLength(id))
            : "Non disponible",
        mode: "Non disponible"
    };
}

export function initializePlayMotifUI({ state, document = globalThis.document }) {
    const fields = Object.fromEntries(["title", "duration", "step", "mode"]
        .map(key => [key, document.getElementById(`play-motif-${key}`)]));
    function render() {
        const status = readPlayMotif(state);
        for (const [key, element] of Object.entries(fields)) {
            if (element.textContent !== status[key]) element.textContent = status[key];
        }
    }
    render();
    return { render };
}
