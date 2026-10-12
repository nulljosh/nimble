#!/usr/bin/env node
// Offline Wikipedia pack builder: top English Wikipedia article intros -> docs/pack/wikipedia-top-v1.json.gz
// Usage: node scripts/build-offline-pack.mjs
// Keyless: Wikimedia pageviews (top lists) + Wikipedia REST summaries. Node built-ins only.
// Re-runs resume from PACK_CACHE (one JSON file per fetched summary, misses included), so a re-run is free.
// Run it in batches: each run stops at the same point it would have, and the next run picks up from the cache.
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(root, "docs/pack");
const OUT = join(OUT_DIR, "wikipedia-top-v1.json.gz");
const CACHE = process.env.PACK_CACHE || "/private/tmp/claude-501/-Users-joshua/ccd069ce-bc60-4205-be42-ac96d855a019/scratchpad/packcache";
const UA = "NimbleOfflinePack/1.0 (https://nimble.jaybulb.com; trommatic@icloud.com)";
const CAP = 9000;            // entries in the pack
const DAYS = 120;            // daily top lists merged into the ranking
const EXTRACT_MAX = 1000;    // characters of whole sentences kept per entry (France's intro puts "Paris" past 600)
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
  if (existsSync(file)) {
    try { return JSON.parse(readFileSync(file, "utf8")); } catch { unlinkSync(file); } // a run killed mid-write: refetch
  }
  const res = await politeGet(url);
  if (res.status === 0) return res; // transient failure: not cached, next run retries it
  writeFileSync(file, JSON.stringify(res));
  return res;
}

// --- 1. candidates: last complete month, plus the last DAYS daily top lists, summed ---
function lastCompleteMonth(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { y: d.getUTCFullYear(), m: String(d.getUTCMonth() + 1).padStart(2, "0") };
}
const BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access";
const NON_ARTICLE = /^(Main_Page|Special:|Wikipedia:|WP:|Portal:|File:|Help:|Template:|Template_talk:|Category:|Talk:|User:|User_talk:|Draft:|Module:|MediaWiki:|Book:|Project:|Wikipedia_talk:|TimedText:|Media:|Topic:|Gadget:|Index:)/i;
const isArticleTitle = (t) => t && !NON_ARTICLE.test(t) && t !== "-";
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
// Lists, year pages, decade pages and day or month pages never answer a question: dropped before any summary is fetched.
const isSkippedTitle = (raw) => {
  const t = String(raw).replace(/_/g, " "); // pageview titles use underscores
  return /^List of /i.test(t) ||
  /\(disambiguation\)$/i.test(t) ||
  /^\d{1,4}s?( BC| AD)?$/.test(t) ||
  new RegExp(`^(${MONTHS})( \\d{1,2})?(,? \\d{1,4})?$`).test(t);
};
const pad = (n) => String(n).padStart(2, "0");
const dayPath = (d) => `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;

async function candidates() {
  const { y, m } = lastCompleteMonth();
  const ym = `${y}/${pad(m)}`;
  const monthly = await cachedGet(`month:${ym}`, `${BASE}/${ym}/all-days`);
  if (monthly.status !== 200) throw new Error(`monthly pageviews failed: ${monthly.status}`);
  const score = new Map();
  for (const a of monthly.body.items[0].articles) if (isArticleTitle(a.article)) score.set(a.article, a.views);
  // Each day's top list (the endpoint is up to 1000 per call) adds its views to the score.
  // The endpoint lags about two days, so the window starts two days back.
  const start = Date.now() - 2 * 86400000;
  let days = 0;
  for (let i = 0; i < DAYS; i++) {
    const day = dayPath(new Date(start - i * 86400000));
    const r = await cachedGet(`day:${day}`, `${BASE}/${day}`);
    if (r.status !== 200) continue;
    days++;
    for (const a of r.body.items[0].articles) {
      if (!isArticleTitle(a.article)) continue;
      score.set(a.article, (score.get(a.article) || 0) + a.views);
    }
  }
  console.log(`daily lists merged: ${days} of ${DAYS}`);
  return { ym: `${ym.replace("/", "-")} plus ${DAYS} daily lists`, ranked: [...score.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t) };
}

// --- 2. summaries ---
// Whole sentences from the intro, up to EXTRACT_MAX characters. A first sentence longer than that is cut at a word.
function trimExtract(text) {
  const clean = String(text || "").replace(/\s*\((?:[^()]*\/[^()]*|\s*)\)/g, "").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  let out = "";
  for (const s of sentences) {
    const next = (out + " " + s.trim()).trim();
    if (next.length > EXTRACT_MAX) break;
    out = next;
  }
  if (!out) {
    out = clean;
    if (out.length > EXTRACT_MAX) {
      const cut = out.slice(0, EXTRACT_MAX);
      out = cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
    }
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
  let misses = 0, disambig = 0, failed = 0, skipped = 0, processed = 0;
  // A batch stops itself after PACK_BUDGET_MS (default 9 minutes) so a foreground run always returns; the cache keeps the progress.
  const deadline = Date.now() + Number(process.env.PACK_BUDGET_MS || 9 * 60 * 1000);
  for (const title of ranked) {
    if (entries.length >= CAP) break;
    if (Date.now() > deadline) { console.log("batch time budget reached"); break; }
    if (isSkippedTitle(title)) { skipped++; continue; }
    processed++;
    const res = await cachedGet(`summary:${title}`, summaryUrl(title));
    if (res.status === 404) { misses++; continue; }
    if (res.status !== 200) { failed++; continue; }
    const s = res.body;
    if (s.type === "disambiguation" || !s.extract) { disambig++; continue; }
    const canonical = s.title || title;
    if (seen.has(canonical) || isSkippedTitle(canonical)) continue;
    seen.add(canonical);
    const u = s.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical.replace(/ /g, "_"))}`;
    const entry = { t: canonical, d: s.description || "", e: trimExtract(s.extract), u, a: aliasesFor(canonical) };
    if (s.thumbnail?.source) entry.i = s.thumbnail.source;
    entries.push(entry);
    if (processed % 500 === 0) console.log(`  processed ${processed}, kept ${entries.length}`);
  }
  console.log(`kept ${entries.length}; skipped by title ${skipped}, missing ${misses}, disambiguation/no extract ${disambig}, failed ${failed}`);
  return { entries, ym, complete: entries.length >= CAP };
}

function pack(entries, ym) {
  const obj = {
    version: 1,
    builtAt: new Date().toISOString().slice(0, 10),
    source: "Wikipedia, CC BY-SA 4.0",
    pageviews: ym,
    count: entries.length,
    entries,
  };
  return gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });
}

const { entries, ym, complete } = await build();
if (!complete) {
  // Not enough summaries yet: the cache holds the progress. Nothing is written; run again to continue.
  console.log(`not done: ${entries.length} of ${CAP}. Run again to resume from the cache.`);
  process.exit(0);
}
let gz = pack(entries, ym);
console.log(`gzip size: ${(gz.length / 1024 / 1024).toFixed(2)} MB for ${entries.length} entries`);
if (gz.length >= SIZE_BUDGET) {
  // Over budget: trim the tail until it fits (the list is ranked, so the least-viewed go first).
  let n = entries.length;
  while (gz.length >= SIZE_BUDGET && n > 100) {
    n = Math.floor(n * 0.95);
    gz = pack(entries.slice(0, n), ym);
  }
  entries.length = n;
  console.log(`over budget; trimmed to ${n} entries, ${(gz.length / 1024 / 1024).toFixed(2)} MB`);
}
mkdirSync(OUT_DIR, { recursive: true });
const tmp = OUT + ".tmp";
writeFileSync(tmp, gz);
renameSync(tmp, OUT);
// index.json: the small file the app reads to label the download size, without fetching the pack.
writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify({ version: 1, file: "wikipedia-top-v1.json.gz", bytes: gz.length, count: entries.length, builtAt: new Date().toISOString().slice(0, 10), pageviews: ym }, null, 2) + "\n");
console.log(`wrote ${OUT}: ${entries.length} entries, ${gz.length} bytes`);
