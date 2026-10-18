// Every locale carries every master key with real text, and the markup only asks for keys that exist.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

const root = path.join(__dirname, "..");
const master = JSON.parse(fs.readFileSync(path.join(root, "i18n/strings.json"), "utf8"));
const { locales } = master._meta;
const keys = Object.keys(master).filter(k => k !== "_meta");
const load = lng => JSON.parse(fs.readFileSync(path.join(root, "docs/locales", lng + ".json"), "utf8"));

test("the house locale set is there", () => {
  for (const l of ["en", "fr", "es", "zh", "pa", "de", "pt", "hi", "ja"]) assert.ok(locales.includes(l), l);
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

// Android and desktop read the same master through a generated Kotlin table (scripts/i18n-gen.mjs).
const kotlin = JSON.parse(fs.readFileSync(path.join(root, "i18n/kotlin.json"), "utf8"));
const slots = (t) => (t.match(/\{[a-z]+\}/g) || []).sort().join(",");

test("kotlin.json carries every locale for every key, with the same {slots}", () => {
  for (const [k, row] of Object.entries(kotlin)) {
    assert.equal(row.en, k, `"${k}": en is the key`);
    for (const l of locales) {
      assert.ok(typeof row[l] === "string" && row[l].trim(), `"${k}" has no ${l}`);
      assert.equal(slots(row[l]), slots(k), `"${k}" ${l} slots`);
    }
  }
});

test("every tr(\"...\") in the Kotlin UI is in the catalog, and the generated table has it", () => {
  const all = { ...master, ...kotlin }, table = fs.readFileSync(path.join(root, "kmp/shared/src/commonMain/kotlin/com/nulljosh/nimble/I18nTable.kt"), "utf8");
  const dir = path.join(root, "kmp");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (["build", ".kotlin", ".gradle"].includes(e.name) || /Test$/.test(e.name) ? [] : walk(path.join(d, e.name))) : e.name.endsWith(".kt") ? [path.join(d, e.name)] : []);
  let used = 0;
  for (const f of walk(dir)) {
    if (f.endsWith("I18nTable.kt") || f.endsWith("I18n.kt")) continue;
    for (const m of fs.readFileSync(f, "utf8").matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g)) {
      used++;
      const key = m[1];
      assert.ok(all[key], `${path.basename(f)}: tr("${key}") is not in i18n/strings.json or i18n/kotlin.json`);
      assert.ok(table.includes(`"${key}" to mapOf`), `I18nTable.kt is stale for "${key}", run node scripts/i18n-gen.mjs`);
    }
  }
  assert.ok(used > 30, `expected the Compose UI to use tr(), found ${used}`);
});
