// Contextual A/T input ownership; invoked with the Launchpad controller as this.
export const TEMPO_HOLD_DELAY_MS = 300;

export function handleATInput(status, number, value, key) {
    if (this.deleteConsumedInputs.has(key)) return false;
    // SHIFT browsing owns the surface until SHIFT is released. Pad releases
    // never start a hold/confirmation or close the selected preview.
    const browseSlot = status === 0x90 ? this.mapping.BOOKS.indexOf(number) : -1;
    if (this.state.currentView === "PLAY" && this.shiftPressed &&
        (this.atBrowsing || !this.deleteArmed && !this.copyStage && !this.atPadHold) &&
        (browseSlot >= 0 || this.atBrowsing)) {
        if (value > 0) {
            this.atHeld.add(key);
            // Enter browsing even when the first pad is empty/disabled.
            // Its validity must not decide who owns subsequent inputs.
            this.atBrowsing = true;
            if (browseSlot >= 0 && !this.actions.at.isEnabled(browseSlot)) {
                if (this.state.atTransaction) this.actions.at.finish(false);
            } else if (browseSlot >= 0) {
                const previousSlot = this.state.atTransaction?.slot;
                if (this.state.atTransaction) this.actions.at.finish(false);
                if (!this.actions.at.begin(browseSlot) && previousSlot !== undefined) this.actions.at.begin(previousSlot);
            }
        } else this.atHeld.delete(key);
        return true;
    }
    if (value === 0 && status === 0x90 && number === this.mapping.AT_VALUE[1]) this.euclideanDurationHeld = false;
    if (this.state.atTransaction?.kind === "EUCLIDEAN" && status === 0x90 &&
        (this.mapping.MOTIF.includes(number) || number === this.mapping.AT_VALUE[1])) {
        if (value > 0) {
            this.atHeld.add(key);
            if (number === this.mapping.AT_VALUE[1]) {
                this.actions.at.apply(1);
                this.euclideanDurationHeld = true;
            }
            else this.actions.at.setEuclideanStep(this.mapping.MOTIF.indexOf(number),
                { resolution: this.shiftPressed, duration: Boolean(this.euclideanDurationHeld) });
        } else this.atHeld.delete(key);
        this.drawMotif();
        this.drawATValues();
        return true;
    }
    if (value === 0 && (this.state.atTransaction || this.atHeld.has(key))) {
        this.deleteConsumedInputs.delete(key);
        if (status === 0x90 && number === this.mapping.VALUE_CONTROLS.SWITCH) this.switchPressed = false;
    }
    if (this.atHeld.has(key)) {
        if (value === 0) {
            this.atHeld.delete(key);
            if (this.atPadHold?.key === key) {
                const hold = this.atPadHold;
                clearTimeout(hold.timer);
                this.atPadHold = null;
                if (!hold.fired) {
                    if (hold.active) this.actions.at.finish(false);
                    else if (!hold.mutation) this.actions.at.begin(hold.slot);
                }
            }
        }
        return true;
    }
    if (status === 0xB0 && number === this.mapping.TOP_CONTROLS.MUTATION) {
        if (value > 0) {
            this.atHeld.add(key);
            const tx = this.state.atTransaction;
            if (tx && !["MUTATION", "GROOVE_MORPH"].includes(tx.kind) || this.atPadHold || this.deleteArmed || this.copyStage) return true;
            const active = ["MUTATION", "GROOVE_MORPH"].includes(tx?.kind);
            if (!active && !(this.shiftPressed ? this.actions.at.beginGrooveMorph() : this.actions.at.beginMutation())) return true;
            const hold = { key, mutation: true, active, fired: false, timer: null };
            this.atPadHold = hold;
            if (active) hold.timer = setTimeout(() => {
                hold.fired = true;
                this.actions.at.finish(true);
            }, TEMPO_HOLD_DELAY_MS);
        }
        return true;
    }
    if (this.state.atTransaction?.kind === "GROOVE_MORPH" && status === 0x90 && this.mapping.BOOKS.includes(number)) {
        if (value > 0) {
            this.atHeld.add(key);
            this.actions.at.selectGrooveBlock(this.mapping.BOOKS.indexOf(number));
        }
        return true;
    }
    if (["MUTATION", "GROOVE_MORPH"].includes(this.state.atTransaction?.kind) && status === 0x90 &&
        [...this.mapping.BOOKS, ...this.mapping.INSTRUMENTS, ...this.mapping.MOTIF].includes(number)) {
        if (value > 0) this.atHeld.add(key);
        return true;
    }
    if (this.state.atTransaction?.slot === 4 && status === 0xB0 &&
        [this.mapping.TOP_CONTROLS.PREVIOUS, this.mapping.TOP_CONTROLS.NEXT].includes(number)) {
        if (value > 0) {
            // A simultaneous chord is consumed; it must not leak into FOCUS/navigation.
            const other = number === this.mapping.TOP_CONTROLS.PREVIOUS ? this.mapping.TOP_CONTROLS.NEXT : this.mapping.TOP_CONTROLS.PREVIOUS;
            const chord = this.atHeld.has(`${status}:${other}`);
            this.atHeld.add(key);
            if (!chord) this.actions.at.transposeKeyGroup(number === this.mapping.TOP_CONTROLS.PREVIOUS ? -1 : 1);
        }
        return true;
    }
    if (this.state.atTransaction?.slot === 8 && !["MUTATION", "GROOVE_MORPH"].includes(this.state.atTransaction?.kind) && status === 0xB0 &&
        [this.mapping.TOP_CONTROLS.PREVIOUS, this.mapping.TOP_CONTROLS.NEXT].includes(number)) {
        if (value > 0) {
            this.atHeld.add(key);
            this.actions.at.rotate(number === this.mapping.TOP_CONTROLS.PREVIOUS ? -1 : 1);
        }
        return true;
    }
    if (status !== 0x90) return false;
    const context = this.actions.resolveContext();
    const slot = this.mapping.BOOKS.indexOf(number);
    if (this.state.currentView === "PLAY" && slot >= 0) {
        if (!context.atActive && this.deleteArmed) {
            if (value > 0) {
                this.atHeld.add(key);
                if (this.actions.at.resetMotif()) this.setDeleteArmed(false);
            }
            return true;
        }
        if (value > 0 && context.atActive && !this.actions.at.definition(slot)) {
            this.atHeld.add(key);
            this.actions.at.finish(false);
            return true;
        }
        // Preserve existing contextual commands on the original BOOK surface.
        if (!context.atActive && this.shiftPressed && this.state.chainEnabled) return false;
        if (value > 0) {
            this.atHeld.add(key);
            if ((context.atActive ? this.state.atTransaction.slot === slot : this.actions.at.isEnabled(slot)) && !this.atPadHold) {
                const hold = { key, slot, active: context.atActive, fired: false, timer: null };
                this.atPadHold = hold;
                hold.timer = setTimeout(() => {
                    hold.fired = true;
                    if (hold.active) this.actions.at.finish(true);
                }, TEMPO_HOLD_DELAY_MS);
            }
        }
        return true;
    }
    if (!context.atActive) return false;
    const index = this.mapping.AT_VALUE.indexOf(number);
    const instrument = this.mapping.INSTRUMENTS.indexOf(number);
    const step = this.mapping.MOTIF.indexOf(number);
    if (index < 0 && instrument < 0 && step < 0) return false;
    if (value > 0) {
        this.atHeld.add(key);
        if (index >= 0) this.actions.at.apply(index);
        else this.actions.at.select(instrument >= 0 ? "instruments" : "steps",
            instrument >= 0 ? instrument : step, this.shiftPressed);
    }
    return true;
}
