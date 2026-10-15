export function parseGuide(markdown) {
    const articles = [];
    let section = null, article = null;
    for (const line of markdown.replace(/\r/g, "").split("\n")) {
        const heading = /^(#{2,3})\s+(.+)$/.exec(line);
        if (heading) {
            if (heading[1] === "##") section = heading[2];
            // The introductory reading itinerary precedes the numbered guide.
            if (!section) continue;
            article = { id: `guide-${articles.length + 1}`, title: heading[2],
                section, child: heading[1] === "###", body: "" };
            articles.push(article);
        } else if (article) article.body += line + "\n";
    }
    for (const item of articles) item.body = item.body.trim();
    return articles;
}

const normalize = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\bchain(?:e|es|s)?\b/g, "chain")
    .replace(/\bvelocit(?:e|es|y)\b/g, "velocity")
    .replace(/\bdeplac(?:er|ement|ements)\b/g, "deplacer")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stopWords = new Set(["le", "la", "les", "un", "une", "des", "du", "de", "d", "en", "au", "aux", "et", "a", "l", "pour", "dans", "comment"]);

export function searchGuide(articles, query) {
    const terms = normalize(query).split(/\s+/).filter(term => term && !stopWords.has(term));
    if (!terms.length) return [];
    return articles.map(article => {
        const title = normalize(article.title), section = normalize(article.section);
        const body = normalize(article.body), text = `${title} ${section} ${body}`;
        return { article, score: terms.every(term => text.includes(term))
            ? terms.reduce((score, term) => score + (title.includes(term) ? 10 : section.includes(term) ? 3 : 1), 0) : 0 };
    }).filter(result => result.score).sort((a, b) => b.score - a.score).map(result => result.article);
}

// Render only the Markdown forms used by the guide, with DOM text nodes.
// Raw HTML and URLs from the source never become executable markup.
function inline(document, container, text) {
    const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\([^)]+\))/g;
    let previous = 0;
    for (const match of text.matchAll(pattern)) {
        container.append(document.createTextNode(text.slice(previous, match.index)));
        const node = document.createElement(match[2] ? "strong" : match[3] ? "code" : "span");
        node.textContent = match[2] ?? match[3] ?? match[4];
        container.append(node);
        previous = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(previous)));
}

export function renderGuideBody(document, container, markdown) {
    const lines = markdown.split("\n");
    for (let index = 0; index < lines.length;) {
        const line = lines[index].trim();
        if (!line) { index++; continue; }
        if (line.startsWith("|")) {
            const wrap = document.createElement("div"); wrap.className = "help-table";
            const table = document.createElement("table");
            let header = true;
            while (index < lines.length && lines[index].trim().startsWith("|")) {
                const cells = lines[index++].trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
                if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
                const row = document.createElement("tr");
                for (const cell of cells) {
                    const node = document.createElement(header ? "th" : "td");
                    if (header) node.scope = "col";
                    inline(document, node, cell); row.append(node);
                }
                table.append(row); header = false;
            }
            wrap.append(table); container.append(wrap); continue;
        }
        const listMatch = /^(?:([-*])|\d+\.)\s+(.+)$/.exec(line);
        if (listMatch) {
            const list = document.createElement(listMatch[1] ? "ul" : "ol");
            const ordered = !listMatch[1];
            while (index < lines.length) {
                const item = /^(?:([-*])|\d+\.)\s+(.+)$/.exec(lines[index].trim());
                if (!item || Boolean(!item[1]) !== ordered) break;
                index++;
                let text = item[2];
                while (index < lines.length && /^\s+\S/.test(lines[index]) && !/^\s*(?:[-*]|\d+\.)\s/.test(lines[index])) text += " " + lines[index++].trim();
                const li = document.createElement("li"); inline(document, li, text); list.append(li);
            }
            container.append(list); continue;
        }
        let text = lines[index++].trim();
        while (index < lines.length && lines[index].trim() && !/^\s*(?:\||[-*]\s|\d+\.\s)/.test(lines[index])) text += " " + lines[index++].trim();
        const paragraph = document.createElement("p"); inline(document, paragraph, text); container.append(paragraph);
    }
}

export function initializeHelpUI({ document = globalThis.document, readGuide }) {
    const get = id => document.getElementById(id);
    const input = get("help-search"), menu = get("help-menu"), content = get("help-articles"), status = get("help-results-status");
    let articles = [], selected = null;
    const message = text => { const p = document.createElement("p"); p.textContent = text; content.append(p); };
    function render() {
        const query = input.value.trim();
        const chosen = articles.find(article => article.id === selected);
        const matches = query ? searchGuide(articles, query) : articles.filter(article => article.id === selected ||
            chosen && !chosen.child && article.child && article.section === chosen.section);
        content.replaceChildren();
        status.textContent = query ? `${matches.length} article${matches.length === 1 ? "" : "s"} pour « ${query} »`
            : "Sommaire du guide · Sélectionnez un sujet.";
        if (!matches.length) message(query ? "Aucun article trouvé. Essayez un autre mot ou consultez le sommaire."
            : "Les gestes, les fonctions et les exemples du guide sont accessibles dans le sommaire. Vous pouvez aussi saisir plusieurs mots pour rechercher un sujet.");
        for (const article of matches) {
            const card = document.createElement("article"); card.className = "help-article";
            if (article.child) { const context = document.createElement("p"); context.className = "help-context"; context.textContent = article.section; card.append(context); }
            const title = document.createElement("h3"); title.textContent = article.title; card.append(title);
            if (article.body) renderGuideBody(document, card, article.body);
            content.append(card);
        }
        for (const button of menu.querySelectorAll("button")) button.setAttribute("aria-current", String(!query && button.dataset.article === selected));
    }
    input.addEventListener("input", () => { selected = null; render(); });
    async function load() {
        input.disabled = true;
        try {
            articles = parseGuide(await readGuide());
            if (!articles.length) throw new Error("Guide vide");
            menu.replaceChildren();
            for (const article of articles) {
                const button = document.createElement("button"); button.type = "button";
                button.textContent = article.title; button.dataset.article = article.id;
                if (article.child) button.className = "help-subject";
                button.addEventListener("click", () => {
                    selected = article.id; input.value = ""; render();
                    content.focus();
                });
                menu.append(button);
            }
            input.disabled = false; render();
        } catch {
            status.textContent = "Le guide n’a pas pu être chargé.";
            content.replaceChildren();
            const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Réessayer";
            retry.addEventListener("click", load); content.append(retry);
        }
    }
    return { ready: load() };
}
