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
    function flush() {
        if (timer !== null) { cancel(timer); timer = null; }
        if (inFlight) return inFlight;
        // Publish one promise for the entire drain, including edits made during save.
        let resolve, reject;
        const pending = new Promise((ok, fail) => { resolve = ok; reject = fail; });
        inFlight = pending;
        const failed = error => { inFlight = null; reject(error); };
        const finished = () => {
            // An edit can arrive between drain's final await and this reaction.
            if (dirty) drain().then(finished, failed);
            else { inFlight = null; resolve(); }
        };
        drain().then(finished, failed);
        return pending;
    }
    async function drain() {
        while (dirty) {
            dirty = false;
            try {
                // Only called by debounce or close, never by the musical tick.
                const bank = snapshotMotifBank(state);
                await bridge.save(bank);
            } catch (e) { dirty = true; throw e; }
        }
    }
    state.onBankChange = markDirty;
    return { flush };
}
