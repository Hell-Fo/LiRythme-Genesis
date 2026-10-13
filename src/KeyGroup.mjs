// Editable catalogue lives in assets/scales.json; no user expressions are executed.
export function validateScales(document) {
    if (!document || !Array.isArray(document.scales) || !document.scales.length || document.scales.length > 256) throw new Error("scales: liste de 1 à 256 gammes requise");
    const result = Object.create(null);
    for (const entry of document.scales) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length !== 1) throw new Error("Une gamme doit avoir un nom unique et une liste d’intervalles");
        const [name, intervals] = Object.entries(entry)[0];
        if (!name.trim() || name.length > 80 || Object.hasOwn(result, name) ||
            !Array.isArray(intervals) || intervals.length < 1 || intervals.length > 8 || intervals[0] !== 0 ||
            !intervals.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 11 && (!i || n > intervals[i - 1]))) {
            throw new Error(`Gamme invalide : ${name} (1–8 intervalles croissants de 0 à 11, premier intervalle 0)`);
        }
        result[name] = Object.freeze(intervals.slice());
    }
    return Object.freeze(result);
}
let catalogue, warning = "";
try {
    catalogue = validateScales((await import("../assets/scales.json", { with: { type: "json" } })).default);
} catch (error) {
    warning = `scales.json : ${error.message}. Repli sur ionian ; fichier original conservé.`;
    catalogue = validateScales({ scales: [{ ionian: [0,2,4,5,7,9,11] }] });
}
export const SCALES = catalogue;
export const scaleLoadWarning = warning;
export const defaultKeyGroup = () => ({ root: 60, scale: Object.hasOwn(SCALES, "ionian") ? "ionian" : Object.keys(SCALES)[0] });
export const validKeySettings = v => v && Object.keys(v).length === 2 && Number.isInteger(v.root) &&
    v.root >= 0 && v.root <= 127 && typeof v.scale === "string" && v.scale.trim().length > 0 && v.scale.length <= 80;
export const validKeyCell = v => v === null || Boolean(v && typeof v === "object" && !Array.isArray(v) &&
    Object.keys(v).length && Object.keys(v).every(k => k === "degree" || k === "octave") &&
    (!Object.hasOwn(v, "degree") || Number.isInteger(v.degree) && v.degree >= 0 && v.degree < 8) &&
    (!Object.hasOwn(v, "octave") || Number.isInteger(v.octave) && v.octave >= -10 && v.octave <= 10));
export const validKeyRow = row => Array.isArray(row) && row.length === 32 && row.every(validKeyCell);
export const validKeyGroups = rows => Array.isArray(rows) && rows.length === 16 && rows.every(validKeyRow);
export function keyNote(settings, cell = {}, modulation = null) {
    const intervals = SCALES[settings.scale], degree = cell?.degree ?? 0;
    if (intervals?.[degree] === undefined) return null;
    const transposed = degree + (modulation?.degree ?? 0);
    const note = settings.root + intervals[transposed % intervals.length] +
        12 * ((cell?.octave ?? 0) + (modulation?.octave ?? 0) + Math.floor(transposed / intervals.length));
    return Number.isInteger(note) && note >= 0 && note <= 127 ? note : null;
}
export function readKeyCell(motif, voice, step) {
    return (motif.attributes !== undefined ? motif.attributes.KEY_GROUP : motif.keyGroups)?.[voice]?.[step] ?? null;
}
export function applyKeyPatch(motif, { instruments, steps }, patch) {
    let changed = false;
    for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
        if (!instruments.has(voice) || steps.size && !steps.has(step) ||
            motif.attributes === undefined && !motif.events[voice][step]) continue;
        const rows = motif.attributes !== undefined
            ? motif.attributes.KEY_GROUP ??= Array.from({ length: 16 }, () => Array(32).fill(null))
            : motif.keyGroups ??= Array.from({ length: 16 }, () => Array(32).fill(null));
        const cell = rows[voice][step] ?? {};
        rows[voice][step] = patch.degree !== undefined ? { ...cell, degree: patch.degree }
            : { ...cell, octave: (cell.octave ?? 0) + patch.octaveDelta };
        changed = true;
    }
    return changed;
}

export function keyGroupFeedback(state, tx, cursorOnly = true) {
    const settings = state.keyGroup ?? defaultKeyGroup(), degrees = new Set(), octaves = new Set();
    const motif = state.getMotif(tx.editingMotifId);
    for (let voice = 0; voice < 16; voice++) for (let step = 0; step < 32; step++) {
        if (state.padConfiguration.voices[voice]?.type !== "KEY GROUP" ||
            tx.instruments.size && !tx.instruments.has(voice) || tx.steps.size && !tx.steps.has(step) ||
            cursorOnly && step !== state.playheadPosition % 32) continue;
        const cell = readKeyCell(motif, voice, step);
        if (motif.attributes !== undefined ? cell === null : !motif.events[voice][step]) continue;
        if (motif.attributes === undefined || cell?.degree !== undefined) degrees.add(cell?.degree ?? 0);
        if (motif.attributes === undefined || cell?.octave !== undefined) octaves.add(cell?.octave ?? 0);
    }
    return { count: SCALES[settings.scale] ? motif.attributes !== undefined ? 8 : SCALES[settings.scale].length : 0, degrees, octaves };
}
