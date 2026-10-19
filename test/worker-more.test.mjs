// "Tell me more": the worker asks for three sentences, gives the model room for them, never asks a second
// model (three sentences from two models never match word for word), and caches apart from the one-liner.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";

const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

function ask(body, calls) {
  globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  const env = {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async (model, opts) => { calls.push({ model, system: opts.messages[0].content, max: opts.max_tokens });
      return { response: "Paris is the capital of France. It sits on the Seine. About two million people live there." }; } },
  };
  return worker.fetch(new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env)
    .then((r) => r.json());
}

test("more: three sentences asked, one model, room for the words", async () => {
  const calls = [];
  // A number in the question would normally bring in the second model; more never does.
  const j = await ask({ q: "how many people live in paris in 2026", more: true }, calls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, QWEN);
  assert.match(calls[0].system, /three short factual sentences/);
  assert.equal(calls[0].max, 240);
  assert.match(j.answer, /Seine/);
});

test("without more: the one-sentence prompt and the usual budget", async () => {
  const calls = [];
  await ask({ q: "capital of france" }, calls);
  assert.match(calls[0].system, /one short factual sentence/);
  assert.equal(calls[0].max, 80);
});

test("a normal use of the word reference is an answer, not the model narrating its grounding", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  const env = { RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async () => ({ response: "A haiku is a short Japanese poem. It often carries a seasonal reference." }) } };
  const j = await worker.fetch(new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: "what is a haiku", more: true }) }), env).then((r) => r.json());
  assert.match(j.answer, /seasonal reference/);
});

test("an answer that ends 'according to the reference' keeps its figure", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  const env = { RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async () => ({ response: "Most adults need 600 IU of vitamin D daily, according to the reference." }) } };
  const j = await worker.fetch(new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: "how much vitamin d do adults need" }) }), env).then((r) => r.json());
  assert.equal(j.answer, "Most adults need 600 IU of vitamin D daily.");
});
