import { EUCLIDEAN_SLOT, euclideanDefinition, euclideanPattern } from "./Euclidean.mjs";
export { EUCLIDEAN_SLOT, validEuclidean, validEuclideanVoice, euclideanOnsets } from "./Euclidean.mjs";
import { SCALES, defaultKeyGroup, validKeyCell, readKeyCell, applyKeyPatch, keyNote, keyGroupFeedback } from "./KeyGroup.mjs";
export { SCALES, defaultKeyGroup, validKeySettings, validKeyCell, validKeyRow, validKeyGroups, readKeyCell, keyNote, keyGroupFeedback } from "./KeyGroup.mjs";
import { mutateMotif } from "./Mutation.mjs";
export { composeGroove, validGrooveMorph } from "./GrooveMorph.mjs";
export const createVelocities = () => Array.from({ length: 16 }, () => Array(32).fill(100));
export const SWING_VALUES = Object.freeze([75, 72, 69, 66, 63, 58, 54, 50]);
export const RATCHET_VALUES = Object.freeze([8, 7, 6, 5, 4, 3, 2, 1]);
export const validRatchetRow = row => Array.isArray(row) && row.length === 32 && row.every(v => v === null || RATCHET_VALUES.includes(v));
export const validRatchets = rows => Array.isArray(rows) && rows.length === 16 && rows.every(validRatchetRow);
export const validSwingRow = row => Array.isArray(row) && row.length === 32 && row.every(v => v === null || SWING_VALUES.includes(v));
export const validSwings = rows => Array.isArray(rows) && rows.length === 16 && rows.every(validSwingRow);
export const createColors = () => Array.from({ length: 16 }, () => Array(32).fill(false));
export const createAttributeRows = () => Array.from({ length: 16 }, () => Array(32).fill(null));
export const hasModulationCell = (motif, voice, step) => Boolean(
    Object.values(motif.attributes ?? {}).some(rows => rows[voice][step] !== null));
export const validExplicitAttributes = value => value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, rows]) => ["VELOCITY", "COLOR", "SWING", "RATCHET", "KEY_GROUP"].includes(key) &&
        Array.isArray(rows) && rows.length === 16 && rows.every(row => Array.isArray(row) && row.length === 32 &&
            row.every(v => v === null || (key === "KEY_GROUP" ? validKeyCell(v) : key === "COLOR" ? typeof v === "boolean" : key === "SWING" ? SWING_VALUES.includes(v) : key === "RATCHET" ? RATCHET_VALUES.includes(v) : Number.isInteger(v) && v >= 1 && v <= 127))));
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
    Object.entries(value).every(([key, rows]) => ["VELOCITY", "COLOR", "SWING", "RATCHET", "KEY_GROUP", "ROTATION"].includes(key) &&
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
    Object.freeze({ id: "SWING", values: SWING_VALUES,
        isAssigned: (motif, voice, step) => (motif.attributes !== undefined
            ? motif.attributes.SWING?.[voice]?.[step] : motif.swings?.[voice]?.[step]) != null,
        capture: motif => motif.swings?.map(row => row.slice()),
        restore(motif, snapshot) {
            if (snapshot === undefined) delete motif.swings;
            else motif.swings = snapshot.map(row => row.slice());
        },
        apply(motif, { instruments, steps }, value) {
            if (motif.attributes !== undefined) return applyExplicitAttribute(motif, { instruments, steps }, "SWING", value);
            let changed = false;
            for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
                if (!motif.events[voice][step] || instruments.size && !instruments.has(voice) || steps.size && !steps.has(step)) continue;
                motif.swings ??= createAttributeRows();
                motif.swings[voice][step] = value;
                changed = true;
            }
            return changed;
        }
    }),
    Object.freeze({ id: "RATCHET", values: RATCHET_VALUES,
        isAssigned: (motif, voice, step) => (motif.attributes !== undefined
            ? motif.attributes.RATCHET?.[voice]?.[step] : motif.ratchets?.[voice]?.[step]) != null,
        capture: motif => motif.ratchets?.map(row => row.slice()),
        restore(motif, snapshot) {
            if (snapshot === undefined) delete motif.ratchets;
            else motif.ratchets = snapshot.map(row => row.slice());
        },
        apply(motif, { instruments, steps }, value) {
            if (motif.attributes !== undefined) return applyExplicitAttribute(motif, { instruments, steps }, "RATCHET", value);
            let changed = false;
            for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
                if (!motif.events[voice][step] || instruments.size && !instruments.has(voice) || steps.size && !steps.has(step)) continue;
                motif.ratchets ??= createAttributeRows();
                motif.ratchets[voice][step] = value;
                changed = true;
            }
            return changed;
        }
    }),
    Object.freeze({ id: "KEY_GROUP", values: Object.freeze([7,6,5,4,3,2,1,0]),
        isAssigned: (motif, voice, step) => readKeyCell(motif, voice, step) !== null,
        capture: motif => structuredClone(motif.keyGroups),
        restore(motif, snapshot) {
            if (snapshot === undefined) delete motif.keyGroups;
            else motif.keyGroups = structuredClone(snapshot);
        },
        apply: applyKeyPatch
    }),
    ...Array(3).fill(null),
    Object.freeze({ id: "ROTATION", values: Object.freeze([]),
        isAssigned: (motif, voice, step) => Boolean(motif.atDestinations?.ROTATION?.[voice]?.[step]),
        capture: motif => Object.fromEntries(["events", "velocities", "colors", "swings", "ratchets", "keyGroups", "atDestinations", "attributes", "grooveMorph"]
            .map(key => [key, structuredClone(motif[key])])),
        restore(motif, snapshot) {
            for (const [key, value] of Object.entries(snapshot)) {
                if (value === undefined) delete motif[key];
                else motif[key] = structuredClone(value);
            }
        }
    }),
    euclideanDefinition, ...Array(6).fill(null)
]);
export const validVelocities = value => Array.isArray(value) && value.length === 16 &&
    value.every(row => Array.isArray(row) && row.length === 32 &&
        row.every(n => Number.isInteger(n) && n >= 1 && n <= 127));

// Visit only the temporal copies that still feed the playing target. Geometry stays frozen.
export function visitPlaybackAttributes(state, motifId, instruments, visit) {
    if (state.transportState !== "PLAY" || motifId !== state.playingMotifId) return;
    const groups = new Map();
    for (const [voice, snapshot] of state.liveLengthCycle?.doubleVoices ?? []) {
        if (instruments.size && !instruments.has(voice)) continue;
        if (!groups.has(snapshot)) groups.set(snapshot, new Set());
        groups.get(snapshot).add(voice);
    }
    for (const [snapshot, voices] of groups) visit(snapshot, voices);
}
function applyAttribute(motif, target, definition, value, scope = target) {
    if (!definition.apply(motif, target, value)) return false;
    motif.atDestinations ??= {};
    const destinations = motif.atDestinations[definition.id] ??= createAttributeRows();
    for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
        if ((motif.attributes === undefined && !motif.events[voice][step]) ||
            (target.instruments.size && !target.instruments.has(voice)) ||
            (target.steps.size && !target.steps.has(step))) continue;
        destinations[voice][step] = definition.isAssigned(motif, voice, step)
            ? scope.steps.size ? "STEP" : scope.instruments.size ? "INSTRUMENT" : "MOTIF" : null;
    }
    return true;
}
function clearAttributes(motif) {
    for (const key of ["velocities", "colors", "swings", "ratchets", "keyGroups", "atDestinations"]) delete motif[key];
    if (motif.attributes !== undefined) motif.attributes = {};
}

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
    isEnabled(slot) { if (slot === EUCLIDEAN_SLOT && this.state.systemName !== "MOTIF") return false; return Boolean(this.definition(slot)) && (slot !== 1 || this.state.colorEnabled === true); }
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
    beginMutation() {
        if (this.state.getMotif(this.context().editingMotifId)?.grooveMorph) return false;
        return this.begin(8, { mutation: true });
    }
    beginGrooveMorph() {
        const id = this.context().editingMotifId, motif = this.state.getMotif(id);
        if (this.state.systemName !== "MOTIF" || !motif || motif.euclidean ||
            this.state.currentView !== "MOTIF_LIBRARY" && !motif.grooveMorph && motif.events.some(row => row.some(Boolean))) return false;
        if (!this.begin(8, { mutation: true })) return false;
        const tx = this.state.atTransaction;
        tx.kind = "GROOVE_MORPH";
        for (const snapshot of tx.snapshots) snapshot.grooveMorph = structuredClone(snapshot.grooveMorph);
        tx.valueIndex = motif.grooveMorph?.level ?? null;
        tx.chooseBlock = this.state.currentView === "MOTIF_LIBRARY";
        this.changed("begin");
        return true;
    }
    selectGrooveBlock(id) {
        const tx = this.state.atTransaction, motif = this.state.getMotif(id);
        if (tx?.kind !== "GROOVE_MORPH" || !tx.chooseBlock || !motif || motif.euclidean ||
            !motif.grooveMorph && motif.events.some(row => row.some(Boolean))) return false;
        tx.editingMotifId = id;
        tx.valueIndex = motif.grooveMorph?.level ?? null;
        this.changed("target");
        return true;
    }
    begin(slot = 0, { mutation = false } = {}) {
        const definition = AT_SLOTS[slot];
        if (slot === EUCLIDEAN_SLOT) {
            const motif = this.state.getMotif(this.context().editingMotifId);
            if (motif?.grooveMorph || !motif?.euclidean && motif?.events.some(row => row.some(Boolean))) return false;
        }
        if (!this.isEnabled(slot) || this.state.atTransaction ||
            !(this.state.currentView === "PLAY" || mutation && this.state.currentView === "MOTIF_LIBRARY") ||
            mutation && this.state.systemName !== "MOTIF") return false;
        this.state.atTransaction = {
            ...(mutation ? { kind: "MUTATION" } : slot === EUCLIDEAN_SLOT ? { kind: "EUCLIDEAN" } : {}),
            system: this.state.systemName ?? "MOTIF",
            slot, instruments: new Set(), steps: new Set(), valueIndex: null,
            // CHAIN playback and FOCUS navigation remain independent of A/T's view.
            editingMotifId: this.context().editingMotifId,
            // Capture before any edit for CANCEL.
            snapshots: this.state.motifs.map(m => mutation ? structuredClone(m) : definition.capture(m)),
            destinationSnapshots: this.state.motifs.map(m => structuredClone(m.atDestinations)),
            attributeSnapshots: this.state.motifs.map(m => structuredClone(m.attributes)),
            touched: new Set()
        };
        this.changed("begin");
        return true;
    }
    select(category, id, additive = false) {
        const tx = this.state.atTransaction;
        if (tx?.kind === "MUTATION" || tx?.kind === "GROOVE_MORPH") return false;
        const limit = category === "instruments" ? 16 : category === "steps" ? 32 : 0;
        if (!tx || !Number.isInteger(id) || id < 0 || id >= limit) return false;
        if (tx.kind === "EUCLIDEAN") {
            if (category !== "instruments") return false;
            tx.instruments = new Set([id]);
            this.changed("value");
            return true;
        }
        const set = tx[category];
        if (set.has(id)) set.delete(id);
        else { if (!additive) set.clear(); set.add(id); }
        tx.valueIndex = null;
        delete tx.rotationTargets;
        this.changed(category);
        return true;
    }
    setEuclideanStep(step, { resolution = false, duration = false } = {}) {
        const tx = this.state.atTransaction;
        if (tx?.kind !== "EUCLIDEAN" || !Number.isInteger(step) || step < 0 || step >= 32) return false;
        const voice = [...tx.instruments][0];
        if (!duration && voice === undefined) return false;
        const motif = this.state.getMotif(tx.editingMotifId);
        if (this.state.transportState === "PLAY" && tx.editingMotifId === this.state.playingMotifId) this.state.deferDouble([], true);
        if (duration) motif.motifLength = step + 1;
        else {
            motif.euclidean ??= Array(16).fill(null);
            const settings = motif.euclidean[voice] ??= { resolution: 32, hits: 0, mode: "POLYMETRIC" };
            if (resolution) { settings.resolution = step + 1; settings.hits = Math.min(settings.hits, settings.resolution); }
            else settings.hits = Math.min(step + 1, settings.resolution);
            motif.voiceLengths[voice] = settings.resolution;
            motif.events[voice] = euclideanPattern(settings.resolution, settings.hits);
        }
        tx.touched.add(tx.editingMotifId);
        this.changed("value");
        return true;
    }
    apply(index) {
        const tx = this.state.atTransaction;
        if (!tx || !Number.isInteger(index) || index < 0 || index > 7) return false;
        if (tx.kind === "EUCLIDEAN") {
            if (index > 1 || !tx.instruments.size) return false;
            const motif = this.state.getMotif(tx.editingMotifId), voice = [...tx.instruments][0];
            if (this.state.transportState === "PLAY" && tx.editingMotifId === this.state.playingMotifId) this.state.deferDouble([], true);
            motif.euclidean ??= Array(16).fill(null);
            const settings = motif.euclidean[voice] ??= { resolution: 32, hits: 0, mode: "POLYMETRIC" };
            settings.mode = index === 0 ? "POLYMETRIC" : "POLYRHYTHMIC";
            motif.voiceLengths[voice] = settings.resolution;
            tx.touched.add(tx.editingMotifId);
            this.changed("value");
            return true;
        }
        if (tx.kind === "GROOVE_MORPH") {
            const id = tx.editingMotifId, motif = this.state.getMotif(id);
            if (!motif.grooveMorph && motif.events.some(row => row.some(Boolean))) return false;
            if (this.state.transportState === "PLAY" && id === this.state.playingMotifId) this.state.deferDouble([], true);
            motif.grooveMorph = { level: index };
            tx.rotationWholeMotif = true;
            tx.rotationVoices = new Set(Array.from({ length: 16 }, (_, voice) => voice));
            tx.touched.add(id);
            tx.valueIndex = index;
            this.changed("value");
            return true;
        }
        if (tx.kind === "MUTATION") {
            const id = tx.editingMotifId, motif = mutateMotif(tx.snapshots[id], index);
            if (!motif) return false;
            if (JSON.stringify(motif) !== JSON.stringify(this.state.getMotif(id))) {
                if (this.state.transportState === "PLAY" && id === this.state.playingMotifId) this.state.deferDouble([], true);
                this.state.motifs[id] = motif;
                tx.rotationWholeMotif = true;
                tx.rotationVoices = new Set(Array.from({ length: 16 }, (_, voice) => voice));
                tx.touched.add(id);
            }
            tx.valueIndex = index;
            this.changed("value");
            return true;
        }
        const definition = AT_SLOTS[tx.slot];
        if (definition.id === "KEY_GROUP") return this.applyKeyGroup({ degree: definition.values[index] });
        if (definition.id === "ROTATION") return false; // Controlled exclusively by << / >>.
        if (definition.id === "COLOR") {
            if (index !== 0) return false;
            // Reset by target changes; mixed states always start with collective ON.
            index = tx.valueIndex === 0 ? 1 : 0;
        }
        const id = this.getEditingMotifId();
        const motif = this.state.getMotif(id);
        // Attribute values are read at the next event; never open a temporal cycle here.
        if (!applyAttribute(motif, tx, definition, definition.values[index])) {
            tx.valueIndex = null;
            this.changed("value");
            return false;
        }
        tx.touched.add(id);
        visitPlaybackAttributes(this.state, id, tx.instruments, (snapshot, voices) => {
            tx.liveAttributeSnapshots ??= new Map();
            if (!tx.liveAttributeSnapshots.has(snapshot)) tx.liveAttributeSnapshots.set(snapshot, {
                value: definition.capture(snapshot),
                attributes: structuredClone(snapshot.attributes),
                destinations: structuredClone(snapshot.atDestinations)
            });
            applyAttribute(snapshot, { instruments: voices, steps: tx.steps }, definition, definition.values[index], tx);
        });
        tx.valueIndex = index;
        this.changed("value");
        return true;
    }
    keyGroupStatus() { return keyGroupFeedback(this.state, this.state.atTransaction); }
    transposeKeyGroup(direction) {
        return [-1, 1].includes(direction) && this.applyKeyGroup({ octaveDelta: direction });
    }
    applyKeyGroup(patch) {
        const tx = this.state.atTransaction;
        if (tx?.slot !== 4) return false;
        const settings = this.rootState.keyGroup ?? defaultKeyGroup();
        const modulation = this.state.systemName === "MODULATION";
        if (!SCALES[settings.scale] || patch.degree !== undefined && (!Number.isInteger(patch.degree) || patch.degree < 0 || patch.degree > 7 ||
            !modulation && SCALES[settings.scale][patch.degree] === undefined)) return false;
        const instruments = new Set(this.state.padConfiguration.voices.flatMap((v, id) =>
            v.type === "KEY GROUP" && (!tx.instruments.size || tx.instruments.has(id)) ? [id] : []));
        if (!instruments.size) return false;
        const id = this.getEditingMotifId(), motif = this.state.getMotif(id), definition = AT_SLOTS[4];
        const targets = [[motif, instruments]];
        visitPlaybackAttributes(this.state, id, instruments, (snapshot, voices) => targets.push([snapshot, voices]));
        const candidates = targets.map(([m, voices]) => {
            const copy = structuredClone(m), target = { instruments: voices, steps: tx.steps };
            const changed = applyAttribute(copy, target, definition, patch, tx);
            const valid = [...voices].every(v => Array.from({ length: 32 }, (_, step) => step).every(step =>
                tx.steps.size && !tx.steps.has(step) || m.attributes === undefined && !m.events[v][step] ||
                validKeyCell(readKeyCell(copy, v, step)) && (modulation || keyNote(settings, readKeyCell(copy, v, step)) !== null)));
            return { copy, target, changed, valid };
        });
        if (!candidates[0].changed || candidates.some(c => !c.valid)) return false;
        for (const [n, [m]] of targets.entries()) {
            if (n) {
                tx.liveAttributeSnapshots ??= new Map();
                if (!tx.liveAttributeSnapshots.has(m)) tx.liveAttributeSnapshots.set(m, {
                    value: definition.capture(m), attributes: structuredClone(m.attributes), destinations: structuredClone(m.atDestinations)
                });
            }
            applyAttribute(m, candidates[n].target, definition, patch, tx);
        }
        tx.touched.add(id);
        if (patch.degree !== undefined) tx.valueIndex = definition.values.indexOf(patch.degree);
        this.changed("value");
        return true;
    }
    rotate(direction) {
        const tx = this.state.atTransaction;
        if (tx?.slot !== 8 || tx.kind === "MUTATION" || tx.kind === "GROOVE_MORPH" || ![-1, 1].includes(direction)) return false;
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
                swing: motif.swings?.[voice][step] ?? null,
                ratchet: motif.ratchets?.[voice][step] ?? null,
                keyGroup: structuredClone(motif.keyGroups?.[voice][step] ?? null),
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
                swing: motif.swings?.[voice][to] ?? null,
                ratchet: motif.ratchets?.[voice][to] ?? null,
                keyGroup: structuredClone(motif.keyGroups?.[voice][to] ?? null),
                destinations: Object.fromEntries(Object.entries(motif.atDestinations ?? {})
                    .map(([key, rows]) => [key, rows[voice][to]])) });
        }
        motif.atDestinations ??= {};
        motif.atDestinations.ROTATION ??= Array.from({ length: 16 }, () => Array(32).fill(null));
        for (const { voice, step } of moves) {
            motif.events[voice][step] = false;
            if (motif.velocities) motif.velocities[voice][step] = 100;
            if (motif.colors) motif.colors[voice][step] = false;
            if (motif.swings) motif.swings[voice][step] = null;
            if (motif.ratchets) motif.ratchets[voice][step] = null;
            if (motif.keyGroups) motif.keyGroups[voice][step] = null;
            for (const rows of Object.values(motif.attributes ?? {})) rows[voice][step] = null;
            for (const rows of Object.values(motif.atDestinations)) rows[voice][step] = null;
        }
        for (const move of moves) {
            const { voice, to } = move;
            motif.events[voice][to] = move.event;
            for (const [key, rows] of Object.entries(motif.attributes ?? {})) rows[voice][to] = move.attributes[key] ?? null;
            if (motif.velocities) motif.velocities[voice][to] = move.velocity;
            if (motif.colors) motif.colors[voice][to] = move.color;
            if (motif.swings) motif.swings[voice][to] = move.swing;
            if (motif.ratchets) motif.ratchets[voice][to] = move.ratchet;
            if (motif.keyGroups) motif.keyGroups[voice][to] = structuredClone(move.keyGroup);
            for (const [key, rows] of Object.entries(motif.atDestinations)) rows[voice][to] = move.destinations[key] ?? null;
            motif.atDestinations.ROTATION[voice][to] = destination;
        }
        for (const { voice, to, event, attributes, velocity, color, swing, ratchet, keyGroup, destinations } of displaced) {
            motif.events[voice][to] = event;
            for (const [key, rows] of Object.entries(motif.attributes ?? {})) rows[voice][to] = attributes[key] ?? null;
            if (motif.velocities) motif.velocities[voice][to] = velocity;
            if (motif.colors) motif.colors[voice][to] = color;
            if (motif.swings) motif.swings[voice][to] = swing;
            if (motif.ratchets) motif.ratchets[voice][to] = ratchet;
            if (motif.keyGroups) motif.keyGroups[voice][to] = structuredClone(keyGroup);
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
            if ((tx.slot === 8 || tx.kind === "EUCLIDEAN") && this.state.transportState === "PLAY" && id === this.state.playingMotifId) {
                this.state.deferDouble([...(tx.rotationVoices ?? [])], tx.kind === "EUCLIDEAN" || Boolean(tx.rotationWholeMotif));
            }
            definition.restore(this.state.motifs[id], tx.snapshots[id]);
            if (tx.attributeSnapshots[id] === undefined) delete this.state.motifs[id].attributes;
            else this.state.motifs[id].attributes = structuredClone(tx.attributeSnapshots[id]);
            if (tx.destinationSnapshots[id] === undefined) delete this.state.motifs[id].atDestinations;
            else this.state.motifs[id].atDestinations = structuredClone(tx.destinationSnapshots[id]);
        }
        if (!commit) for (const [snapshot, original] of tx.liveAttributeSnapshots ?? []) {
            definition.restore(snapshot, original.value);
            for (const [key, value] of [["attributes", original.attributes], ["atDestinations", original.destinations]]) {
                if (value === undefined) delete snapshot[key];
                else snapshot[key] = structuredClone(value);
            }
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
        clearAttributes(motif);
        visitPlaybackAttributes(this.state, this.getEditingMotifId(), new Set(), clearAttributes);
        this.state.onBankChange?.();
        this.changed("reset");
        return true;
    }
}
