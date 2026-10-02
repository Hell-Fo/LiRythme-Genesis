import { AT_SLOTS, hasTargetEvents } from "./ATTransaction.mjs";

export function readATPanel(state) {
    const tx = state.atTransaction;
    if (!tx) return null;
    const definition = AT_SLOTS[tx.slot];
    const valueIndex = hasTargetEvents(state.getMotif(tx.editingMotifId ?? state.currentMotifId), tx) ? tx.valueIndex : null;
    const instruments = [...tx.instruments].sort((a, b) => a - b).map(id =>
        state.padConfiguration.voices[id]?.name || `VOICE ${String(id + 1).padStart(2, "0")}`).join("+");
    const steps = [...tx.steps].sort((a, b) => a - b).map(id => String(id + 1).padStart(2, "0")).join("·");
    return { name: definition.id, target: instruments
        ? instruments + (steps ? ` · ${steps}` : "") : steps ? `STEPS ${steps}` : "MOTIF",
        motif: (tx.editingMotifId ?? state.currentMotifId) + 1,
        values: definition.id === "ROTATION" ? ["<<  −1 STEP", ">>  +1 STEP"]
            : definition.id === "COLOR" ? [valueIndex === null ? "—" : valueIndex === 0 ? "ON" : "OFF"] : definition.values,
        selected: definition.id === "COLOR" ? (valueIndex === null ? null : 0) : valueIndex };
}

export function initializePlayATUI({ state, document = globalThis.document }) {
    const field = id => document.getElementById(id);
    const panel = field("play-at"), title = field("play-selection-title"), normal = field("play-selected");
    let previous;
    function render() {
        const status = readATPanel(state);
        const signature = JSON.stringify(status);
        // Do not mutate the aria-live region on every animation frame.
        if (signature === previous) return;
        previous = signature;
        panel.hidden = !status;
        normal.hidden = Boolean(status);
        title.textContent = status?.name ?? "SELECTION";
        if (!status) return;
        field("play-at-target").textContent = status.target;
        field("play-at-motif").textContent = `MOTIF ${String(status.motif).padStart(2, "0")}`;
        for (let index = 0; index < 8; index++) {
            const value = status.values[index];
            const row = field(`play-at-value-${index}`);
            row.hidden = value === undefined;
            row.textContent = value === undefined ? "" : status.name === "ROTATION" ? value : `${String.fromCharCode(65 + index)}   ${value}`;
            row.classList.toggle("at-selected", status.selected === index);
            row.setAttribute("aria-current", status.selected === index ? "true" : "false");
        }
    }
    render();
    return { render };
}
