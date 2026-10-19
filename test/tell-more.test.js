// "Tell me more" on the web: the engine asks the proxy with more:true and keeps only https pages as sources.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");
const realFetch = global.fetch;
test.after(() => { global.fetch = realFetch; });

const stub = (reply, seen) => { global.fetch = async (url, init) => { seen.push(JSON.parse(init.body)); return new Response(JSON.stringify(reply), { status: 200 }); }; };

test("tellMore asks with more:true and returns the three sentences with their pages", async () => {
  const seen = [];
  stub({ answer: "Paris is the capital of France. It sits on the Seine. About two million live there.", source: "Groq",
    refs: [{ title: "Paris", url: "https://en.wikipedia.org/wiki/Paris" }, { title: "Bad", url: "http://x" }] }, seen);
  const m = await E.tellMore("capital of france");
  assert.deepEqual(seen[0], { q: "capital of france", more: true });
  assert.match(m.body, /Seine/);
  assert.equal(m.src, "Groq");
  assert.deepEqual(m.sources, [{ name: "Paris", url: "https://en.wikipedia.org/wiki/Paris" }]);
});

test("tellMore is null when the proxy has nothing more", async () => {
  stub({ answer: "UNKNOWN" }, []);
  assert.equal(await E.tellMore("asdfgh"), null);
});
