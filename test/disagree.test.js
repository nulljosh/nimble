// "Sources disagree": the card that shows both answers when the proxy's two models clash and no source
// settles it. Offline: the proxy, DuckDuckGo and Wikipedia are stubbed; nothing calls a model.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const PROXY = "https://nimble-answers.trommatic.workers.dev";
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
const ALTS = [
  { model: "Qwen3 30B", answer: "Hamlet was written by William Shakespeare." },
  { model: "Gemma 4 26B", answer: "Hamlet was written by Christopher Marlowe." },
];

// Stubs the three network sources. proxy: the answer route's JSON. ddg: the DuckDuckGo abstract, or null.
function stub({ proxy, ddg = {} }) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.startsWith(PROXY) && init && init.method === "POST") return json(proxy);
    if (url.includes("?ddg=")) return json(ddg);
    if (url.includes("?news=")) return json({ items: [] });
    if (url.includes("?site=")) return json({});
    if (url.includes("api.php")) return json({ query: { pages: [] } });
    return new Response("{}", { status: 404 });
  };
  return () => { globalThis.fetch = real; };
}

test("the proxy's clash comes back as a disagree card, with no picked answer and no photo", async () => {
  const restore = stub({ proxy: { disagree: true, alts: ALTS, source: "Gemma + Qwen", image: { url: "https://upload.wikimedia.org/x.jpg" } } });
  try {
    const a = await E.answer("who wrote hamlet");
    assert.equal(a.kind, "disagree");
    assert.deepEqual(a.alts, ALTS);
    assert.equal(a.image, undefined, "the card never carries a photo");
    assert.ok(a.asOf, "the freshness label is set");
  } finally { restore(); }
});

test("the card renders both answers with their model names, the title and the as-of line, and no photo", async () => {
  const restore = stub({ proxy: { disagree: true, alts: ALTS } });
  try {
    const r = await E.renderAnswer("who wrote hamlet");
    assert.match(r.h, /<p class="disagree-title">Sources disagree<\/p>/);
    assert.match(r.h, /<p class="disagree-answer">Hamlet was written by William Shakespeare\.<\/p><p class="disagree-model">Qwen3 30B<\/p>/);
    assert.match(r.h, /<p class="disagree-answer">Hamlet was written by Christopher Marlowe\.<\/p><p class="disagree-model">Gemma 4 26B<\/p>/);
    assert.match(r.h, /<p class="as-of num">/);
    assert.doesNotMatch(r.h, /<img|mockup-photo|photo-credit/);
    assert.equal(r.credit, "");
    assert.equal(r.kind, "disagree");
  } finally { restore(); }
});

test("the card escapes both answers like the rest of the answer", async () => {
  const restore = stub({ proxy: { disagree: true, alts: [{ model: "Qwen3 30B", answer: "<b>x</b> 1889" }, { model: "Gemma 4 26B", answer: "1887" }] } });
  try {
    const r = await E.renderAnswer("when did the tower open");
    assert.doesNotMatch(r.h, /<b>x<\/b>/);
    assert.match(r.h, /<p class="disagree-answer">&lt;b>x&lt;\/b> 1889<\/p>/);
  } finally { restore(); }
});

test("the source row sits under the card when the proxy names Wikipedia pages", async () => {
  const refs = [{ title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy." }];
  const restore = stub({ proxy: { disagree: true, alts: ALTS, refs } });
  try {
    const r = await E.renderAnswer("who wrote hamlet");
    assert.match(r.h, /<p class="sources"><a href="https:\/\/en\.wikipedia\.org\/wiki\/Hamlet" target="_blank" rel="noopener">Hamlet<\/a><\/p>/);
  } finally { restore(); }
});

test("a DuckDuckGo abstract that backs one of the two answers settles it: the normal answer path runs", async () => {
  const restore = stub({
    proxy: { disagree: true, alts: ALTS },
    ddg: { AbstractText: "Hamlet is a tragedy written by William Shakespeare around 1600.", AbstractURL: "https://duckduckgo.com/Hamlet", AbstractSource: "Wikipedia", Heading: "Hamlet" },
  });
  try {
    const a = await E.answer("who wrote hamlet");
    assert.notEqual(a.kind, "disagree");
    assert.equal(a.kind, "text");
  } finally { restore(); }
});

test("without the fields the answer is the same text answer it was before", async () => {
  const restore = stub({ proxy: { answer: "Hamlet was written by William Shakespeare.", source: "Gemma + Qwen" } });
  try {
    const a = await E.answer("who wrote hamlet");
    assert.equal(a.kind, "text");
    assert.equal(a.body, "Hamlet was written by William Shakespeare.");
    assert.equal(a.src, "Gemma + Qwen");
    const r = await E.renderAnswer("who wrote hamlet");
    assert.doesNotMatch(r.h, /disagree/);
  } finally { restore(); }
});

test("a malformed alts list is not a card: one answer or junk falls back to the answer", async () => {
  const restore = stub({ proxy: { answer: "Hamlet was written by William Shakespeare.", source: "Gemma + Qwen", disagree: true, alts: [{ model: "Qwen3 30B", answer: "" }, "junk"] } });
  try {
    const a = await E.answer("who wrote hamlet");
    assert.equal(a.kind, "text");
  } finally { restore(); }
});
