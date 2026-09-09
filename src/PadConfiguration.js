export class PadConfiguration {
    constructor() {
        this.name = "DrumBrute Impact";
        this.voices = Array.from({ length: 16 }, (_, id) => ({
            id, name: "", type: "NONE"
        }));
        // Compatibility setup only: names are data, never musical identities.
        const drums = [
            ["Tom High", 39], ["Tom Low", 40], ["Closed Hat", 43],
            ["Open Hat", 44], ["Kick", 36], ["Snare 1", 37],
            ["Snare 2", 38], ["Cymbal", 41]
        ];
        drums.forEach(([name, note], index) => {
            const id = index + 8;
            this.voices[id] = {
                id, name, type: "MIDI DRUM", output: { mode: "DEFAULT" },
                channel: 10, note
            };
        });
    }
}
