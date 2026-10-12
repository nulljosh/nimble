// Answer cache, one-model-first flow, neuron guard and /stats in the worker. Offline: Wikipedia, Workers AI
// and the Cache API are all stubbed. The Cache API is a Map here, so tests never touch real caches.
import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  normalizeQuestion, cacheUrl, isTimeSensitive, needsSecondModel, estNeurons, overBudget,
  NEURONS_PER_CALL, BUDGET_NEURONS, TTL_CACHE, TTL_TIMELY, _resetForTests,
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
  assert.deepEqual(calls, [QWEN, GEMMA]);
  assert.equal(json.source, "Gemma + Qwen");
  assert.equal(json.disagree, undefined);
});

test("a clash on a year asks Llama too, and disagree lists both answers", async () => {
  const { json, calls } = await post("when did the eiffel tower open", {
    answers: { [QWEN]: "The Eiffel Tower opened in 1889.", [GEMMA]: "The Eiffel Tower opened in 1887." },
  });
  assert.deepEqual(calls, [QWEN, GEMMA, LLAMA]);
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

test("GET /stats returns exactly day, aiCalls, cacheHits and estNeurons, with no secrets", async () => {
  const c = fakeCaches();
  installCaches(c);
  await seedToday(c, 10);
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async () => { throw new Error("no AI on /stats"); } } });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(Object.keys(j).sort(), ["aiCalls", "cacheHits", "day", "estNeurons"]);
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
