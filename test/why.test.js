// Why this answer: a sourced text answer carries the text its sentence was cut from, and the page
// shows it behind the source line. Only when it says more than the sentence did.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

// The site path asks the answer proxy for the page's own description. Stub that one call.
function stubSite(description) {
  const real = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("?site=")) {
      return new Response(JSON.stringify({ title: "Acme", description }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
  };
  return () => { global.fetch = real; };
}

test("a multi-sentence source keeps the full text and renders it behind the source line", async () => {
  const restore = stubSite("Ship faster. Then ship again.");
  try {
    const a = await E.answer("what's acme.io");
    assert.equal(a.kind, "text");
    assert.equal(a.body, "Ship faster.");
    assert.equal(a.grounding, "Ship faster. Then ship again.");
    const r = await E.renderAnswer("what's acme.io");
    assert.match(r.h, /<details class="why"><summary>powered by acme\.io<\/summary>/);
    assert.match(r.h, /<p>Ship faster\. Then ship again\.<\/p>/);
    assert.match(r.h, /<a href="https:\/\/acme\.io" target="_blank" rel="noopener">acme\.io<\/a>/);
    assert.equal(r.credit, "");
  } finally { restore(); }
});

test("a one-sentence source shows no expander and keeps the usual credit line", async () => {
  const restore = stubSite("Payments for the internet.");
  try {
    const r = await E.renderAnswer("what's acme.io");
    assert.doesNotMatch(r.h, /class="why"/);
    assert.equal(r.credit, "powered by acme.io");
  } finally { restore(); }
});

test("a source that is only its title has nothing more to show", async () => {
  const real = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ title: "Acme" }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const r = await E.renderAnswer("what's acme.io");
    assert.doesNotMatch(r.h, /class="why"/);
    assert.equal(r.credit, "powered by acme.io");
  } finally { global.fetch = real; }
});
