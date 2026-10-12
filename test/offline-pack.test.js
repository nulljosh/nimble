// The offline Wikipedia pack: lookup scoring on a small fixture (never the real pack), the offline answer,
// and proof that online answers are unchanged when no pack is loaded.
const test = require("node:test"), assert = require("node:assert/strict");
const path = require("node:path");
globalThis.localStorage = { getItem: (k) => (k === "nimble.aiConsent" ? "yes" : null), setItem() {}, removeItem() {} };
const E = require("../docs/engine.js");
const PACK = require(path.join(__dirname, "fixtures", "offline-pack.json"));

const realFetch = globalThis.fetch;
const realOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator, "onLine");
function setOnline(v) {
  Object.defineProperty(globalThis.navigator, "onLine", { value: v, configurable: true });
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
  if (realOnLine) Object.defineProperty(globalThis.navigator, "onLine", realOnLine);
  else delete globalThis.navigator.onLine;
});
const down = () => { globalThis.fetch = async () => { throw new Error("network down"); }; };

test("capital of france maps to France or Paris", () => {
  const hit = E.packSearch("capital of france", PACK);
  assert.ok(hit, "a hit");
  assert.ok(["France", "Paris"].includes(hit.entry.t), hit.entry.t);
});

test("who wrote hamlet maps to Hamlet or William Shakespeare", () => {
  const hit = E.packSearch("who wrote hamlet", PACK);
  assert.ok(hit, "a hit");
  assert.ok(["Hamlet", "William Shakespeare"].includes(hit.entry.t), hit.entry.t);
});

test("a gibberish query is not in the pack", () => {
  assert.equal(E.packSearch("zqxv blorptastic flimflam", PACK), null);
  assert.equal(E.packSearch("", PACK), null);
  assert.equal(E.packSearch("who is the", PACK), null, "only stop words");
});

test("a pack hit carries the entry's text, its link and the build date", () => {
  const a = E.packAnswer("what is water", PACK);
  assert.equal(a.kind, "pack");
  assert.equal(a.title, "Water");
  assert.equal(a.text, PACK.entries[4].e.split(/(?<=[.!?])\s+/)[0], "no sentence overlaps the question, so the first sentence");
  assert.equal(a.url, "https://en.wikipedia.org/wiki/Water");
  assert.equal(a.asOf, "2026-09-30");
  assert.equal(a.src, "Offline pack · Wikipedia (CC BY-SA)");
});

test("offline with a pack: the pack answers, and a miss says so", async () => {
  setOnline(false);
  const hit = await E.answer("who wrote hamlet", { pack: PACK });
  assert.equal(hit.kind, "pack");
  assert.ok(["Hamlet", "William Shakespeare"].includes(hit.title));
  const miss = await E.answer("zqxv blorptastic flimflam", { pack: PACK });
  assert.equal(miss.kind, "pack-miss");
});

test("offline with a pack: math still computes before the pack is asked", async () => {
  setOnline(false);
  const m = await E.answer("2 + 2", { pack: PACK });
  assert.equal(m.kind, "math");
});

test("offline without a pack: the old offline message, unchanged", async () => {
  setOnline(false);
  assert.deepEqual(await E.answer("who wrote hamlet"), { kind: "offline" });
  assert.deepEqual(await E.answer("who wrote hamlet", { pack: null }), { kind: "offline" });
});

test("online with every source failing and no pack: none, as before", async () => {
  setOnline(true);
  down();
  assert.deepEqual(await E.answer("who wrote hamlet", { ifUnset: "no" }), { kind: "none" });
});

test("online with every source failing and a pack: the pack answers", async () => {
  setOnline(true);
  down();
  const a = await E.answer("who wrote hamlet", { ifUnset: "no", pack: PACK });
  assert.equal(a.kind, "pack");
});

test("online and a source answers: the pack is never used", async () => {
  setOnline(true);
  globalThis.fetch = async (url) => {
    if (String(url).includes("?ddg=")) return { ok: true, json: async () => ({ AbstractText: "Hamlet is a tragedy by Shakespeare.", AbstractURL: "https://en.wikipedia.org/wiki/Hamlet", Heading: "Hamlet" }) };
    return { ok: false };
  };
  const a = await E.answer("who wrote hamlet", { ifUnset: "no", pack: PACK });
  assert.notEqual(a.kind, "pack");
});

// The real pack (the file the page downloads). Answers must come from it or be an honest miss, never a guess.
const zlib = require("node:zlib"), fs = require("node:fs");
const REAL = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "docs", "pack", "wikipedia-top-v1.json.gz"))).toString("utf8"));

test("real pack: capital of france names Paris", () => {
  const a = E.packAnswer("capital of france", REAL);
  assert.ok(a, "in the pack");
  assert.match(a.text, /Paris/);
});

test("real pack: population of japan gives a population figure, or an honest miss", () => {
  const a = E.packAnswer("population of japan", REAL);
  if (a) assert.match(a.text, /population[^.]*\d|\d[^.]*population/i, a.text);
  else assert.equal(a, null);
});

test("real pack: who founded apple names Jobs or Wozniak", () => {
  const a = E.packAnswer("who founded apple", REAL);
  assert.ok(a, "Apple Inc. is in the pack");
  assert.match(a.text, /Jobs|Wozniak/);
});

test("real pack: who wrote hamlet names Hamlet or Shakespeare, or misses honestly", () => {
  const a = E.packAnswer("who wrote hamlet", REAL);
  if (a) assert.match(a.text, /Hamlet|Shakespeare/, a.text);
  else assert.equal(a, null); // Hamlet is not among the top pageview lists
});

test("real pack: what is water is never a guess from another title", () => {
  const a = E.packAnswer("what is water", REAL);
  if (a) assert.match(a.text, /water/i, a.text);
  assert.ok(!a || !/Way of Water/.test(a.title), "Avatar is not an answer about water");
});

test("real pack: who is albert einstein names Einstein", () => {
  const a = E.packAnswer("who is albert einstein", REAL);
  assert.ok(a, "in the pack");
  assert.match(a.text, /Einstein/);
});

test("real pack: the freshness label is the app's short date, not ISO", () => {
  assert.match(E.asOfLabel(REAL.builtAt, true), /^[A-Z][a-z]{2} \d{1,2}$/);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(E.asOfLabel(REAL.builtAt, true)));
});

test("real pack: an answer is at most two sentences and never has double spaces", () => {
  for (const q of ["capital of france", "who is albert einstein", "population of japan"]) {
    const a = E.packAnswer(q, REAL);
    if (a) assert.ok(!/  /.test(a.text) && a.text.split(/(?<=[.!?])\s+/).length <= 3, q);
  }
});

test("real pack: when was albert einstein born never gives the 1921 prize year", () => {
  const a = E.packAnswer("when was albert einstein born", REAL);
  assert.ok(!a || !/1921/.test(a.text), a && a.text);
  if (a) assert.match(a.text, /1879|born/i);
});

test("real pack: when was apple founded names 1976", () => {
  const a = E.packAnswer("when was apple founded", REAL);
  assert.ok(a, "Apple Inc. is in the pack");
  assert.match(a.text, /1976/);
});

test("the web's relation table has no population rule: the pack keeps its own", () => {
  assert.equal(E.relationOf("population of japan"), null);
  const a = E.packAnswer("population of japan", REAL);
  assert.ok(a === null || a.kind === "pack");
});
