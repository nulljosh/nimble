// The quiet line under a text answer's header: one line, resting note first, then the background caption.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const NOTE = "The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening.";
const CAPTION = "Not a direct answer to your question. Background from Wikipedia:";
const base = (extra) => ({ kind: "text", title: "Rainbow", body: "A rainbow is an optical phenomenon.", src: "Wikipedia", sources: [], ...extra });

test("background with the AI resting merges both into one caption line", async () => {
  const { h } = await E.renderAnswer("what was the first color photograph of a rainbow", { scripted: base({ background: true, aiError: "capacity" }) });
  const lines = h.match(/<p class="bg-caption">[^<]*<\/p>/g) || [];
  assert.equal(lines.length, 1);
  assert.equal(lines[0], `<p class="bg-caption">${NOTE} ${CAPTION}</p>`);
  assert.doesNotMatch(h, /ai-note/);
});

test("background alone is one caption line with no resting note", async () => {
  const { h } = await E.renderAnswer("what was the first color photograph of a rainbow", { scripted: base({ background: true }) });
  assert.equal((h.match(/bg-caption/g) || []).length, 1);
  assert.match(h, /<p class="bg-caption">Not a direct answer to your question\. Background from Wikipedia:<\/p>/);
  assert.doesNotMatch(h, /resets in the evening/);
});

test("a plain Wikipedia answer with the AI resting keeps only the note", async () => {
  const { h } = await E.renderAnswer("capital of france", { scripted: base({ title: "France", background: false, aiError: "capacity" }) });
  assert.match(h, /<p class="ai-note"><img src="mascot\/nim-doze\.svg" width="32" height="32" alt="">The free AI is out of answers for today/);
  assert.doesNotMatch(h, /bg-caption/);
});
