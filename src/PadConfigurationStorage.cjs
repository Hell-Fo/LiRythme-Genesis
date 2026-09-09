const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { TextDecoder } = require("node:util");

async function readConfiguration(file) {
    return new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(file));
}
async function writeConfiguration(file, text) {
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
    let handle;
    try {
        handle = await fs.open(temporary, "wx");
        await handle.writeFile(text, "utf8");
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.rename(temporary, file);
    } finally {
        if (handle) await handle.close();
        await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
}
module.exports = { readConfiguration, writeConfiguration };
