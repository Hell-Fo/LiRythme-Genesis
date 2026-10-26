import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseGuide, searchGuide, initializeHelpUI } from "../src/HelpUI.mjs";

const guide = await fs.readFile(new URL("../docs/GUIDE-UTILISATION.md", import.meta.url), "utf8");
const articles = parseGuide(guide);

test("guide articles retain their chapter context and complete subsection content", () => {
    assert.equal(articles.filter(article => !article.child).length, 16);
    const loop = articles.find(article => article.title === "Loop Point");
    assert.match(loop.section, /Chain, NEXT et FOCUS/);
    assert.match(loop.body, /SHIFT/);
    assert.equal(new Set(articles.map(article => article.id)).size, articles.length);
    assert.equal(parseGuide(guide.replace(/\n/g, "\r\n")).length, articles.length);
});

test("search ignores accents and case, matches all meaningful terms and ranks titles first", () => {
    assert.deepEqual(searchGuide(articles, "VÉLOCITÉ"), searchGuide(articles, "velocity"));
    assert.equal(searchGuide(articles, "loop point")[0].title, "Loop Point");
    assert.equal(searchGuide(articles, "comment déplacer la chaîne")[0].title, "Déplacer un bloc pendant PLAY");
    assert.equal(searchGuide(articles, "déplacement bloc chaîne")[0].title, "Déplacer un bloc pendant PLAY");
    assert.deepEqual(searchGuide(articles, "aucunsujetcorrespondant"), []);
    assert.deepEqual(searchGuide(articles, "   "), []);
    const results = searchGuide(articles, "ratchet");
    assert.ok(results.length > 1);
    assert.match(results[0].title, /RATCHET/);
});

class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.attributes = {}; this.value = ""; this.textContent = ""; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(event, callback) { this.events[event] = callback; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelectorAll(tag) { return this.children.flatMap(child => [ ...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag) ]); }
    focus() { this.focused = true; }
}
function fixture() {
    const fields = new Map();
    const document = { getElementById(id) { if (!fields.has(id)) fields.set(id, new Node("div")); return fields.get(id); },
        createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node("text"), { textContent: text }) };
    return { document, get: document.getElementById };
}

test("HELP loads the menu, opens articles, searches live, clears and safely renders tables", async () => {
    const { document, get } = fixture();
    await initializeHelpUI({ document, readGuide: async () => guide }).ready;
    assert.equal(get("help-search").disabled, false);
    assert.equal(get("help-menu").children.length, articles.length);
    const colors = get("help-menu").children.find(button => button.textContent === "Les couleurs utiles");
    colors.events.click();
    assert.equal(get("help-articles").querySelectorAll("table").length, 1);
    assert.equal(get("help-articles").focused, true);
    const input = get("help-search"); input.value = "loop point"; input.events.input();
    assert.equal(get("help-articles").children[0].querySelectorAll("h3")[0].textContent, "Loop Point");
    input.value = "<script>alert(1)</script>"; input.events.input();
    assert.match(get("help-articles").children[0].textContent, /Aucun article/);
    assert.equal(get("help-articles").querySelectorAll("script").length, 0);
    input.value = ""; input.events.input();
    assert.match(get("help-results-status").textContent, /Sommaire/);
    get("help-menu").children.find(button => button.textContent.includes("5. Attributs")).events.click();
    assert.ok(get("help-articles").querySelectorAll("article").length > 1);
});

test("a failed guide load offers a retry and recovers", async () => {
    const { document, get } = fixture();
    let attempts = 0;
    await initializeHelpUI({ document, readGuide: async () => { if (!attempts++) throw new Error("Unavailable"); return guide; } }).ready;
    assert.match(get("help-results-status").textContent, /pas pu/);
    await get("help-articles").children[0].events.click();
    assert.equal(get("help-search").disabled, false);
    assert.equal(get("help-menu").children.length, articles.length);
});
