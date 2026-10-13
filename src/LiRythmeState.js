/*
LiRythme – Genesis

Global state of the LiRythme engine.

Hardware independent.

Author:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

===============================================================================
*/

import { PadConfiguration } from "./PadConfiguration.js";
import { composeGroove, defaultKeyGroup, readKeyCell, keyNote } from "./ATTransaction.mjs";

export class LiRythmeState {
    constructor({ system = "MOTIF" } = {}) {
        this.systemName = system;
        Object.defineProperty(this, "onBankChange", { value: null, writable: true });
        // Navigation is independent of the musical timeline and transport.
        this.currentView = "PLAY";
        this.transportState = "STOP";
        this.playheadPosition = 0;
        this.minimumTempo = 20;
        this.maximumTempo = 300;
        this.tempo = 120;
        this.stepDivision = 16;

        this.currentBook = "MOTIF";
        this.currentTimeline = "MOTIF";

        this.modulationActive = false;
        this.modulationChainMode = false;

        this.freezeMode = false;
        this.colorEnabled = false;
        this.keyGroup = defaultKeyGroup();
        this.atTransaction = null;
        this.lockMode = false;

        this.selectedInstrument = 12;
        this.visibleInstrumentFilter = new Set();
        this.filterMode = false;

        this.padConfiguration = new PadConfiguration();
        this.playingMotifId = 0;
        this.nextMotifId = null;
        // Phase A session-only occurrence list (IDs are references into motifs).
        this.chainEnabled = false;
        this.chain = [];
        this.chainPlayingIndex = -1;
        this.chainPlayingDetached = true;
        // Session-only occurrence reference, shifted by structural edits.
        this.chainLoopMasterIndex = null;
        this.chainFocus = false;
        this.viewMotifId = 0;
        this.chainViewIndex = -1;
        Object.defineProperty(this, "currentMotifId", {
            enumerable: true,
            get: () => this.chainFocus ? this.viewMotifId : this.playingMotifId,
            set: id => {
                if (id === this.currentMotifId) return;
                if (this.chainFocus) this.viewMotifId = id;
                else this.playingMotifId = id;
                this.onBankChange?.();
            }
        });
        this.motifs = Array.from({ length: 16 }, () => ({
            events: Array.from({ length: 16 }, () => new Array(32).fill(false)),
            motifLength: null,
            voiceLengths: new Array(16).fill(null)
        }));
        // Compatibility projections; the bank owns the musical data, not a copy.
        for (const [property, field] of Object.entries({
            motif: "events", motifLength: "motifLength", voiceLengths: "voiceLengths"
        })) {
            Object.defineProperty(this, property, {
                enumerable: true,
                get: () => this.getMotif(this.currentMotifId)[field],
                set: value => { this.getMotif(this.currentMotifId)[field] = value; }
            });
        }
        this.soloSelection = new Set();
        this.muteSelection = new Set();
        this.soloActive = false;
        this.muteActive = false;
        this.liveLengthCycle = null;
        if (system === "MODULATION") {
            for (const motif of this.motifs) motif.attributes = {};
        } else {
            // Both layers use this same bank, Chain and local-cycle implementation.
            // The facade shares transport/Voice/filter state and selects only musical data.
            this.modulationRequested = false;
            Object.defineProperty(this, "rootState", { value: this });
            Object.defineProperty(this, "modulation", { value: new LiRythmeState({ system: "MODULATION" }) });
            Object.defineProperty(this.modulation, "rootState", { value: this });
            const local = new Set(["systemName", "motifs", "motif", "motifLength", "voiceLengths", "currentMotifId",
                "playingMotifId", "nextMotifId", "playheadPosition", "liveLengthCycle", "chainEnabled", "chain",
                "chainPlayingIndex", "chainPlayingDetached", "chainLoopMasterIndex", "chainFocus", "viewMotifId", "chainViewIndex"]);
            for (const key of Object.keys(this)) if (!local.has(key)) Object.defineProperty(this.modulation, key, {
                enumerable: true, configurable: true, get: () => this[key], set: value => { this[key] = value; }
            });
            this.modulation.onBankChange = () => this.onBankChange?.();
            const methods = new Map();
            Object.defineProperty(this, "editingState", { value: new Proxy(this, {
                get: (root, key) => {
                    const descriptor = Object.getOwnPropertyDescriptor(root, key);
                    if (descriptor && !descriptor.configurable && !descriptor.writable && "value" in descriptor) return descriptor.value;
                    const layer = root.forSystem(root.currentTimeline), value = layer[key];
                    if (typeof value !== "function") return value;
                    const id = `${layer.systemName}:${String(key)}`;
                    if (methods.get(id)?.original !== value) methods.set(id, { original: value, bound: value.bind(layer) });
                    return methods.get(id).bound;
                },
                set: (root, key, value) => { root.forSystem(root.currentTimeline)[key] = value; return true; }
            }) });
        }
    }

    forSystem(name = "MOTIF") {
        const root = this.rootState ?? this;
        if (!["MOTIF", "MODULATION"].includes(name)) throw new Error("Unknown musical system");
        return name === "MOTIF" ? root : root.modulation;
    }

    getKeyGroupNote(voice, preview = null) {
        const root = this.rootState ?? this;
        const base = root.forSystem("MOTIF"), mod = root.forSystem("MODULATION");
        const cell = preview ? readKeyCell(preview.motif, voice, preview.step)
            : readKeyCell(base.getPlaybackMotifForVoice(voice), voice, base.getVoiceStep(voice));
        const overlay = !preview && root.modulationActive
            ? readKeyCell(mod.getPlaybackMotifForVoice(voice), voice, mod.getVoiceStep(voice)) : null;
        return keyNote(root.keyGroup, cell, overlay);
    }

    getPlayingEvent(voiceId, position = this.playheadPosition) {
        const motif = this.forSystem("MOTIF");
        const modulation = this.forSystem("MODULATION");
        const base = motif.getPlaybackMotifForVoice(voiceId), baseStep = motif.getVoiceStep(voiceId, position);
        const overlay = modulation.getPlaybackMotifForVoice(voiceId), overlayStep = modulation.getVoiceStep(voiceId);
        const active = this.modulationActive;
        if (!base.events[voiceId][baseStep]) return null;
        // Motif alone owns note onsets; Modulation overrides only matching Voice attributes.
        const attributes = active ? overlay.attributes : null;
        return {
            velocity: attributes?.VELOCITY?.[voiceId]?.[overlayStep] ?? base.velocities?.[voiceId]?.[baseStep] ?? 100,
            color: attributes?.COLOR?.[voiceId]?.[overlayStep] ?? base.colors?.[voiceId]?.[baseStep] ?? false
        };
    }

    getChainNextIndex() {
        if (!this.chain.length) return -1;
        if (!this.chainPlayingDetached && this.chainPlayingIndex === this.chainLoopMasterIndex) return 0;
        return (this.chainPlayingIndex + 1) % this.chain.length;
    }

    getMotif(id) {
        return Number.isInteger(id) && id >= 0 && id < this.motifs.length
            ? this.motifs[id] : null;
    }

    isVoiceAudible(voiceId) {
        return (!this.soloActive || this.soloSelection.has(voiceId)) &&
            (!this.muteActive || !this.muteSelection.has(voiceId));
    }

    getVoiceLength(voiceId, motifId = this.currentMotifId) {
        return this.getMotif(motifId).voiceLengths[voiceId] ?? 32;
    }

    getMotifDuration(motifId = this.currentMotifId) {
        const motif = this.getMotif(motifId);
        if (motif.motifLength !== null) return motif.motifLength;
        const lengths = motif.voiceLengths.filter(length => length !== null);
        if (lengths.length === 0) return 32;
        const gcd = (a, b) => {
            while (b !== 0) [a, b] = [b, a % b];
            return a;
        };
        // LCM(1..32) is below Number.MAX_SAFE_INTEGER; no truncation or cap.
        return lengths.reduce((a, b) => (a / gcd(a, b)) * b, 1);
    }

    getVoiceStep(voiceId, position = this.playheadPosition) {
        if (this.liveLengthCycle && position === this.playheadPosition) {
            return this.liveLengthCycle.steps[voiceId];
        }
        return position % this.getVoiceLength(voiceId, this.playingMotifId);
    }

    advanceLiveLengthCycle() {
        const cycle = this.liveLengthCycle;
        if (!cycle) {
            this.playheadPosition = (this.playheadPosition + 1) % this.getMotifDuration(this.playingMotifId);
            return;
        }
        this.playheadPosition++;
        if (this.playheadPosition >= cycle.duration) {
            this.playheadPosition = 0;
            // The global boundary still resets incomplete local cycles.
            this.liveLengthCycle = null;
            return;
        }
        for (let id = 0; id < 16; id++) {
            cycle.steps[id]++;
            if (cycle.steps[id] >= cycle.lengths[id]) {
                cycle.steps[id] = 0;
                if (!cycle.doubleMotif && (!cycle.untilEntry || cycle.doubleVoices?.has(id))) {
                    cycle.lengths[id] = this.getVoiceLength(id, this.playingMotifId);
                    cycle.doubleVoices?.delete(id);
                }
            }
        }
    }

    getPlaybackMotifForVoice(voiceId) {
        return this.liveLengthCycle?.doubleVoices?.get(voiceId) ?? this.getOccurrenceMotif();
    }

    getDisplayMotif(id) {
        return id === this.playingMotifId && this.getMotif(id)?.grooveMorph
            ? this.getOccurrenceMotif() : this.getMotif(id);
    }

    getOccurrenceMotif() {
        const recipe = this.getMotif(this.playingMotifId);
        if (!recipe.grooveMorph || !this.chainEnabled || this.chainPlayingDetached || this.chainPlayingIndex < 0) return recipe;
        const index = this.chainPlayingIndex, size = this.chain.length;
        if (this.groovePass && this.groovePass.index === index && this.groovePass.recipe === recipe &&
            this.transportState === "PLAY" && this.playheadPosition > 0) return this.groovePass.motif;
        // Resolve surrounding ordinary motifs without recursive Morph composition.
        const neighbor = direction => {
            for (let offset = 1; offset < size; offset++) {
                const i = direction > 0 && this.chainLoopMasterIndex === index ? (offset - 1) % size
                    : direction < 0 && index === 0 && this.chainLoopMasterIndex !== null
                        ? (this.chainLoopMasterIndex - offset + 1 + size) % size
                    : (index + direction * offset + size * 2) % size;
                const motif = this.getMotif(this.chain[i]);
                if (motif && !motif.grooveMorph) return motif;
            }
            return null;
        };
        const previous = neighbor(-1), next = neighbor(1);
        const key = JSON.stringify([index, previous, next, recipe]);
        // Source changes take effect on the next entry.
        if (this.groovePass?.key !== key) this.groovePass = { key, index, recipe,
            motif: composeGroove(previous, next, recipe) };
        return this.groovePass.motif;
    }

    // Snapshot only temporal playback; the bank remains immediately editable.
    deferDouble(voices, wholeMotif) {
        this.liveLengthCycle ??= {
            untilEntry: this.chainEnabled,
            duration: this.getMotifDuration(this.playingMotifId),
            lengths: Array.from({ length: 16 }, (_, id) => this.getVoiceLength(id, this.playingMotifId)),
            steps: Array.from({ length: 16 }, (_, id) => this.getVoiceStep(id))
        };
        const cycle = this.liveLengthCycle;
        cycle.doubleVoices ??= new Map();
        let snapshot;
        for (const id of wholeMotif ? Array.from({ length: 16 }, (_, id) => id) : voices) {
            if (!cycle.doubleVoices.has(id)) {
                snapshot ??= structuredClone(this.getOccurrenceMotif());
                cycle.doubleVoices.set(id, snapshot);
            }
        }
        cycle.doubleMotif ||= wholeMotif;
    }

    setTargetLength(length, { defer = false, target = this.selectedInstrument } = {}) {
        if (length !== null && (!Number.isInteger(length) || length < 1 || length > 32)) {
            return false;
        }
        const id = target;
        if (id !== null && (!Number.isInteger(id) || id < 0 || id >= 16)) return false;
        const previous = id === null ? this.motifLength : this.voiceLengths[id];
        if (previous === length) return false;
        const editingPlaying = this.currentMotifId === this.playingMotifId;
        defer = editingPlaying && (defer || this.chainEnabled && this.transportState === "PLAY");
        if (defer && !this.liveLengthCycle) {
            this.liveLengthCycle = {
                untilEntry: this.chainEnabled,
                duration: this.getMotifDuration(this.playingMotifId),
                lengths: Array.from({ length: 16 }, (_, voice) => this.getVoiceLength(voice, this.playingMotifId)),
                steps: Array.from({ length: 16 }, (_, voice) => this.getVoiceStep(voice))
            };
        }
        if (id === null) this.motifLength = length;
        else this.voiceLengths[id] = length;
        this.onBankChange?.();
        if (!defer && (!this.chainFocus || editingPlaying && this.transportState !== "PLAY")) {
            this.liveLengthCycle = null;
            this.playheadPosition = 0;
        }
        return true;
    }

    getStepDurationMs() {
        const beatDuration = 60000 / this.tempo;

        return beatDuration * (4 / this.stepDivision);
    }

    setTempo(tempo) {
        const nextTempo = Number(tempo);

        if (!Number.isFinite(nextTempo)) {
            return this.tempo;
        }

        this.tempo = Math.min(
            this.maximumTempo,
            Math.max(this.minimumTempo, nextTempo)
        );

        return this.tempo;
    }
}
