const fs = require("node:fs/promises");
const path = require("node:path");
async function readWav(file) {
    if (typeof file !== "string" || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== ".wav") {
        throw new Error("Sélectionnez un fichier .wav avec un chemin absolu.");
    }
    const handle = await fs.open(file, "r");
    try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size < 12 || stat.size > 64 * 1024 * 1024) throw new Error("WAV invalide ou supérieur à 64 Mo.");
        const bytes = await handle.readFile();
        if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") throw new Error("Format WAV RIFF attendu.");
        return new Uint8Array(bytes);
    } finally { await handle.close(); }
}
module.exports = { readWav };
