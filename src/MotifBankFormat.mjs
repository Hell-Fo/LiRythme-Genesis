import { AT_SLOTS, validKeyGroups, validKeySettings, defaultKeyGroup, validSwings, validRatchets, validVelocities, validColors, validATDestinations, validExplicitAttributes, validGrooveMorph } from "./ATTransaction.mjs";

export function validateMotifBank(value, { modulation = false } = {}) {
    const length = n => n === null || Number.isInteger(n) && n >= 1 && n <= 32;
    if (!value || value.format !== "lirythme-motif-bank" || value.version !== 1 ||
        !Number.isInteger(value.currentMotifId) || value.currentMotifId < 0 || value.currentMotifId >= 16 ||
        !Array.isArray(value.motifs) || value.motifs.length !== 16 ||
        !value.motifs.every(m => m && Array.isArray(m.events) && m.events.length === 16 &&
            m.events.every(row => Array.isArray(row) && row.length === 32 && row.every(v => typeof v === "boolean")) &&
            Array.isArray(m.voiceLengths) && m.voiceLengths.length === 16 &&
            m.voiceLengths.every(length) && length(m.motifLength) &&
            (m.velocities === undefined || validVelocities(m.velocities)) &&
            (m.colors === undefined || validColors(m.colors)) &&
            (m.swings === undefined || validSwings(m.swings)) &&
            (m.ratchets === undefined || validRatchets(m.ratchets)) &&
            (m.keyGroups === undefined || validKeyGroups(m.keyGroups)) &&
            (m.grooveMorph === undefined || !modulation && validGrooveMorph(m.grooveMorph) && !m.events.some(row => row.some(Boolean))) &&
            (modulation ? validExplicitAttributes(m.attributes) : m.attributes === undefined) &&
            (m.atDestinations === undefined || validATDestinations(m.atDestinations)))) {
        throw new Error("Invalid or unsupported Motif Bank (expected version 1, 16 valid motifs)");
    }
    if (value.keyGroup !== undefined && !validKeySettings(value.keyGroup)) throw new Error("Invalid Key Group settings");
    // Whitelist and clone; neither transient state nor shared rows cross this boundary.
    const result = { format: "lirythme-motif-bank", version: 1, currentMotifId: value.currentMotifId,
        ...(value.keyGroup ? { keyGroup: structuredClone(value.keyGroup) } : {}),
        motifs: value.motifs.map(m => ({ events: m.events.map(row => modulation ? Array(32).fill(false) : row.slice()),
            ...(m.velocities ? { velocities: m.velocities.map(row => row.slice()) } : {}),
            ...(m.colors ? { colors: m.colors.map(row => row.slice()) } : {}),
            ...(m.swings ? { swings: m.swings.map(row => row.slice()) } : {}),
            ...(m.grooveMorph ? { grooveMorph: structuredClone(m.grooveMorph) } : {}),
            ...(m.keyGroups ? { keyGroups: structuredClone(m.keyGroups) } : {}),
            ...(m.ratchets ? { ratchets: m.ratchets.map(row => row.slice()) } : {}),
            ...(m.atDestinations ? { atDestinations: structuredClone(m.atDestinations) } : {}),
            ...(m.attributes !== undefined ? { attributes: structuredClone(m.attributes) } : {}),
            voiceLengths: m.voiceLengths.slice(), motifLength: m.motifLength })) };
    if (value.modulation !== undefined) {
        const m = value.modulation;
        if (!m || typeof m.requested !== "boolean" || typeof m.chainEnabled !== "boolean" ||
            !Array.isArray(m.chain) || !m.chain.every(id => Number.isInteger(id) && id >= 0 && id < 16) ||
            !(m.loopPoint === null || Number.isInteger(m.loopPoint) && m.loopPoint >= 0 && m.loopPoint < m.chain.length) ||
            !m.motifs?.every(motif => motif.attributes !== undefined)) throw new Error("Invalid Modulation Bank/Chain");
        const bank = validateMotifBank({ format: result.format, version: 1, currentMotifId: m.currentMotifId, motifs: m.motifs }, { modulation: true });
        result.modulation = { currentMotifId: bank.currentMotifId, motifs: bank.motifs, requested: m.requested,
            chainEnabled: m.chainEnabled, chain: m.chain.slice(), loopPoint: m.loopPoint };
    }
    return result;
}
export function snapshotMotifBank(state) {
    // Autosave may run for an unrelated edit while A/T is auditioning live values.
    // Serialize the BEGIN values until COMMIT; no provisional edit reaches disk.
    const root = state.rootState ?? state;
    state = root.forSystem?.("MOTIF") ?? root;
    const tx = root.atTransaction?.system === "MODULATION" ? null : root.atTransaction;
    const motifs = tx ? state.motifs.map((motif, id) => {
        const copy = { ...motif };
        AT_SLOTS[tx.slot].restore(copy, tx.snapshots[id]);
        if (tx.attributeSnapshots?.[id] !== undefined) copy.attributes = structuredClone(tx.attributeSnapshots[id]);
        if (tx.destinationSnapshots[id] === undefined) delete copy.atDestinations;
        else copy.atDestinations = structuredClone(tx.destinationSnapshots[id]);
        return copy;
    }) : state.motifs;
    const doc = { format: "lirythme-motif-bank", version: 1, currentMotifId: state.currentMotifId, motifs, ...(root.keyGroup ? { keyGroup: structuredClone(root.keyGroup) } : {}) };
    if (root.modulation) {
        const m = root.forSystem("MODULATION"), tx = root.atTransaction;
        const motifs = tx?.system === "MODULATION" ? m.motifs.map((motif, id) => {
            const copy = { ...motif };
            AT_SLOTS[tx.slot].restore(copy, tx.snapshots[id]);
            copy.attributes = structuredClone(tx.attributeSnapshots[id]);
            if (tx.destinationSnapshots[id] === undefined) delete copy.atDestinations;
            else copy.atDestinations = structuredClone(tx.destinationSnapshots[id]);
            return copy;
        }) : m.motifs;
        doc.modulation = { currentMotifId: m.currentMotifId, motifs, requested: root.modulationRequested,
            chainEnabled: m.chainEnabled, chain: m.chain, loopPoint: m.chainLoopMasterIndex };
    }
    return validateMotifBank(doc);
}
export function restoreMotifBank(state, value) {
    const bank = validateMotifBank(value);
    const root = state.rootState ?? state;
    state = root.forSystem?.("MOTIF") ?? root;
    root.keyGroup = bank.keyGroup ?? defaultKeyGroup();
    state.motifs = bank.motifs;
    state.currentMotifId = bank.currentMotifId;
    state.nextMotifId = null;
    state.playheadPosition = 0;
    state.liveLengthCycle = null;
    if (root.modulation) {
        const m = root.forSystem("MODULATION"), saved = bank.modulation;
        m.motifs = saved?.motifs ?? Array.from({ length: 16 }, () => ({ events: Array.from({ length: 16 }, () => Array(32).fill(false)),
            voiceLengths: Array(16).fill(null), motifLength: null, attributes: {} }));
        m.currentMotifId = saved?.currentMotifId ?? 0;
        m.chain = saved?.chain ?? [];
        m.chainEnabled = saved?.chainEnabled ?? false;
        m.chainLoopMasterIndex = saved?.loopPoint ?? null;
        m.nextMotifId = null;
        m.playheadPosition = 0;
        m.liveLengthCycle = null;
        m.chainPlayingIndex = -1;
        m.chainPlayingDetached = true;
        m.chainFocus = false;
        root.modulationRequested = saved?.requested ?? false;
        root.modulationActive = root.modulationRequested;
        root.modulationChainMode = m.chainEnabled;
    }
}
