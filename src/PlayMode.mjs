export const PLAY_MODES = Object.freeze(["FORWARD", "PING_PONG", "BACKWARD"]);
export const validPlayModes = value => value && typeof value === "object" &&
    PLAY_MODES.includes(value.motif) && Array.isArray(value.voices) && value.voices.length === 16 &&
    value.voices.every(mode => mode === null || PLAY_MODES.includes(mode));
export const readPlayMode = (motif, voice = null) =>
    (voice === null ? null : motif.playModes?.voices[voice]) ?? motif.playModes?.motif ?? "FORWARD";
export const traversalPeriod = (length, mode) => mode === "PING_PONG" ? Math.max(1, 2 * (length - 1)) : length;
export function traversalStep(position, length, mode) {
    const period = traversalPeriod(length, mode);
    const phase = ((position % period) + period) % period;
    if (mode === "BACKWARD") return length - 1 - phase;
    return phase < length ? phase : period - phase;
}
export const playModeDefinition = Object.freeze({
    id: "PLAY_MODE", values: PLAY_MODES,
    capture: motif => structuredClone(motif.playModes),
    restore(motif, snapshot) {
        if (snapshot === undefined) delete motif.playModes;
        else motif.playModes = structuredClone(snapshot);
    },
    read: readPlayMode,
    isAssigned: (motif, voice) => Boolean(motif.playModes),
    destination: (motif, voice) => motif.playModes?.voices[voice] != null ? "INSTRUMENT" : "MOTIF",
    apply(motif, { instruments, steps }, value) {
        if (steps.size || !PLAY_MODES.includes(value)) return false;
        const modes = motif.playModes ??= { motif: "FORWARD", voices: Array(16).fill(null) };
        if (instruments.size) for (const voice of instruments) modes.voices[voice] = value;
        else { modes.motif = value; modes.voices.fill(null); }
        return true;
    }
});
