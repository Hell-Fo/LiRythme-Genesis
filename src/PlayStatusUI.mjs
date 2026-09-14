// Read-only projection of existing engine state. No musical commands or timers.
export function readPlayStatus(state, clock, midiManager) {
    const id = state.selectedInstrument;
    const voice = Number.isInteger(id) && id >= 0 && id < 16
        ? state.padConfiguration.voices[id] : null;
    const selected = voice
        ? voice.name || `VOICE ${String(id + 1).padStart(2, "0")}`
        : "Motif 01";
    const internal = clock.source === "INTERNAL";
    const external = clock.source === "MIDI";
    const inputName = midiManager.clockInput?.name;
    return {
        selected,
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
    function render() {
        if (disposed) return;
        const status = readPlayStatus(state, clock, midiManager);
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
