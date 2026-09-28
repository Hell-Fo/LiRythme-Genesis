import { AT_SLOTS, validVelocities, validColors } from "./ATTransaction.mjs";

export function validateMotifBank(value) {
    const length = n => n === null || Number.isInteger(n) && n >= 1 && n <= 32;
    if (!value || value.format !== "lirythme-motif-bank" || value.version !== 1 ||
        !Number.isInteger(value.currentMotifId) || value.currentMotifId < 0 || value.currentMotifId >= 16 ||
        !Array.isArray(value.motifs) || value.motifs.length !== 16 ||
        !value.motifs.every(m => m && Array.isArray(m.events) && m.events.length === 16 &&
            m.events.every(row => Array.isArray(row) && row.length === 32 && row.every(v => typeof v === "boolean")) &&
            Array.isArray(m.voiceLengths) && m.voiceLengths.length === 16 &&
            m.voiceLengths.every(length) && length(m.motifLength) &&
            (m.velocities === undefined || validVelocities(m.velocities)) &&
            (m.colors === undefined || validColors(m.colors)))) {
        throw new Error("Invalid or unsupported Motif Bank (expected version 1, 16 valid motifs)");
    }
    // Whitelist and clone; neither transient state nor shared rows cross this boundary.
    return { format: "lirythme-motif-bank", version: 1, currentMotifId: value.currentMotifId,
        motifs: value.motifs.map(m => ({ events: m.events.map(row => row.slice()),
            ...(m.velocities ? { velocities: m.velocities.map(row => row.slice()) } : {}),
            ...(m.colors ? { colors: m.colors.map(row => row.slice()) } : {}),
            voiceLengths: m.voiceLengths.slice(), motifLength: m.motifLength })) };
}
export function snapshotMotifBank(state) {
    // Autosave may run for an unrelated edit while A/T is auditioning live values.
    // Serialize the BEGIN values until COMMIT; no provisional edit reaches disk.
    const tx = state.atTransaction;
    const motifs = tx ? state.motifs.map((motif, id) => {
        const copy = { ...motif };
        AT_SLOTS[tx.slot].restore(copy, tx.snapshots[id]);
        return copy;
    }) : state.motifs;
    return validateMotifBank({ format: "lirythme-motif-bank", version: 1,
        currentMotifId: state.currentMotifId, motifs });
}
export function restoreMotifBank(state, value) {
    const bank = validateMotifBank(value);
    state.motifs = bank.motifs;
    state.currentMotifId = bank.currentMotifId;
    state.nextMotifId = null;
    state.playheadPosition = 0;
    state.liveLengthCycle = null;
}
