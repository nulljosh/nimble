// The web app's first load stays under 300 KB gzipped: app.html plus every local file it references directly.
// A 16-bit 665 KB icon once sat in the header at 30 px; this catches the next one.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib");

const DOCS = path.join(__dirname, "..", "docs");
const BUDGET = 300 * 1024;

test("app.html first load is under 300 KB gzipped", () => {
  const html = fs.readFileSync(path.join(DOCS, "app.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"#:?]+)(?:\?[^"]*)?"/g)].map((m) => m[1])
    .filter((f) => fs.existsSync(path.join(DOCS, f)) && fs.statSync(path.join(DOCS, f)).isFile());
  const files = ["app.html", ...new Set(refs)];
  const sizes = files.map((f) => [f, zlib.gzipSync(fs.readFileSync(path.join(DOCS, f))).length]);
  const total = sizes.reduce((n, [, s]) => n + s, 0);
  assert.ok(total < BUDGET, `first load ${Math.round(total / 1024)} KB: ${sizes.map(([f, s]) => `${f} ${Math.round(s / 1024)}`).join(", ")}`);
});
