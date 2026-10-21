// Swing changes note placement only. Neither transport nor clock pulses are moved.
export function readSwing(state, voice, eventStep = null) {
    const base = state.forSystem("MOTIF"), mod = state.forSystem("MODULATION");
    const overlay = mod.getPlaybackMotifForVoice(voice), overlayStep = mod.getVoiceStep(voice);
    const overridden = state.modulationActive && overlay.attributes?.SWING?.[voice]?.[overlayStep] != null;
    const layer = overridden ? mod : base;
    const motif = overridden ? overlay : base.getPlaybackMotifForVoice(voice);
    const step = overridden ? overlayStep : eventStep ?? base.getVoiceStep(voice);
    const value = overridden ? overlay.attributes.SWING[voice][step] : motif.swings?.[voice]?.[step] ?? 50;
    const target = motif.atDestinations?.SWING?.[voice]?.[step] ?? "STEP";
    const affected = target === "STEP" || (target === "MOTIF" ? layer.playheadPosition : step) % 2 === 1;
    return { value, target, fraction: affected ? (value - 50) / 50 : 0 };
}

export function readRatchet(state, voice, eventStep = null) {
    const base = state.forSystem("MOTIF"), mod = state.forSystem("MODULATION");
    const overlay = mod.getPlaybackMotifForVoice(voice);
    const explicit = state.modulationActive ? overlay.attributes?.RATCHET?.[voice]?.[mod.getVoiceStep(voice)] : null;
    return explicit ?? base.getPlaybackMotifForVoice(voice).ratchets?.[voice]?.[eventStep ?? base.getVoiceStep(voice)] ?? 1;
}

export function ratchetPlan(duration, delay, count) {
    const interval = (duration - delay) / count;
    return { offsets: Array.from({ length: count }, (_, i) => delay + i * interval),
        interval, gate: count === 1 ? 50 : Math.min(50, interval / 2) };
}

export class SwingTiming {
    constructor(state, clock, { now = () => performance.now(), later = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id) } = {}) {
        Object.assign(this, { state, clock, now, later, cancel });
        this.pending = new Set();
        this.pulseTimes = [];
        this.duration = state.getStepDurationMs();
        this.stepStarted = now();
    }
    clear() {
        for (const id of this.pending) this.cancel(id);
        this.pending.clear();
    }
    reset() { this.clear(); this.pulseTimes = []; }
    observeMidiPulse() {
        const time = this.now();
        if (this.pulseTimes.length && time - this.pulseTimes.at(-1) > 500) this.pulseTimes = [];
        this.pulseTimes.push(time);
        if (this.pulseTimes.length > 25) this.pulseTimes.shift();
    }
    beginStep() {
        // Never replay a stale delayed onset at the next step or a Motif boundary.
        this.clear();
        this.stepStarted = this.now();
        this.duration = this.state.getStepDurationMs();
        if (this.clock.source === "MIDI" && this.pulseTimes.length > 1) {
            const interval = (this.pulseTimes.at(-1) - this.pulseTimes[0]) / (this.pulseTimes.length - 1);
            if (interval > 0) this.duration = interval * 96 / this.state.stepDivision;
        }
    }
    delayFor(voice) { return readSwing(this.state, voice).fraction * this.duration; }
    planFor(voice, preview = null, onset = null) {
        const plan = this.basePlanFor(voice, preview, onset);
        const settings = this.state.padConfiguration?.voices[voice];
        if (settings?.type === "KEY GROUP") {
            plan.gate = plan.interval * (settings.gate ?? 12.5) / 100;
        }
        return plan;
    }
    basePlanFor(voice, preview = null, onset = null) {
        if (preview) {
            const layer = this.state.forSystem(preview.system);
            const motif = layer.getMotif(preview.motifId).grooveMorph && preview.motifId === layer.playingMotifId
                ? layer.getOccurrenceMotif() : layer.getMotif(preview.motifId);
            return ratchetPlan(this.duration, 0, motif.ratchets?.[voice]?.[preview.step % 32] ?? 1);
        }
        if (onset) {
            const span = Math.min(onset.interval, 1 - onset.offset) * this.duration;
            const delay = readSwing(this.state, voice, onset.step).fraction * span;
            const plan = ratchetPlan(span, delay, readRatchet(this.state, voice, onset.step));
            return { ...plan, gate: Math.min(plan.gate, plan.interval / 2), offsets: plan.offsets.map(offset => onset.offset * this.duration + offset) };
        }
        return ratchetPlan(this.duration, this.delayFor(voice), readRatchet(this.state, voice));
    }
    applyFlamPlans(strikes) {
        const mod = this.state.forSystem("MODULATION"), base = this.state.forSystem("MOTIF"), groups = new Map();
        for (const strike of strikes) {
            const explicit = this.state.modulationActive ? mod.getPlaybackMotifForVoice(strike.voiceId).attributes?.FLAM?.[strike.voiceId]?.[mod.getVoiceStep(strike.voiceId)] : null;
            const value = explicit ?? base.getPlaybackMotifForVoice(strike.voiceId).flams?.[strike.voiceId]?.[strike.step ?? base.getVoiceStep(strike.voiceId)] ?? 0;
            if (value <= 0) continue;
            const key = Math.round(strike.plan.offsets[0] * 1e6);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ strike, value });
        }
        for (const group of groups.values()) {
            group.sort((a, b) => a.strike.voiceId - b.strike.voiceId);
            let total = 0;
            const delays = group.map(({ value }, index) => total += index ? value : 0);
            if (!total) continue;
            // Only delayed Voices constrain the spread. Use their actual remaining
            // room, keeping a small margin before cancellation at the boundary.
            const scale = Math.min(1, ...group.slice(1).map(({ strike }, index) => {
                const room = Math.max(0, strike.deadline - strike.plan.offsets.at(-1));
                const margin = Math.min(2, room / 2);
                return (room - margin) / delays[index + 1];
            }));
            group.forEach(({ strike }, index) => {
                const delay = delays[index] * scale;
                strike.plan.offsets = strike.plan.offsets.map(offset => offset + delay);
            });
        }
    }
    schedule(delay, emit, validUntil = this.duration, preview = false) {
        const revision = this.clock.transportRevision, source = this.clock.source;
        const deadline = this.stepStarted + validUntil;
        const id = this.later(() => {
            this.pending.delete(id);
            if ((preview ? this.state.transportState === "PLAY" : this.state.transportState !== "PLAY") || this.clock.transportRevision !== revision ||
                this.clock.source !== source || this.now() >= deadline) return;
            emit();
        }, Math.max(0, this.stepStarted + delay - this.now()));
        this.pending.add(id);
    }
}
