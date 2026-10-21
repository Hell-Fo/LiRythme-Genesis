// A–H describe methods, not an intensity scale. Each result derives from BEGIN.
export const MUTATION_METHODS = Object.freeze([
    "COMBINAISON", "EUCLIDIEN", "DENSIFICATION", "ALLEGEMENT",
    "REDISTRIBUTION", "PERMUTATION", "SYNCOPE", "DEPLACEMENT"
]);

export function mutateMotif(source, index) {
    if (!Number.isInteger(index) || index < 0 || index > 7 || source.attributes !== undefined) return null;
    const motif = structuredClone(source);
    const limit = voice => Math.min(source.voiceLengths[voice] ?? 32, source.motifLength ?? 32);
    const matrices = Object.keys(motif).filter(key => Array.isArray(motif[key]) &&
        motif[key].length === 16 && motif[key].every(row => Array.isArray(row) && row.length === 32));
    const defaults = key => key === "events" || key === "colors" ? false : key === "velocities" ? 100 : null;
    const positions = voice => Array.from({ length: limit(voice) }, (_, step) => step).filter(step => motif.events[voice][step]);
    const read = (voice, step) => ({
        cycle: motif.cycles?.steps[voice][step] ?? null,
        fields: Object.fromEntries(matrices.map(key => [key, structuredClone(motif[key][voice][step])])),
        destinations: Object.fromEntries(Object.entries(motif.atDestinations ?? {}).map(([key, rows]) => [key, rows[voice][step]]))
    });
    const write = (voice, step, cell) => {
        if (motif.cycles) motif.cycles.steps[voice][step] = cell?.cycle ?? null;
        for (const key of matrices) motif[key][voice][step] = cell ? structuredClone(cell.fields[key]) : defaults(key);
        for (const [key, rows] of Object.entries(motif.atDestinations ?? {})) rows[voice][step] = cell?.destinations[key] ?? null;
    };
    const move = (voice, from, to) => {
        if (to < 0 || to >= limit(voice) || motif.events[voice][to]) return false;
        const cell = read(voice, from); write(voice, from, null); write(voice, to, cell); return true;
    };
    // Preserve the strongest onset (earliest on ties) as a simple audible anchor.
    const anchor = voice => positions(voice).reduce((best, step) => best === null ||
        (motif.velocities?.[voice][step] ?? 100) > (motif.velocities?.[voice][best] ?? 100) ? step : best, null);
    const local = syncopate => {
        for (let voice = 0; voice < 16; voice++) {
            const fixed = anchor(voice);
            for (const [n, step] of positions(voice).entries()) {
                if (step === fixed) continue;
                if (syncopate) { if (step % 2 === 0) move(voice, step, step + 1); }
                else if (n % 2 === 1) { if (!move(voice, step, step + 1)) move(voice, step, step - 1); }
            }
        }
    };
    const permute = () => {
        for (let voice = 0; voice < 16; voice++) {
            const fixed = anchor(voice), length = limit(voice);
            // Exchange equal fragments after the first step; leave odd remainders intact.
            const half = Math.floor((length - 1) / 2);
            for (let step = 1; step <= half; step++) {
                const other = step + half;
                if (step === fixed || other === fixed) continue;
                const a = read(voice, step), b = read(voice, other);
                write(voice, step, b); write(voice, other, a);
            }
        }
    };
    const densify = () => {
        for (let voice = 0; voice < 16; voice++) {
            const steps = positions(voice); let budget = Math.ceil(steps.length / 2);
            for (const step of steps) {
                if (!budget) break;
                const to = step + 1;
                if (to < limit(voice) && !motif.events[voice][to]) { write(voice, to, read(voice, step)); budget--; }
            }
        }
    };
    if (index === 7) local(false);
    if (index === 6) local(true);
    if (index === 5) permute();
    if (index === 4) {
        const voices = Array.from({ length: 16 }, (_, voice) => voice).filter(voice => positions(voice).length);
        const moves = [];
        for (const [i, voice] of voices.entries()) {
            const to = voices[(i + 1) % voices.length], fixed = anchor(voice);
            const step = positions(voice).find(step => step !== fixed && step < limit(to) && !motif.events[to][step]);
            if (step !== undefined) moves.push({ voice, to, step, cell: read(voice, step) });
        }
        for (const { voice, step } of moves) write(voice, step, null);
        for (const { to, step, cell } of moves) write(to, step, cell);
    }
    if (index === 3) for (let voice = 0; voice < 16; voice++) {
        const fixed = anchor(voice);
        positions(voice).filter(step => step !== fixed).forEach((step, n) => { if (n % 2 === 0) write(voice, step, null); });
    }
    if (index === 2) densify();
    if (index === 1) for (let voice = 0; voice < 16; voice++) {
        const steps = positions(voice), length = limit(voice), fixed = anchor(voice);
        if (!steps.length) continue;
        const ordered = [...steps.filter(step => step >= fixed), ...steps.filter(step => step < fixed)];
        const cells = ordered.map(step => read(voice, step));
        for (const step of steps) write(voice, step, null);
        cells.forEach((cell, n) => write(voice, (fixed + Math.floor(n * length / cells.length)) % length, cell));
    }
    if (index === 0) { permute(); local(true); densify(); }
    return motif;
}
