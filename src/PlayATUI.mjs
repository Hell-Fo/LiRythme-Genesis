import { AT_SLOTS, hasTargetEvents, SCALES, keyGroupFeedback, readPlayMode } from "./ATTransaction.mjs";
import { MUTATION_METHODS } from "./Mutation.mjs";
import { GROOVE_METHODS } from "./GrooveMorph.mjs";

export function readATPanel(state) {
    if (state.projectMode && state.projectBook) return {
        name: "PROJETS", target: state.projectBook.slots[state.projectBook.active].name,
        motif: state.projectBook.active + 1, system: "PROJET",
        values: ["Root : " + ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][state.keyGroup.root % 12] + " · MIDI " + state.keyGroup.root, "Scale : " + state.keyGroup.scale], selected: null
    };
    const tx = state.atTransaction;
    if (!tx) return null;
    state = state.forSystem?.(tx.system ?? "MOTIF") ?? state;
    if (tx.kind === "GROOVE_MORPH") return {
        name: "GROOVE MORPH", target: "MOTIF", motif: tx.editingMotifId + 1,
        values: GROOVE_METHODS, selected: tx.valueIndex
    };
    if (tx.kind === "MUTATION") return {
        name: "MUTATION", target: "MOTIF", motif: tx.editingMotifId + 1,
        values: MUTATION_METHODS, selected: tx.valueIndex
    };
    if (tx.kind === "EUCLIDEAN") {
        const motif = state.getMotif(tx.editingMotifId), voice = [...tx.instruments][0];
        const settings = motif.euclidean?.[voice];
        return { name: "EUCLIDIEN", motif: tx.editingMotifId + 1,
            target: voice === undefined ? "CHOISIR UN INSTRUMENT" :
                `${state.padConfiguration.voices[voice]?.name || 'VOICE ' + (voice + 1)} · ${settings?.hits ?? 0}/${settings?.resolution ?? 32} · MOTIF ${state.getMotifDuration(tx.editingMotifId)} STEPS`,
            values: ["Polymétrique", motif.motifLength === null
                ? "Polyrythmique · B + Step : choisir la durée"
                : "Polyrythmique · B + Step : modifier la durée"],
            selected: voice === undefined ? null : settings?.mode === "POLYRHYTHMIC" ? 1 : 0 };
    }
    const definition = AT_SLOTS[tx.slot];
    const modes = definition.id === "PLAY_MODE" ? new Set((tx.instruments.size ? [...tx.instruments] : Array.from({ length: 16 }, (_, i) => i))
        .map(voice => readPlayMode(state.getMotif(tx.editingMotifId), voice))) : null;
    const valueIndex = modes ? modes.size === 1 ? definition.values.indexOf([...modes][0]) : null : definition.id === "CYCLE" ? tx.valueIndex : hasTargetEvents(state.getMotif(tx.editingMotifId ?? state.currentMotifId), tx) ? tx.valueIndex : null;
    const instruments = [...tx.instruments].sort((a, b) => a - b).map(id =>
        state.padConfiguration.voices[id]?.name || `VOICE ${String(id + 1).padStart(2, "0")}`).join("+");
    const steps = [...tx.steps].sort((a, b) => a - b).map(id => String(id + 1).padStart(2, "0")).join("·");
    const key = tx.slot === 4 ? keyGroupFeedback(state, tx, false) : null;
    return { name: definition.id === "KEY_GROUP" ? "KEY GROUP" : definition.id === "PLAY_MODE" ? "PLAY MODE" : definition.id, target: key ? `${instruments || "VOICES KEY GROUP"}${steps ? ` · ${steps}` : ""}` : instruments
        ? instruments + (steps ? ` · ${steps}` : "") : steps ? `STEPS ${steps}` : "MOTIF",
        motif: (tx.editingMotifId ?? state.currentMotifId) + 1,
        ...(tx.system === "MODULATION" ? { system: "MODULATION" } : {}),
        values: key ? definition.values.map(degree => degree >= key.count ? undefined : tx.system === "MODULATION"
            ? `+${degree} degré${degree === 1 ? "" : "s"}` : `Degré ${degree + 1} · +${SCALES[state.keyGroup.scale][degree]}`) : definition.id === "PLAY_MODE" ? ["Forward", "Ping-pong", "Backward"] : definition.id === "ROTATION" ? ["<<  −1 STEP", ">>  +1 STEP"]
            : definition.id === "COLOR" ? [valueIndex === null ? "—" : valueIndex === 0 ? "ON" : "OFF"] : definition.id === "SWING" ? definition.values.map(value => `${value} %`) : definition.id === "FLAM" ? definition.values.map(value => `${value} ms`) : definition.id === "CYCLE" ? definition.values.map(value => `1 / ${value}`) : definition.id === "RATCHET" ? definition.values.map(value => `${value}×`) : definition.values,
        selected: definition.id === "COLOR" ? (valueIndex === null ? null : 0) : valueIndex };
}

export function initializePlayATUI({ state, document = globalThis.document }) {
    const field = id => document.getElementById(id);
    const panel = field("play-at"), title = field("play-selection-title"), normal = field("play-selected");
    let previous;
    function render() {
        const description = field("play-project-description");
        const book = (state.rootState ?? state).projectBook;
        const text = book?.slots[book.active]?.description ?? "";
        if (description) {
            if (description.textContent !== text) description.textContent = text;
            description.hidden = !state.projectMode || !text.trim();
        }
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
        field("play-at-octave").hidden = status.name !== "KEY GROUP";
        field("play-at-motif").textContent = `${status.system ?? "MOTIF"} ${String(status.motif).padStart(2, "0")}`;
        for (let index = 0; index < 8; index++) {
            const value = status.values[index];
            const row = field(`play-at-value-${index}`);
            row.hidden = value === undefined;
            row.textContent = value === undefined ? "" : ["ROTATION", "PROJETS"].includes(status.name) ? value : `${String.fromCharCode(65 + index)}   ${value}`;
            row.classList.toggle("at-selected", status.selected === index);
            row.setAttribute("aria-current", status.selected === index ? "true" : "false");
        }
    }
    render();
    return { render };
}
