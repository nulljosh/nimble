// Each upstream down in turn: Wikipedia, Groq, Workers AI. The worker still answers (or says UNKNOWN cleanly), never throws.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });
const page = { index: 1, title: "Paris", extract: "Paris is the capital and largest city of France." };
const wiki = () => new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200 });
const groqOk = () => new Response(JSON.stringify({ choices: [{ message: { content: "Paris." } }] }), { status: 200 });

async function ask({ wikiDown = false, groqDown = false, aiDown = false, groqSays = "Paris." } = {}) {
  globalThis.fetch = async (u) => {
    const url = String(u);
    if (url.includes("groq.com")) { if (groqDown) throw new Error("groq down"); return new Response(JSON.stringify({ choices: [{ message: { content: groqSays } }] }), { status: 200 }); }
    if (wikiDown) throw new Error("wikipedia down");
    return wiki();
  };
  const env = {
    GROQ_KEY: "k", GROQ_BURST_WAIT_MS: 0,
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async () => { if (aiDown) throw new Error("AI down"); return { response: "Paris." }; } },
  };
  const r = await worker.fetch(new Request("https://w.example/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: "capital of france" }) }), env);
  assert.equal(r.status, 200);
  return r.json();
}

test("Wikipedia down: the model still answers", async () => {
  assert.equal((await ask({ wikiDown: true })).answer, "Paris.");
});

test("Groq down: Workers AI answers", async () => {
  const j = await ask({ groqDown: true });
  assert.equal(j.answer, "Paris.");
  assert.equal(j.source, "Qwen");
});

test("Workers AI down: Groq answers", async () => {
  assert.equal((await ask({ aiDown: true })).source, "Groq");
});

test("Groq and Workers AI both down: a clean UNKNOWN with the error, not a crash", async () => {
  const j = await ask({ groqDown: true, aiDown: true });
  assert.equal(j.answer, "UNKNOWN");
  assert.match(j.aiError, /AI down/);
});

test("a reply said twice comes back once; a name that repeats a word stays whole", async () => {
  assert.equal((await ask({ groqSays: "William Shakespeare.William Shakespeare." })).answer, "William Shakespeare.");
  assert.equal((await ask({ groqSays: "Bora Bora." })).answer, "Bora Bora.");
});

test("a throw anywhere comes back as JSON UNKNOWN with CORS, never Cloudflare's error page", async () => {
  const env = { RATE_LIMITER: { limit: async () => { throw new Error("limiter down"); } } };
  const r = await worker.fetch(new Request("https://w.example/", { method: "POST", body: JSON.stringify({ q: "capital of france" }) }), env);
  assert.equal(r.status, 500);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal((await r.json()).answer, "UNKNOWN");
});

test("the answer goes out without waiting on the day's counts being saved", async () => {
  globalThis.fetch = async (u) => (String(u).includes("groq.com")
    ? new Response(JSON.stringify({ choices: [{ message: { content: "Paris." } }] }), { status: 200 })
    : new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200 }));
  const pending = [];
  const COUNTS = { idFromName: () => "g", get: () => ({ fetch: (u, init) => (init?.method === "POST" ? new Promise(() => {}) : Promise.resolve(new Response("{}"))) }) };
  const env = { GROQ_KEY: "k", COUNTS, RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async () => ({ response: "Paris." }) } };
  const r = await worker.fetch(new Request("https://w.example/", { method: "POST", body: JSON.stringify({ q: "capital of france" }) }), env, { waitUntil: (p) => pending.push(p) });
  assert.equal((await r.json()).answer, "Paris.");
  assert.ok(pending.length >= 1);
});
