import { readFileSync } from "node:fs";
// Answer cache, one-model-first flow, neuron guard and /stats in the worker. Offline: Wikipedia, Workers AI
// and the Cache API are all stubbed. The Cache API is a Map here, so tests never touch real caches.
import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  normalizeQuestion, cacheUrl, isTimeSensitive, needsSecondModel, estNeurons, overBudget,
  NEURONS_PER_CALL, BUDGET_NEURONS, TTL_CACHE, TTL_TIMELY, _resetForTests, NimbleCounts,
} from "../worker/worker.js";

const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";
const LLAMA = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ORIGIN = "https://w.example";
const realFetch = globalThis.fetch;
const hadCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");

// A Map-backed Cache API: match and put by request URL, with max-age honored for nothing (no expiry needed here).
function fakeCaches() {
  const m = new Map();
  return {
    m,
    default: {
      match: async (req) => (m.has(req.url) ? new Response(m.get(req.url).body, { headers: m.get(req.url).headers }) : undefined),
      put: async (req, res) => {
        m.set(req.url, { body: await res.text(), headers: { "content-type": res.headers.get("content-type"), "cache-control": res.headers.get("cache-control") } });
      },
    },
  };
}
function installCaches(c) {
  Object.defineProperty(globalThis, "caches", { value: c, configurable: true, writable: true });
}
test.beforeEach(() => {
  _resetForTests();
  globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
});
test.afterEach(() => {
  if (hadCaches) Object.defineProperty(globalThis, "caches", hadCaches);
  else delete globalThis.caches;
});
test.after(() => { globalThis.fetch = realFetch; });

// Runs one POST with a stubbed AI. answers: model -> text; models not listed answer UNKNOWN.
function post(q, { answers = {}, turns, env: extra = {} } = {}) {
  const calls = [];
  const env = {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async (model) => { calls.push(model); return { response: answers[model] ?? "UNKNOWN" }; } },
    ...extra,
  };
  const body = turns ? { q, turns } : { q };
  const req = new Request(`${ORIGIN}/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return worker.fetch(req, env).then(async (r) => ({ json: await r.json(), calls, res: r }));
}

// ---- normalization and keys -------------------------------------------------------------------

test("normalize: trims, lowercases and collapses whitespace", () => {
  assert.equal(normalizeQuestion("  Capital   OF\tFrance  "), "capital of france");
});

test("cache key: spacing and case do not change it, different questions do", () => {
  assert.equal(cacheUrl(ORIGIN, "Capital of France"), cacheUrl(ORIGIN, "  capital  of  france "));
  assert.notEqual(cacheUrl(ORIGIN, "capital of france"), cacheUrl(ORIGIN, "capital of spain"));
  assert.ok(cacheUrl(ORIGIN, "a b").startsWith(`${ORIGIN}/`));
});

test("time-sensitive words: current, latest, today, price, score, now, who is the", () => {
  for (const q of ["current president of france", "latest iphone", "price of gold today", "score of the game", "what time is it now", "who is the ceo of apple"])
    assert.equal(isTimeSensitive(q), true, q);
  for (const q of ["capital of france", "who wrote hamlet", "knowing the nowhere"])
    assert.equal(isTimeSensitive(q), false, q);
});

test("second model: time-sensitive, date and number questions; not a plain fact", () => {
  assert.equal(needsSecondModel("when did the eiffel tower open"), true);
  assert.equal(needsSecondModel("population of 2 cities"), true);
  assert.equal(needsSecondModel("latest iphone"), true);
  assert.equal(needsSecondModel("capital of france"), false);
  // Firsts and lasts: a lone model guessed "F.W. de Klerk" for the first president of South Africa.
  assert.equal(needsSecondModel("who was the first president of south africa"), true);
});

// ---- one-model-first flow ---------------------------------------------------------------------

test("a normal question costs one AI call, and the source names only Qwen", async () => {
  const { json, calls } = await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls, [QWEN]);
  assert.equal(json.answer, "Paris is the capital of France.");
  assert.equal(json.source, "Qwen");
});

test("when Qwen says UNKNOWN, Gemma is the second and only other call", async () => {
  const { json, calls } = await post("capital of france", { answers: { [GEMMA]: "Paris is the capital of France." } });
  assert.deepEqual(calls, [QWEN, GEMMA]);
  assert.equal(json.source, "Gemma");
});

test("a date question runs both models, and agreement names both", async () => {
  const { json, calls } = await post("when did the eiffel tower open", {
    answers: { [QWEN]: "The Eiffel Tower opened in 1889.", [GEMMA]: "The Eiffel Tower opened in 1889." },
  });
  assert.deepEqual(calls, [GEMMA, QWEN]);
  assert.equal(json.source, "Gemma + Qwen");
  assert.equal(json.disagree, undefined);
});

test("a clash on a year asks Llama too, and disagree lists both answers", async () => {
  const { json, calls } = await post("when did the eiffel tower open", {
    answers: { [QWEN]: "The Eiffel Tower opened in 1889.", [GEMMA]: "The Eiffel Tower opened in 1887." },
  });
  assert.deepEqual(calls, [GEMMA, QWEN, LLAMA]);
  assert.equal(json.disagree, true);
  assert.equal(json.alts.length, 2);
  assert.equal(json.source, "Qwen");
});

test("three different answers: no synthesis call, the house model's answer with both alts", async () => {
  const { json, calls } = await post("when did the eiffel tower open", {
    answers: { [QWEN]: "It opened in 1889.", [GEMMA]: "It opened in 1887.", [LLAMA]: "It opened in 1885." },
  });
  assert.equal(calls.length, 3, "Qwen, Gemma, Llama and nothing else");
  assert.equal(json.answer, "It opened in 1889.");
  assert.equal(json.source, "Qwen");
  assert.equal(json.disagree, true);
});

// ---- cache ------------------------------------------------------------------------------------

test("an identical question inside the TTL costs no AI call (cache hit)", async () => {
  const c = fakeCaches();
  installCaches(c);
  const first = await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." } });
  assert.equal(first.calls.length, 1);
  const second = await post("  Capital   of FRANCE ", { answers: { [QWEN]: "Something else." } });
  assert.equal(second.calls.length, 0, "a hit runs no model");
  assert.deepEqual(second.json, first.json, "the hit returns the same answer");
});

test("follow-up turns skip the cache entirely", async () => {
  const c = fakeCaches();
  installCaches(c);
  const turns = [{ q: "capital of france", a: "Paris is the capital of France." }];
  await post("and in spain?", { turns, answers: { [QWEN]: "Madrid is the capital of Spain." } });
  await post("and in spain?", { turns, answers: { [QWEN]: "Madrid is the capital of Spain." } });
  assert.equal([...c.m.keys()].filter((k) => k.includes("/__nimble/answer")).length, 0);
});

test("UNKNOWN is never cached: the same question asks the models again", async () => {
  const c = fakeCaches();
  installCaches(c);
  const a = await post("obscure thing");
  const b = await post("obscure thing");
  assert.equal(a.json.answer, "UNKNOWN");
  assert.equal(b.calls.length, 2, "both calls again: Qwen then Gemma");
  assert.equal([...c.m.keys()].filter((k) => k.includes("/__nimble/answer")).length, 0);
});

test("a time-sensitive answer is cached for one hour, others for six", async () => {
  const c = fakeCaches();
  installCaches(c);
  await post("latest iphone", { answers: { [QWEN]: "The newest iPhone is the iPhone 18." } });
  await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." } });
  const ttl = (q) => c.m.get(cacheUrl(ORIGIN, q)).headers["cache-control"];
  assert.equal(ttl("latest iphone"), `max-age=${TTL_TIMELY}`);
  assert.equal(ttl("capital of france"), `max-age=${TTL_CACHE}`);
  assert.equal(TTL_TIMELY, 3600);
  assert.equal(TTL_CACHE, 21600);
});

// ---- neuron guard and /stats ------------------------------------------------------------------

test("the guard: 141 calls (8,460 neurons) still answers, 142 (8,520) returns resting with no AI call", () => {
  assert.equal(estNeurons(141), 8460);
  assert.equal(overBudget({ aiCalls: 141 }), false);
  assert.equal(overBudget({ aiCalls: 142 }), true);
  assert.equal(NEURONS_PER_CALL, 60);
  assert.equal(BUDGET_NEURONS, 8500);
});

async function seedToday(c, aiCalls) {
  const day = new Date().toISOString().slice(0, 10);
  await c.default.put(new Request(`${ORIGIN}/__nimble/stats/${day}`), new Response(JSON.stringify({ aiCalls, cacheHits: 0 })));
}

test("over budget: resting reply with aiError, no AI call, and the client's resting note triggers", async () => {
  const c = fakeCaches();
  installCaches(c);
  await seedToday(c, 142);
  const { json, calls } = await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." } });
  assert.equal(calls.length, 0);
  assert.equal(json.answer, "UNKNOWN");
  assert.equal(json.resting, true);
  assert.ok(json.aiError, "aiError is what Swift and engine.js key the resting note on");
});

test("under budget (141 calls seeded) the question still goes to the AI", async () => {
  const c = fakeCaches();
  installCaches(c);
  await seedToday(c, 141);
  const { json, calls } = await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." } });
  assert.equal(calls.length, 1);
  assert.equal(json.resting, undefined);
});

test("the resting reply is never cached", async () => {
  const c = fakeCaches();
  installCaches(c);
  await seedToday(c, 142);
  await post("capital of france", {});
  assert.equal([...c.m.keys()].filter((k) => k.includes("/__nimble/answer")).length, 0);
});

test("GET /stats returns exactly the day, the counts and the Groq gauge, with no secrets", async () => {
  const c = fakeCaches();
  installCaches(c);
  await seedToday(c, 10);
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async () => { throw new Error("no AI on /stats"); } } });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(Object.keys(j).sort(), ["aiCalls", "cacheHits", "day", "estNeurons", "groqCalls", "groqRefused", "latency"]);
  assert.equal(j.day, new Date().toISOString().slice(0, 10));
  assert.equal(j.aiCalls, 10);
  assert.equal(j.estNeurons, 600);
});

test("a normal question increments aiCalls, and a cache hit increments cacheHits", async () => {
  const c = fakeCaches();
  installCaches(c);
  await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." } });
  await post("capital of france", {});
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async () => ({}) } });
  const j = await res.json();
  assert.equal(j.aiCalls, 1);
  assert.equal(j.cacheHits, 1);
  assert.equal(j.estNeurons, 60);
});

test("without the Cache API (plain Node) the route still answers and nothing throws", async () => {
  delete globalThis.caches;
  const { json, calls } = await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." } });
  assert.equal(calls.length, 1);
  assert.equal(json.source, "Qwen");
});
// ---- Groq free tier first ---------------------------------------------------------------------

// Routes Groq calls to `groq(model)`; everything else is the empty Wikipedia stub.
function stubGroq(groq) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.groq.com/")) {
      seen.push(JSON.parse(init.body).model);
      return groq();
    }
    return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  };
  return seen;
}
const groqSays = (text) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

test("groq: with a key, Groq answers first and Workers AI is never called", async () => {
  installCaches(fakeCaches());
  stubGroq(() => groqSays("Leo Tolstoy wrote *War and Peace*."));
  const { json, calls } = await post("who wrote war and peace", { env: { GROQ_KEY: "k" } });
  assert.equal(json.answer, "Leo Tolstoy wrote War and Peace.");
  assert.equal(json.source, "Groq");
  assert.deepEqual(calls, []);
});

test("groq: every model capped falls back to Qwen on Workers AI", async () => {
  installCaches(fakeCaches());
  const seen = stubGroq(() => new Response("{}", { status: 429 }));
  const { json, calls } = await post("capital of france", { env: { GROQ_KEY: "k", GROQ_BURST_WAIT_MS: 0 }, answers: { [QWEN]: "Paris." } });
  assert.equal(seen.length, 4, "three models, then one more try on the first after the burst wait");
  assert.equal(json.source, "Qwen");
  assert.deepEqual(calls, [QWEN]);
});

test("groq: past the Workers AI budget, Groq still answers", async () => {
  const c = fakeCaches();
  installCaches(c);
  await seedToday(c, 142);
  stubGroq(() => groqSays("Paris."));
  const { json, calls } = await post("capital of france", { env: { GROQ_KEY: "k" } });
  assert.equal(json.answer, "Paris.");
  assert.deepEqual(calls, []);
});

test("groq: no key, past the budget, still the resting reply", async () => {
  const c = fakeCaches();
  installCaches(c);
  await seedToday(c, 142);
  const { json } = await post("capital of france");
  assert.equal(json.resting, true);
});

test("groq: /stats counts every Groq request and every refusal", async () => {
  const c = fakeCaches();
  installCaches(c);
  let n = 0;
  stubGroq(() => (++n === 1 ? new Response("{}", { status: 429 }) : groqSays("Paris.")));
  await post("capital of france", { env: { GROQ_KEY: "k" } });
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { RATE_LIMITER: { limit: async () => ({ success: true }) } });
  const j = await res.json();
  assert.equal(j.groqCalls, 2);
  assert.equal(j.groqRefused, 1);
});

test("groq: a short retry-after is waited out and the same model answers", async () => {
  installCaches(fakeCaches());
  let n = 0;
  const seen = stubGroq(() => (++n === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "0" } }) : groqSays("Paris.")));
  const { json } = await post("capital of france", { env: { GROQ_KEY: "k" } });
  assert.equal(json.source, "Groq");
  assert.deepEqual(seen, ["openai/gpt-oss-120b", "openai/gpt-oss-120b"]);
});

// ---- global counter (Durable Object) ------------------------------------------------------------

// One fake COUNTS binding shared by every "isolate" in the test, backed by the real NimbleCounts class.
function fakeCounts() {
  const store = new Map();
  const obj = new NimbleCounts({ storage: { get: async (k) => store.get(k), put: async (k, v) => void store.set(k, v) } });
  return { idFromName: () => "global", get: () => ({ fetch: (u, init) => obj.fetch(new Request(u, init)) }) };
}

test("global counter: a second isolate sees the first one's calls, and /stats reads the total", async () => {
  installCaches(fakeCaches());
  const COUNTS = fakeCounts();
  await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." }, env: { COUNTS } });
  _resetForTests(); // a different isolate, empty memory, and a different data center's empty Cache API
  installCaches(fakeCaches());
  const r = await worker.fetch(new Request(`${ORIGIN}/stats`), { COUNTS });
  const s = await r.json();
  assert.ok(s.aiCalls >= 1, "the first isolate's AI call shows up in the second one's /stats");
  assert.ok(s.latency?.Qwen?.n >= 1 && Number.isFinite(s.latency.Qwen.p95), "latency per source comes from the global counter");
});

test("global counter: a broken binding never breaks an answer", async () => {
  installCaches(fakeCaches());
  const COUNTS = { idFromName: () => { throw new Error("down"); }, get: () => { throw new Error("down"); } };
  const { json } = await post("capital of france", { answers: { [QWEN]: "Paris is the capital of France." }, env: { COUNTS } });
  assert.match(json.answer, /Paris/);
});

test("groq: a burst (every model 429 with no retry-after) gets one more try on the first model before Workers AI", async () => {
  installCaches(fakeCaches());
  let n = 0;
  const seen = stubGroq(() => (++n <= 3 ? new Response("{}", { status: 429 }) : groqSays("Paris.")));
  const { json, calls } = await post("capital of france", { env: { GROQ_KEY: "k", GROQ_BURST_WAIT_MS: 0 }, answers: { [QWEN]: "Paris from Qwen." } });
  assert.equal(seen.length, 4);
  assert.equal(seen[3], seen[0]);
  assert.equal(json.source, "Groq");
  assert.deepEqual(calls, []);
});

test("groq: a daily cap (429 with a long retry-after) is not retried as a burst", async () => {
  installCaches(fakeCaches());
  const seen = stubGroq(() => new Response("{}", { status: 429, headers: { "retry-after": "3600" } }));
  const { json } = await post("capital of france", { env: { GROQ_KEY: "k", GROQ_BURST_WAIT_MS: 0 }, answers: { [QWEN]: "Paris." } });
  assert.equal(seen.length, 3);
  assert.equal(json.source, "Qwen");
});

test("samantha: with SAMANTHA_URL set she answers first and Groq is never asked", async () => {
  installCaches(fakeCaches());
  let groqAsked = false;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://samantha.test/")) return groqSays("Paris.");
    if (String(url).startsWith("https://api.groq.com/")) { groqAsked = true; return groqSays("Lyon."); }
    return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  };
  const { json } = await post("capital of france", { env: { GROQ_KEY: "k", SAMANTHA_URL: "https://samantha.test" } });
  assert.equal(json.answer, "Paris.");
  assert.equal(json.source, "Samantha");
  assert.equal(groqAsked, false);
});

test("samantha: an unreachable tunnel falls through to Groq", async () => {
  installCaches(fakeCaches());
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://samantha.test/")) throw new Error("tunnel down");
    if (String(url).startsWith("https://api.groq.com/")) return groqSays("Paris.");
    return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  };
  const { json } = await post("capital of france", { env: { GROQ_KEY: "k", SAMANTHA_URL: "https://samantha.test" } });
  assert.equal(json.source, "Groq");
});

// ---- public API keys ----------------------------------------------------------------------------

function postKeyed(headers, extra = {}) {
  installCaches(fakeCaches());
  const used = [];
  const env = {
    RATE_LIMITER: { limit: async () => { used.push("ip"); return { success: true }; } },
    API_LIMITER: { limit: async ({ key }) => { used.push(`key:${key}`); return { success: true }; } },
    AI: { run: async () => ({ response: "Paris." }) },
    API_KEYS: "good1, good2",
    ...extra,
  };
  const req = new Request(`${ORIGIN}/`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ q: "capital of france" }) });
  return worker.fetch(req, env).then(async (r) => ({ res: r, json: await r.json(), used }));
}

test("api key: a listed key (Bearer or x-api-key) is limited in its own bucket, not the IP's", async () => {
  const a = await postKeyed({ authorization: "Bearer good2" });
  assert.equal(a.res.status, 200);
  assert.deepEqual(a.used, ["key:good2"]);
  const b = await postKeyed({ "x-api-key": "good1" });
  assert.deepEqual(b.used, ["key:good1"]);
});

test("api key: an unknown key is refused with 401 before any limit is spent", async () => {
  const r = await postKeyed({ authorization: "Bearer nope" });
  assert.equal(r.res.status, 401);
  assert.deepEqual(r.used, []);
});

test("api key: no key keeps the per-IP limit, and a key's bucket can run out", async () => {
  assert.deepEqual((await postKeyed({})).used, ["ip"]);
  const r = await postKeyed({ "x-api-key": "good1" }, { API_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(r.res.status, 429);
});

test("grounding: the prompt tells the model to ignore a reference about the wrong thing", () => {
  assert.match(readFileSync(new URL("../worker/worker.js", import.meta.url), "utf8"), /ignore it and answer the best-known meaning/);
});

test("a subject of a letter or two gets no Wikipedia reference (\"who created c\" found The Who)", async () => {
  const { tinySubject } = await import("../worker/worker.js");
  assert.equal(tinySubject("who created c"), true);
  assert.equal(tinySubject("what is r?"), true);
  assert.equal(tinySubject("who created python"), false);
  assert.equal(tinySubject("capital of france"), false);
});
