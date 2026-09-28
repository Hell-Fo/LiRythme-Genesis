// Exercise the actual packaged app without writing into Dan's existing profile.
// The main-process debugger sets test paths before app.whenReady; no app code is changed.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const build = path.resolve(process.argv[2] ?? path.join(root, "dist/LiRythme-Genesis-1.0.0-field1-win32-x64"));
const testRoot = await fs.mkdtemp(path.join(root, "dist/field-smoke-"));
const userData = path.join(testRoot, "userData");
const documents = path.join(testRoot, "Documents");
await fs.mkdir(userData); await fs.mkdir(documents);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(operation) {
    let last;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try { const value = await operation(); if (value) return value; }
        catch (error) { last = error; }
        await pause(100);
    }
    throw last ?? new Error("Timed out waiting for packaged app");
}
async function connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    let id = 0;
    const events = [];
    const pending = new Map();
    socket.addEventListener("message", event => {
        const data = JSON.parse(event.data);
        if (data.method) events.push(data);
        const request = pending.get(data.id);
        if (!request) return;
        pending.delete(data.id);
        if (data.error) request.reject(new Error(JSON.stringify(data.error)));
        else request.resolve(data.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const key = ++id;
        const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout: ${method}`)); }, 15000);
        pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); },
            reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id: key, method, params }));
    });
    return { send, events, close: () => socket.close(), evaluate: async (expression, awaitPromise = true) => {
        const value = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
        if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
        return value.result.value;
    } };
}
const results = [];
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
for (let run = 0; run < 2; run++) {
    const mainPort = 19381 + run * 2, rendererPort = mainPort + 1;
    const child = spawn(path.join(build, "LiRythme-Genesis.exe"),
        [`--inspect-brk=${mainPort}`, `--remote-debugging-port=${rendererPort}`, "--remote-debugging-address=127.0.0.1"],
        { cwd: testRoot, windowsHide: true, env: environment });
    let log = "", exited = false, exitCode;
    child.stdout.on("data", data => { log += data; process.stdout.write(data); });
    child.stderr.on("data", data => { log += data; process.stderr.write(data); });
    child.on("exit", code => { exited = true; exitCode = code; });
    let main, renderer;
    try {
        const targets = await eventually(async () => {
            const response = await fetch(`http://127.0.0.1:${mainPort}/json/list`, { signal: AbortSignal.timeout(1000) });
            const targets = await response.json(); return targets.length && targets;
        });
        main = await connect(targets[0].webSocketDebuggerUrl);
        await main.send("Runtime.enable");
        await main.send("Debugger.enable");
        await main.send("Runtime.runIfWaitingForDebugger");
        await eventually(() => main.events.find(event => event.method === "Debugger.paused"));
        await main.evaluate(`(() => {
            const require = process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(build, "resources/app/package.json"))});
            const {app} = require('electron');
            app.setPath('userData', ${JSON.stringify(userData)});
            app.setPath('sessionData', ${JSON.stringify(userData)});
            app.setPath('documents', ${JSON.stringify(documents)});
            app.setAppLogsPath(${JSON.stringify(path.join(userData, "logs"))});
            // Main configures its Chromium log-file using this isolated userData.
            return true;
        })()`, false);
        await main.send("Debugger.resume");
        const page = await eventually(async () => {
            const pages = await (await fetch(`http://127.0.0.1:${rendererPort}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
            return pages.find(page => page.type === "page" && page.url.endsWith("index.html"));
        });
        renderer = await connect(page.webSocketDebuggerUrl);
        await eventually(() => renderer.evaluate(`document.getElementById('soundcheck-summary')?.textContent.includes('MIDI natif') ||
            document.getElementById('midi-controller')?.options.length > 0`));
        const paths = await main.evaluate(`(() => {
            const {app} = process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(build, "resources/app/package.json"))})('electron');
            return { packaged: app.isPackaged, userData: app.getPath('userData'), documents: app.getPath('documents') };
        })()`);
        assert.equal(paths.packaged, true); assert.equal(paths.userData, userData);
        const ports = await renderer.evaluate(`nativeMidi.request({type:'LIST_PORTS'})`);
        let controller = null, loopback = null;
        if (ports.inputs.some(port => port.name === "Launchpad Mini") &&
            ports.outputs.some(port => port.name === "Launchpad Mini")) {
            controller = await renderer.evaluate(`nativeMidi.request({type:'OPEN_CONTROLLER', name:'Launchpad Mini'})`);
            assert.equal(controller.opened, true);
        }
        if (ports.inputs.some(port => port.name === "loopMIDI Port")) {
            await main.evaluate(`(() => {
                const require = process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(build, "resources/app/package.json"))});
                const midi = require('@julusian/midi');
                globalThis.fieldInput = new midi.Input(); globalThis.fieldMessages = [];
                fieldInput.ignoreTypes(false, false, false);
                fieldInput.on('message', (_, message) => fieldMessages.push(message));
                for (let i = 0; i < fieldInput.getPortCount(); i++) {
                    if (fieldInput.getPortName(i) === 'loopMIDI Port') { fieldInput.openPort(i); break; }
                }
                return true;
            })()`);
            await renderer.evaluate(`nativeMidi.request({type:'SET_OUTPUT_ROUTING', notesOutputName:'loopMIDI Port', clockOutputName:null})`);
            await renderer.evaluate(`nativeMidi.request({type:'SEND_NOTES', name:'loopMIDI Port', message:[144,60,64]})`);
            // IPC acknowledgement precedes worker delivery; wait for Note On before release.
            await eventually(async () => (await main.evaluate('fieldMessages')).some(message => message[0] === 144));
            await renderer.evaluate(`nativeMidi.request({type:'SEND_NOTES', name:'loopMIDI Port', message:[128,60,0]})`);
            loopback = await eventually(async () => {
                const messages = await main.evaluate('fieldMessages');
                return messages.length >= 2 && messages;
            });
            assert.deepEqual(loopback.slice(0, 2), [[144,60,64], [128,60,0]]);
            await main.evaluate('fieldInput.closePort(); true');
            await renderer.evaluate(`nativeMidi.request({type:'SET_OUTPUT_ROUTING', notesOutputName:null, clockOutputName:null})`);
        }
        const timing = await main.evaluate(`(() => {
            const require = process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(build, "resources/app/package.json"))});
            const timing = require('./native/timing/build/Release/lirythme_timing.node');
            timing.prepareTimingThread(); timing.preciseSleep(1); return true;
        })()`);
        if (run === 0) {
            await renderer.evaluate(`(async () => {
                document.getElementById('focus-startup').checked = true;
                document.getElementById('focus-startup').dispatchEvent(new Event('change'));
                document.getElementById('pads-new').click();
                document.getElementById('pads-new-name').value = 'Field Build Persistence';
                document.getElementById('pads-create').click();
                const { LiRythmeState } = await import('./src/LiRythmeState.js');
                const { snapshotMotifBank } = await import('./src/MotifBankFormat.mjs');
                const state = new LiRythmeState();
                state.motifs[0].events[0][0] = true;
                state.motifs[0].voiceLengths[0] = 7;
                await motifBankFiles.save(snapshotMotifBank(state));
            })()`);
            await eventually(() => renderer.evaluate(`document.getElementById('pads-library').selectedOptions[0]?.textContent.includes('Field Build Persistence')`));
        } else {
            assert.equal(await renderer.evaluate(`localStorage.getItem('focusStartup')`), "true");
            assert.equal(await renderer.evaluate(`document.getElementById('pads-library').selectedOptions[0]?.textContent.includes('Field Build Persistence')`), true);
            const bank = await renderer.evaluate(`motifBankFiles.load()`);
            assert.equal(bank.bank.motifs[0].events[0][0], true);
            assert.equal(bank.bank.motifs[0].voiceLengths[0], 7);
            assert.equal(await renderer.evaluate(`document.getElementById('play-motif-duration').textContent`), "7 STEPS");
        }
        const summary = await renderer.evaluate(`document.getElementById('soundcheck-summary').textContent`);
        // Normal window close invokes the real Motif Bank flush and utility shutdown.
        await renderer.evaluate("window.close()").catch(() => {});
        renderer.close(); main.close();
        await eventually(() => exited);
        assert.equal(exitCode, 0);
        assert.doesNotMatch(log, /Unable to load|save failed|utility exited with code: [1-9]|uncaught exception/i);
        results.push({ run: run + 1, paths, ports, controller, loopback, timing, summary, exitCode, log });
    } finally {
        renderer?.close(); main?.close();
        if (!exited) child.kill();
        await fs.writeFile(path.join(testRoot, `run-${run + 1}.log`), log);
    }
}
const manifest = JSON.parse(await fs.readFile(path.join(build, "BUILD-MANIFEST.json"), "utf8"));
const { createHash } = await import("node:crypto");
for (const [file, hash] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(build, file))).digest('hex'), hash,
        `Packaged resource changed during runtime: ${file}`);
}
const actualFiles = (await fs.readdir(build, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => path.relative(build, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .filter(file => file !== "BUILD-MANIFEST.json").sort();
assert.deepEqual(actualFiles, Object.keys(manifest.files).sort(), "Unexpected file written into portable folder");
await fs.writeFile(path.join(testRoot, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ testRoot, results }, null, 2));
