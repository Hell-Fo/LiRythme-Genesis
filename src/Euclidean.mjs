import { readPlayMode, traversalPeriod, traversalStep } from "./PlayMode.mjs";
export const EUCLIDEAN_SLOT = 9;
export const validEuclideanVoice = v => v && Number.isInteger(v.resolution) && v.resolution >= 1 && v.resolution <= 32 &&
    Number.isInteger(v.hits) && v.hits >= 0 && v.hits <= v.resolution && ["POLYMETRIC", "POLYRHYTHMIC"].includes(v.mode);
export const validEuclidean = rows => Array.isArray(rows) && rows.length === 16 &&
    rows.every(v => v === null || validEuclideanVoice(v));

// Start on position zero; successive gaps differ by at most one position.
export function euclideanPattern(resolution, hits) {
    if (!validEuclideanVoice({ resolution, hits, mode: "POLYMETRIC" })) throw new Error("Invalid Euclidean rhythm");
    return Array.from({ length: 32 }, (_, step) => step < resolution && hits > 0 && (step * hits) % resolution < hits);
}

// Integer comparisons keep boundary hits out of both adjacent clock intervals.
// Offsets and cell duration are expressed in clock steps, never rounded to pads.
export function euclideanOnsets(motif, voice, position, duration) {
    const settings = motif.euclidean?.[voice];
    if (settings?.mode !== "POLYRHYTHMIC") return null;
    const resolution = motif.voiceLengths[voice] ?? settings.resolution;
    const phase = position % duration;
    const mode = readPlayMode(motif, voice), period = traversalPeriod(resolution, mode);
    const onsets = [];
    for (let tick = 0; tick < period; tick++) {
        const step = traversalStep(tick, resolution, mode), numerator = tick * duration;
        if (motif.events[voice][step] && numerator >= phase * period && numerator < (phase + 1) * period)
            onsets.push({ step, offset: numerator / period - phase, interval: duration / period });
    }
    return onsets;
}

export const euclideanDefinition = Object.freeze({ id: "EUCLIDEAN", values: Object.freeze(["POLYMETRIC", "POLYRHYTHMIC"]),
    capture: motif => Object.fromEntries(["events", "voiceLengths", "motifLength", "euclidean"]
        .map(key => [key, structuredClone(motif[key])])),
    restore(motif, snapshot) {
        for (const [key, value] of Object.entries(snapshot)) {
            if (value === undefined) delete motif[key];
            else motif[key] = structuredClone(value);
        }
    }
});
