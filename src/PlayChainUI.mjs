// Read-only occurrence projection. A detached cursor denotes the gap left by
// deleting PLAYING; it must never highlight the preceding occurrence.
export function readPlayChain(state) {
    const chain = state.chain ?? [];
    const enabled = state.chainEnabled && chain.length > 0;
    const stopped = state.transportState === "STOP";
    const playing = enabled && !stopped && !state.chainPlayingDetached
        ? state.chainPlayingIndex : -1;
    const next = enabled ? (stopped ? 0 : (state.chainPlayingIndex + 1) % chain.length) : -1;
    return chain.map((id, index) => ({
        label: `[${String(id + 1).padStart(2, "0")}]`,
        playing: index === playing,
        next: index === next
    }));
}

export function initializePlayChainUI({ state, actions, document = globalThis.document }) {
    const container = document.getElementById("play-chain-occurrences");
    let previous = "";
    function render() {
        const occurrences = readPlayChain(state);
        const signature = JSON.stringify(occurrences);
        if (signature === previous) return;
        previous = signature;
        container.replaceChildren(...occurrences.map(occurrence => {
            const element = document.createElement("span");
            element.className = `chain-occurrence${occurrence.playing ? " is-playing" : ""}`;
            element.textContent = occurrence.label;
            return element;
        }));
    }
    actions.onChainChange = render;
    render();
    return { render };
}
