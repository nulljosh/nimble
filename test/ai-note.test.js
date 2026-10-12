// The quiet note under a Wikipedia fallback when the free AI's call failed. Offline: the answer is scripted.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const wikiAnswer = (extra) => ({ kind: "text", title: "France", body: "Paris is the capital of France.", src: "Wikipedia", sources: [], ...extra });

test("a Wikipedia fallback with aiError shows the resting note", async () => {
  const { h } = await E.renderAnswer("capital of france", { scripted: wikiAnswer({ aiError: "AiError: daily free allocation exceeded" }) });
  assert.match(h, /<p class="ai-note">The free AI is resting, showing Wikipedia\.<\/p>/);
});

test("no aiError, no note", async () => {
  const { h } = await E.renderAnswer("capital of france", { scripted: wikiAnswer() });
  assert.doesNotMatch(h, /ai-note/);
});

test("the note is only for the Wikipedia fallback", async () => {
  const { h } = await E.renderAnswer("capital of france", { scripted: wikiAnswer({ src: "DuckDuckGo", aiError: "capacity" }) });
  assert.doesNotMatch(h, /ai-note/);
});

test("the note is escaped like the rest of the answer", async () => {
  const { h } = await E.renderAnswer("capital of france", { scripted: wikiAnswer({ aiError: "<b>x</b>" }) });
  assert.doesNotMatch(h, /<b>x<\/b>/);
});
