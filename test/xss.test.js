// Hostile text from a feed, a page or a model never becomes markup or a script link in the rendered answer.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const BAD = '<img src=x onerror=alert(1)>';
const JS = "javascript:alert(1)";
const answers = [
  { kind: "text", title: BAD, body: BAD, src: BAD, url: JS, grounding: BAD + " and more words than the body has", groundingUrl: JS, sources: [{ name: BAD, url: JS }, { name: "b", url: JS }] },
  { kind: "card", big: BAD, unit: BAD, sub: BAD, src: BAD, url: JS },
  { kind: "market", title: BAD, big: BAD, change: BAD, src: BAD, url: JS },
  { kind: "news", src: BAD, items: [{ sentence: BAD, outlet: BAD, url: JS }] },
  { kind: "sports", title: BAD, src: BAD, url: JS, rows: [{ state: "post", status: BAD, teams: [{ name: BAD, score: BAD, winner: true }, { name: BAD, score: "1" }] }] },
  { kind: "disagree", alts: [{ answer: BAD, model: BAD }], sources: [{ name: BAD, url: JS }] },
  { kind: "pack", text: BAD, url: JS },
];

for (const a of answers) {
  test(`${a.kind}: no injected tag, no javascript: link`, async () => {
    const r = await E.renderAnswer("q", { scripted: a });
    const html = r.h + (r.credit || "");
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /href="javascript:/i);
  });
}
