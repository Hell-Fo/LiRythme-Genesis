import { activateConfiguration, serializeConfiguration } from "./PadConfigurationFile.mjs";
import { snapshotMotifBank, restoreMotifBank } from "./MotifBankFormat.mjs";
import { SCALES, defaultKeyGroup } from "./KeyGroup.mjs";

const nameFor = id => `Projet ${String(id + 1).padStart(2, "0")}`;
const chainOf = s => ({ enabled: s.chainEnabled, ids: s.chain.slice(), loop: s.chainLoopMasterIndex });
export const PROJECT_KEYS = new Map([[1,61],[2,63],[4,66],[5,68],[6,70],
    [8,60],[9,62],[10,64],[11,65],[12,67],[13,69],[14,71]]);

export function initializeProjectBook(state, actions) {
    const empty = snapshotMotifBank(state, false);
    empty.currentMotifId = 0;
    empty.keyGroup = defaultKeyGroup();
    for (const bank of [empty, empty.modulation]) if (bank) {
        bank.motifs = Array.from({ length: 16 }, () => ({ events: Array.from({ length: 16 }, () => Array(32).fill(false)),
            voiceLengths: Array(16).fill(null), motifLength: null, ...(bank === empty ? {} : { attributes: {} }) }));
        if (bank !== empty) Object.assign(bank, { currentMotifId: 0, requested: false, chainEnabled: false, chain: [], loopPoint: null });
    }
    state.projectBook ??= { active: 0, slots: Array(16).fill(null) };
    state.projectBook.slots[state.projectBook.active] ??= { description: "", name: nameFor(0), bank: snapshotMotifBank(state, false), chain: chainOf(state) };
    const capture = () => {
        const slot = state.projectBook.slots[state.projectBook.active];
        slot.bank = snapshotMotifBank(state, false); slot.chain = chainOf(state);
        slot.pads = serializeConfiguration(state.padConfiguration);
    };
    function select(id) {
        if (state.atTransaction || state.padLibrarySession?.busy) return false;
        capture();
        actions.stop();
        const book = state.projectBook;
        book.slots[id] ??= { pads: serializeConfiguration(state.padConfiguration), description: "", name: nameFor(id), bank: structuredClone(empty), chain: { enabled: false, ids: [], loop: null } };
        book.active = id;
        const slot = book.slots[id];
        state.chainFocus = false;
        restoreMotifBank(state, slot.bank);
        restorePads();
        Object.assign(state, { chain: slot.chain.ids.slice(), chainEnabled: slot.chain.enabled,
            chainLoopMasterIndex: slot.chain.loop, chainPlayingIndex: -1, chainPlayingDetached: true,
            chainViewIndex: -1, chainMoveIndex: null, selectedInstrument: null });
        state.onBankChange?.();
        return true;
    }
    function copy(source, target) {
        if (state.atTransaction || state.padLibrarySession?.busy) return false;
        capture();
        if (!state.projectBook.slots[source]) return false;
        if (target === state.projectBook.active) actions.stop();
        state.projectBook.slots[target] = structuredClone(state.projectBook.slots[source]);
        state.projectBook.slots[target].name = nameFor(target);
        if (target === state.projectBook.active) {
            // select captures the current state; load the replacement directly instead.
            const slot = state.projectBook.slots[target];
            state.chainFocus = false;
            restoreMotifBank(state, slot.bank);
            restorePads();
            Object.assign(state, { chain: slot.chain.ids.slice(), chainEnabled: slot.chain.enabled, chainLoopMasterIndex: slot.chain.loop });
        }
        state.onBankChange?.(); return true;
    }
    function remove(id) {
        if (state.atTransaction || state.padLibrarySession?.busy) return false;
        if (id === state.projectBook.active) {
            actions.stop();
            restoreMotifBank(state, empty);
            Object.assign(state, { chain: [], chainEnabled: false, chainFocus: false, chainLoopMasterIndex: null });
            state.projectBook.slots[id] = { description: "", name: nameFor(id), bank: structuredClone(empty), chain: chainOf(state) };
        } else state.projectBook.slots[id] = null;
        state.onBankChange?.();
    }
    function restorePads() {
        const slot = state.projectBook.slots[state.projectBook.active];
        if (slot.pads === undefined) slot.pads = serializeConfiguration(state.padConfiguration);
        else {
            activateConfiguration(state, slot.pads);
            if (state.padLibrarySession) state.padLibrarySession.active = null;
        }
    }
    state.projects = { select, copy, remove, restorePads };
    const saved = state.projectBook.slots[state.projectBook.active].chain;
    Object.assign(state, { chain: saved.ids.slice(), chainEnabled: saved.enabled, chainLoopMasterIndex: saved.loop });
    return state.projects;
}

export function connectProjectController(controller) {
    const c = controller, s = c.rootState, m = c.mapping;
    const originalInput = c.handleControllerMessage.bind(c), originalSend = c.sendController.bind(c);
    let mode = false, shift = false, switching = false, operation = null, source = null, playHeld = false, playLong = false, timer;
    function color(status, note) {
        if (status === 0xB0) return note === m.TOP_CONTROLS.PLAY_STOP ? (s.transportState === "PLAY" ? c.colors.GREEN : c.colors.OFF) : c.colors.OFF;
        const id = m.BOOKS.indexOf(note), key = m.MOTIF.indexOf(note);
        if (id >= 0) return id === source ? c.colors.RED : id === s.projectBook.active ? c.colors.GREEN : c.colors.DIM_GREEN;
        if (PROJECT_KEYS.has(key)) return PROJECT_KEYS.get(key) % 12 === s.keyGroup.root % 12 ? c.colors.GREEN : key < 8 ? c.colors.YELLOW : c.colors.DIM_AMBER;
        if (key === 7 || key === 15) return c.colors.RED;
        if (note === m.VALUE_CONTROLS.COPY) return operation === "COPY" ? c.colors.GREEN : c.colors.OFF;
        if (note === m.VALUE_CONTROLS.DELETE) return operation === "DELETE" ? c.colors.RED : c.colors.OFF;
        return c.colors.OFF;
    }
    c.sendController = (device, message) => {
        const [status, note] = message;
        if (mode && (status === 0x90 || status === 0xB0 && note !== 0)) message = [status, note, color(status, note) | 4];
        return originalSend(device, message);
    };
    function redraw() {
        for (const note of [...m.MOTIF, ...m.INSTRUMENTS, ...m.BOOKS, ...m.VALUE]) c.setLed(note, color(0x90, note));
        for (const note of m.TOP_BUTTONS) c.setTopLed ? c.setTopLed(note, color(0xB0, note)) : originalSend(c.deviceName, [0xB0, note, color(0xB0, note) | 4]);
        c.swapBuffers();
    }
    c.handleControllerMessage = data => {
        const [raw, note, v] = data, status = raw === 0x80 ? 0x90 : raw, value = raw === 0x80 ? 0 : v;
        if (status === 0xB0 && note === m.TOP_CONTROLS.SHIFT) { shift = value > 0; c.shiftPressed = shift; }
        if (status === 0x90 && note === m.VALUE_CONTROLS.SWITCH) {
            if (value > 0 && !switching && shift && !s.atTransaction && !playHeld && !c.playStopPressed) {
                mode = !mode; s.projectMode = mode; operation = source = null;
                c.resetInputState(); c.shiftPressed = shift;
                c.setCopyStage(null); c.setDeleteArmed(false); c.cancelStepNavigationHold();
                if (mode) redraw(); else { c.drawSelectedMotif(); c.drawTopControls(); c.drawFilterStatus(); c.swapBuffers(); }
                switching = true; return;
            }
            if (value === 0 && switching) { switching = false; return; }
        }
        if (!mode) return originalInput(data);
        if (status === 0xB0 && note === m.TOP_CONTROLS.PLAY_STOP) {
            if (value > 0 && !playHeld) {
                playHeld = true; playLong = false;
                timer = setTimeout(() => { playLong = true; actionsStop(); redraw(); }, 300);
            } else if (!value && playHeld) {
                clearTimeout(timer); playHeld = false;
                if (!playLong) c.actions.togglePlayPause();
                redraw();
            }
            return;
        }
        if (!value || status !== 0x90) return;
        if (note === m.VALUE_CONTROLS.COPY || note === m.VALUE_CONTROLS.DELETE) {
            const next = note === m.VALUE_CONTROLS.COPY ? "COPY" : "DELETE";
            operation = operation === next ? null : next; source = null;
        } else {
            const id = m.BOOKS.indexOf(note), key = m.MOTIF.indexOf(note);
            if (id >= 0) {
                if (operation === "DELETE") { s.projects.remove(id); operation = null; }
                else if (operation === "COPY") {
                    if (source === null) { if (s.projectBook.slots[id]) source = id; }
                    else if (s.projects.copy(source, id)) operation = source = null;
                } else s.projects.select(id);
            } else if (!operation && PROJECT_KEYS.has(key)) {
                s.keyGroup.root = PROJECT_KEYS.get(key); s.onBankChange?.();
            } else if (!operation && (key === 7 || key === 15)) {
                const names = Object.keys(SCALES), index = names.indexOf(s.keyGroup.scale);
                s.keyGroup.scale = names[(index + (key === 7 ? 1 : -1) + names.length) % names.length]; s.onBankChange?.();
            }
        }
        redraw();
    };
    function actionsStop() { c.actions.stop(); }
}
