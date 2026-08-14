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
    constructor(midiManager, state, actions) {
        this.midiManager = midiManager;
        this.state = state;
        this.actions = actions;
        this.deviceName = "Launchpad Mini";
        this.mapping = LaunchpadMapping;
        this.colors = LaunchpadColors;
        this.layout = GenesisLayout;

        this.currentBook = "MOTIF";

        this.shiftPressed = false;
        this.previousPressed = false;
        this.nextPressed = false;
        this.navigationCombo = false;
    }

    setLed(note, value) {
        this.midiManager.send(
            this.deviceName,
            [0x90, note, value]
        );
    }

    setTopLed(controller, value) {
        this.midiManager.send(
            this.deviceName,
            [0xB0, controller, value]
        );
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
        const colorName = this.layout.MOTIF;
        const colorValue = this.colors[colorName];

        for (const note of this.mapping.MOTIF) {
            this.setLed(note, colorValue);
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
    drawTimelineSelection() {
        const previous = this.mapping.TOP_CONTROLS.PREVIOUS;
        const next = this.mapping.TOP_CONTROLS.NEXT;

        // FREEZE MODE
        if (this.state.freezeMode) {
            if (this.state.currentTimeline === "MOTIF") {
                this.setTopLed(
                    previous,
                    this.colors.GREEN
                );

                this.setTopLed(
                    next,
                    this.colors.DIM_GREEN
                );
            } else {
                this.setTopLed(
                    previous,
                    this.colors.DIM_GREEN
                );

                this.setTopLed(
                    next,
                    this.colors.GREEN
                );
            }

            return;
        }

        // NORMAL PLAY MODE
        if (this.state.currentTimeline === "MOTIF") {
            this.setTopLed(
                previous,
                this.colors.AMBER
            );

            this.setTopLed(
                next,
                this.colors.DIM_AMBER
            );
        } else {
            this.setTopLed(
                previous,
                this.colors.DIM_AMBER
            );

            this.setTopLed(
                next,
                this.colors.AMBER
            );
        }
    }

    drawInstruments() {
        const colorName = this.layout.INSTRUMENTS;
        const colorValue = this.colors[colorName];

        for (const note of this.mapping.INSTRUMENTS) {
            this.setLed(note, colorValue);
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

    nextBook() {
        const books = [
            "MOTIF",
            "ATTRIBUTES_TRANSFORMATIONS",
            "EXTENSIONS"
        ];

        const currentIndex = books.indexOf(this.currentBook);
        const nextIndex = (currentIndex + 1) % books.length;

        this.currentBook = books[nextIndex];

        console.log("BOOK:", this.currentBook);
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

                if (this.nextPressed) {
                    this.navigationCombo = true;

                    if (this.state.isPlaying) {
                        this.actions.toggleFreezeMode();
                        this.drawTimelineSelection();
                    }
                }

                return;
            }

            // RELEASE [<<]

            this.previousPressed = false;

            if (this.navigationCombo) {
                console.log("NAV: combo consumed");

                if (!this.previousPressed && !this.nextPressed) {
                    this.navigationCombo = false;
                    console.log("NAV: combo reset");
                }

                return;
            }

            if (this.state.isPlaying) {
                this.actions.selectMotifTimeline();
                this.drawTimelineSelection();
            } else {
                console.log("NAV: PREVIOUS released");
            }

            return;
        }

        if (controlName === "NEXT") {
            if (value > 0) {
                this.nextPressed = true;

                if (this.previousPressed) {
                    this.navigationCombo = true;

                    if (this.state.isPlaying) {
                        this.actions.toggleFreezeMode();
                        this.drawTimelineSelection();
                    }
                }

                return;
            }

            // RELEASE [>>]

            this.nextPressed = false;

            if (this.navigationCombo) {
                console.log("NAV: combo consumed");

                if (!this.previousPressed && !this.nextPressed) {
                    this.navigationCombo = false;
                    console.log("NAV: combo reset");
                }

                return;
            }

            if (this.state.isPlaying) {
                this.actions.selectModulationTimeline();
                this.drawTimelineSelection();
            } else {
                console.log("NAV: NEXT released");
            }

            return;
        }

        if (controlName === "PLAY_STOP" && value > 0) {
            this.actions.togglePlayPause();
            return;
        }

        if (value > 0) {
            if (controlType === "VALUE" && controlPosition === 0) {
                this.nextBook();
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