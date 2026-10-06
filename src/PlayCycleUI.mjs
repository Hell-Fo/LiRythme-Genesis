// Pure projections of the engaged playback geometry, never of a future edit.
export function readPlayCycle(root, system = "MOTIF") {
    const state = root.forSystem(system);
    const running = state.transportState !== "STOP";
    const motifId = running ? state.playingMotifId : state.currentMotifId;
    const cycle = running ? state.liveLengthCycle : null;
    const length = cycle?.duration ?? state.getMotifDuration(motifId);
    const position = ((state.playheadPosition % length) + length) % length;
    const id = state.selectedInstrument;
    const selected = Number.isInteger(id) && id >= 0 && id < 16;
    const voiceLength = selected ? cycle?.lengths[id] ?? state.getVoiceLength(id, motifId) : null;
    const voicePosition = selected ? running ? state.getVoiceStep(id) : position % voiceLength : null;
    return {
        length, position, motifId,
        viewingOther: motifId !== state.currentMotifId,
        voice: selected ? {
            length: voiceLength, position: voicePosition,
            name: state.padConfiguration.voices[id].name || `VOICE ${String(id + 1).padStart(2, "0")}`
        } : null
    };
}

export function cyclePoint(position, length, radius) {
    const angle = (position / length) * Math.PI * 2 - Math.PI / 2;
    return [120 + Math.cos(angle) * radius, 120 + Math.sin(angle) * radius];
}

// Dense polygons become rings; geometry stays bounded even for large LCMs.
export function cycleOutline(length, radius) {
    return length >= 3 && length <= 16
        ? Array.from({ length }, (_, i) => cyclePoint(i, length, radius).join(",")).join(" ")
        : null;
}

export function initializePlayCycleUI({ state, system = "MOTIF", document = globalThis.document }) {
    const host = document.getElementById(`play-${system.toLowerCase()}-clock`);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 240 240");
    svg.setAttribute("aria-hidden", "true");
    const set = (element, name, value) => {
        const text = String(value);
        if (element.getAttribute(name) !== text) element.setAttribute(name, text);
    };
    const node = (tag, attrs, parent = svg) => {
        const element = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attrs)) set(element, key, value);
        parent.appendChild(element);
        return element;
    };
    const outer = node("g", { class: "cycle-outer" });
    const inner = node("g", { class: "cycle-inner" });
    function dial(parent, radius) {
        const ring = node("circle", { cx: 120, cy: 120, r: radius, class: "cycle-outline" }, parent);
        const polygon = node("polygon", { class: "cycle-outline" }, parent);
        const hand = node("line", { x1: 120, y1: 120, class: "cycle-hand" }, parent);
        const dot = node("circle", { r: 3.5, class: "cycle-dot" }, parent);
        let previousLength;
        return (length, position) => {
            if (length !== previousLength) {
                const points = cycleOutline(length, radius);
                set(ring, "display", points ? "none" : "inline");
                set(polygon, "display", points ? "inline" : "none");
                if (points) set(polygon, "points", points);
                previousLength = length;
            }
            const [x, y] = cyclePoint(position, length, radius);
            set(hand, "x2", x); set(hand, "y2", y);
            set(dot, "cx", x); set(dot, "cy", y);
        };
    }
    const drawOuter = dial(outer, 100);
    const drawInner = dial(inner, 80);
    node("circle", { cx: 120, cy: 120, r: 3, class: "cycle-hub" });
    const caption = document.createElement("div");
    caption.className = "cycle-readout";
    const globalLabel = document.createElement("div");
    globalLabel.className = "cycle-global-label";
    const localLabel = document.createElement("div");
    localLabel.className = "cycle-local-label";
    caption.appendChild(globalLabel); caption.appendChild(localLabel);
    host.replaceChildren(svg, caption);
    let previous = "";
    function render() {
        const data = readPlayCycle(state, system);
        const signature = JSON.stringify(data);
        if (signature === previous) return;
        previous = signature;
        drawOuter(data.length, data.position);
        set(inner, "display", data.voice ? "inline" : "none");
        if (data.voice) drawInner(data.voice.length, data.voice.position);
        globalLabel.textContent = `${system} ${data.position + 1} / ${data.length}${data.viewingOther ? ` · LECTURE ${String(data.motifId + 1).padStart(2, "0")}` : ""}`;
        localLabel.textContent = data.voice ? `${data.voice.name} · ${data.voice.position + 1} / ${data.voice.length}` : "";
        host.setAttribute("aria-label", `${globalLabel.textContent}${data.voice ? `. ${localLabel.textContent}` : ""}`);
    }
    render();
    return { render };
}
