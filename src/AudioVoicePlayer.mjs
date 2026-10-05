export class AudioVoicePlayer {
    constructor({ files, createContext = () => new AudioContext({ latencyHint: "interactive" }) }) {
        this.files = files;
        this.createContext = createContext;
        this.samples = new Map();
        this.active = new Set();
    }
    context() { return this.ctx ??= this.createContext(); }
    async load(path) {
        if (!path || this.samples.has(path)) return;
        const entry = { status: "Chargement…" };
        this.samples.set(path, entry);
        try {
            const result = await this.files.read(path);
            if (result.error) throw new Error(result.error);
            const ctx = this.context();
            const bytes = new Uint8Array(result.bytes);
            const decoded = await ctx.decodeAudioData(bytes.buffer);
            const mono = ctx.createBuffer(1, decoded.length, decoded.sampleRate);
            const data = mono.getChannelData(0);
            for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
                const input = decoded.getChannelData(channel);
                for (let i = 0; i < data.length; i++) data[i] += input[i] / decoded.numberOfChannels;
            }
            entry.buffer = decoded;
            entry.monoBuffer = mono;
            await this.resume();
            entry.status = "Prêt — sortie audio système";
        } catch (error) { entry.status = `Audio indisponible : ${error.message}`; }
    }
    sync(voices) {
        const paths = new Set(voices.filter(v => v.type === "AUDIO" && v.source).map(v => v.source));
        for (const path of this.samples.keys()) if (!paths.has(path)) this.samples.delete(path);
        for (const path of paths) void this.load(path);
    }
    status(path) {
        if (!path) return "Choisissez un fichier WAV.";
        const entry = this.samples.get(path);
        if (entry?.buffer && this.ctx?.state === "suspended") return "Cliquez dans l’application pour activer l’audio.";
        return entry?.status ?? "Chargement…";
    }
    async resume() { if (this.ctx?.state === "suspended") await this.ctx.resume(); }
    trigger(voice, velocity = 100) {
        const sample = this.samples.get(voice.source);
        const stereo = voice.output === "STEREO";
        const buffer = stereo ? sample?.buffer : sample?.monoBuffer;
        if (!buffer || this.ctx?.state !== "running" || !["LEFT", "RIGHT", "STEREO"].includes(voice.output)) return false;
        const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
        const merger = stereo ? null : this.ctx.createChannelMerger(2);
        source.buffer = buffer;
        gain.gain.value = Math.max(0, Math.min(127, velocity)) / 127;
        source.connect(gain);
        if (stereo) {
            // Speaker upmix duplicates a mono source on L/R and preserves stereo channels.
            gain.channelCount = 2;
            gain.channelCountMode = "explicit";
            gain.channelInterpretation = "speakers";
            gain.connect(this.ctx.destination);
        } else {
            gain.connect(merger, 0, voice.output === "LEFT" ? 0 : 1);
            merger.connect(this.ctx.destination);
        }
        source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); merger?.disconnect(); };
        this.active.add(source);
        source.start();
        return true;
    }
    stop() { for (const source of this.active) source.stop(); this.active.clear(); }
}
