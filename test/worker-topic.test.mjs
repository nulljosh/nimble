// The answer route of the Worker, offline: Wikipedia search and both models are stubbed.
// Covers the topic and topicUrl fields (old fields unchanged) and the grounding rules.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";

const realFetch = globalThis.fetch;
const HAMLET = {
  title: "Hamlet", index: 1, extract: "Hamlet is a tragedy written by William Shakespeare sometime between 1599 and 1601.",
  thumbnail: { source: "https://upload.wikimedia.org/hamlet.jpg", width: 800, height: 500 },
};
const FRANCE = {
  title: "France", index: 1, extract: "France is a country in Western Europe. Its capital is Paris. The country has been a republic since 1870.",
  thumbnail: { source: "https://upload.wikimedia.org/europe-map.svg.png", width: 800, height: 500 },
};

// wiki: the search pages Wikipedia returns. answers: what each model says, in call order per question.
function run(q, { wiki, answers, turns }) {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).startsWith("https://en.wikipedia.org/w/api.php"));
    return new Response(JSON.stringify({ query: { pages: wiki } }), { status: 200 });
  };
  const seen = [];
  const env = {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: {
      run: async (model, input) => {
        seen.push({ model, system: input.messages[0].content });
        const text = answers[model] ?? "UNKNOWN";
        return { response: text };
      },
    },
  };
  const body = JSON.stringify(turns ? { q, turns } : { q });
  return worker.fetch(new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body }), env)
    .then((r) => r.json()).then((j) => ({ j, seen }));
}

test.after(() => { globalThis.fetch = realFetch; });

test("an answer with a photo names the page the photo came from as topic", async () => {
  const { j } = await run("who wrote hamlet", {
    wiki: [HAMLET],
    answers: { "@cf/qwen/qwen3-30b-a3b-fp8": "Hamlet was written by William Shakespeare.", "@cf/google/gemma-4-26b-a4b-it": "Hamlet was written by William Shakespeare." },
  });
  assert.equal(j.answer, "Hamlet was written by William Shakespeare.");
  assert.equal(j.topic, "Hamlet");
  assert.equal(j.topicUrl, "https://en.wikipedia.org/wiki/Hamlet");
  assert.equal(j.image.url, "https://upload.wikimedia.org/hamlet.jpg");
  assert.equal(j.image.title, undefined, "the photo object keeps its old shape");
  assert.equal(j.source, "Gemma + Qwen");
  assert.ok(Array.isArray(j.refs));
});

test("without a photo, topic falls back to the first grounding page", async () => {
  const noPic = { ...HAMLET, thumbnail: undefined };
  const { j } = await run("who wrote hamlet", {
    wiki: [noPic],
    answers: { "@cf/qwen/qwen3-30b-a3b-fp8": "Hamlet was written by William Shakespeare." },
  });
  assert.equal(j.image, undefined);
  assert.equal(j.topic, "Hamlet");
  assert.equal(j.topicUrl, "https://en.wikipedia.org/wiki/Hamlet");
});

test("UNKNOWN carries no topic, no photo and no refs", async () => {
  const { j } = await run("what is the weather on mars", { wiki: [HAMLET], answers: {} });
  assert.equal(j.answer, "UNKNOWN");
  assert.equal(j.topic, undefined);
  assert.equal(j.topicUrl, undefined);
  assert.equal(j.image, undefined);
});

test("topicUrl uses underscores and encodes the title like the refs do", async () => {
  const page = { title: "Saint-Germain-des-Prés", index: 1, extract: "Saint-Germain-des-Prés is a district in Paris.", thumbnail: { source: "https://upload.wikimedia.org/a.jpg" } };
  const { j } = await run("what is saint germain", {
    wiki: [page],
    answers: { "@cf/qwen/qwen3-30b-a3b-fp8": "Saint-Germain-des-Prés is a district in Paris." },
  });
  assert.equal(j.topic, "Saint-Germain-des-Prés");
  assert.equal(j.topicUrl, encodeURI("https://en.wikipedia.org/wiki/Saint-Germain-des-Prés"));
  assert.equal(j.refs[0].url, j.topicUrl);
});

test("the grounding rule is sent only when reference text exists", async () => {
  const withRef = await run("capital of france", {
    wiki: [FRANCE],
    answers: { "@cf/qwen/qwen3-30b-a3b-fp8": "The capital of France is Paris." },
  });
  assert.match(withRef.seen[0].system, /Do not add a date or figure the reference lacks/);
  const noRef = await run("capital of france", { wiki: [], answers: {} });
  assert.doesNotMatch(noRef.seen[0].system, /Do not add a date/);
});

test("the 'since' sentence stays out unless it names an office", async () => {
  const quake = { title: "Quake", index: 1, extract: "Quake is a tremor. It is measured in magnitudes. Quakes come from faults. Plates move slowly. It has been studied since 1944 by many people." };
  const office = { title: "Chancellor", index: 2, extract: "Chancellor is a title. Angela Merkel has been the chancellor since 2005." };
  const { seen } = await run("tell me", { wiki: [quake, office], answers: {} });
  const sys = seen[0].system;
  assert.doesNotMatch(sys, /1944/);
  assert.match(sys, /since 2005/);
});

test("old clients still get answer, source, image and refs", async () => {
  const { j } = await run("who wrote hamlet", {
    wiki: [HAMLET],
    answers: { "@cf/qwen/qwen3-30b-a3b-fp8": "Hamlet was written by William Shakespeare." },
  });
  assert.deepEqual(Object.keys(j).filter((k) => ["answer", "source", "image", "refs", "topic", "topicUrl"].includes(k)).sort(),
    ["answer", "image", "refs", "source", "topic", "topicUrl"]);
});

// Dates: a date sentence past the lead reaches the model only when the question asks when,
// or when its year also appears in the lead. The printing press case failed when neither held.
const PRESS = { title: "Printing press", index: 1, extract: "The printing press is a mechanical printing device. It was a major development in printing technology. Movable type was used in Europe. Books became cheaper to make. The first press was built by Johannes Gutenberg around 1440 in Mainz." };
const FRANCE_OLYMPICS = { title: "France", index: 1, extract: "France is a country in Western Europe. Its capital is Paris. It is a republic. It has many regions. The country hosted the Olympics in 1924." };

test("a when question keeps the date sentence past the lead", async () => {
  const { seen } = await run("when was the printing press invented", { wiki: [PRESS], answers: {} });
  assert.match(seen[0].system, /around 1440 in Mainz/);
});

test("a non-date question drops an unrelated date sentence past the lead", async () => {
  const { seen } = await run("capital of france", { wiki: [FRANCE_OLYMPICS], answers: {} });
  assert.doesNotMatch(seen[0].system, /1924/);
  assert.match(seen[0].system, /Its capital is Paris/);
});
