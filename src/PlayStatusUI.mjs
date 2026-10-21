// Read-only projection of existing engine state. No musical commands or timers.
const GATE_COLORS = ["#ffffff", "#ffe699", "#ffd966", "#ffff66",
    "#ccff99", "#99ff33", "#ff9999", "#ff4d4d"];
export function readPlayStatus(state, clock, midiManager) {
    state = state.editingState ?? state;
    const id = state.selectedInstrument;
    const voice = Number.isInteger(id) && id >= 0 && id < 16
        ? state.padConfiguration.voices[id] : null;
    const tx = state.atTransaction;
    const gateVoice = tx?.slot === 4 && tx.instruments.size === 1
        ? state.padConfiguration.voices[[...tx.instruments][0]] : voice;
    const selected = voice
        ? voice.name || `VOICE ${String(id + 1).padStart(2, "0")}`
        : `${state.systemName === "MODULATION" ? "Modulation" : "Motif"} ${String(state.currentMotifId + 1).padStart(2, "0")}`;
    const internal = clock.source === "INTERNAL";
    const external = clock.source === "MIDI";
    const inputName = midiManager.clockInput?.name;
    return {
        selected,
        gate: gateVoice?.type === "KEY GROUP" ? gateVoice.gate ?? 12.5 : null,
        state: state.transportState,
        // External pulses currently expose no measured tempo. Never reuse internal BPM.
        bpm: internal && Number.isFinite(clock.state.tempo) && clock.state.tempo > 0
            ? String(clock.state.tempo) : "XXX",
        source: internal ? "INTERNAL" : external
            ? `EXTERNAL${inputName ? ` — ${inputName}` : " — MIDI"}`
            : "Non disponible"
    };
}

export function initializePlayStatusUI({ state, clock, midiManager,
    renderMotif = () => {},
    renderFooter = () => {},
    document = globalThis.document, window = globalThis.window }) {
    const fields = Object.fromEntries(["selected", "state", "bpm", "source"]
        .map(key => [key, document.getElementById(`play-${key}`)]));
    let frame = null;
    let disposed = false;
    let gateColor;
    function render() {
        if (disposed) return;
        const status = readPlayStatus(state, clock, midiManager);
        const gate = document.getElementById("play-gate");
        if (gate) {
            gate.hidden = status.gate === null;
            const label = document.getElementById("play-gate-current");
            if (label) {
                const value = status.gate ?? 12.5;
                const text = `GATE ${String(value).replace(".", ",")} %`;
                if (label.textContent !== text) label.textContent = text;
                const color = GATE_COLORS[value / 12.5 - 1];
                if (gateColor !== color) {
                    label.style.color = color;
                    gateColor = color;
                }
            }
        }
        for (const [key, element] of Object.entries(fields)) {
            if (element.textContent !== status[key]) element.textContent = status[key];
        }
        renderMotif();
        renderFooter();
    }
    function observe() {
        render();
        if (!disposed) frame = window.requestAnimationFrame(observe);
    }
    function dispose() {
        disposed = true;
        window.cancelAnimationFrame(frame);
        window.removeEventListener("pagehide", dispose);
    }
    observe();
    window.addEventListener("pagehide", dispose);
    return { render, dispose };
}
