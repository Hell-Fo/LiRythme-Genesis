export const FORMAT = "LiRythme Pad Configuration";
export const EXTENSION = ".lirythme-pads.json";
export function voiceKey(id) {
    if (!Number.isInteger(id) || id < 0 || id > 15) throw new Error("voiceId invalide");
    return `VOICE ${String(id + 1).padStart(2, "0")}`;
}
export function voiceId(key) {
    const id = Array.from({ length: 16 }, (_, i) => voiceKey(i)).indexOf(key);
    if (id < 0) throw new Error(`Adresse Voice inconnue : ${key}`);
    return id;
}
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
function fail(errors) { if (errors.length) throw new Error(errors.join("\n")); }

// JSON.parse owns syntax. This scan only tracks containers and decoded object keys.
// Strings are consumed whole, so braces/colons inside text cannot affect the scan.
function checkDuplicateKeys(text) {
    const tokens = [...text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g)];
    const stack = [];
    const errors = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i][0];
        if (token === "{" || token === "[") {
            stack.push({ keys: new Set(), label: tokens[i - 1]?.[0] === ":" ? JSON.parse(tokens[i - 2][0]) : "document" });
        } else if (token === "}" || token === "]") stack.pop();
        else if (token.startsWith('"') && tokens[i + 1]?.[0] === ":") {
            const key = JSON.parse(token);
            const scope = stack.at(-1);
            if (scope.keys.has(key)) {
                const before = text.slice(0, tokens[i].index);
                errors.push(`${scope.label} → ${key} : clé dupliquée (ligne ${before.split("\n").length}, colonne ${before.length - before.lastIndexOf("\n")}).`);
            }
            scope.keys.add(key);
        }
    }
    fail(errors);
}

export function validateDocument(doc) {
    const errors = [];
    const error = (path, message) => errors.push(`${path} : ${message}`);
    const fields = (value, allowed, path) => {
        for (const key of Object.keys(value)) if (!allowed.includes(key)) error(`${path} → ${key}`, "champ non supporté en Phase B.");
    };
    if (!object(doc)) throw new Error("Le document doit être un objet JSON.");
    fields(doc, ["format", "version", "name", "description", "voices"], "document");
    if (doc.format !== FORMAT) error("format", `attendu : "${FORMAT}".`);
    if (doc.version !== 1) error("version", "seule la version 1 est supportée.");
    if (typeof doc.name !== "string") error("name", "chaîne de caractères obligatoire.");
    if ("description" in doc && typeof doc.description !== "string") error("description", "chaîne de caractères attendue.");
    if (!object(doc.voices)) error("voices", "objet obligatoire définissant VOICE 01 à VOICE 16.");
    else {
        const expected = Array.from({ length: 16 }, (_, i) => voiceKey(i));
        for (const key of Object.keys(doc.voices)) if (!expected.includes(key)) error(key, "Voice supplémentaire ou adresse inconnue ; utiliser VOICE 01 à VOICE 16.");
        for (const key of expected) {
            if (!Object.hasOwn(doc.voices, key)) { error(key, "Voice manquante. Définir VOICE 01 à VOICE 16."); continue; }
            const v = doc.voices[key];
            if (!object(v)) { error(key, "objet attendu."); continue; }
            if (typeof v.name !== "string") error(`${key} → name`, "chaîne de caractères obligatoire.");
            if (!["NONE", "MIDI DRUM"].includes(v.type)) { error(`${key} → type`, `type inconnu : ${JSON.stringify(v.type) ?? "champ absent"}.`); continue; }
            fields(v, v.type === "NONE" ? ["name", "type"] : ["name", "type", "output", "channel", "note"], key);
            if (v.type === "NONE") continue;
            for (const [field, min, max] of [["channel", 1, 16], ["note", 0, 127]]) {
                if (!Object.hasOwn(v, field)) error(`${key} → ${field}`, "champ obligatoire pour MIDI DRUM.");
                else if (!Number.isInteger(v[field]) || v[field] < min || v[field] > max) error(`${key} → ${field}`, `valeur reçue : ${JSON.stringify(v[field])}. Un entier de ${min} à ${max} est requis.`);
            }
            if (!object(v.output)) error(`${key} → output`, "objet obligatoire pour MIDI DRUM.");
            else {
                fields(v.output, ["mode"], `${key} → output`);
                if (v.output.mode !== "DEFAULT") error(`${key} → output.mode`, `valeur reçue : ${JSON.stringify(v.output.mode)}. Seul DEFAULT est supporté ; DEVICE et les destinations explicites nécessitent une phase future.`);
            }
        }
    }
    fail(errors);
    return doc;
}

export function parseConfiguration(text) {
    if (typeof text !== "string") throw new Error("Texte JSON attendu.");
    text = text.replace(/^\uFEFF/, "");
    let doc;
    try { doc = JSON.parse(text); }
    catch (error) { throw new Error(`JSON invalide : ${error.message}`); }
    checkDuplicateKeys(text);
    validateDocument(doc);
    return {
        name: doc.name,
        ...(doc.description !== undefined ? { description: doc.description } : {}),
        voices: Array.from({ length: 16 }, (_, id) => ({ id: voiceId(voiceKey(id)), ...doc.voices[voiceKey(id)] }))
    };
}

export function serializeConfiguration(config) {
    if (!object(config) || !Array.isArray(config.voices) || config.voices.length !== 16) throw new Error("La configuration doit contenir exactement 16 Voices.");
    const voices = {};
    config.voices.forEach((voice, id) => {
        if (!object(voice) || voice.id !== id) throw new Error(`${voiceKey(id)} : identité interne invalide.`);
        const { id: unused, ...data } = voice;
        voices[voiceKey(id)] = data;
    });
    const doc = { format: FORMAT, version: 1, name: config.name,
        ...(config.description !== undefined ? { description: config.description } : {}), voices };
    validateDocument(doc);
    return JSON.stringify(doc, null, 2) + "\n";
}

export function activateConfiguration(state, text) {
    const next = parseConfiguration(text);
    if (!["STOP", "PAUSE"].includes(state.transportState)) throw new Error("Fichier valide, activation refusée pendant PLAY. Passez en STOP ou PAUSE, puis réessayez la sélection.");
    state.padConfiguration = next;
    return next;
}
