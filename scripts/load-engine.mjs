import fs from 'node:fs/promises';

export const source = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const at = new URL('../src/ATTransaction.mjs', import.meta.url).href;
const moduleURL = text => `data:text/javascript;base64,${Buffer.from(text.replace('"./ATTransaction.mjs"', JSON.stringify(at))).toString('base64')}`;

export async function loadEngine({ actions: includeActions = true } = {}) {
    const pad = moduleURL(await source('PadConfiguration.js'));
    const state = await import(moduleURL((await source('LiRythmeState.js')).replace('"./PadConfiguration.js"', JSON.stringify(pad))));
    const clock = await import(moduleURL(await source('LiRythmeClock.js')));
    const actions = includeActions ? await import(moduleURL(await source('LiRythmeActions.js'))) : {};
    return { ...state, ...clock, ...actions };
}
