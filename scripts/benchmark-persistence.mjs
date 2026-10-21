import { performance } from 'node:perf_hooks';
import { loadEngine } from './load-engine.mjs';
import { snapshotMotifBank } from '../src/MotifBankFormat.mjs';

const { LiRythmeState } = await loadEngine({ actions: false });
const state = new LiRythmeState();
for (const motif of state.motifs) {
    motif.events.forEach(row => row.fill(true));
    for (const [field, value] of Object.entries({ velocities: 100, colors: false, swings: 50, ratchets: 1 }))
        motif[field] = Array.from({ length: 16 }, () => Array(32).fill(value));
}
const bank = snapshotMotifBank(state, false);
function measure() {
    const times = Array.from({ length: 5 }, () => {
        const started = performance.now(); snapshotMotifBank(state); return performance.now() - started;
    }).sort((a, b) => a - b);
    return { minMs: +times[0].toFixed(2), medianMs: +times[2].toFixed(2), maxMs: +times[4].toFixed(2) };
}
const oneBank = measure();
state.projectBook = { active: 0, slots: Array.from({ length: 16 }, (_, id) => ({
    name: `Project ${id}`, description: '', bank: structuredClone(bank), chain: { enabled: false, ids: [], loop: null }
})) };
console.log(JSON.stringify({ oneBank, sixteenProjects: measure(), bytes: Buffer.byteLength(JSON.stringify(snapshotMotifBank(state))) }, null, 2));
