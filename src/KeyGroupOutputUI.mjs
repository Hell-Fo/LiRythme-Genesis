export function initializeKeyGroupOutput({ state, midiManager, document, storage }) {
    const select = document.getElementById("key-group-output");
    const status = document.getElementById("key-group-output-status");
    const saved = storage.getItem("keyGroupMidiOutput") || "";
    const add = (value, label) => {
        const option = document.createElement("option");
        option.value = value; option.textContent = label; select.appendChild(option);
    };
    select.replaceChildren();
    add("", "Default MIDI Output");
    for (const name of midiManager.outputs.keys()) add(name, name);
    if (saved && !midiManager.findOutput(saved)) add(saved, `${saved} — absent`);
    select.value = saved;
    const apply = () => {
        state.keyGroupOutputName = select.value || null;
        if (status) status.textContent = state.keyGroupOutputName && !midiManager.findOutput(state.keyGroupOutputName)
            ? "Port absent : les Voices Key Group restent silencieuses."
            : "Sortie des Voices Key Group uniquement ; CLOCK conserve sa sortie.";
    };
    apply();
    select.addEventListener("change", () => { storage.setItem("keyGroupMidiOutput", select.value); apply(); });
}
