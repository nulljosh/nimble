// Disagreement in the worker, offline. The pure rules (agree, disagreement) are tested directly; the
// answer route is tested with Wikipedia and both models stubbed: a clash adds disagree and alts, and no photo.
import test from "node:test";
import assert from "node:assert/strict";
import worker, { agree, disagreement } from "../worker/worker.js";

const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";
const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

test("agree: the same sentence in other words agrees", () => {
  assert.equal(agree("Tim Cook is the CEO of Apple.", "Apple's chief executive is Timothy Cook.", "who is the ceo of apple"), true);
});

test("agree: a shared name the question does not give is not enough when the other name differs", () => {
  assert.equal(agree("Apple's CEO is Tim Cook.", "Apple's CEO is Satya Nadella.", "who runs apple"), false);
});

test("numbers differ: two populations that clash do not agree", () => {
  assert.equal(agree("The population is 2.1 million.", "The population is 2.4 million.", "population of paris"), false);
});

test("years differ: two founding years that clash do not agree", () => {
  assert.equal(agree("The Eiffel Tower opened in 1889.", "The Eiffel Tower opened in 1887.", "when did the eiffel tower open"), false);
});

test("one UNKNOWN agrees with anything, so there is nothing to disagree about", () => {
  assert.equal(agree("Paris is the capital of France.", "UNKNOWN", "capital of france"), true);
  assert.deepEqual(disagreement("UNKNOWN", "Paris is the capital of France.", "", "capital of france"), {});
});

test("grounding settles it: when the reference carries a clash token, no disagreement", () => {
  const g = "Hamlet is a tragedy by William Shakespeare, written around 1600.";
  assert.deepEqual(disagreement("Hamlet was written by William Shakespeare.", "Hamlet was written by Christopher Marlowe.", g, "who wrote hamlet"), {});
});

test("without grounding, a clash returns both answers with their model names and no pick", () => {
  const out = disagreement("Hamlet was written by William Shakespeare.", "Hamlet was written by Christopher Marlowe.", "", "who wrote hamlet");
  assert.equal(out.disagree, true);
  assert.deepEqual(out.alts, [
    { model: "Qwen3 30B", answer: "Hamlet was written by William Shakespeare." },
    { model: "Gemma 4 26B", answer: "Hamlet was written by Christopher Marlowe." },
  ]);
});

test("near-synonyms agree: Tim and Timothy are the same name, and a one-sided extra is not a clash", () => {
  assert.equal(agree("Tim Cook leads Apple.", "Timothy Cook leads Apple.", "who leads apple"), true);
  assert.equal(agree("Tim Cook leads Apple.", "Tim Cook and Jeff Williams lead Apple.", "who leads apple"), true);
});

// The answer route, with Wikipedia and the models stubbed.
function ask(q, { wiki = [], answers }) {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (/\/page\/summary\//.test(url)) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ query: { pages: wiki } }), { status: 200 });
  };
  const env = {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async (model) => ({ response: answers[model] ?? "UNKNOWN" }) },
  };
  return worker.fetch(new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) }), env)
    .then((r) => r.json());
}
const SHAKE_PHOTO = { title: "William Shakespeare", index: 3, extract: "William Shakespeare was an English playwright.", thumbnail: { source: "https://upload.wikimedia.org/shakespeare.jpg" } };

test("the route adds disagree and alts when the two models clash and no page settles it", async () => {
  // No reference page: nothing settles the clash, and the page that would have given a photo is absent too.
  const j = await ask("who wrote hamlet, and when?", {
    wiki: [],
    answers: { [QWEN]: "Hamlet was written by William Shakespeare.", [GEMMA]: "Hamlet was written by Christopher Marlowe." },
  });
  assert.equal(j.disagree, true);
  assert.equal(j.alts.length, 2);
  assert.equal(j.alts[1].model, "Gemma 4 26B");
  assert.equal(j.image, undefined, "no photo when the sources disagree");
});

test("a reference that names one clash token settles it: no disagree, the answer stays as before", async () => {
  const j = await ask("who wrote hamlet, and when?", {
    wiki: [SHAKE_PHOTO],
    answers: { [QWEN]: "Hamlet was written by William Shakespeare.", [GEMMA]: "Hamlet was written by Christopher Marlowe." },
  });
  assert.equal(j.disagree, undefined);
  assert.equal(j.alts, undefined);
  assert.equal(j.answer, "Hamlet was written by William Shakespeare.");
});

test("the route adds no disagreement fields when the models agree", async () => {
  const j = await ask("who wrote hamlet, and when?", {
    wiki: [SHAKE_PHOTO],
    answers: { [QWEN]: "Hamlet was written by William Shakespeare.", [GEMMA]: "Hamlet was written by William Shakespeare." },
  });
  assert.equal(j.disagree, undefined);
  assert.equal(j.alts, undefined);
  assert.equal(j.source, "Gemma + Qwen");
});
