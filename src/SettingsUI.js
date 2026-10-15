import { initializePadLibraryUI } from "./PadLibraryUI.js";
import { editPadVoice, initializeKeyGroupSettings } from "./PadVoiceEditor.mjs";

// UI state is intentionally independent of the musical selection and transport.
export function initializeSettingsUI({ state, clock, actions, audioPlayer }) {
    const get = id => document.getElementById(id);
    const refreshKeyGroup = initializeKeyGroupSettings(state, document);
    const projectName = get("project-name");
    const projectDescription = get("project-description");
    projectDescription.addEventListener("input", () => {
        if (!state.projectBook) return;
        state.projectBook.slots[state.projectBook.active].description = projectDescription.value.slice(0, 2000);
        state.onBankChange?.();
    });
    projectName.addEventListener("change", () => {
        const name = projectName.value.trim().slice(0, 80);
        if (name) { state.projectBook.slots[state.projectBook.active].name = name; state.onBankChange?.(); }
    });
    const settingsPage = get("settings-page");
    const playPage = get("play-page");
    const helpPanel = get("help-panel");
    const helpStartup = get("help-startup");
    const tempo = get("settings-tempo");
    const colorEnabled = get("color-enabled");
    state.colorEnabled = localStorage.getItem("colorEnabled") === "true";
    colorEnabled.checked = state.colorEnabled;
    colorEnabled.addEventListener("change", () => {
        actions.at.setColorEnabled(colorEnabled.checked);
        localStorage.setItem("colorEnabled", String(colorEnabled.checked));
    });
    const output = get("midi-output");
    let page = "SETTINGS";
    let manualNavigation = false;
    let initialSoundCheckApplied = false;
    let selectedVoice = 0;
    const libraryUI = initializePadLibraryUI({ state, onActivated: () => {
        audioPlayer?.stop();
        audioPlayer?.sync(state.padConfiguration.voices);
        setText("voice-error", "");
        renderVoice(true);
    }, onBusyChanged: () => renderVoice() });
    const helpAtStartup = localStorage.getItem("helpStartup") === "true";
    helpStartup.checked = helpAtStartup;

    function renderHelp() {
        helpPanel.hidden = page !== "HELP";
        get("toggle-help").setAttribute("aria-pressed", String(page === "HELP"));
    }

    function showPage(nextPage, manual = false) {
        if (manual) manualNavigation = true;
        page = nextPage;
        settingsPage.hidden = page !== "SETTINGS";
        playPage.hidden = page !== "PLAY";
        get("show-settings").setAttribute("aria-pressed", String(page === "SETTINGS"));
        get("show-play").setAttribute("aria-pressed", String(page === "PLAY"));
        renderHelp();
        refresh();
    }

    function toggleHelp() {
        showPage("HELP", true);
    }

    get("show-settings").addEventListener("click", () => showPage("SETTINGS", true));
    get("show-play").addEventListener("click", () => showPage("PLAY", true));
    get("toggle-help").addEventListener("click", toggleHelp);
    helpStartup.addEventListener("change", () => {
        localStorage.setItem("helpStartup", String(helpStartup.checked));
    });
    document.addEventListener("keydown", event => {
        if (event.defaultPrevented || event.repeat || event.isComposing ||
            event.ctrlKey || event.altKey || event.metaKey) return;
        const target = event.target;
        if (target instanceof Element &&
            (target.closest("input, textarea, select") || target.isContentEditable ||
             target.closest('[role="textbox"], [role="spinbutton"]'))) return;
        const key = event.key.toLowerCase();
        if (!["s", "p", "h"].includes(key)) return;
        event.preventDefault();
        if (key === "h") toggleHelp();
        else showPage(key === "s" ? "SETTINGS" : "PLAY", true);
    });

    for (let i = 0; i < 16; i++) {
        const project = document.createElement("button");
        project.type = "button";
        project.textContent = `PROJECT ${String(i + 1).padStart(2, "0")}`;
        project.addEventListener("click", () => { if (!state.atTransaction) state.projects.select(i); });
        get("project-slots").appendChild(project);

        const voice = document.createElement("button");
        voice.type = "button";
        voice.textContent = state.padConfiguration.voices[i].name || String(i + 1).padStart(2, "0");
        voice.setAttribute("aria-pressed", String(i === selectedVoice));
        voice.addEventListener("click", () => {
            selectedVoice = i;
            for (const [index, button] of [...get("voice-slots").children].entries()) {
                button.setAttribute("aria-pressed", String(index === selectedVoice));
            }
            setText("voice-error", "");
            renderVoice(true);
        });
        get("voice-slots").appendChild(voice);
    }

    function setText(id, value) {
        if (get(id).textContent !== value) get(id).textContent = value;
    }
    function renderVoice(force = false) {
        for (const [id, button] of [...get("voice-slots").children].entries()) {
            const slot = state.padConfiguration.voices[id];
            const label = slot.name || String(id + 1).padStart(2, "0");
            if (button.textContent !== label) button.textContent = label;
        }
        const voice = state.padConfiguration.voices[selectedVoice];
        setText("voice-editor-title", `VOICE ${String(selectedVoice + 1).padStart(2, "0")}`);
        const locked = libraryUI.busy || (!libraryUI.hasActivePreset && !state.projectBook) || !["STOP", "PAUSE"].includes(state.transportState);
        for (const field of ["name", "type", "channel", "note", "colorNote"]) {
            const input = get(`voice-${field}`);
            input.disabled = locked;
            if (force || locked || document.activeElement !== input) input.value = String(voice[field] ?? "");
        }
        get("voice-midi-fields").hidden = !["MIDI DRUM", "KEY GROUP"].includes(voice.type);
        if (get("voice-fixed-note-field")) get("voice-fixed-note-field").hidden = voice.type === "KEY GROUP";
        if (get("voice-color-field")) get("voice-color-field").hidden = voice.type === "KEY GROUP";
        if (get("voice-color-help")) get("voice-color-help").hidden = voice.type === "KEY GROUP";
        if (get("voice-audio-fields")) {
            get("voice-audio-fields").hidden = voice.type !== "AUDIO";
            get("voice-audioOutput").disabled = locked;
            get("voice-audioOutput").value = voice.type === "AUDIO" ? voice.output : "LEFT";
            get("voice-source").value = voice.source ?? "";
            get("voice-browse").disabled = locked;
            setText("voice-audio-status", audioPlayer?.status(voice.source) ?? "");
        }
        const destination = output.options[output.selectedIndex]?.textContent;
        setText("voice-output-status", `Default MIDI Output : ${destination || "aucune sortie disponible"}`);
        setText("voice-editor-status", state.transportState === "PLAY"
            ? "Édition verrouillée pendant PLAY. Passez en STOP ou PAUSE."
            : libraryUI.busy ? "Opération de bibliothèque en cours…"
                : !libraryUI.hasActivePreset ? "Chargez ou créez un preset pour activer l’éditeur."
                    : "Les changements sont actifs en mémoire. SAVE les sauvegarde dans le preset.");
    }

    function applyVoiceEdit(field) {
        const input = get(`voice-${field}`);
        let rejected = false;
        try {
            if (libraryUI.busy || !libraryUI.hasActivePreset) throw new Error("Édition indisponible pendant une opération de bibliothèque ou sans preset actif.");
            const value = field === "colorNote" && input.value === "" ? null
                : ["channel", "note", "colorNote"].includes(field) ? input.valueAsNumber : input.value;
            editPadVoice(state, selectedVoice, field, value);
            audioPlayer?.stop();
            audioPlayer?.sync(state.padConfiguration.voices);
            setText("voice-error", "");
        } catch (error) { rejected = true; setText("voice-error", error.message); }
        renderVoice(rejected || field !== "name");
        libraryUI.refresh();
    }
    get("voice-name").addEventListener("input", () => applyVoiceEdit("name"));
    get("voice-audioOutput")?.addEventListener("change", () => applyVoiceEdit("audioOutput"));
    get("voice-browse")?.addEventListener("click", async () => {
        const id = selectedVoice, configuration = state.padConfiguration;
        try {
            if (libraryUI.busy || !libraryUI.hasActivePreset || !["STOP", "PAUSE"].includes(state.transportState)) return;
            const result = await window.audioSampleFiles.pick();
            if (result.error) throw new Error(result.error);
            if (result.canceled || state.padConfiguration !== configuration || selectedVoice !== id) return;
            editPadVoice(state, id, "source", result.path);
            audioPlayer?.samples.delete(result.path);
            audioPlayer?.sync(state.padConfiguration.voices);
            setText("voice-error", "");
        } catch (error) { setText("voice-error", error.message); }
        renderVoice(true); libraryUI.refresh();
    });
    get("voice-name").addEventListener("blur", () => renderVoice(true));
    for (const field of ["type", "channel", "note", "colorNote"]) {
        get(`voice-${field}`).addEventListener("change", () => applyVoiceEdit(field));
    }

    tempo.min = String(state.minimumTempo);
    tempo.max = String(state.maximumTempo);
    function renderTempo(force = false) {
        tempo.disabled = clock.source !== "INTERNAL";
        if (force || document.activeElement !== tempo) {
            const value = String(state.tempo);
            if (tempo.value !== value) tempo.value = value;
        }
        setText("tempo-status", tempo.disabled
            ? "Clock IN externe : réglage interne désactivé. Le BPM entrant n’est pas mesuré ici."
            : `${state.minimumTempo}–${state.maximumTempo} BPM · Clock INTERNAL`);
    }
    tempo.addEventListener("change", () => {
        const value = tempo.valueAsNumber;
        if (Number.isFinite(value) && clock.source === "INTERNAL") {
            actions.adjustInternalTempo(value - state.tempo);
        }
        renderTempo(true);
    });
    tempo.addEventListener("blur", () => renderTempo(true));
    function refresh() {
        refreshKeyGroup();
        if (state.projectBook && document.activeElement !== projectName) projectName.value = state.projectBook.slots[state.projectBook.active].name;
        if (state.projectBook && document.activeElement !== projectDescription) projectDescription.value = state.projectBook.slots[state.projectBook.active].description ?? "";
        for (const [i, button] of [...get("project-slots").children].entries()) {
            button.textContent = state.projectBook?.slots[i]?.name ?? "PROJECT " + String(i + 1).padStart(2, "0") + " ? vide";
            button.disabled = Boolean(state.atTransaction);
            button.setAttribute("aria-pressed", String(i === state.projectBook?.active));
        }
        audioPlayer?.sync(state.padConfiguration.voices);
        if (settingsPage.hidden) return;
        renderTempo();
        renderVoice();
        libraryUI.refresh();
    }
    // Display observation only; never schedules steps or sends MIDI.
    const refreshTimer = setInterval(refresh, 250);
    window.addEventListener("pagehide", () => clearInterval(refreshTimer), { once: true });
    showPage(helpAtStartup ? "HELP" : "SETTINGS", helpAtStartup);

    return {
        ready: libraryUI.ready,
        updateSoundCheck(rows) {
            const complete = rows.every(row =>
                row.status === "available" || row.status === "special"
            );
            for (const row of rows) {
                const text = row.status === "unconfigured"
                    ? "? Non configuré"
                    : row.status === "missing"
                        ? `✕ ${row.name} — ABSENT`
                        : row.status === "special"
                            ? `— ${row.name}`
                            : `✓ ${row.name} — disponible`;
                setText(`soundcheck-${row.id}`, text);
            }
            setText("soundcheck-summary", complete
                ? "Configuration mémorisée disponible."
                : "Configuration mémorisée incomplète — vérifiez les éléments ci-dessous.");
            if (!initialSoundCheckApplied) {
                initialSoundCheckApplied = true;
                if (!manualNavigation) showPage(complete ? "PLAY" : "SETTINGS");
            }
        }
    };
}
