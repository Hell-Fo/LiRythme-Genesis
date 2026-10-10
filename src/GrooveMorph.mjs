import { mutateMotif } from "./Mutation.mjs";

export const GROOVE_METHODS = Object.freeze([
    "LIAISON DOUCE", "DEPLACEMENT", "SYNCOPE", "ALLEGEMENT",
    "REDISTRIBUTION", "PERMUTATION / EUCLIDIEN", "DENSIFICATION", "FILL"
]);
export const validGrooveMorph = value => value && Object.keys(value).length === 1 &&
    Number.isInteger(value.level) && value.level >= 0 && value.level < 8;

// Deterministic composition: no transport time or random input affects a recipe.
export function composeGroove(previous, next, recipe) {
    const result = structuredClone(recipe);
    delete result.grooveMorph;
    const length = recipe.motifLength ?? 32, level = recipe.grooveMorph.level;
    const fields = { events: false, velocities: 100, colors: false, swings: null, ratchets: null };
    for (const [field, value] of Object.entries(fields)) result[field] =
        Array.from({ length: 16 }, () => Array(32).fill(value));
    delete result.atDestinations;
    const destinations = [...new Set([...Object.keys(previous?.atDestinations ?? {}), ...Object.keys(next?.atDestinations ?? {})])];
    if (destinations.length) result.atDestinations = Object.fromEntries(destinations.map(key =>
        [key, Array.from({ length: 16 }, () => Array(32).fill(null))]));
    const read = (motif, field, voice, step) => motif?.[field]?.[voice]?.[
        step % Math.min(motif.voiceLengths[voice] ?? 32, motif.motifLength ?? 32)] ?? fields[field];
    for (let voice = 0; voice < 16; voice++) for (let step = 0; step < Math.min(length, recipe.voiceLengths[voice] ?? 32); step++) {
        const progress = length === 1 ? 1 : step / (length - 1);
        const a = read(previous, "events", voice, step), b = read(next, "events", voice, step);
        // A fixed, distributed threshold gradually transfers differing onsets.
        const threshold = ((voice * 7 + step * 11) % 31 + 1) / 32;
        const source = progress >= threshold ? next : previous;
        result.events[voice][step] = a && b || read(source, "events", voice, step);
        for (const field of Object.keys(fields).filter(key => key !== "events")) {
            result[field][voice][step] = read(source, field, voice, step);
        }
        for (const key of destinations) result.atDestinations[key][voice][step] = source?.atDestinations?.[key]?.[voice]?.[
            step % Math.min(source.voiceLengths[voice] ?? 32, source.motifLength ?? 32)] ?? null;
        result.velocities[voice][step] = Math.round(
            read(previous, "velocities", voice, step) * (1 - progress) + read(next, "velocities", voice, step) * progress);
    }
    const method = [null, 7, 6, 3, 4, 5, 2, 0][level];
    const changed = method === null ? result : mutateMotif(level === 5 ? mutateMotif(result, 1) : result, method);
    // Shared onsets and the first/last steps remain reliable musical landmarks.
    for (let voice = 0; voice < 16; voice++) for (let step = 0; step < Math.min(length, recipe.voiceLengths[voice] ?? 32); step++) {
        const common = read(previous, "events", voice, step) && read(next, "events", voice, step);
        const edge = step === 0 || step === Math.min(length, recipe.voiceLengths[voice] ?? 32) - 1;
        if (common || edge) for (const field of Object.keys(fields)) changed[field][voice][step] = result[field][voice][step];
        if (common || edge) for (const key of destinations) changed.atDestinations[key][voice][step] = result.atDestinations[key][voice][step];
        if (level >= 6 && changed.events[voice][step] && !common && !edge && step >= length * 0.65)
            changed.ratchets[voice][step] = level === 7 ? 3 : 2;
    }
    // Even identical or fully occupied phrases receive an audible, stable variation.
    const candidates = changed.events.flatMap((row, voice) => row.slice(0, Math.min(length, recipe.voiceLengths[voice] ?? 32))
        .flatMap((on, step) => on ? [{ voice, step }] : []));
    const target = candidates.find(({ step }) => step > 0 && step < length - 1) ?? candidates[0];
    if (target) {
        const { voice, step } = target, velocity = changed.velocities[voice][step];
        changed.velocities[voice][step] = velocity > 16 ? Math.max(1, velocity - 3 - level * 2) : velocity + 3 + level * 2;
    }
    return changed;
}
