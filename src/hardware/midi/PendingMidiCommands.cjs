// Only used before the utility is ready. Never replay old musical messages.
class PendingMidiCommands {
    constructor(limit = 256) { this.limit = limit; this.commands = []; }
    get size() { return this.commands.length; }
    enqueue(command) {
        const native = command?.target === 'NATIVE_MIDI' ? command.command : null;
        if (native?.type === 'SEND_NOTES' || ['SEND_MIDI', 'MIDI_REALTIME_THRU'].includes(command?.type)) return false;
        const key = native?.type === 'SEND_CONTROLLER' && command.requestId === undefined
            ? JSON.stringify([native.type, native.name, native.message?.[0], native.message?.[1]])
            : !native && ['SET_TEMPO', 'SET_SOURCE', 'SET_ENABLED', 'SET_DESTINATION', 'SET_CLOCK_OUTPUT_SELECTED', 'TRANSPORT', 'SET_STEP_TRANSPORT'].includes(command?.type)
                ? command.type : null;
        if (key !== null) {
            const previous = this.commands.findIndex(entry => entry.key === key);
            if (previous >= 0) this.commands.splice(previous, 1);
        }
        if (this.commands.length >= this.limit) {
            const visual = this.commands.findIndex(entry => entry.command.command?.type === 'SEND_CONTROLLER' && entry.command.requestId === undefined);
            if (visual < 0) return false;
            this.commands.splice(visual, 1);
        }
        this.commands.push({ key, command });
        return true;
    }
    drain() {
        const result = this.commands.map(entry => entry.command);
        this.commands = [];
        return result;
    }
}
module.exports = { PendingMidiCommands };
