// The answer route reports why the AI gave UNKNOWN, but only when an AI call threw. Offline: Wikipedia and Workers AI are stubbed.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

// throws: model -> error message to throw. answers: model -> text. Models not listed answer UNKNOWN.
async function ask({ throws = {}, answers = {} }) {
  globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  const env = {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: {
      run: async (model) => {
        if (throws[model]) throw new Error(throws[model]);
        return { response: answers[model] ?? "UNKNOWN" };
      },
    },
  };
  const req = new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: "capital of france" }) });
  return (await worker.fetch(req, env)).json();
}
const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";

test("both models failing on quota reports the error as aiError", async () => {
  const j = await ask({ throws: { [QWEN]: "AiError: daily free allocation of neurons exceeded", [GEMMA]: "AiError: daily free allocation of neurons exceeded" } });
  assert.equal(j.answer, "UNKNOWN");
  assert.equal(j.aiError, "AiError: daily free allocation of neurons exceeded");
});

test("a long error is cut to 200 characters with whitespace collapsed", async () => {
  const long = "boom\n\n" + "x".repeat(500);
  const j = await ask({ throws: { [QWEN]: long, [GEMMA]: long } });
  assert.equal(j.aiError.length, 200);
  assert.ok(!/\n/.test(j.aiError));
});

test("a model saying UNKNOWN without an error leaves aiError out", async () => {
  const j = await ask({});
  assert.equal(j.answer, "UNKNOWN");
  assert.equal("aiError" in j, false);
});

test("an answer that came back despite one failed call has no aiError", async () => {
  const j = await ask({ throws: { [QWEN]: "AiError: capacity" }, answers: { [GEMMA]: "Paris is the capital of France." } });
  assert.equal(j.answer, "Paris is the capital of France.");
  assert.equal("aiError" in j, false);
});

test("an UNKNOWN from one failure and one plain UNKNOWN still reports the failure", async () => {
  const j = await ask({ throws: { [GEMMA]: "AiError: capacity" } });
  assert.equal(j.answer, "UNKNOWN");
  assert.equal(j.aiError, "AiError: capacity");
});

test("the existing fields are unchanged on an answer", async () => {
  const j = await ask({ answers: { [QWEN]: "Paris is the capital of France.", [GEMMA]: "Paris is the capital of France." } });
  assert.equal(j.answer, "Paris is the capital of France.");
  assert.equal(j.source, "Gemma + Qwen");
});
