import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Build #1 requires Windows x64 and its tested native timing binary.");
}
const pkg = require("../package.json");
const electron = require("electron/package.json");
const fieldBuild = Number(process.argv[2] ?? 1);
if (!Number.isSafeInteger(fieldBuild) || fieldBuild < 1) throw new Error("Invalid field build number.");
const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const output = path.join(root, "dist", `LiRythme-Genesis-${pkg.version}-field${fieldBuild}-win32-x64`);
// Never replace a previous field artifact implicitly.
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(output);
const app = path.join(output, "resources", "app");
await fs.cp(path.join(root, "node_modules/electron/dist"), output, {
    recursive: true, filter: source => path.basename(source) !== "debug.log"
});
await fs.rm(path.join(output, "resources/default_app.asar"), { force: true });
await fs.rename(path.join(output, "electron.exe"), path.join(output, "LiRythme-Genesis.exe"));
await fs.mkdir(app, { recursive: true });
for (const name of ["main.js", "preload.js", "index.html", "src", "assets"]) {
    await fs.cp(path.join(root, name), path.join(app, name), { recursive: true });
}
await fs.mkdir(path.join(app, "docs/examples"), { recursive: true });
await fs.copyFile(path.join(root, "docs/GUIDE-UTILISATION.md"), path.join(app, "docs/GUIDE-UTILISATION.md"));
await fs.copyFile(path.join(root, "docs/examples/DrumBrute Impact.lirythme-pads.json"),
    path.join(app, "docs/examples/DrumBrute Impact.lirythme-pads.json"));
await fs.writeFile(path.join(app, "package.json"), JSON.stringify({
    name: pkg.name, version: pkg.version, main: pkg.main, type: pkg.type,
    license: pkg.license, dependencies: pkg.dependencies
}, null, 2) + "\n");

// Copy the installed production dependency closure, excluding build tools.
const copied = new Map();
async function copyDependency(name, from) {
    const dependencyRequire = createRequire(path.join(from, "package.json"));
    const manifest = dependencyRequire.resolve(`${name}/package.json`);
    const directory = path.dirname(manifest);
    const destination = path.join(app, "node_modules", name);
    if (copied.has(name)) {
        if (copied.get(name) !== directory) throw new Error(`Dependency collision: ${name}`);
        return;
    }
    copied.set(name, directory);
    await fs.cp(directory, destination, { recursive: true });
    const metadata = JSON.parse(await fs.readFile(manifest, "utf8"));
    for (const child of Object.keys(metadata.dependencies ?? {})) await copyDependency(child, directory);
}
for (const name of Object.keys(pkg.dependencies)) await copyDependency(name, root);
const nativeFile = "native/timing/build/Release/lirythme_timing.node";
await fs.mkdir(path.dirname(path.join(app, nativeFile)), { recursive: true });
await fs.copyFile(path.join(root, nativeFile), path.join(app, nativeFile));
await fs.copyFile(path.join(root, `docs/WINDOWS-FIELD-BUILD-${fieldBuild}.md`), path.join(output, "FIELD-TEST.md"));
const hashes = {};
async function hashTree(directory, prefix = "") {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const relative = path.posix.join(prefix, entry.name);
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) await hashTree(full, relative);
        else hashes[relative] = createHash("sha256").update(await fs.readFile(full)).digest("hex");
    }
}
await hashTree(output);
await fs.writeFile(path.join(output, "BUILD-MANIFEST.json"), JSON.stringify({
    fieldBuild, gitCommit, version: pkg.version, electron: electron.version,
    platform: process.platform, arch: process.arch, files: hashes
}, null, 2) + "\n");
console.log(output);
