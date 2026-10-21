import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Usage: node scripts/validate-windows-release.mjs <portable-build-directory>');
const build = path.resolve(process.argv[2]);
const manifest = JSON.parse(await fs.readFile(path.join(build, 'BUILD-MANIFEST.json'), 'utf8'));
if (!manifest.gitCommit || typeof manifest.gitDirty !== 'boolean' || !manifest.createdAt)
    throw new Error('Build lacks source provenance; rebuild before release validation.');
const packaged = new Map(Object.entries(manifest.files));
const files = ['main.js', 'preload.js', 'index.html', 'docs/GUIDE-UTILISATION.md'];
for (const directory of ['src', 'assets']) {
    for (const entry of await fs.readdir(path.join(root, directory), { recursive: true, withFileTypes: true }))
        if (entry.isFile()) files.push(path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
}
for (const file of files) {
    const expected = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
    if (packaged.get(`resources/app/${file}`) !== expected) throw new Error(`Portable is stale or missing current source: ${file}`);
    packaged.delete(`resources/app/${file}`);
}
if ([...packaged.keys()].some(file => file.startsWith('resources/app/src/') || file.startsWith('resources/app/assets/')))
    throw new Error('Portable contains source/assets removed from the workspace.');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
for (const args of [pkg.scripts.test.split(' ').slice(1), ['scripts/test-windows-portable.mjs', build]]) {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(JSON.stringify({ build, commit: manifest.gitCommit, dirty: manifest.gitDirty, validated: true }));
