// AI consent on web: unset = ask, "no" = DuckDuckGo and Wikipedia only, "yes" = model allowed.
// Offline: fetch and localStorage are stubbed, nothing leaves the machine.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const PROXY = "https://nimble-answers.trommatic.workers.dev";
const realFetch = globalThis.fetch;
let calls;

function setup(consent, reply = () => ({ ok: false })) {
  const store = new Map(consent ? [["nimble.aiConsent", consent]] : []);
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url: String(url), method: opts?.method || "GET" }); return reply(String(url), opts); };
}
function teardown() { delete globalThis.localStorage; globalThis.fetch = realFetch; }
const modelCalls = () => calls.filter(c => c.url === PROXY);

test("consent unset asks and never calls the model", async () => {
  setup(null);
  try {
    const a = await E.answer("who wrote Dune");
    assert.equal(a.kind, "consent");
    assert.match(a.recipient, /Gemma/);
    assert.equal(modelCalls().length, 0);
    assert.equal(calls.filter(c => c.url.includes("?ddg=")).length, 0, "nothing is sent before the visitor chooses");
  } finally { teardown(); }
});

test("consent no skips the model and falls through to DuckDuckGo then Wikipedia", async () => {
  setup("no");
  try {
    const a = await E.answer("who wrote Dune");
    assert.equal(a.kind, "none");
    assert.equal(modelCalls().length, 0);
    const urls = calls.map(c => c.url);
    const ddg = urls.findIndex(u => u.startsWith(PROXY + "/?ddg="));
    const wiki = urls.findIndex(u => u.includes("wikipedia.org"));
    assert.ok(ddg >= 0 && wiki > ddg, "DuckDuckGo first, then Wikipedia");
  } finally { teardown(); }
});

test("consent yes reaches the model", async () => {
  setup("yes", (url, opts) => url === PROXY && opts?.method === "POST"
    ? { ok: true, json: async () => ({ answer: "Frank Herbert.", source: "Gemma" }) } : { ok: false });
  try {
    const a = await E.answer("who wrote Dune");
    assert.equal(modelCalls().length, 1);
    assert.equal(a.kind, "text");
    assert.equal(a.body, "Frank Herbert.");
  } finally { teardown(); }
});

test("ifUnset no behaves like no, but a stored choice wins", async () => {
  setup(null);
  try {
    assert.equal((await E.answer("who wrote Dune", { ifUnset: "no" })).kind, "none");
    assert.equal(modelCalls().length, 0);
    E.aiConsent("yes");
    await E.answer("who wrote Dune", { ifUnset: "no" });
    assert.equal(modelCalls().length, 1);
  } finally { teardown(); }
});

test("offline kinds never ask", async () => {
  setup(null);
  try {
    assert.equal((await E.answer("2+2")).kind, "math");
    assert.equal((await E.answer("5 miles to km")).kind, "convert");
    assert.equal(calls.length, 0);
  } finally { teardown(); }
});

test("getter and setter round trip", () => {
  setup(null);
  try {
    assert.equal(E.aiConsent(), null);
    E.aiConsent("yes"); assert.equal(E.aiConsent(), "yes");
    E.aiConsent("no"); assert.equal(E.aiConsent(), "no");
    E.aiConsent(null); assert.equal(E.aiConsent(), null);
  } finally { teardown(); }
});

test("recipient names the engine, same text as the native app", () => {
  setup(null);
  try {
    assert.equal(E.aiRecipient(), "Nimble's answer service, which runs Google Gemma and Alibaba Qwen models on Cloudflare Workers AI");
    localStorage.setItem("nimble.ai", JSON.stringify({ engine: "claude", apiKey: "k" }));
    assert.equal(E.aiRecipient(), "Anthropic (Claude)");
    localStorage.setItem("nimble.ai", JSON.stringify({ engine: "ollama" }));
    assert.equal(E.aiRecipient(), "your own Ollama server");
    localStorage.setItem("nimble.ai", JSON.stringify({ engine: "openai" })); // no key: falls back to the house proxy
    assert.match(E.aiRecipient(), /Gemma/);
  } finally { teardown(); }
});

test("the API side has no storage and keeps answering", async () => {
  assert.equal(typeof localStorage, "undefined");
  assert.equal(E.aiConsent(), "yes");
});
