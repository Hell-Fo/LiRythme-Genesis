export const CYCLE_VALUES = Object.freeze([8, 7, 6, 5, 4, 3, 2, 1]);
const validValue = value => value === null || CYCLE_VALUES.includes(value);
export const cycleRows = () => Array.from({ length: 16 }, () => Array(32).fill(null));
export const createCycles = () => ({ motif: null, voices: Array(16).fill(null), steps: cycleRows() });
export const validCycleRow = row => Array.isArray(row) && row.length === 32 && row.every(validValue);
export const validCycles = value => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 3 && validValue(value.motif) &&
    Array.isArray(value.voices) && value.voices.length === 16 && value.voices.every(validValue) &&
    Array.isArray(value.steps) && value.steps.length === 16 && value.steps.every(validCycleRow);
export const validVoiceCycle = value => value && Object.keys(value).length === 2 && validValue(value.voice) && validCycleRow(value.steps);
export function readCycle(motif, voice, step) {
    const cycle = motif.cycles;
    if (cycle?.steps[voice][step] != null) return { value: cycle.steps[voice][step], scope: 'STEP' };
    if (cycle?.voices[voice] != null) return { value: cycle.voices[voice], scope: 'INSTRUMENT' };
    return cycle?.motif != null ? { value: cycle.motif, scope: 'MOTIF' } : null;
}
export const hasCycles = motif => Boolean(motif.cycles && (motif.cycles.motif !== null ||
    motif.cycles.voices.some(value => value !== null) || motif.cycles.steps.some(row => row.some(value => value !== null))));
export const cycleDefinition = Object.freeze({
    id: 'CYCLE', values: CYCLE_VALUES, hasData: hasCycles,
    read: (motif, voice, step) => readCycle(motif, voice, step)?.value ?? 1,
    isAssigned: (motif, voice, step) => readCycle(motif, voice, step) !== null,
    destination: (motif, voice, step) => readCycle(motif, voice, step)?.scope,
    capture: motif => structuredClone(motif.cycles),
    restore(motif, snapshot) {
        if (snapshot === undefined) delete motif.cycles;
        else motif.cycles = structuredClone(snapshot);
    },
    apply(motif, target, value, scope = target) {
        const { instruments, steps } = scope;
        const cycle = motif.cycles ??= createCycles();
        if (steps.size) {
            for (let voice = 0; voice < 16; voice++) if (!instruments.size || instruments.has(voice))
                for (const step of steps) cycle.steps[voice][step] = value;
        } else if (instruments.size) for (const voice of instruments) cycle.voices[voice] = value;
        else cycle.motif = value;
        return true;
    }
});
