import { activateConfiguration, serializeConfiguration, voiceKey } from "./PadConfigurationFile.mjs";
export { initializeKeyGroupSettings } from "./KeyGroupUI.mjs";

// The editor builds a candidate; Phase B validates the entire configuration before activation.
// No filesystem, transport commands, Motif mutations or parallel validation rules here.
export function editPadVoice(state, id, field, value) {
    voiceKey(id); // Validate the canonical address before indexing.
    if (!["STOP", "PAUSE"].includes(state.transportState)) throw new Error("Édition refusée pendant PLAY. Passez en STOP ou PAUSE.");
    if (!["name", "type", "channel", "note", "colorNote", "source", "audioOutput"].includes(field)) throw new Error("Paramètre non éditable.");
    const current = state.padConfiguration.voices[id];
    let voice = { ...current, [field]: value };
    if (field === "audioOutput") { delete voice.audioOutput; voice.output = value; }
    if (field === "colorNote" && value === null) delete voice.colorNote;
    if (field === "type" && value !== current.type) {
        if (value === "NONE") voice = { id, name: current.name, type: "NONE" };
        if (value === "AUDIO") voice = { id, name: current.name, type: "AUDIO", output: "LEFT", source: "" };
        if (value === "KEY GROUP") voice = { id, name: current.name, type: "KEY GROUP", output: { mode: "DEFAULT" }, channel: 1 };
        if (value === "MIDI DRUM") voice = { id, name: current.name, type: "MIDI DRUM", output: { mode: "DEFAULT" }, channel: 10, note: 36 };
    }
    const voices = state.padConfiguration.voices.map((existing, index) => index === id ? voice : existing);
    return activateConfiguration(state, serializeConfiguration({ ...state.padConfiguration, voices }));
}
