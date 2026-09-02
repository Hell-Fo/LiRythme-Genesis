'use strict';

const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { app } = require('electron');

const addonPath = path.join(
  __dirname,
  '..',
  'native',
  'timing',
  'build',
  'Release',
  'lirythme_timing.node',
);

app.whenReady().then(() => {
  try {
    const timing = require(addonPath);
    const prepareResult = timing.prepareTimingThread();
    const requestedMilliseconds = 10;
    const startedAt = performance.now();
    timing.preciseSleep(requestedMilliseconds);
    const elapsedMilliseconds = performance.now() - startedAt;

    console.log(JSON.stringify({
      loaded: true,
      electron: process.versions.electron,
      modules: process.versions.modules,
      prepareTimingThread: prepareResult,
      preciseSleep: {
        requestedMilliseconds,
        elapsedMilliseconds,
        completed: elapsedMilliseconds >= requestedMilliseconds * 0.8,
      },
      closingCleanly: true,
    }));
    app.quit();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    app.exit(1);
  }
});
