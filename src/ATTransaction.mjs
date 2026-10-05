export const createVelocities = () => Array.from({ length: 16 }, () => Array(32).fill(100));
export const createColors = () => Array.from({ length: 16 }, () => Array(32).fill(false));
export const createAttributeRows = () => Array.from({ length: 16 }, () => Array(32).fill(null));
export const hasModulationCell = (motif, voice, step) => Boolean(motif.events[voice][step] ||
    Object.values(motif.attributes ?? {}).some(rows => rows[voice][step] !== null));
export const validExplicitAttributes = value => value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, rows]) => ["VELOCITY", "COLOR"].includes(key) &&
        Array.isArray(rows) && rows.length === 16 && rows.every(row => Array.isArray(row) && row.length === 32 &&
            row.every(v => v === null || (key === "COLOR" ? typeof v === "boolean" : Number.isInteger(v) && v >= 1 && v <= 127))));
function applyExplicitAttribute(motif, { instruments, steps }, key, value) {
    let changed = false;
    const rows = motif.attributes[key] ??= createAttributeRows();
    for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
        if (instruments.size && !instruments.has(voice) || steps.size && !steps.has(step)) continue;
        rows[voice][step] = value;
        changed = true;
    }
    return changed;
}
export const validATDestinationRow = row => Array.isArray(row) && row.length === 32 &&
    row.every(v => v === null || ["STEP", "INSTRUMENT", "MOTIF"].includes(v));
export const validATDestinations = value => value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, rows]) => ["VELOCITY", "COLOR", "ROTATION"].includes(key) &&
        Array.isArray(rows) && rows.length === 16 && rows.every(validATDestinationRow));
export const hasTargetEvents = (motif, target) => Boolean(motif && target && motif.events.some((row, voice) =>
    (!target.instruments.size || target.instruments.has(voice)) &&
    row.some((event, step) => (event || motif.attributes !== undefined) && (!target.steps.size || target.steps.has(step)))));
export const validColors = value => Array.isArray(value) && value.length === 16 &&
    value.every(row => Array.isArray(row) && row.length === 32 && row.every(n => typeof n === "boolean"));
// Definitions own their value scale and musical capture/apply/restore operations.
// Empty slots deliberately have no behavior.
export const AT_SLOTS = Object.freeze([
    Object.freeze({ id: "VELOCITY", values: Object.freeze([127, 111, 96, 80, 64, 48, 32, 16]),
        isAssigned: (motif, voice, step) => motif.attributes !== undefined
            ? motif.attributes.VELOCITY?.[voice]?.[step] != null : (motif.velocities?.[voice]?.[step] ?? 100) !== 100,
        capture: motif => motif.velocities?.map(row => row.slice()),
        restore(motif, snapshot) {
            if (snapshot === undefined) delete motif.velocities;
            else motif.velocities = snapshot.map(row => row.slice());
        },
        apply(motif, { instruments, steps }, value) {
            if (motif.attributes !== undefined) return applyExplicitAttribute(motif, { instruments, steps }, "VELOCITY", value);
            let changed = false;
            for (let voice = 0; voice < 16; voice++) {
                if (instruments.size && !instruments.has(voice)) continue;
                for (let step = 0; step < 32; step++) {
                    if (!motif.events[voice][step] || steps.size && !steps.has(step)) continue;
                    motif.velocities ??= createVelocities();
                    motif.velocities[voice][step] = value;
                    changed = true;
                }
            }
            return changed;
        }
    }),
    Object.freeze({ id: "COLOR", values: Object.freeze([true, false]),
        isAssigned: (motif, voice, step) => motif.attributes !== undefined
            ? motif.attributes.COLOR?.[voice]?.[step] != null : motif.colors?.[voice]?.[step] === true,
        capture: motif => motif.colors?.map(row => row.slice()),
        restore(motif, snapshot) {
            if (snapshot === undefined) delete motif.colors;
            else motif.colors = snapshot.map(row => row.slice());
        },
        apply(motif, { instruments, steps }, value) {
            if (motif.attributes !== undefined) return applyExplicitAttribute(motif, { instruments, steps }, "COLOR", value);
            let changed = false;
            for (let voice = 0; voice < 16; voice++) {
                if (instruments.size && !instruments.has(voice)) continue;
                for (let step = 0; step < 32; step++) {
                    if (!motif.events[voice][step] || steps.size && !steps.has(step)) continue;
                    motif.colors ??= createColors();
                    motif.colors[voice][step] = value;
                    changed = true;
                }
            }
            return changed;
        }
    }),
    ...Array(6).fill(null),
    Object.freeze({ id: "ROTATION", values: Object.freeze([]),
        isAssigned: (motif, voice, step) => Boolean(motif.atDestinations?.ROTATION?.[voice]?.[step]),
        capture: motif => Object.fromEntries(["events", "velocities", "colors", "atDestinations", "attributes"]
            .map(key => [key, structuredClone(motif[key])])),
        restore(motif, snapshot) {
            for (const [key, value] of Object.entries(snapshot)) {
                if (value === undefined) delete motif[key];
                else motif[key] = structuredClone(value);
            }
        }
    }),
    ...Array(7).fill(null)
]);
export const validVelocities = value => Array.isArray(value) && value.length === 16 &&
    value.every(row => Array.isArray(row) && row.length === 32 &&
        row.every(n => Number.isInteger(n) && n >= 1 && n <= 127));

export class ATTransaction {
    constructor(state, context, changed = () => {}) {
        this.rootState = state.rootState ?? state;
        this.context = context;
        this.changed = changed;
        state.atTransaction = null;
    }
    get state() {
        const root = this.rootState;
        return root.forSystem?.(root.atTransaction?.system ?? root.currentTimeline) ?? root;
    }
    getEditingState() { return this.state; }
    definition(slot) { return AT_SLOTS[slot]; }
    isEnabled(slot) { return Boolean(this.definition(slot)) && (slot !== 1 || this.state.colorEnabled === true); }
    setColorEnabled(enabled) {
        // Disable entry only; an existing transaction retains CANCEL/COMMIT.
        this.state.colorEnabled = Boolean(enabled);
        this.changed("availability");
    }
    getEditingMotifId() {
        return this.state.atTransaction?.editingMotifId ?? this.context().editingMotifId;
    }
    hasTargetEvents() {
        return hasTargetEvents(this.state.getMotif(this.getEditingMotifId()), this.state.atTransaction);
    }
    begin(slot = 0) {
        const definition = AT_SLOTS[slot];
        if (!this.isEnabled(slot) || this.state.atTransaction || this.state.currentView !== "PLAY") return false;
        this.state.atTransaction = {
            system: this.state.systemName ?? "MOTIF",
            slot, instruments: new Set(), steps: new Set(), valueIndex: null,
            // CHAIN playback and FOCUS navigation remain independent of A/T's view.
            editingMotifId: this.context().editingMotifId,
            // Capture before any edit for CANCEL.
            snapshots: this.state.motifs.map(m => definition.capture(m)),
            destinationSnapshots: this.state.motifs.map(m => structuredClone(m.atDestinations)),
            attributeSnapshots: this.state.motifs.map(m => structuredClone(m.attributes)),
            touched: new Set()
        };
        this.changed("begin");
        return true;
    }
    select(category, id, additive = false) {
        const tx = this.state.atTransaction;
        const limit = category === "instruments" ? 16 : category === "steps" ? 32 : 0;
        if (!tx || !Number.isInteger(id) || id < 0 || id >= limit) return false;
        const set = tx[category];
        if (set.has(id)) set.delete(id);
        else { if (!additive) set.clear(); set.add(id); }
        tx.valueIndex = null;
        delete tx.rotationTargets;
        this.changed(category);
        return true;
    }
    apply(index) {
        const tx = this.state.atTransaction;
        if (!tx || !Number.isInteger(index) || index < 0 || index > 7) return false;
        const definition = AT_SLOTS[tx.slot];
        if (definition.id === "ROTATION") return false; // Controlled exclusively by << / >>.
        if (definition.id === "COLOR") {
            if (index !== 0) return false;
            // Reset by target changes; mixed states always start with collective ON.
            index = tx.valueIndex === 0 ? 1 : 0;
        }
        const id = this.getEditingMotifId();
        const motif = this.state.getMotif(id);
        if (this.state.systemName === "MODULATION") {
            const voices = tx.instruments.size ? [...tx.instruments] : Array.from({ length: 16 }, (_, i) => i);
            const whole = !tx.instruments.size && !tx.steps.size;
            tx.attributeVoices ??= new Set();
            for (const voice of voices) tx.attributeVoices.add(voice);
            tx.attributeWholeMotif ||= whole;
            if (this.state.transportState === "PLAY" && id === this.state.playingMotifId) this.state.deferDouble(voices, whole);
        }
        // Playing Motifs require events; Modulation permits explicit A/T-only cells.
        // A rejected target must not advance COLOR's toggle or dirty the bank.
        if (!definition.apply(motif, tx, definition.values[index])) {
            tx.valueIndex = null;
            this.changed("value");
            return false;
        }
        tx.touched.add(id);
        motif.atDestinations ??= {};
        const destinations = motif.atDestinations[definition.id] ??=
            Array.from({ length: 16 }, () => Array(32).fill(null));
        for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
            if ((motif.attributes === undefined && !motif.events[voice][step]) || (tx.instruments.size && !tx.instruments.has(voice)) ||
                (tx.steps.size && !tx.steps.has(step))) continue;
            destinations[voice][step] = definition.isAssigned(motif, voice, step)
                ? tx.steps.size ? "STEP" : tx.instruments.size ? "INSTRUMENT" : "MOTIF" : null;
        }
        tx.valueIndex = index;
        this.changed("value");
        return true;
    }
    rotate(direction) {
        const tx = this.state.atTransaction;
        if (tx?.slot !== 8 || ![-1, 1].includes(direction)) return false;
        const id = this.getEditingMotifId(), motif = this.state.getMotif(id);
        const moves = [];
        const destination = tx.steps.size ? "STEP" : tx.instruments.size ? "INSTRUMENT" : "MOTIF";
        // Capture every source first: adjacent selected events move simultaneously.
        for (let voice = 0; voice < 16; voice++) for (let step = 0; step < this.state.getVoiceLength(voice, id); step++) {
            const selectedSteps = tx.rotationTargets?.get(voice) ?? tx.steps;
            if (!(motif.attributes !== undefined ? hasModulationCell(motif, voice, step) : motif.events[voice][step]) || (tx.instruments.size && !tx.instruments.has(voice)) ||
                (tx.rotationTargets && !tx.rotationTargets.has(voice)) ||
                (tx.steps.size && !selectedSteps.has(step))) continue;
            const length = this.state.getVoiceLength(voice, id);
            moves.push({ voice, step, to: (step + direction + length) % length,
                event: motif.events[voice][step],
                attributes: Object.fromEntries(Object.entries(motif.attributes ?? {}).map(([key, rows]) => [key, rows[voice][step]])),
                velocity: motif.velocities?.[voice][step] ?? 100,
                color: motif.colors?.[voice][step] ?? false,
                destinations: Object.fromEntries(Object.entries(motif.atDestinations ?? {})
                    .map(([key, rows]) => [key, rows[voice][step]])) });
        }
        if (!moves.length) return false;
        tx.rotationVoices ??= new Set();
        for (const { voice } of moves) tx.rotationVoices.add(voice);
        tx.rotationWholeMotif ||= destination === "MOTIF";
        if (this.state.transportState === "PLAY" && id === this.state.playingMotifId) {
            this.state.deferDouble([...new Set(moves.map(move => move.voice))], destination === "MOTIF");
        }
        const sources = new Map(moves.map(move => [`${move.voice}:${move.step}`, move]));
        const displaced = [];
        for (const { voice, to } of moves) {
            if (sources.has(`${voice}:${to}`) || !(motif.attributes !== undefined ? hasModulationCell(motif, voice, to) : motif.events[voice][to])) continue;
            const length = this.state.getVoiceLength(voice, id);
            // At the end of a selected run, return the encountered event to
            // the run's vacated origin. All selected events still advance once.
            let origin = (to - direction + length) % length;
            while (sources.has(`${voice}:${(origin - direction + length) % length}`)) {
                origin = (origin - direction + length) % length;
            }
            displaced.push({ voice, to: origin,
                event: motif.events[voice][to],
                attributes: Object.fromEntries(Object.entries(motif.attributes ?? {}).map(([key, rows]) => [key, rows[voice][to]])),
                velocity: motif.velocities?.[voice][to] ?? 100,
                color: motif.colors?.[voice][to] ?? false,
                destinations: Object.fromEntries(Object.entries(motif.atDestinations ?? {})
                    .map(([key, rows]) => [key, rows[voice][to]])) });
        }
        motif.atDestinations ??= {};
        motif.atDestinations.ROTATION ??= Array.from({ length: 16 }, () => Array(32).fill(null));
        for (const { voice, step } of moves) {
            motif.events[voice][step] = false;
            if (motif.velocities) motif.velocities[voice][step] = 100;
            if (motif.colors) motif.colors[voice][step] = false;
            for (const rows of Object.values(motif.attributes ?? {})) rows[voice][step] = null;
            for (const rows of Object.values(motif.atDestinations)) rows[voice][step] = null;
        }
        for (const move of moves) {
            const { voice, to } = move;
            motif.events[voice][to] = move.event;
            for (const [key, rows] of Object.entries(motif.attributes ?? {})) rows[voice][to] = move.attributes[key] ?? null;
            if (motif.velocities) motif.velocities[voice][to] = move.velocity;
            if (motif.colors) motif.colors[voice][to] = move.color;
            for (const [key, rows] of Object.entries(motif.atDestinations)) rows[voice][to] = move.destinations[key] ?? null;
            motif.atDestinations.ROTATION[voice][to] = destination;
        }
        for (const { voice, to, event, attributes, velocity, color, destinations } of displaced) {
            motif.events[voice][to] = event;
            for (const [key, rows] of Object.entries(motif.attributes ?? {})) rows[voice][to] = attributes[key] ?? null;
            if (motif.velocities) motif.velocities[voice][to] = velocity;
            if (motif.colors) motif.colors[voice][to] = color;
            for (const [key, rows] of Object.entries(motif.atDestinations)) rows[voice][to] = destinations[key] ?? null;
        }
        if (tx.steps.size) {
            // Different cycles can send the same selected step to different pads.
            // Track each voice separately so the displayed union cannot select extra notes.
            tx.rotationTargets = new Map();
            for (const { voice, to } of moves) {
                if (!tx.rotationTargets.has(voice)) tx.rotationTargets.set(voice, new Set());
                tx.rotationTargets.get(voice).add(to);
            }
            tx.steps = new Set(moves.map(move => move.to));
        }
        tx.touched.add(id);
        this.changed("value");
        return true;
    }
    finish(commit = false) {
        const tx = this.state.atTransaction;
        if (!tx) return false;
        const definition = AT_SLOTS[tx.slot];
        if (!commit) for (const id of tx.touched) {
            if ((tx.slot === 8 || tx.system === "MODULATION") && this.state.transportState === "PLAY" && id === this.state.playingMotifId) {
                this.state.deferDouble(tx.slot === 8 ? [...tx.rotationVoices] : [...tx.attributeVoices],
                    tx.slot === 8 ? Boolean(tx.rotationWholeMotif) : Boolean(tx.attributeWholeMotif));
            }
            definition.restore(this.state.motifs[id], tx.snapshots[id]);
            if (tx.attributeSnapshots[id] === undefined) delete this.state.motifs[id].attributes;
            else this.state.motifs[id].attributes = structuredClone(tx.attributeSnapshots[id]);
            if (tx.destinationSnapshots[id] === undefined) delete this.state.motifs[id].atDestinations;
            else this.state.motifs[id].atDestinations = structuredClone(tx.destinationSnapshots[id]);
        }
        this.state.atTransaction = null;
        if (commit && tx.touched.size) this.state.onBankChange?.();
        this.changed("finish");
        return true;
    }
    resetMotif() {
        if (this.state.atTransaction) return false;
        const motif = this.state.getMotif(this.getEditingMotifId());
        if (!motif) return false;
        if (motif.attributes !== undefined && this.state.transportState === "PLAY" && this.getEditingMotifId() === this.state.playingMotifId) this.state.deferDouble([], true);
        delete motif.velocities;
        delete motif.colors;
        delete motif.atDestinations;
        if (motif.attributes !== undefined) {
            motif.attributes = {};
        }
        this.state.onBankChange?.();
        this.changed("reset");
        return true;
    }
}
