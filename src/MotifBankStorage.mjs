import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateMotifBank } from "./MotifBankFormat.mjs";

export class MotifBankStorage {
    constructor(file, io = fs) {
        this.file = file;
        this.io = io;
        this.pending = Promise.resolve();
        this.lastText = null;
        this.blocked = false;
    }
    async load() {
        let text;
        try { text = await this.io.readFile(this.file, "utf8"); }
        catch (e) {
            if (e.code === "ENOENT") return { bank: null };
            this.blocked = true;
            return { bank: null, warning: `Motif Bank read failed; autosave blocked: ${e.message}` };
        }
        try {
            const bank = validateMotifBank(JSON.parse(text));
            this.lastText = JSON.stringify(bank);
            return { bank };
        } catch (e) {
            const backup = `${this.file}.invalid-${randomUUID()}`;
            try { await this.io.rename(this.file, backup); }
            catch (error) {
                this.blocked = true;
                return { bank: null, warning: `Invalid Motif Bank; preservation failed, autosave blocked: ${error.message}` };
            }
            return { bank: null, warning: `${e.message}; preserved at ${backup}` };
        }
    }
    save(value) {
        const operation = this.pending.then(async () => {
            if (this.blocked) throw new Error("Motif Bank autosave blocked to preserve unreadable file");
            const text = JSON.stringify(validateMotifBank(value));
            if (text === this.lastText) return;
            await this.io.mkdir(path.dirname(this.file), { recursive: true });
            const temp = `${this.file}.${randomUUID()}.tmp`;
            try {
                const handle = await this.io.open(temp, "wx");
                try { await handle.writeFile(text, "utf8"); await handle.sync(); }
                finally { await handle.close(); }
                await this.io.rename(temp, this.file);
                this.lastText = text;
            } finally { await this.io.unlink(temp).catch(() => {}); }
        });
        this.pending = operation.catch(() => {});
        return operation;
    }
}
