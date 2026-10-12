// Multiple sources per answer: up to three linked sources, a second one only when it backs the sentence.
// Offline: fetch is stubbed, and nothing new is fetched beyond what answer() already calls.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

function stubFetch({ answer, ddg, site, refs }) {
  const real = global.fetch, calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push(String(url));
    const body = String(url).includes("?site=") ? (site || null)
      : String(url).includes("?ddg=") ? (ddg || null)
      : (init.method === "POST" ? (answer ? { answer, source: "Gemma + Qwen", ...(refs ? { refs } : {}) } : null) : null);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, restore: () => { global.fetch = real; } };
}

test("agrees: a paraphrase backed by the text passes; an unrelated text and a wrong number fail", () => {
  assert.equal(E.agrees("Ottawa is the capital of Canada.", "Ottawa is the capital city of Canada, in Ontario."), true);
  assert.equal(E.agrees("Ottawa is the capital of Canada.", "Paris is in France."), false);
  assert.equal(E.agrees("It costs 40 dollars.", "It costs about dollars."), false);
  assert.equal(E.agrees("Anything.", ""), false);
});

test("sourcesFor: primary first, deduped by URL, capped at three, unrelated extras dropped", () => {
  const primary = { src: "Wikipedia", url: "https://en.wikipedia.org/wiki/Ottawa", body: "Ottawa is the capital of Canada." };
  const same = { src: "Wikipedia", url: "https://en.wikipedia.org/wiki/Ottawa", body: "Ottawa is the capital of Canada." };
  const agreeing = { src: "Britannica", url: "https://britannica.example/ottawa", grounding: "Ottawa is the capital city of Canada." };
  const unrelated = { src: "Other", url: "https://other.example/x", grounding: "Bananas are yellow fruit." };
  const more = { src: "Fourth", url: "https://fourth.example/y", grounding: "Ottawa is the capital of Canada." };
  const out = E.sourcesFor(primary.body, [primary, same, agreeing, unrelated, more]);
  assert.deepEqual(out.map(s => s.name), ["Wikipedia", "Britannica", "Fourth"].slice(0, 3));
  assert.equal(out.length, 3);
  assert.equal(E.sourcesFor("x y z", [{ src: "A", body: "no link" }]).length, 0);
});

test("a model answer with a DDG abstract that backs it lists the DDG link, once", async () => {
  const s = stubFetch({
    answer: "Ottawa is the capital of Canada.",
    ddg: { AbstractText: "Ottawa is the capital city of Canada, in Ontario.", AbstractURL: "https://en.wikipedia.org/wiki/Ottawa", AbstractSource: "Wikipedia" },
  });
  try {
    const a = await E.answer("capital of canada question", { ifUnset: "yes" });
    assert.equal(a.kind, "text");
    assert.deepEqual(a.sources, [{ name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Ottawa" }]);
    assert.equal(a.body, "Ottawa is the capital of Canada.");
    assert.equal(a.src, "Gemma + Qwen", "src stays for back-compat");
  } finally { s.restore(); }
});

test("a DDG abstract that does not back the model answer is not listed", async () => {
  const s = stubFetch({
    answer: "Ottawa is the capital of Canada.",
    ddg: { AbstractText: "Bananas are a yellow fruit.", AbstractURL: "https://example.org/banana", AbstractSource: "Fruit" },
  });
  try {
    const a = await E.answer("capital of canada question", { ifUnset: "yes" });
    assert.deepEqual(a.sources, []);
  } finally { s.restore(); }
});

test("a sourced answer keeps its link as sources[0] and its old url and src fields", async () => {
  const s = stubFetch({ site: { title: "Acme", description: "Payments for the internet." } });
  try {
    const a = await E.answer("what's acme.io", { ifUnset: "yes" });
    assert.equal(a.kind, "text");
    assert.equal(a.sources.length, 1);
    assert.equal(a.sources[0].url, a.url);
    assert.equal(a.src, "acme.io");
  } finally { s.restore(); }
});

test("sourceRow renders names as links, joined by a middle dot, with no extra words", () => {
  const html = E.sourceRow([
    { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Ottawa" },
    { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=ottawa" },
  ]);
  assert.equal(html, '<a href="https://en.wikipedia.org/wiki/Ottawa" target="_blank" rel="noopener">Wikipedia</a> · <a href="https://duckduckgo.com/?q=ottawa" target="_blank" rel="noopener">DuckDuckGo</a>');
});

test("a model answer lists the proxy's Wikipedia page as a second source, after DDG's", async () => {
  const hamlet = { title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy written by William Shakespeare." };
  const shakes = { title: "William Shakespeare", url: "https://en.wikipedia.org/wiki/William_Shakespeare", extract: "William Shakespeare was an English playwright. He wrote Hamlet." };
  const s = stubFetch({
    answer: "William Shakespeare wrote Hamlet.",
    refs: [hamlet, shakes],
    ddg: { AbstractText: "Hamlet is a tragedy written by William Shakespeare.", AbstractURL: "https://en.wikipedia.org/wiki/Hamlet", AbstractSource: "Wikipedia" },
  });
  try {
    const a = await E.answer("who wrote hamlet", { ifUnset: "yes" });
    assert.equal(a.kind, "text");
    assert.deepEqual(a.sources, [
      { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Hamlet" },
      { name: "William Shakespeare", url: "https://en.wikipedia.org/wiki/William_Shakespeare" },
    ]);
  } finally { s.restore(); }
});

test("the proxy's Wikipedia page for the same article as DDG's adds nothing, whatever the spelling", async () => {
  const hamlet = { title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy written by William Shakespeare." };
  for (const abstractURL of ["https://en.wikipedia.org/wiki/Hamlet", "https://EN.wikipedia.org/wiki/hamlet"]) {
    const s = stubFetch({
      answer: "William Shakespeare wrote Hamlet.",
      refs: [hamlet],
      ddg: { AbstractText: "Hamlet is a tragedy written by William Shakespeare.", AbstractURL: abstractURL, AbstractSource: "Other" },
    });
    try {
      const a = await E.answer("who wrote hamlet", { ifUnset: "yes" });
      assert.equal(a.sources.length, 1, abstractURL);
    } finally { s.restore(); }
  }
});

test("with no DDG abstract, the proxy's first two Wikipedia pages make the two sources, named by article", async () => {
  const hamlet = { title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy written by William Shakespeare." };
  const film = { title: "Hamlet (1996 film)", url: "https://en.wikipedia.org/wiki/Hamlet_(1996_film)", extract: "Hamlet is a film of Shakespeare by William Hamlet wrote." };
  const third = { title: "Third", url: "https://en.wikipedia.org/wiki/Third", extract: "Unrelated text." };
  const s = stubFetch({ answer: "William Shakespeare wrote Hamlet.", refs: [hamlet, film, third] });
  try {
    const a = await E.answer("who wrote hamlet", { ifUnset: "yes" });
    assert.deepEqual(a.sources.map(x => x.name), ["Hamlet", "Hamlet (1996 film)"]);
  } finally { s.restore(); }
});

test("a proxy ref on another subject is not listed: 'Capital punishment in France' drops off 'capital of france'", async () => {
  const paris = { title: "Paris", url: "https://en.wikipedia.org/wiki/Paris", extract: "Paris is the capital and most populous city of France." };
  const punish = { title: "Capital punishment in France", url: "https://en.wikipedia.org/wiki/Capital_punishment_in_France", extract: "Capital punishment in France was abolished in 1981. The capital of France was ..." };
  const s = stubFetch({ answer: "The capital of France is Paris.", refs: [punish, paris] });
  try {
    const a = await E.answer("capital of france", { ifUnset: "yes" });
    assert.deepEqual(a.sources.map(x => x.name), ["Paris"]);
  } finally { s.restore(); }
});

test("onTopic: the question's topic, the answer's entity, or a qualifier-stripped article name; never a stray subject", () => {
  assert.equal(E.onTopic("Capital punishment in France", "capital of france", "The capital of France is Paris."), false);
  assert.equal(E.onTopic("Paris", "capital of france", "The capital of France is Paris."), true);
  assert.equal(E.onTopic("France", "capital of france", "The capital of France is Paris."), true);
  assert.equal(E.onTopic("Hamlet (1996 film)", "who wrote hamlet", "William Shakespeare wrote Hamlet."), true);
  assert.equal(E.onTopic("Third", "who wrote hamlet", "William Shakespeare wrote Hamlet."), false);
  assert.equal(E.onTopic("", "who wrote hamlet", "William Shakespeare wrote Hamlet."), false);
});
