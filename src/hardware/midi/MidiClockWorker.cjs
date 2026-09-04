const {
    parentPort,
    receiveMessageOnPort
} = require("node:worker_threads");
const path = require("node:path");
const midi = require("@julusian/midi");

const timingAddonPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "native",
    "timing",
    "build",
    "Release",
    "lirythme_timing.node"
);

let timing;

try {
    timing = require(timingAddonPath);
} catch (error) {
    throw new Error(
        `Unable to load native timing addon: ${timingAddonPath}`,
        { cause: error }
    );
}

const { prepareTimingThread, preciseSleep } = timing;

const MIDI_CLOCK = 0xF8;
const MIDI_START = 0xFA;
const MIDI_CONTINUE = 0xFB;
const MIDI_STOP = 0xFC;
const PPQN = 24;
const DEFAULT_STEP_DIVISION = 16;
const PULSES_PER_WHOLE_NOTE = PPQN * 4;
const NS_PER_MS = 1_000_000n;
const FINE_WAIT_NS = 1_000_000n;
const MAX_COARSE_SLEEP_MS = 2;
const MIDI_SEND_GUARD_NS = 2_000_000n;
const MAX_PENDING_MIDI_MESSAGES = 256;
const DIAGNOSTIC_DURATION_NS = 10_000_000_000n;

let destinationName = null;
let output = null;
let clockOutputSelected = false;
let tempo = 120;
let source = "INTERNAL";
let enabled = false;
let loopRunning = false;
let loopScheduled = false;
let shuttingDown = false;
let nextPulseTimeNs = 0n;
let diagnostic = null;
let pendingNoteOffMessages = [];
let pendingMidiMessages = [];
let idleMidiFlushScheduled = false;
let logicalPulseSequence = 0;
let nativeStepSequence = 0;
let nativeStepPhase = 0;
let stepTransportRunning = false;
let transportRevision = 0;

function post(message) {
    parentPort.postMessage(message);
}

function serializeError(error) {
    return {
        name: error?.name ?? null,
        message: error?.message ?? String(error),
        code: error?.code ?? null,
        stack: error?.stack ?? null
    };
}

function getPulseIntervalNs() {
    return BigInt(
        Math.round(
            60_000_000_000 / (tempo * PPQN)
        )
    );
}

function canRun() {
    return Boolean(
        enabled &&
        source === "INTERNAL" &&
        !shuttingDown
    );
}

function startDiagnostic() {
    diagnostic = {
        startedAtNs: process.hrtime.bigint(),
        f8Sent: 0,
        firstCallTimeNs: null,
        previousCallTimeNs: null,
        intervalCount: 0,
        intervalTotalNs: 0n,
        minimumIntervalNs: null,
        maximumIntervalNs: null,
        abandonedPulses: 0,
        maximumLatenessNs: 0n,
        pendingMidiPeak: getPendingMidiCount(),
        midiMessagesSent: 0,
        midiMessagesDropped: 0,
        stepDivision: DEFAULT_STEP_DIVISION,
        pulsesPerStep:
            PULSES_PER_WHOLE_NOTE / DEFAULT_STEP_DIVISION,
        stepPhase: 0,
        logicalPulses: 0,
        nativeStepsGenerated: 0,
        reported: false
    };
}

function reportDiagnostic({ force = false } = {}) {
    if (!diagnostic || diagnostic.reported) {
        return;
    }

    const nowNs = process.hrtime.bigint();

    if (
        !force &&
        nowNs - diagnostic.startedAtNs <
            DIAGNOSTIC_DURATION_NS
    ) {
        return;
    }

    diagnostic.reported = true;

    const averageIntervalMs = diagnostic.intervalCount > 0
        ? Number(diagnostic.intervalTotalNs) /
            diagnostic.intervalCount /
            1_000_000
        : null;
    const spanMs = diagnostic.intervalCount > 0
        ? Number(
            diagnostic.previousCallTimeNs -
            diagnostic.firstCallTimeNs
        ) /
            1_000_000
        : null;

    post({
        type: "DIAGNOSTIC",
        durationMs:
            Number(nowNs - diagnostic.startedAtNs) / 1_000_000,
        destinationName,
        tempo,
        ppqn: PPQN,
        f8Sent: diagnostic.f8Sent,
        f8PerSecond: spanMs > 0
            ? diagnostic.intervalCount * 1000 / spanMs
            : null,
        averageIntervalMs,
        minimumIntervalMs: diagnostic.minimumIntervalNs !== null
            ? Number(diagnostic.minimumIntervalNs) / 1_000_000
            : null,
        maximumIntervalMs: diagnostic.maximumIntervalNs !== null
            ? Number(diagnostic.maximumIntervalNs) / 1_000_000
            : null,
        derivedBpm: averageIntervalMs > 0
            ? 60000 / (averageIntervalMs * PPQN)
            : null,
        abandonedPulses: diagnostic.abandonedPulses,
        maximumLatenessMs:
            Number(diagnostic.maximumLatenessNs) / 1_000_000,
        pendingMidiPeak: diagnostic.pendingMidiPeak,
        midiMessagesSent: diagnostic.midiMessagesSent,
        midiMessagesDropped: diagnostic.midiMessagesDropped,
        stepDivision: diagnostic.stepDivision,
        pulsesPerStep: diagnostic.pulsesPerStep,
        logicalPulses: diagnostic.logicalPulses,
        nativeStepsGenerated: diagnostic.nativeStepsGenerated
    });
}

function recordDiagnosticPulse(deadlineNs) {
    if (!diagnostic) {
        return;
    }

    logicalPulseSequence += 1;
    diagnostic.logicalPulses += 1;
    diagnostic.stepPhase += diagnostic.stepDivision;

    if (diagnostic.stepPhase >= PULSES_PER_WHOLE_NOTE) {
        diagnostic.stepPhase -= PULSES_PER_WHOLE_NOTE;
        diagnostic.nativeStepsGenerated += 1;
    }

    if (!stepTransportRunning) {
        return;
    }

    nativeStepPhase += DEFAULT_STEP_DIVISION;

    if (nativeStepPhase >= PULSES_PER_WHOLE_NOTE) {
        nativeStepPhase -= PULSES_PER_WHOLE_NOTE;
        nativeStepSequence += 1;

        post({
            type: "STEP",
            sequence: nativeStepSequence,
            logicalPulse: logicalPulseSequence,
            stepDivision: DEFAULT_STEP_DIVISION,
            transportRevision,
            deadlineNs: deadlineNs.toString()
        });
    }
}

function setStepTransport(status, revision) {
    if (Number.isSafeInteger(revision) && revision >= 0) {
        transportRevision = revision;
    }

    stepTransportRunning =
        status === "START" || status === "CONTINUE";
    nativeStepPhase = 0;
}

function getPendingMidiCount() {
    return pendingNoteOffMessages.length +
        pendingMidiMessages.length;
}

function isNoteOff(message) {
    const messageType = message[0] & 0xF0;

    return messageType === 0x80 ||
        (
            messageType === 0x90 &&
            message.length >= 3 &&
            message[2] === 0
        );
}

function recordMidiDrop(count = 1) {
    if (diagnostic) {
        diagnostic.midiMessagesDropped += count;
    }
}

function validateShortMidiMessage(message) {
    if (
        !Array.isArray(message) ||
        message.length < 1 ||
        message.length > 3 ||
        message[0] < 0x80 ||
        message[0] === 0xF0 ||
        message[0] === 0xF7 ||
        message.some(
            byte =>
                !Number.isInteger(byte) ||
                byte < 0 ||
                byte > 0xFF
        )
    ) {
        throw new TypeError(
            "SEND_MIDI expects a non-SysEx MIDI message of 1 to 3 bytes"
        );
    }

    if (
        message.slice(1).some(byte => byte > 0x7F)
    ) {
        throw new TypeError(
            "SEND_MIDI data bytes must be between 0 and 127"
        );
    }

    return [...message];
}

function enqueueMidiMessage(message) {
    let validatedMessage;

    try {
        validatedMessage = validateShortMidiMessage(message);
    } catch (error) {
        recordMidiDrop();
        throw error;
    }

    const noteOff = isNoteOff(validatedMessage);

    if (getPendingMidiCount() >= MAX_PENDING_MIDI_MESSAGES) {
        if (noteOff && pendingMidiMessages.length > 0) {
            pendingMidiMessages.shift();
            recordMidiDrop();
        } else {
            recordMidiDrop();
            return;
        }
    }

    if (noteOff) {
        pendingNoteOffMessages.push(validatedMessage);
    } else {
        pendingMidiMessages.push(validatedMessage);
    }

    if (diagnostic) {
        diagnostic.pendingMidiPeak = Math.max(
            diagnostic.pendingMidiPeak,
            getPendingMidiCount()
        );
    }

    scheduleIdleMidiFlush();
}

function takePendingMidiMessage() {
    return pendingNoteOffMessages.shift() ??
        pendingMidiMessages.shift() ??
        null;
}

function sendOnePendingMidiMessage() {
    if (!output) {
        return false;
    }

    const message = takePendingMidiMessage();

    if (!message) {
        return false;
    }

    try {
        output.sendMessage(message);
    } catch (error) {
        recordMidiDrop();
        post({
            type: "ERROR",
            operation: "SEND_MIDI",
            error: serializeError(error)
        });
        return false;
    }

    if (diagnostic) {
        diagnostic.midiMessagesSent += 1;
    }

    return true;
}

function sendOneMidiMessageAfterClockPulse() {
    if (getPendingMidiCount() === 0) {
        return;
    }

    const remainingNs =
        nextPulseTimeNs - process.hrtime.bigint();

    if (remainingNs <= MIDI_SEND_GUARD_NS) {
        return;
    }

    sendOnePendingMidiMessage();
}

function scheduleIdleMidiFlush() {
    if (
        idleMidiFlushScheduled ||
        canRun() ||
        !output ||
        getPendingMidiCount() === 0
    ) {
        return;
    }

    idleMidiFlushScheduled = true;
    setImmediate(flushOneMidiMessageWhileClockIdle);
}

function flushOneMidiMessageWhileClockIdle() {
    idleMidiFlushScheduled = false;

    if (canRun() || !output) {
        return;
    }

    sendOnePendingMidiMessage();
    scheduleIdleMidiFlush();
}

function dropPendingMidiMessages() {
    const dropped = getPendingMidiCount();

    pendingNoteOffMessages = [];
    pendingMidiMessages = [];
    recordMidiDrop(dropped);
}

function stopClock({ report = true } = {}) {
    nextPulseTimeNs = 0n;

    if (report) {
        reportDiagnostic({ force: true });
    }
}

function closePhysicalOutput() {
    dropPendingMidiMessages();

    if (!output) {
        return;
    }

    output.closePort();
    output = null;
}

function startClockLoopIfReady() {
    if (!canRun() || loopRunning || loopScheduled) {
        return;
    }

    loopScheduled = true;

    setImmediate(runClockLoop);
}

function initializeClockPhase() {
    nextPulseTimeNs =
        process.hrtime.bigint() + getPulseIntervalNs();
    startDiagnostic();
}

function setDestination(name) {
    if (name === destinationName && output) {
        return;
    }

    closePhysicalOutput();
    destinationName = name || null;

    if (!destinationName) {
        post({ type: "DESTINATION", name: null, opened: false });
        return;
    }

    const candidate = new midi.Output();
    const outputs = [];

    for (let index = 0; index < candidate.getPortCount(); index++) {
        outputs.push({
            index,
            name: candidate.getPortName(index)
        });
    }

    const destination = outputs.find(
        port => port.name === destinationName
    );

    if (!destination) {
        candidate.closePort();
        post({
            type: "ERROR",
            operation: "SET_DESTINATION",
            error: {
                message: `Native MIDI output not found: ${destinationName}`
            },
            outputs
        });
        return;
    }

    try {
        candidate.openPort(destination.index);
        output = candidate;
        post({
            type: "DESTINATION",
            name: destination.name,
            index: destination.index,
            opened: true
        });
        startClockLoopIfReady();
    } catch (error) {
        candidate.closePort();
        post({
            type: "ERROR",
            operation: "OPEN_DESTINATION",
            destination,
            error: serializeError(error)
        });
    }
}

function sendTransport(status, companionMessage = null) {
    if (!clockOutputSelected || !output) {
        return;
    }

    const messages = {
        START: MIDI_START,
        CONTINUE: MIDI_CONTINUE,
        STOP: MIDI_STOP
    };
    const message = messages[status];

    if (message !== undefined) {
        output.sendMessage([message]);

        if (Array.isArray(companionMessage)) {
            output.sendMessage(companionMessage);
        }
    }
}

function sendRealtimeThru(status) {
    if (
        source !== "MIDI" ||
        !clockOutputSelected ||
        !output
    ) {
        return;
    }

    if (
        status !== MIDI_CLOCK &&
        status !== MIDI_START &&
        status !== MIDI_CONTINUE &&
        status !== MIDI_STOP
    ) {
        return;
    }

    output.sendMessage([status]);
}

function handleCommand(command) {
    switch (command?.type) {
        case "SET_DESTINATION":
            setDestination(command.name);
            break;

        case "SET_CLOCK_OUTPUT_SELECTED":
            clockOutputSelected = Boolean(command.selected);
            break;

        case "SET_TEMPO": {
            const nextTempo = Number(command.bpm);

            if (Number.isFinite(nextTempo) && nextTempo > 0) {
                tempo = nextTempo;
            }
            break;
        }

        case "SET_SOURCE":
            source = command.source === "MIDI"
                ? "MIDI"
                : "INTERNAL";

            if (source === "INTERNAL") {
                startClockLoopIfReady();
            } else {
                stopClock();
            }
            break;

        case "SET_ENABLED":
            enabled = Boolean(command.enabled);

            if (enabled) {
                startClockLoopIfReady();
            } else {
                stopClock();
            }
            break;

        case "TRANSPORT":
            setStepTransport(
                command.status,
                command.transportRevision
            );
            sendTransport(
                command.status,
                command.companionMessage
            );
            break;

        case "MIDI_REALTIME_THRU":
            sendRealtimeThru(command.status);
            break;

        case "SET_STEP_TRANSPORT":
            if (source === "INTERNAL") {
                setStepTransport(
                    command.status,
                    command.transportRevision
                );
            }
            break;

        case "SEND_MIDI":
            enqueueMidiMessage(command.message);
            break;

        case "SHUTDOWN":
            shuttingDown = true;
            closePhysicalOutput();
            stopClock();
            post({ type: "SHUTDOWN_ACK" });
            break;
    }
}

function handleCommandSafely(command) {
    try {
        handleCommand(command);
    } catch (error) {
        post({
            type: "ERROR",
            operation: command?.type ?? "UNKNOWN",
            error: serializeError(error)
        });
    }
}

function drainCommands() {
    let entry = receiveMessageOnPort(parentPort);

    while (entry) {
        handleCommandSafely(entry.message);
        entry = receiveMessageOnPort(parentPort);
    }
}

function abandonPastDeadlines(nowNs, pulseIntervalNs) {
    if (nowNs < nextPulseTimeNs + pulseIntervalNs) {
        return false;
    }

    const missedPulses =
        ((nowNs - nextPulseTimeNs) / pulseIntervalNs) + 1n;

    nextPulseTimeNs += missedPulses * pulseIntervalNs;

    if (diagnostic) {
        diagnostic.abandonedPulses += Number(missedPulses);
    }

    return true;
}

function recordNativeCall(callTimeNs, latenessNs) {
    if (!diagnostic) {
        return;
    }

    if (diagnostic.firstCallTimeNs === null) {
        diagnostic.firstCallTimeNs = callTimeNs;
    }

    if (diagnostic.previousCallTimeNs !== null) {
        const intervalNs =
            callTimeNs - diagnostic.previousCallTimeNs;

        diagnostic.intervalCount += 1;
        diagnostic.intervalTotalNs += intervalNs;

        if (
            diagnostic.minimumIntervalNs === null ||
            intervalNs < diagnostic.minimumIntervalNs
        ) {
            diagnostic.minimumIntervalNs = intervalNs;
        }

        if (
            diagnostic.maximumIntervalNs === null ||
            intervalNs > diagnostic.maximumIntervalNs
        ) {
            diagnostic.maximumIntervalNs = intervalNs;
        }
    }

    diagnostic.f8Sent += 1;
    diagnostic.previousCallTimeNs = callTimeNs;

    if (latenessNs > diagnostic.maximumLatenessNs) {
        diagnostic.maximumLatenessNs = latenessNs;
    }
}

function waitForDeadline(deadlineNs) {
    let nowNs = process.hrtime.bigint();

    while (nowNs < deadlineNs) {
        const remainingNs = deadlineNs - nowNs;

        if (remainingNs > FINE_WAIT_NS) {
            const coarseMs = Math.min(
                MAX_COARSE_SLEEP_MS,
                Math.max(
                    1,
                    Number(
                        (remainingNs - FINE_WAIT_NS) /
                        NS_PER_MS
                    )
                )
            );

            preciseSleep(coarseMs);
            drainCommands();

            if (!canRun()) {
                return null;
            }
        }

        nowNs = process.hrtime.bigint();
    }

    return process.hrtime.bigint();
}

function runClockLoop() {
    loopScheduled = false;

    if (!canRun()) {
        return;
    }

    loopRunning = true;

    if (nextPulseTimeNs === 0n) {
        initializeClockPhase();
    }

    while (canRun()) {
        drainCommands();

        if (!canRun()) {
            break;
        }

        if (nextPulseTimeNs === 0n) {
            initializeClockPhase();
        }

        const pulseIntervalNs = getPulseIntervalNs();
        const nowNs = process.hrtime.bigint();

        if (abandonPastDeadlines(nowNs, pulseIntervalNs)) {
            continue;
        }

        const callTimeNs = waitForDeadline(nextPulseTimeNs);

        if (callTimeNs === null) {
            break;
        }

        if (abandonPastDeadlines(callTimeNs, pulseIntervalNs)) {
            continue;
        }

        const latenessNs = callTimeNs - nextPulseTimeNs;

        if (clockOutputSelected && output) {
            output.sendMessage([MIDI_CLOCK]);
            recordNativeCall(callTimeNs, latenessNs);
        }

        recordDiagnosticPulse(nextPulseTimeNs);

        nextPulseTimeNs += pulseIntervalNs;
        sendOneMidiMessageAfterClockPulse();
        reportDiagnostic();
    }

    loopRunning = false;

    scheduleIdleMidiFlush();

    if (shuttingDown) {
        process.exit(0);
        return;
    }

    startClockLoopIfReady();
}

parentPort.on("message", command => {
    handleCommandSafely(command);

    if (shuttingDown && !loopRunning) {
        process.exit(0);
    }
});

prepareTimingThread();

post({
    type: "READY",
    electron: process.versions.electron,
    node: process.versions.node
});
