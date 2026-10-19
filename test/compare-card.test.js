// The compare card: "paris vs london population" comes back from the proxy as a sentence plus two rows,
// and the card lays the rows out side by side. Offline: the proxy and the fallbacks are stubbed.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const PROXY = "https://nimble-answers.trommatic.workers.dev";
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
function stub(proxy) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.startsWith(PROXY) && init && init.method === "POST") return json(proxy);
    if (url.includes("?news=")) return json({ items: [] });
    if (url.includes("api.php")) return json({ query: { pages: [] } });
    return json({});
  };
  return () => { globalThis.fetch = real; };
}

test("two rows render as label and value, escaped, with the sentence kept as the body", async () => {
  const rows = [{ label: "Paris", value: "2.1 million (2023)" }, { label: "<b>London</b>", value: "8.9 million (2023)" }];
  const restore = stub({ answer: "Paris: 2.1 million (2023). London: 8.9 million (2023).", rows, source: "Wikidata" });
  try {
    const r = await E.renderAnswer("paris vs london population");
    assert.match(r.h, /<div class="compare-rows"><p><span class="compare-label">Paris<\/span> <strong class="num">2\.1 million \(2023\)<\/strong><\/p>/);
    assert.match(r.h, /&lt;b>London&lt;\/b>/);
    assert.doesNotMatch(r.h, /<b>London/);
  } finally { restore(); }
});

test("a reply without two good rows is the plain sentence", async () => {
  const restore = stub({ answer: "Paris has 2.1 million people.", rows: [{ label: "Paris" }], source: "Wikidata" });
  try {
    const r = await E.renderAnswer("paris vs london population");
    assert.doesNotMatch(r.h, /compare-rows/);
    assert.match(r.h, /<p>Paris has 2\.1 million people\.<\/p>/);
  } finally { restore(); }
});
