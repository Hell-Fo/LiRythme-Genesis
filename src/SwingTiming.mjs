// Swing changes note placement only. Neither transport nor clock pulses are moved.
export function readSwing(state, voice) {
    const base = state.forSystem("MOTIF"), mod = state.forSystem("MODULATION");
    const overlay = mod.getPlaybackMotifForVoice(voice), overlayStep = mod.getVoiceStep(voice);
    const overridden = state.modulationActive && overlay.attributes?.SWING?.[voice]?.[overlayStep] != null;
    const layer = overridden ? mod : base;
    const motif = overridden ? overlay : base.getPlaybackMotifForVoice(voice);
    const step = overridden ? overlayStep : base.getVoiceStep(voice);
    const value = overridden ? overlay.attributes.SWING[voice][step] : motif.swings?.[voice]?.[step] ?? 50;
    const target = motif.atDestinations?.SWING?.[voice]?.[step] ?? "STEP";
    const affected = target === "STEP" || (target === "MOTIF" ? layer.playheadPosition : step) % 2 === 1;
    return { value, target, fraction: affected ? (value - 50) / 50 : 0 };
}

export function readRatchet(state, voice) {
    const base = state.forSystem("MOTIF"), mod = state.forSystem("MODULATION");
    const overlay = mod.getPlaybackMotifForVoice(voice);
    const explicit = state.modulationActive ? overlay.attributes?.RATCHET?.[voice]?.[mod.getVoiceStep(voice)] : null;
    return explicit ?? base.getPlaybackMotifForVoice(voice).ratchets?.[voice]?.[base.getVoiceStep(voice)] ?? 1;
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
    planFor(voice, preview = null) {
        if (preview) {
            const motif = this.state.forSystem(preview.system).getMotif(preview.motifId);
            return ratchetPlan(this.duration, 0, motif.ratchets?.[voice]?.[preview.step % 32] ?? 1);
        }
        return ratchetPlan(this.duration, this.delayFor(voice), readRatchet(this.state, voice));
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
