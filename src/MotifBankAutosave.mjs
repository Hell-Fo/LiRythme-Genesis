import { snapshotMotifBank, restoreMotifBank } from "./MotifBankFormat.mjs";

export async function initializeMotifBankAutosave(state, bridge, {
    delay = 350, schedule = setTimeout, cancel = clearTimeout,
    report = error => console.error("Motif Bank:", error)
} = {}) {
    const restored = await bridge.load();
    if (restored.warning) report(restored.warning);
    if (restored.bank) restoreMotifBank(state, restored.bank);
    let dirty = false, timer = null, inFlight = null;
    function markDirty() {
        dirty = true;
        if (timer !== null) cancel(timer);
        timer = schedule(() => { timer = null; flush().catch(report); }, delay);
    }
    async function flush() {
        if (timer !== null) { cancel(timer); timer = null; }
        if (inFlight) await inFlight;
        while (dirty) {
            dirty = false;
            try {
                // Only called by debounce or close, never by the musical tick.
                const bank = snapshotMotifBank(state);
                inFlight = bridge.save(bank);
                await inFlight;
            } catch (e) { dirty = true; throw e; }
            finally { inFlight = null; }
        }
    }
    state.onBankChange = markDirty;
    return { flush };
}
