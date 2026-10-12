// The news card in the web engine, offline: fetch is stubbed, keyed on the ?news= proxy route.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
const items = [
  { title: "A", sentence: "First story happened today.", outlet: "BBC", url: "https://www.bbc.com/news/1" },
  { title: "B", sentence: "Second <b>story</b> happened.", outlet: "CBC", url: "https://www.cbc.ca/news/2" },
  { title: "C", sentence: "Third story happened too.", outlet: "NPR", url: "https://www.npr.org/3" },
  { title: "D", sentence: "Fourth story is cut.", outlet: "Guardian", url: "https://www.theguardian.com/4" },
];
let asked = [];
function stub(payload) {
  globalThis.fetch = async url => {
    asked.push(url);
    if (String(url).includes("?news=")) return { ok: true, json: async () => payload };
    return { ok: false };
  };
}
test.afterEach(() => { globalThis.fetch = realFetch; asked = []; });

test("news returns the top three, and the place goes to the proxy", async () => {
  stub({ items });
  const a = await E.answer("what's happening in Vancouver?");
  assert.equal(a.kind, "news");
  assert.equal(a.items.length, 3);
  assert.equal(a.src, "BBC, CBC, NPR");
  assert.match(asked[0], /\?news=Vancouver$/);
});

test("plain news asks for the world feed", async () => {
  stub({ items });
  const a = await E.answer("latest news");
  assert.equal(a.kind, "news");
  assert.match(asked[0], /\?news=$/);
});

test("news renders one linked sentence per story with the outlet and credit", async () => {
  stub({ items });
  const r = await E.renderAnswer("news");
  assert.equal(r.kind, "news");
  assert.equal((r.h.match(/<li>/g) || []).length, 3);
  assert.match(r.h, /<a href="https:\/\/www\.bbc\.com\/news\/1" target="_blank" rel="noopener">First story happened today\.<\/a> <span class="news-src">BBC<\/span>/);
  assert.match(r.h, /Second &lt;b>story/);
  assert.doesNotMatch(r.h, /Fourth story/);
  assert.equal(r.credit, "powered by BBC, CBC, NPR");
});

test("news with no items falls through, and never asks for consent", async () => {
  stub({ items: [] });
  const a = await E.answer("news");
  assert.notEqual(a.kind, "news");
  assert.notEqual(a.kind, "consent");
});

test("news is shared as its first headline", () => {
  assert.equal(E.shareText({ kind: "news", items, src: "BBC" }), "First story happened today.");
});
