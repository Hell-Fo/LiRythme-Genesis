// Read-only occurrence projection. A detached cursor denotes the gap left by
// deleting PLAYING; it must never highlight the preceding occurrence.
export function readPlayChain(state, system) {
    state = system ? (state.forSystem?.(system) ?? state) : (state.editingState ?? state);
    const chain = state.chain ?? [];
    const enabled = state.chainEnabled && chain.length > 0;
    const stopped = state.transportState === "STOP";
    const playing = enabled && !stopped && !state.chainPlayingDetached
        ? state.chainPlayingIndex : -1;
    const next = enabled ? (stopped ? 0 : state.getChainNextIndex()) : -1;
    return chain.map((id, index) => ({
        label: state.getMotif?.(id)?.grooveMorph ? "[GM]" : `[${String(id + 1).padStart(2, "0")}]`,
        playing: index === playing,
        selected: enabled && stopped && !state.chainPlayingDetached && index === state.chainPlayingIndex,
        moving: enabled && state.transportState === "PLAY" && index === state.chainMoveIndex,
        loopMaster: enabled && index === state.chainLoopMasterIndex,
        next: index === next
    }));
}

export function initializePlayChainUI({ state, actions, system, document = globalThis.document }) {
    const container = document.getElementById(system === "MODULATION" ? "play-modulation-chain-occurrences" : "play-chain-occurrences");
    let previous = "";
    let previousEntry = null;
    function render() {
        const occurrences = readPlayChain(state, system);
        const layer = system ? (state.forSystem?.(system) ?? state) : (state.editingState ?? state);
        const entry = layer.chainOccurrenceRevision ?? 0;
        const running = layer.transportState === "PLAY";
        const flash = running && entry !== previousEntry;
        const modulation = (system ?? state.currentTimeline) === "MODULATION";
        const signature = JSON.stringify([modulation, occurrences, entry, running]);
        if (signature === previous) return;
        previous = signature;
        previousEntry = entry;
        container.classList?.toggle("is-modulation", modulation);
        const title = document.getElementById(system === "MODULATION" ? "modulation-chain-title" : "motif-chain-title");
        if (title) title.textContent = modulation ? "CHAIN MODULATION" : "CHAIN";
        container.replaceChildren(...occurrences.map(occurrence => {
            const element = document.createElement("span");
            element.className = `chain-occurrence${occurrence.playing || occurrence.selected ? " is-playing" : ""}${occurrence.moving ? " is-moving" : ""}${occurrence.loopMaster ? " is-loop-master" : ""}${flash && occurrence.playing ? " is-entry" : ""}`;
            element.textContent = occurrence.label;
            return element;
        }));
    }
    if (actions) actions.onChainChange = render;
    render();
    return { render };
}
