// The credit line: a site's own page is where the answer came from ("from primitive.dev"), an engine is what powered it.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

test("a site answer reads from the site, an AI answer powered by the model", async () => {
  const site = await E.renderAnswer("what's primitive.dev?", { scripted: { kind: "text", title: "primitive.dev", body: "Email for AI agents.", src: "primitive.dev" } });
  assert.match(site.credit, /^from primitive\.dev$/);
  const ai = await E.renderAnswer("capital of france", { scripted: { kind: "text", title: "capital of france", body: "Paris.", src: "Groq" } });
  assert.match(ai.credit, /^powered by Groq$/);
});
