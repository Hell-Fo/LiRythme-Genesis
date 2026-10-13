import { SCALES, defaultKeyGroup, validKeySettings, scaleLoadWarning } from "./KeyGroup.mjs";

export function initializeKeyGroupSettings(state, document) {
    const root = document.getElementById("key-root"), scale = document.getElementById("key-scale");
    if (!root || !scale) return () => {};
    state.keyGroup ??= defaultKeyGroup();
    scale.replaceChildren();
    const add = (name, label = name) => {
        const option = document.createElement("option");
        option.value = name; option.textContent = label; scale.appendChild(option);
    };
    for (const name of Object.keys(SCALES)) add(name);
    if (!Object.hasOwn(SCALES, state.keyGroup.scale)) add(state.keyGroup.scale, `${state.keyGroup.scale} — absente`);
    const status = document.getElementById("key-status");
    if (status) status.textContent = scaleLoadWarning || "Gammes : assets/scales.json. Relancer LiRythme après modification.";
    const refresh = () => {
        root.disabled = scale.disabled = Boolean(state.atTransaction);
        if (document.activeElement !== root) root.value = String(state.keyGroup.root);
        if (document.activeElement !== scale) scale.value = state.keyGroup.scale;
    };
    const apply = () => {
        const next = { root: root.valueAsNumber, scale: scale.value };
        const valid = !state.atTransaction && validKeySettings(next) && Object.hasOwn(SCALES, next.scale);
        if (valid) { state.keyGroup = next; state.onBankChange?.(); }
        else { root.value = String(state.keyGroup.root); scale.value = state.keyGroup.scale; }
        if (status) status.textContent = valid ? "Actif au prochain événement Key Group."
            : "Root MIDI : 0 à 127 ; gamme valide requise. Terminez l’édition A/T avant de changer la tonalité.";
        refresh();
    };
    root.addEventListener("change", apply); scale.addEventListener("change", apply);
    refresh();
    return refresh;
}
