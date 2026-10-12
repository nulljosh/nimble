// The Wikipedia fallback when the free AI is unavailable, offline: fetch is stubbed per URL, no AI call.
// A relation question ("capital of X", "who wrote X", "when was X") answers only from an intro sentence that
// carries the relation word. Lists and disambiguation pages are skipped, never answered from.
const test = require("node:test"), assert = require("node:assert/strict");
globalThis.localStorage = { getItem: (k) => (k === "nimble.aiConsent" ? "yes" : null), setItem() {}, removeItem() {} };
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const json = (o) => ({ ok: true, json: async () => o });
const img = (name) => ({ source: `https://upload.wikimedia.org/${name}.jpg`, width: 800, height: 500 });
const FRANCE = "France, officially the French Republic, is a country primarily located in Western Europe. Its capital, largest city and main cultural and economic centre is Paris, with a metropolitan population of over 13 million. Its territory is large.";
const HAMLET = "The Tragedy of Hamlet, Prince of Denmark, often shortened to Hamlet (), is a tragedy written by William Shakespeare sometime between 1599 and 1601. It is Shakespeare's longest play.";
// hits: the search titles; intros: canonical title -> lead text; pages: summary title -> fields (photo included).
function stub({ hits = [], intros = {}, pages = {} } = {}) {
  globalThis.fetch = async (url, opts) => {
    url = String(url);
    if (url.startsWith("https://nimble-answers.trommatic.workers.dev")) {
      if (opts?.method === "POST") return json({ aiError: "4006" }); // quota: the AI is resting
      return json({});
    }
    if (url.includes("list=search")) return json({ query: { search: hits.map((title) => ({ title })) } });
    if (url.includes("prop=extracts")) {
      const t = decodeURIComponent(/titles=([^&]+)/.exec(url)[1]);
      const key = Object.keys(intros).find((k) => k.toLowerCase() === t.toLowerCase());
      if (!key) return json({ query: { pages: [{ title: t, missing: true }] } });
      return json({ query: { pages: [{ title: key, extract: intros[key] }] } });
    }
    const m = /\/page\/summary\/(.+)$/.exec(url);
    const title = m && decodeURIComponent(m[1]);
    if (title && pages[title]) return json({ title, ...pages[title], content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + title } } });
    return { ok: false };
  };
}

test("capital of France: the Paris sentence from France's own page, not the list", async () => {
  stub({ hits: ["List of capitals of France", "Capital punishment in France"], intros: { France: FRANCE } });
  const hit = await E.wiki("capital of france");
  assert.equal(hit.title, "France");
  assert.equal(hit.body, "Its capital, largest city and main cultural and economic centre is Paris, with a metropolitan population of over 13 million.");
  assert.equal(hit.url, "https://en.wikipedia.org/wiki/France");
});

test("capital of France: when the subject page has no capital sentence, a loose hit never answers", async () => {
  stub({ hits: ["List of capitals of France", "Capital punishment in France"], intros: { "Capital punishment in France": "Capital punishment in France is banned by the Constitution." } });
  assert.equal(await E.wiki("capital of france"), null);
});

test("capital of France: a search hit that names France and the capital answers", async () => {
  stub({ hits: ["List of capitals of France", "Paris"], intros: { Paris: "Paris is the capital and most populous city of France." } });
  const hit = await E.wiki("capital of france");
  assert.equal(hit.body, "Paris is the capital and most populous city of France.");
});

test("who wrote Hamlet: Shakespeare's sentence, with the empty pronunciation brackets removed", async () => {
  stub({ hits: ["Hamlet (film)"], intros: { Hamlet: HAMLET } });
  const hit = await E.wiki("who wrote hamlet");
  assert.equal(hit.body, "The Tragedy of Hamlet, Prince of Denmark, often shortened to Hamlet, is a tragedy written by William Shakespeare sometime between 1599 and 1601.");
});

test("list-only results give no instant answer", async () => {
  stub({ hits: ["List of capitals of France", "List of French capitals"], intros: {} });
  assert.equal(await E.wiki("capital of france"), null);
  stub({ hits: ["List of capitals of France"], intros: {} });
  assert.equal(await E.wiki("what is the capital of spain"), null);
});

test("unshaped questions take the first usable non-list hit, not a list", async () => {
  stub({
    hits: ["List of rivers of Canada", "Fraser River"],
    pages: { "Fraser River": { extract: "The Fraser River is the longest river in British Columbia.", thumbnail: img("fraser") } },
  });
  const hit = await E.wiki("fraser river");
  assert.equal(hit.title, "Fraser River");
  assert.match(hit.body, /longest river/);
});

test("answer(): the AI resting, the Paris photo for the Paris sentence, and the resting note", async () => {
  stub({
    hits: ["List of capitals of France"],
    intros: { France: FRANCE },
    pages: { Paris: { extract: "Paris is the capital and largest city of France.", thumbnail: img("paris") } },
  });
  const a = await E.answer("capital of france");
  assert.equal(a.kind, "text");
  assert.equal(a.src, "Wikipedia");
  assert.match(a.body, /Paris/);
  assert.equal(a.image?.url, "https://upload.wikimedia.org/paris.jpg");
  assert.equal(a.aiError, "4006");
});

test("answer(): nothing usable stays No instant answer", async () => {
  stub({ hits: ["List of capitals of France"], intros: {} });
  assert.equal((await E.answer("capital of france")).kind, "none");
});
