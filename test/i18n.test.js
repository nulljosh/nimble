// Every locale carries every master key with real text, and the markup only asks for keys that exist.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

const root = path.join(__dirname, "..");
const master = JSON.parse(fs.readFileSync(path.join(root, "i18n/strings.json"), "utf8"));
const { locales } = master._meta;
const keys = Object.keys(master).filter(k => k !== "_meta");
const load = lng => JSON.parse(fs.readFileSync(path.join(root, "docs/locales", lng + ".json"), "utf8"));

test("the house locale set is there", () => {
  for (const l of ["en", "fr", "es", "zh", "pa"]) assert.ok(locales.includes(l), l);
});

for (const lng of locales) {
  test(`${lng} has every master key, none empty`, () => {
    const d = load(lng);
    for (const k of keys) {
      assert.equal(typeof d[k], "string", `${lng} is missing "${k}"`);
      assert.ok(d[k].trim().length > 0, `${lng} has an empty "${k}"`);
    }
  });
  test(`${lng} keeps the {s} slots the English has`, () => {
    const d = load(lng);
    for (const k of keys) assert.equal(d[k].includes("{s}"), k.includes("{s}"), `${lng} "${k}"`);
  });
}

test("locales are generated from the master, not hand edited", () => {
  const en = load("en");
  for (const k of keys) assert.equal(en[k], master[k].en);
});

test("every data-i18n key in the pages exists in the master", () => {
  for (const f of ["app.html", "index.html"]) {
    const html = fs.readFileSync(path.join(root, "docs", f), "utf8");
    for (const m of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) assert.ok(keys.includes(m[1]), `${f}: "${m[1]}"`);
  }
});

test("the offline shell caches the runtime and every locale", () => {
  const sw = fs.readFileSync(path.join(root, "docs/sw.js"), "utf8");
  assert.match(sw, /"i18n\.js"/);
  for (const l of locales) assert.ok(sw.includes(`locales/${l}.json`), l);
});
