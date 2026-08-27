/*
===============================================================================

LiRythme – Genesis

Launchpad Mini Mk1

Responsible for Launchpad Mini Mk1 communication and LED control.

Author:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

===============================================================================
*/

import { LaunchpadMapping } from "./LaunchpadMapping.js";
import { LaunchpadColors } from "./LaunchpadColors.js";
import { GenesisLayout } from "./GenesisLayout.js";

export class LaunchpadMini {
    constructor(
        midiManager,
        state,
        actions,
        deviceName
    ) {
        this.midiManager = midiManager;
        this.state = state;
        this.actions = actions;
        this.deviceName = deviceName;
        this.mapping = LaunchpadMapping;
        this.colors = LaunchpadColors;
        this.layout = GenesisLayout;

        this.shiftPressed = false;
        this.previousPressed = false;
        this.nextPressed = false;
        this.navigationCombo = false;

        this.playStopTimer = null;
        this.playStopLongPressTriggered = false;
        this.previousHoldTimer = null;
        this.previousRepeatTimer = null;
        this.nextRepeatTimer = null;
        this.displayBuffer = 1;
        this.updateBuffer = 0;
        this.nextHoldTimer = null;

        this.filterSelectionMode = false;
        this.filterSelectionChanged = false;
        this.filterWasActive = false;

    }

    setLed(note, value) {
        const bufferedValue = value & 0x33;

        this.midiManager.send(
            this.deviceName,
            [0x90, note, bufferedValue]
        );
    }

    setTopLed(controller, value) {
        const bufferedValue = value & 0x33;

        this.midiManager.send(
            this.deviceName,
            [0xB0, controller, bufferedValue]
        );
    }
    enableDoubleBuffering() {
        this.midiManager.send(
            this.deviceName,
            [0xB0, 0, 49]
        );

        this.displayBuffer = 1;
        this.updateBuffer = 0;
    }
    swapBuffers() {
        if (this.displayBuffer === 1) {
            this.midiManager.send(
                this.deviceName,
                [0xB0, 0, 52]
            );

            this.displayBuffer = 0;
            this.updateBuffer = 1;
        } else {
            this.midiManager.send(
                this.deviceName,
                [0xB0, 0, 49]
            );

            this.displayBuffer = 1;
            this.updateBuffer = 0;
        }
    }

    testColors() {
        const colors = [
            this.colors.DIM_RED,
            this.colors.RED,
            this.colors.DIM_GREEN,
            this.colors.GREEN,
            this.colors.DIM_AMBER,
            this.colors.AMBER,
            this.colors.YELLOW
        ];

        for (let i = 0; i < colors.length; i++) {
            this.setLed(i, colors[i]);
        }
    }

    drawMotif() {
        const selectedInstrumentName =
            this.state.instrumentMap[
            this.state.selectedInstrument
            ];

        const filter =
            this.state.visibleInstrumentFilter;

        for (let i = 0; i < this.mapping.MOTIF.length; i++) {
            const note = this.mapping.MOTIF[i];

            let hasAnyVoice = false;
            let hasSelectedVoice = false;

            for (const [instrumentName, steps] of Object.entries(
                this.state.motif
            )) {
                const instrumentPosition =
                    Object.keys(this.state.instrumentMap)
                        .find(
                            key =>
                                this.state.instrumentMap[key] === instrumentName
                        );

                const isInFilter =
                    filter.has(Number(instrumentPosition));

                const isSelectedInstrument =
                    instrumentName === selectedInstrumentName;

                const isVisible =
                    this.filterSelectionMode
                        ? isInFilter
                        : (
                            !this.state.filterMode ||
                            isInFilter ||
                            isSelectedInstrument
                        );

                if (!isVisible) {
                    continue;
                }

                if (steps[i]) {
                    hasAnyVoice = true;

                    if (isSelectedInstrument) {
                        hasSelectedVoice = true;
                    }
                }
            }

            let colorValue = 0;

            if (hasSelectedVoice) {
                colorValue = this.colors.YELLOW;
            } else if (hasAnyVoice) {
                colorValue = this.colors.DIM_AMBER;
            }

            this.setLed(
                note,
                colorValue
            );
        }
    }

    drawTimelineSelection() {
        const previous = this.mapping.TOP_CONTROLS.PREVIOUS;
        const next = this.mapping.TOP_CONTROLS.NEXT;

        const isMotif = this.state.currentTimeline === "MOTIF";

        // LOCK + FREEZE
        if (
            this.state.lockMode &&
            this.state.freezeMode
        ) {
            this.setTopLed(
                previous,
                isMotif ? this.colors.RED : this.colors.DIM_GREEN
            );

            this.setTopLed(
                next,
                isMotif ? this.colors.DIM_GREEN : this.colors.RED
            );

            return;
        }

        // LOCK
        if (this.state.lockMode) {
            this.setTopLed(
                previous,
                isMotif ? this.colors.RED : this.colors.DIM_RED
            );

            this.setTopLed(
                next,
                isMotif ? this.colors.DIM_RED : this.colors.RED
            );

            return;
        }

        // FREEZE
        if (this.state.freezeMode) {
            this.setTopLed(
                previous,
                isMotif ? this.colors.GREEN : this.colors.DIM_GREEN
            );

            this.setTopLed(
                next,
                isMotif ? this.colors.DIM_GREEN : this.colors.GREEN
            );

            return;
        }

        // NORMAL
        this.setTopLed(
            previous,
            isMotif ? this.colors.AMBER : this.colors.DIM_AMBER
        );

        this.setTopLed(
            next,
            isMotif ? this.colors.DIM_AMBER : this.colors.AMBER
        );
    }

    drawInstruments() {
        for (let i = 0; i < this.mapping.INSTRUMENTS.length; i++) {
            const note = this.mapping.INSTRUMENTS[i];

            const instrumentName =
                this.state.instrumentMap[i];

            const isSelected =
                i === this.state.selectedInstrument;

            const isPlayingNow =
                instrumentName &&
                this.state.motif[instrumentName]?.[
                this.state.playheadPosition
                ];

            const isInFilter =
                this.state.visibleInstrumentFilter.has(i);

            let colorValue =
                this.colors[
                this.layout.INSTRUMENTS
                ];

            if (
                this.filterSelectionMode &&
                isInFilter
            ) {
                colorValue = this.colors.YELLOW;
            } else if (isPlayingNow) {
                colorValue = this.colors.GREEN;
            } else if (isSelected) {
                colorValue = this.colors.DIM_AMBER;
            }

            this.setLed(
                note,
                colorValue
            );
        }
    }

    drawAttributesTransformations() {
        const books = this.mapping.BOOKS;

        for (let i = 0; i < books.length; i++) {
            const colorName =
                i < 8
                    ? this.layout.BOOKS.ATTRIBUTES
                    : this.layout.BOOKS.TRANSFORMATIONS;

            this.setLed(
                books[i],
                this.colors[colorName]
            );
        }
    }
    drawTopControls() {
        for (const [name, controller] of Object.entries(
            this.mapping.TOP_CONTROLS
        )) {
            const colorName = this.layout.TOP_CONTROLS[name];
            const colorValue = this.colors[colorName];

            this.setTopLed(controller, colorValue);
        }
    }

    drawTransport() {
        const playStop = this.mapping.TOP_CONTROLS.PLAY_STOP;

        if (this.state.transportState === "PLAY") {
            this.setTopLed(
                playStop,
                this.colors.GREEN
            );
        } else {
            this.setTopLed(
                playStop,
                this.colors.DIM_GREEN
            );
        }
    }
    drawFilterStatus() {
        const solo = this.mapping.TOP_CONTROLS.SOLO;

        if (
            this.filterSelectionMode ||
            this.state.filterMode
        ) {
            this.setTopLed(
                solo,
                this.colors.GREEN
            );
        } else {
            this.setTopLed(
                solo,
                this.colors.AMBER
            );
        }
    }

    pulseTransport() {
        const playStop = this.mapping.TOP_CONTROLS.PLAY_STOP;

        const isFirstMotifStep =
            this.state.currentTimeline === "MOTIF" &&
            this.state.playheadPosition === 0;

        this.setTopLed(
            playStop,
            isFirstMotifStep
                ? this.colors.YELLOW
                : this.colors.DIM_GREEN
        );

        setTimeout(() => {
            if (this.state.transportState === "PLAY") {
                this.setTopLed(
                    playStop,
                    this.colors.GREEN
                );
            }
        }, 300);
    }

    drawPlayhead() {
        const step = this.state.playheadPosition;

        const note = this.mapping.MOTIF[step];

        const selectedInstrumentName =
            this.state.instrumentMap[
            this.state.selectedInstrument
            ];

        const hasSelectedVoice =
            selectedInstrumentName &&
            this.state.motif[selectedInstrumentName]?.[step];

        if (this.state.currentTimeline === "MOTIF") {
            this.setLed(
                note,
                hasSelectedVoice
                    ? this.colors.GREEN
                    : this.colors.DIM_GREEN
            );
        } else {
            this.setLed(
                note,
                hasSelectedVoice
                    ? this.colors.RED
                    : this.colors.DIM_RED
            );
        }
    }
    getControlType(status, number) {
        if (status === 0xB0) {
            if (this.mapping.TOP_BUTTONS.includes(number)) {
                return "TOP_BUTTON";
            }
        }

        if (status === 0x90) {
            if (this.mapping.MOTIF.includes(number)) {
                return "MOTIF";
            }

            if (this.mapping.INSTRUMENTS.includes(number)) {
                return "INSTRUMENT";
            }

            if (this.mapping.BOOKS.includes(number)) {
                return "BOOK";
            }

            if (this.mapping.VALUE.includes(number)) {
                return "VALUE";
            }
        }

        return "UNKNOWN";
    }

    getControlPosition(controlType, number) {
        let controls;

        if (controlType === "MOTIF") {
            controls = this.mapping.MOTIF;
        } else if (controlType === "INSTRUMENT") {
            controls = this.mapping.INSTRUMENTS;
        } else if (controlType === "BOOK") {
            controls = this.mapping.BOOKS;
        } else if (controlType === "VALUE") {
            controls = this.mapping.VALUE;
        } else if (controlType === "TOP_BUTTON") {
            controls = this.mapping.TOP_BUTTONS;
        } else {
            return null;
        }

        return controls.indexOf(number);
    }

    getControlName(status, number) {
        if (status === 0xB0) {
            for (const [name, midiNumber] of Object.entries(
                this.mapping.TOP_CONTROLS
            )) {
                if (midiNumber === number) {
                    return name;
                }
            }
        }

        if (status === 0x90) {
            for (const [name, midiNumber] of Object.entries(
                this.mapping.VALUE_CONTROLS
            )) {
                if (midiNumber === number) {
                    return name;
                }
            }
        }

        return null;
    }
    consumeNavigationCombo() {
        if (!this.navigationCombo) {
            return false;
        }

        console.log("NAV: combo consumed");

        if (!this.previousPressed && !this.nextPressed) {
            this.navigationCombo = false;
            console.log("NAV: combo reset");
        }

        return true;
    }

    handleMidiMessage(data) {
        const [status, number, value] = data;

        const controlType = this.getControlType(status, number);
        const controlPosition = this.getControlPosition(
            controlType,
            number
        );

        const controlName = this.getControlName(
            status,
            number
        );
        if (controlName === "SHIFT") {
            this.shiftPressed = value > 0;

            console.log("SHIFT:", this.shiftPressed);

            return;
        }
        if (controlName === "PREVIOUS") {
            if (value > 0) {
                this.previousPressed = true;
                if (this.state.transportState !== "PLAY") {

                    // Shift + [<<] = Timeline MOTIF
                    if (this.shiftPressed) {
                        this.actions.selectMotifTimeline();
                        this.drawTimelineSelection();
                        this.drawMotif();
                        this.drawPlayhead();
                        this.swapBuffers();
                        return;
                    }

                    // [<<] = recule immédiatement
                    this.actions.previousStep();
                    this.drawMotif();
                    this.drawPlayhead();
                    this.drawInstruments();
                    this.swapBuffers();

                    const stepDuration = this.state.getStepDurationMs();

                    this.previousHoldTimer = setTimeout(() => {
                        this.previousRepeatTimer = setInterval(() => {
                            this.actions.previousStep();
                            this.drawMotif();
                            this.drawPlayhead();
                            this.drawInstruments();
                            this.swapBuffers();
                        }, stepDuration);
                    }, stepDuration);

                    return;
                }

                if (this.nextPressed) {
                    this.navigationCombo = true;

                    if (this.state.transportState === "PLAY") {
                        if (this.shiftPressed) {
                            this.actions.toggleLockMode();
                        } else {
                            this.actions.toggleFreezeMode();
                        }

                        this.drawTimelineSelection();
                    }
                }

                return;
            }

            // RELEASE [<<]

            this.previousPressed = false;
            clearTimeout(this.previousHoldTimer);
            clearInterval(this.previousRepeatTimer);

            this.previousHoldTimer = null;
            this.previousRepeatTimer = null;

            if (this.consumeNavigationCombo()) {
                return;
            }

            if (this.state.transportState === "PLAY") {
                this.actions.selectMotifTimeline();
                this.drawTimelineSelection();
                this.drawMotif();
                this.drawPlayhead();

            }

            return;
        }

        if (controlName === "NEXT") {
            if (value > 0) {
                this.nextPressed = true;
                if (this.state.transportState !== "PLAY") {

                    // Shift + [>>] = Timeline MODULATION
                    if (this.shiftPressed) {
                        this.actions.selectModulationTimeline();
                        this.drawTimelineSelection();
                        this.drawMotif();
                        this.drawPlayhead();
                        this.swapBuffers();
                        return;
                    }

                    // [>>] = avance immédiatement
                    this.actions.nextStep();
                    this.drawMotif();
                    this.drawPlayhead();
                    this.drawInstruments();
                    this.swapBuffers();

                    const stepDuration = this.state.getStepDurationMs();

                    this.nextHoldTimer = setTimeout(() => {
                        this.nextRepeatTimer = setInterval(() => {
                            this.actions.nextStep();
                            this.drawMotif();
                            this.drawPlayhead();
                            this.drawInstruments();
                            this.swapBuffers();
                        }, stepDuration);
                    }, stepDuration);

                    return;
                }

                if (this.previousPressed) {
                    this.navigationCombo = true;

                    if (this.state.transportState === "PLAY") {
                        if (this.shiftPressed) {
                            this.actions.toggleLockMode();
                        } else {
                            this.actions.toggleFreezeMode();
                        }

                        this.drawTimelineSelection();
                    }
                }

                return;
            }

            // RELEASE [>>]
            this.nextPressed = false;

            clearTimeout(this.nextHoldTimer);
            clearInterval(this.nextRepeatTimer);

            this.nextHoldTimer = null;
            this.nextRepeatTimer = null;

            if (this.consumeNavigationCombo()) {
                return;
            }

            if (this.state.transportState === "PLAY") {
                this.actions.selectModulationTimeline();
                this.drawTimelineSelection();
                this.drawMotif();
                this.drawPlayhead();
            }

            return;
        }
        if (
            controlType === "MOTIF" &&
            value > 0
        ) {
            this.actions.toggleInstrumentStep(
                controlPosition
            );
            this.drawMotif();
            this.drawPlayhead();
            this.swapBuffers();

            return;
        }
        if (
            controlType === "INSTRUMENT" &&
            value > 0
        ) {
            // Pendant Filter Selection :
            // le pad ajoute / retire une voix du filtre
            if (this.filterSelectionMode) {
                this.actions.toggleInstrumentFilter(
                    controlPosition
                );

                this.filterSelectionChanged = true;

                this.drawMotif();
                this.drawPlayhead();
                this.drawInstruments();
                this.swapBuffers();

                return;
            }

            // Instrument seul = sélection / désélection pour l'édition
            this.actions.toggleSelectedInstrument(
                controlPosition
            );

            console.log(
                "INSTRUMENT:",
                this.state.selectedInstrument
            );

            this.drawInstruments();
            this.drawMotif();
            this.drawPlayhead();
            this.swapBuffers();

            return;
        }
        if (controlName === "PLAY_STOP") {
            if (value > 0) {
                this.playStopLongPressTriggered = false;

                this.playStopTimer = setTimeout(() => {
                    this.playStopLongPressTriggered = true;
                    this.actions.stop();
                    this.drawTransport();
                    this.drawTimelineSelection();
                    this.drawMotif();
                    this.drawPlayhead();
                    this.swapBuffers();
                }, 300);

                return;
            }

            clearTimeout(this.playStopTimer);
            this.playStopTimer = null;

            if (!this.playStopLongPressTriggered) {
                this.actions.togglePlayPause();
                this.drawTransport();
                this.drawTimelineSelection();
            }

            return;
        }
        if (controlName === "SOLO") {
            // PRESS SOLO
            if (value > 0) {
                if (this.shiftPressed) {
                    this.filterWasActive =
                        this.state.filterMode;

                    // On entre dans la sélection du filtre
                    this.filterSelectionMode = true;
                    this.filterSelectionChanged = false;

                    // Si le filtre était OFF, il devient immédiatement ON
                    if (!this.state.filterMode) {
                        this.actions.enterFocusMode();
                    }

                    console.log("FILTER SELECT: ON");

                    this.drawInstruments();
                    this.drawMotif();
                    this.drawPlayhead();
                    this.drawFilterStatus();
                    this.swapBuffers();

                    return;
                }

                console.log("SOLO PRESS");
                return;
            }

            // RELEASE SOLO
            if (this.filterSelectionMode) {
                this.filterSelectionMode = false;

                if (this.filterSelectionChanged) {
                    // Focus a été modifié :
                    // il reste actif
                    this.actions.activateFocusMode();

                } else if (this.filterWasActive) {
                    // Focus était déjà actif :
                    // Shift + Solo = sortie complète
                    this.actions.exitFocusMode();

                } else {
                    // Focus venait juste d'être activé
                    // et aucune voix n'a été touchée :
                    // il reste actif, même vide
                    this.actions.activateFocusMode();
                }

                this.drawInstruments();
                this.drawMotif();
                this.drawPlayhead();
                this.drawFilterStatus();
                this.swapBuffers();

                return;
            }

            console.log("SOLO RELEASE");
            return;
        }

        if (value > 0) {
            if (controlType === "VALUE" && controlPosition === 0) {
                this.actions.nextBook();
                return;
            }

            console.log(
                "PRESS:",
                controlName ?? controlType,
                "position:",
                controlPosition
            );
        }
    }
}