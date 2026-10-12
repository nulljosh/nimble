// Background answers on the web: the generic Rainbow page for Liam's question is flagged, not answered, and the
// card says BACKGROUND with the caption under the header. The resting note sits under the header too.
// Fetch is stubbed per URL: no network, no Worker call.
const test = require("node:test"), assert = require("node:assert/strict");
globalThis.localStorage = { getItem: (k) => (k === "nimble.aiConsent" ? "no" : null), setItem() {}, removeItem() {} };
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const json = (o) => ({ ok: true, json: async () => o });
const LIAM = "what was the first color photograph of a rainbow";
const RAINBOW = "A rainbow is an optical phenomenon caused by refraction, internal reflection and dispersion of light in water droplets.";
const NOTE = "The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening.";
const CAPTION = "Not a direct answer to your question. Background from Wikipedia:";

function stub({ hits = [], intros = {} }) {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes("duckduckgo.com")) return json({});
    if (url.includes("list=search")) return json({ query: { search: hits.map((title) => ({ title })) } });
    if (url.includes("prop=extracts")) {
      const t = decodeURIComponent(/titles=([^&]+)/.exec(url)[1]);
      const key = Object.keys(intros).find((k) => k.toLowerCase() === t.toLowerCase());
      return key ? json({ query: { pages: [{ title: key, extract: intros[key] }] } }) : json({ query: { pages: [{ title: t, missing: true }] } });
    }
    const m = /\/page\/summary\/(.+)$/.exec(url);
    const title = m && decodeURIComponent(m[1]);
    if (title && intros[title]) return json({ title, extract: intros[title], content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + title } } });
    return { ok: false };
  };
}

test("Liam's question: the generic Rainbow page comes back as background, not as the answer", async () => {
  stub({ hits: ["Rainbow"], intros: { Rainbow: RAINBOW } });
  const res = await E.answer(LIAM, { ifUnset: "no" });
  assert.equal(res.kind, "text");
  assert.equal(res.title, "Rainbow");
  assert.equal(res.src, "Wikipedia");
  assert.equal(res.background, true);
  assert.equal(res.body, RAINBOW, "the body is the page's sentence, no caption inside it");
});

test("a direct question with the same page stays an answer", async () => {
  stub({ hits: ["Speed of light"], intros: { "Speed of light": "The speed of light in vacuum is 299,792 km/s." } });
  const res = await E.answer("what is the speed of light", { ifUnset: "no" });
  assert.equal(res.kind, "text");
  assert.equal(res.background, undefined);
});

test("the card header reads BACKGROUND, the caption leads the summary, and the body stays clean", async () => {
  stub({ hits: ["Rainbow"], intros: { Rainbow: RAINBOW } });
  const { h } = await E.renderAnswer(LIAM, { t: (s) => s, scripted: { kind: "text", title: "Rainbow", body: RAINBOW, src: "Wikipedia", sources: [], background: true } });
  assert.match(h, /^<div class="mockup-label">Background<\/div>/);
  assert.ok(h.indexOf('class="bg-caption"') < h.indexOf(RAINBOW), "caption before the summary");
  assert.match(h, /<p class="bg-caption">Not a direct answer to your question\. Background from Wikipedia:<\/p>/);
  assert.equal((h.match(/Not a direct answer/g) || []).length, 1, "the caption appears once");
});

test("a plain answer keeps the ANSWER header and no caption", async () => {
  const { h } = await E.renderAnswer("capital of france", { t: (s) => s, scripted: { kind: "text", title: "France", body: "Paris is the capital.", src: "Wikipedia", sources: [] } });
  assert.match(h, /^<div class="mockup-label">Answer<\/div>/);
  assert.doesNotMatch(h, /bg-caption/);
});

test("the resting note is the first line under the header, before the answer", async () => {
  const { h } = await E.renderAnswer("capital of france", { t: (s) => s, scripted: { kind: "text", title: "France", body: "Paris is the capital.", src: "Wikipedia", sources: [], aiError: "AiError: daily free allocation exceeded" } });
  assert.match(h, new RegExp('^<div class="mockup-label">Answer</div><p class="ai-note">' + NOTE.replace(/\./g, "\\.") + "</p>"));
  assert.ok(h.indexOf("ai-note") < h.indexOf("Paris is the capital."));
});

test("the resting note and the caption stack under the header when both apply", async () => {
  const { h } = await E.renderAnswer(LIAM, { t: (s) => s, scripted: { kind: "text", title: "Rainbow", body: RAINBOW, src: "Wikipedia", sources: [], background: true, aiError: "capacity" } });
  assert.ok(h.indexOf("ai-note") < h.indexOf("bg-caption"), "resting note first");
  assert.ok(h.indexOf("bg-caption") < h.indexOf(RAINBOW), "caption before the summary");
});

test("the history row keeps the answer snippet, capped at 280 characters, and remove drops rows", () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const H = E.history;
  H.add("what is it", "x".repeat(400));
  H.add("second", null);
  const rows = H.list();
  assert.equal(rows[0].q, "second");
  assert.equal(rows[0].a, undefined, "no answer, no snippet field");
  assert.equal(rows[1].a.length, 280);
  H.remove(["SECOND"]);
  assert.deepEqual(H.list().map((e) => e.q), ["what is it"]);
});
