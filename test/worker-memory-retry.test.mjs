// A reference with no figure made both models say UNKNOWN to "how much vitamin d do adults need".
// The worker asks once more without the reference, but never for a time-sensitive question.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });
const page = { index: 1, title: "Vitamin D deficiency", extract: "Vitamin D deficiency or hypovitaminosis D is a vitamin D level that is below normal. It most commonly occurs with little sunlight." };

function ask(q, calls) {
  globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200 });
  const env = {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async (model, opts) => { const grounded = /Reference \(live Wikipedia\)/.test(opts.messages[0].content); calls.push(grounded);
      return { response: grounded ? "UNKNOWN" : "Most adults need 600 IU (15 mcg) of vitamin D a day." }; } },
  };
  return worker.fetch(new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) }), env).then((r) => r.json());
}

test("both models UNKNOWN with a reference: one retry from memory answers a settled question", async () => {
  const calls = [];
  const j = await ask("how much vitamin d do adults need", calls);
  assert.match(j.answer, /600 IU/);
  assert.equal(calls.at(-1), false);
});

test("a time-sensitive question never retries from memory", async () => {
  const calls = [];
  const j = await ask("what is the current vitamin d price today", calls);
  assert.equal(j.answer, "UNKNOWN");
  assert.ok(calls.every((g) => g));
});
