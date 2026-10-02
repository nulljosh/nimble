// The mic button's words: only "listening" changes the placeholder.
const test = require("node:test"), assert = require("node:assert/strict");
const { listenLabel } = require("../docs/engine.js");

test("idle says what the button does and leaves the placeholder alone", () => {
  assert.deepEqual(listenLabel("idle"), { button: "Ask by voice", placeholder: "" });
});

test("listening says Listening and offers to stop", () => {
  assert.deepEqual(listenLabel("listening"), { button: "Stop listening", placeholder: "Listening" });
});

test("anything else is idle", () => {
  for (const s of [undefined, null, "", "denied", "error"]) assert.equal(listenLabel(s).placeholder, "");
});
