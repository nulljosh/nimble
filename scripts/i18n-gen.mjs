#!/usr/bin/env node
// i18n-gen: master i18n/strings.json -> docs/locales/*.json (one file per locale, en always full).
// Mirrors quotestreak/scripts/i18n-gen.mjs. Web locales land in docs/locales (docs/ is the site),
// the native String Catalog in Resources/Localizable.xcstrings (both app targets build it).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(resolve(root, "i18n/strings.json"), "utf8"));
const { sourceLanguage, locales } = src._meta;
const keys = Object.keys(src).filter((k) => k !== "_meta");

const outDir = resolve(root, "docs/locales");
mkdirSync(outDir, { recursive: true });
for (const lng of locales) {
  const out = {};
  for (const k of keys) {
    const v = src[k][lng];
    if (lng === sourceLanguage || (v && v.length)) out[k] = v || src[k][sourceLanguage];
  }
  writeFileSync(resolve(outDir, `${lng}.json`), JSON.stringify(out, null, 2) + "\n");
}

const translated = (lng) => keys.filter((k) => lng === sourceLanguage || (src[k][lng] && src[k][lng].length)).length;
console.log(`i18n-gen: ${keys.length} keys -> docs/locales/*.json`);
for (const lng of locales) console.log(`  ${lng}: ${translated(lng)}/${keys.length} translated`);

// Native String Catalog. SwiftUI's key for `Text("Score: \(n)")` is "Score: %lld", so the
// web's {n}/{s} tokens are rewritten to the printf specifiers Swift generates.
const swiftKey = (k) => k.replace(/\{n\d*\}/g, "%lld").replace(/\{s\}/g, "%@");
const strings = {};
for (const k of keys) {
  const localizations = {};
  for (const lng of locales) {
    const v = lng === sourceLanguage ? src[k][sourceLanguage] : src[k][lng];
    if (!v) continue;
    localizations[lng] = { stringUnit: { state: "translated", value: swiftKey(v) } };
  }
  strings[swiftKey(k)] = { extractionState: "manual", localizations };
}
writeFileSync(
  resolve(root, "Resources/Localizable.xcstrings"),
  JSON.stringify({ sourceLanguage, strings, version: "1.0" }, null, 2) + "\n"
);
console.log(`i18n-gen: ${keys.length} keys -> Resources/Localizable.xcstrings`);
