// The extension ships a copy of docs/engine.js; it must match the site's, and the manifest must be loadable.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs");
const read = f => fs.readFileSync(__dirname + "/../" + f, "utf8");

test("extension engine.js is the site's engine.js", () => {
  assert.equal(read("extension/engine.js"), read("docs/engine.js"));
});

test("manifest is MV3, its files exist and its version is the app's", () => {
  const m = JSON.parse(read("extension/manifest.json"));
  assert.equal(m.manifest_version, 3);
  assert.ok(fs.existsSync(__dirname + "/../extension/" + m.action.default_popup));
  assert.ok(fs.existsSync(__dirname + "/../extension/" + m.icons["128"]));
  assert.equal(m.version, /MARKETING_VERSION: "([^"]+)"/.exec(read("project.yml"))[1]);
});
