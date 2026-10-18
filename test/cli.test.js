// The CLI needs a question and exits 2 with usage when it gets none (no network).
const test = require("node:test"), assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

test("no question prints usage and exits 2", () => {
  const r = spawnSync("node", [__dirname + "/../bin/nimble.js"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage: nimble/);
});
