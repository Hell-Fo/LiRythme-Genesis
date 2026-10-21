import assert from 'node:assert/strict';

const message = entry => entry.m ?? (Array.isArray(entry[1]) ? entry[1] : entry);
export const noteOns = entries => entries.filter(entry => {
    const m = message(entry);
    return (m[0] & 0xf0) === 0x90 && m[2] > 0;
});

// Deliberately late fake timers may release a note at retrigger time instead.
// Every physical Note On still needs exactly one matching Note Off.
export function assertReleasedNotes(entries) {
    const key = entry => {
        const m = message(entry), port = entry.port ?? (Array.isArray(entry[1]) ? entry[0] : '');
        return JSON.stringify([port, m[0] & 0x0f, m[1]]);
    };
    const offs = entries.filter(entry => {
        const m = message(entry);
        return (m[0] & 0xf0) === 0x80 || (m[0] & 0xf0) === 0x90 && m[2] === 0;
    });
    assert.deepEqual(offs.map(key).sort(), noteOns(entries).map(key).sort());
}
