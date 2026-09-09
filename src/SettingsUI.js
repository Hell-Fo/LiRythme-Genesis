// UI state is intentionally independent of the musical selection and transport.
export function initializeSettingsUI({ state, clock, actions }) {
    const get = id => document.getElementById(id);
    const settingsPage = get("settings-page");
    const playPage = get("play-page");
    const helpPanel = get("help-panel");
    const helpStartup = get("help-startup");
    const tempo = get("settings-tempo");
    const output = get("midi-output");
    let page = "SETTINGS";
    let manualNavigation = false;
    let initialSoundCheckApplied = false;
    let selectedVoice = 0;
    let helpVisible = localStorage.getItem("helpStartup") !== "false";
    helpStartup.checked = helpVisible;

    function renderHelp() {
        helpPanel.hidden = !helpVisible;
        get("toggle-help").setAttribute("aria-pressed", String(helpVisible));
        get("help-content").textContent = page === "SETTINGS"
            ? "Préparez les connexions MIDI et le tempo interne. Les Voices affichent les capacités actuelles ; leur sélection ici ne change pas la sélection Launchpad."
            : "Cette page est provisoire. Changer de page ne démarre ni n’arrête le transport.";
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
        helpVisible = !helpVisible;
        renderHelp();
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
        project.disabled = true;
        get("project-slots").appendChild(project);

        const voice = document.createElement("button");
        voice.type = "button";
        voice.textContent = `VOICE ${String(i + 1).padStart(2, "0")}`;
        voice.setAttribute("aria-pressed", String(i === selectedVoice));
        voice.addEventListener("click", () => {
            selectedVoice = i;
            for (const [index, button] of [...get("voice-slots").children].entries()) {
                button.setAttribute("aria-pressed", String(index === selectedVoice));
            }
            renderVoice();
        });
        get("voice-slots").appendChild(voice);
    }

    function setText(id, value) {
        if (get(id).textContent !== value) get(id).textContent = value;
    }
    function renderVoice() {
        const voice = state.padConfiguration.voices[selectedVoice];
        setText("voice-editor-title", `VOICE ${String(selectedVoice + 1).padStart(2, "0")}`);
        setText("voice-name", voice.name || "—");
        setText("voice-type", voice.type);
        const destination = output.options[output.selectedIndex]?.textContent;
        setText("voice-output", voice.type === "MIDI DRUM" ? `Default MIDI Output : ${destination || "aucune sortie disponible"}` : "—");
        setText("voice-channel", voice.type === "MIDI DRUM" ? String(voice.channel) : "—");
        setText("voice-note", voice.type === "MIDI DRUM" ? String(voice.note) : "—");
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
        if (settingsPage.hidden) return;
        renderTempo();
        renderVoice();
    }
    // Display observation only; never schedules steps or sends MIDI.
    const refreshTimer = setInterval(refresh, 250);
    window.addEventListener("pagehide", () => clearInterval(refreshTimer), { once: true });
    showPage("SETTINGS");

    return {
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
