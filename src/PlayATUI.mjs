import { AT_SLOTS } from "./ATTransaction.mjs";

export function readATPanel(state) {
    const tx = state.atTransaction;
    if (!tx) return null;
    const definition = AT_SLOTS[tx.slot];
    const instruments = [...tx.instruments].sort((a, b) => a - b).map(id =>
        state.padConfiguration.voices[id]?.name || `VOICE ${String(id + 1).padStart(2, "0")}`).join("+");
    const steps = [...tx.steps].sort((a, b) => a - b).map(id => String(id + 1).padStart(2, "0")).join("·");
    return { name: definition.id, target: instruments
        ? instruments + (steps ? ` · ${steps}` : "") : steps ? `STEPS ${steps}` : "MOTIF",
        motif: state.currentMotifId + 1,
        values: definition.values, selected: tx.valueIndex };
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
        status.values.forEach((value, index) => {
            const row = field(`play-at-value-${index}`);
            row.textContent = `${String.fromCharCode(65 + index)}   ${value}`;
            row.classList.toggle("at-selected", status.selected === index);
            row.setAttribute("aria-current", status.selected === index ? "true" : "false");
        });
    }
    render();
    return { render };
}
