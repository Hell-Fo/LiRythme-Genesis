export const createVelocities = () => Array.from({ length: 16 }, () => Array(32).fill(100));
// Definitions own their value scale and musical capture/apply/restore operations.
// Empty slots deliberately have no behavior.
export const AT_SLOTS = Object.freeze([
    Object.freeze({ id: "VELOCITY", values: Object.freeze([127, 111, 96, 80, 64, 48, 32, 16]),
        capture: motif => motif.velocities?.map(row => row.slice()),
        restore(motif, snapshot) {
            if (snapshot === undefined) delete motif.velocities;
            else motif.velocities = snapshot.map(row => row.slice());
        },
        apply(motif, { instruments, steps }, value) {
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
    ...Array(15).fill(null)
]);
export const validVelocities = value => Array.isArray(value) && value.length === 16 &&
    value.every(row => Array.isArray(row) && row.length === 32 &&
        row.every(n => Number.isInteger(n) && n >= 1 && n <= 127));

export class ATTransaction {
    constructor(state, context, changed = () => {}) {
        this.state = state;
        this.context = context;
        this.changed = changed;
        state.atTransaction = null;
    }
    definition(slot) { return AT_SLOTS[slot]; }
    getEditingMotifId() {
        return this.state.atTransaction?.editingMotifId ?? this.context().editingMotifId;
    }
    begin(slot = 0) {
        const definition = AT_SLOTS[slot];
        if (!definition || this.state.atTransaction || this.state.currentView !== "PLAY") return false;
        this.state.atTransaction = {
            slot, instruments: new Set(), steps: new Set(), valueIndex: null,
            // CHAIN playback and FOCUS navigation remain independent of A/T's view.
            editingMotifId: this.state.chainEnabled ? this.context().editingMotifId : null,
            // Capture before any edit for CANCEL.
            snapshots: this.state.motifs.map(m => definition.capture(m)),
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
        this.changed(category);
        return true;
    }
    apply(index) {
        const tx = this.state.atTransaction;
        if (!tx || !Number.isInteger(index) || index < 0 || index > 7) return false;
        const definition = AT_SLOTS[tx.slot];
        const id = this.getEditingMotifId();
        const motif = this.state.getMotif(id);
        if (definition.apply(motif, tx, definition.values[index])) tx.touched.add(id);
        tx.valueIndex = index;
        this.changed("value");
        return true;
    }
    finish(commit = false) {
        const tx = this.state.atTransaction;
        if (!tx) return false;
        const definition = AT_SLOTS[tx.slot];
        if (!commit) for (const id of tx.touched) {
            definition.restore(this.state.motifs[id], tx.snapshots[id]);
        }
        this.state.atTransaction = null;
        if (commit && tx.touched.size) this.state.onBankChange?.();
        this.changed("finish");
        return true;
    }
}
