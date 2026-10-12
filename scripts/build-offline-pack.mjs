#!/usr/bin/env node
// Offline Wikipedia pack builder: top English Wikipedia article intros -> docs/pack/wikipedia-top-v1.json.gz
// Usage: node scripts/build-offline-pack.mjs
// Keyless: Wikimedia pageviews (top lists) + Wikipedia REST summaries. Node built-ins only.
// Re-runs resume from PACK_CACHE (one JSON file per fetched summary, misses included), so a re-run is free.
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(root, "docs/pack");
const OUT = join(OUT_DIR, "wikipedia-top-v1.json.gz");
const CACHE = process.env.PACK_CACHE || "/private/tmp/claude-501/-Users-joshua/ccd069ce-bc60-4205-be42-ac96d855a019/scratchpad/packcache";
const UA = "NimbleOfflinePack/1.0 (https://nimble.jaybulb.com; trommatic@icloud.com)";
const CAP = 4000;
const EXTRACT_MAX = 320;
const CONCURRENCY = 3;
const SPACING_MS = 150;
const SIZE_BUDGET = 4 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => createHash("sha1").update(s).digest("hex");
mkdirSync(CACHE, { recursive: true });

// --- polite client: max 3 in flight, 150ms between request starts, retry 429/5xx with backoff ---
let nextStart = 0, inFlight = 0;
const gate = [];
function acquire() {
  return new Promise((res) => { gate.push(res); pump(); });
}
function pump() {
  while (gate.length && inFlight < CONCURRENCY) {
    const now = Date.now();
    if (now < nextStart) { setTimeout(pump, nextStart - now); return; }
    nextStart = Date.now() + SPACING_MS;
    inFlight++;
    gate.shift()();
  }
}
function release() { inFlight--; pump(); }

async function politeGet(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await acquire();
    let r;
    try {
      r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    } catch (e) {
      release();
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    release();
    if (r.status === 404) return { status: 404 };
    if (r.status === 429 || r.status >= 500) {
      const ra = Number(r.headers.get("retry-after"));
      await sleep(ra > 0 ? ra * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    if (!r.ok) return { status: r.status };
    return { status: 200, body: await r.json() };
  }
  return { status: 0 };
}

// Cached GET: stores {status, body} so a miss (404) is remembered too.
async function cachedGet(key, url) {
  const file = join(CACHE, hash(key) + ".json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const res = await politeGet(url);
  if (res.status === 0) return res; // transient failure: not cached, next run retries it
  writeFileSync(file, JSON.stringify(res));
  return res;
}

// --- 1. candidates: last complete month, monthly top list plus each day's top list ---
function lastCompleteMonth(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { y: d.getUTCFullYear(), m: String(d.getUTCMonth() + 1).padStart(2, "0"), days: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() };
}
const BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access";
const NON_ARTICLE = /^(Main_Page|Special:|Wikipedia:|WP:|Portal:|File:|Help:|Template:|Template_talk:|Category:|Talk:|User:|User_talk:|Draft:|Module:|MediaWiki:|Book:|Project:|Wikipedia_talk:|TimedText:|Media:|Topic:|Gadget:|Index:)/i;
const isArticleTitle = (t) => t && !NON_ARTICLE.test(t) && t !== "-";

async function candidates() {
  const { y, m, days } = lastCompleteMonth();
  const ym = `${y}/${m}`;
  const monthly = await cachedGet(`month:${ym}`, `${BASE}/${ym}/all-days`);
  if (monthly.status !== 200) throw new Error(`monthly pageviews failed: ${monthly.status}`);
  const score = new Map();
  for (const a of monthly.body.items[0].articles) if (isArticleTitle(a.article)) score.set(a.article, a.views);
  // The top endpoint returns at most 1000 per call; each day's list adds articles the monthly list cut off.
  for (let d = 1; d <= days; d++) {
    const day = `${ym}/${String(d).padStart(2, "0")}`;
    const r = await cachedGet(`day:${day}`, `${BASE}/${day}`);
    if (r.status !== 200) continue;
    for (const a of r.body.items[0].articles) {
      if (!isArticleTitle(a.article) || score.has(a.article)) continue;
      score.set(a.article, (score.get(a.article) || 0) + a.views);
    }
  }
  return { ym, ranked: [...score.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t) };
}

// --- 2. summaries ---
function trimExtract(text) {
  const clean = String(text || "").replace(/\s*\((?:[^()]*\/[^()]*|\s*)\)/g, "").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  let out = sentences.slice(0, 2).join("").trim() || clean;
  if (out.length > EXTRACT_MAX) {
    const cut = out.slice(0, EXTRACT_MAX);
    out = cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
  }
  return out;
}

function aliasesFor(title) {
  const lower = title.toLowerCase();
  const set = new Set([lower]);
  const noParens = title.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (noParens && noParens !== title) set.add(noParens.toLowerCase());
  if (/^the /i.test(title)) set.add(title.slice(4).toLowerCase());
  else set.add("the " + lower);
  set.delete(lower);
  return [...set].filter(Boolean);
}

const summaryUrl = (title) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;

async function build() {
  const { ym, ranked } = await candidates();
  console.log(`candidates after article filter: ${ranked.length} (pageviews ${ym})`);
  const entries = [];
  const seen = new Set();
  let misses = 0, disambig = 0, failed = 0, processed = 0;
  for (const title of ranked) {
    if (entries.length >= CAP) break;
    processed++;
    const res = await cachedGet(`summary:${title}`, summaryUrl(title));
    if (res.status === 404) { misses++; continue; }
    if (res.status !== 200) { failed++; continue; }
    const s = res.body;
    if (s.type === "disambiguation" || !s.extract) { disambig++; continue; }
    const canonical = s.title || title;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const u = s.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical.replace(/ /g, "_"))}`;
    const entry = { t: canonical, d: s.description || "", e: trimExtract(s.extract), u, a: aliasesFor(canonical) };
    if (s.thumbnail?.source) entry.i = s.thumbnail.source;
    entries.push(entry);
    if (processed % 500 === 0) console.log(`  processed ${processed}, kept ${entries.length}`);
  }
  console.log(`kept ${entries.length}; missing ${misses}, disambiguation/no extract ${disambig}, failed ${failed}`);
  return entries;
}

function pack(entries) {
  const { y, m } = lastCompleteMonth();
  const obj = {
    version: 1,
    builtAt: new Date().toISOString().slice(0, 10),
    source: "Wikipedia, CC BY-SA 4.0",
    pageviews: `${y}-${m}`,
    count: entries.length,
    entries,
  };
  return gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });
}

const entries = await build();
let gz = pack(entries);
console.log(`gzip size: ${(gz.length / 1024 / 1024).toFixed(2)} MB for ${entries.length} entries`);
if (gz.length >= SIZE_BUDGET) {
  // Over budget: trim the tail until it fits (the list is ranked, so the least-viewed go first).
  let n = entries.length;
  while (gz.length >= SIZE_BUDGET && n > 100) {
    n = Math.floor(n * 0.95);
    gz = pack(entries.slice(0, n));
  }
  entries.length = n;
  console.log(`over budget; trimmed to ${n} entries, ${(gz.length / 1024 / 1024).toFixed(2)} MB`);
}
mkdirSync(OUT_DIR, { recursive: true });
const tmp = OUT + ".tmp";
writeFileSync(tmp, gz);
renameSync(tmp, OUT);
// index.json: the small file the app reads to label the download size, without fetching the pack.
const { y, m } = lastCompleteMonth();
writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify({ version: 1, file: "wikipedia-top-v1.json.gz", bytes: gz.length, count: entries.length, builtAt: new Date().toISOString().slice(0, 10), pageviews: `${y}-${m}` }, null, 2) + "\n");
console.log(`wrote ${OUT}: ${entries.length} entries, ${gz.length} bytes`);
