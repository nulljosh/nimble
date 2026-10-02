// Follow-up questions on web: the proxy request carries the last three AI exchanges.
// Offline: fetch and localStorage are stubbed, nothing leaves the machine.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const PROXY = "https://nimble-answers.trommatic.workers.dev";
const realFetch = globalThis.fetch;
let bodies;

function setup() {
  const store = new Map([["nimble.aiConsent", "yes"]]);
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  bodies = [];
  globalThis.fetch = async (url, opts) => {
    url = String(url);
    if (url === PROXY && opts?.method === "POST") {
      const b = JSON.parse(opts.body);
      bodies.push(b);
      return { ok: true, json: async () => ({ answer: `Answer to ${b.q}.`, source: "Gemma" }) };
    }
    return { ok: false };
  };
  E.turns.clear();
}
function teardown() { delete globalThis.localStorage; globalThis.fetch = realFetch; E.turns.clear(); }

test("the first question sends no turns, the follow-up sends the one before it", async () => {
  setup();
  try {
    await E.answer("boiling point of water in fahrenheit");
    assert.deepEqual(bodies[0].turns, []);
    const a = await E.answer("and in celsius?");
    assert.equal(a.kind, "text", "a bare follow-up still goes to the model");
    assert.equal(bodies[1].q, "and in celsius?");
    assert.deepEqual(bodies[1].turns, [{ q: "boiling point of water in fahrenheit", a: "Answer to boiling point of water in fahrenheit." }]);
  } finally { teardown(); }
});

test("only the last three turns are sent, oldest first", async () => {
  setup();
  try {
    for (const q of ["one", "two", "three", "four", "five"]) await E.answer("capital of " + q);
    const last = bodies[4];
    assert.equal(last.q, "capital of five");
    assert.deepEqual(last.turns.map(t => t.q), ["capital of two", "capital of three", "capital of four"]);
    assert.ok(last.turns.every(t => typeof t.a === "string" && t.a));
  } finally { teardown(); }
});

test("offline answers are not remembered, and clearing history forgets the turns", async () => {
  setup();
  try {
    await E.answer("2 + 2");
    await E.answer("5 miles to km");
    assert.equal(E.turns.list().length, 0, "math and units never reach the model");
    await E.answer("who wrote Dune");
    assert.equal(E.turns.list().length, 1);
    E.history.clear();
    assert.equal(E.turns.list().length, 0);
    await E.answer("who wrote Emma");
    assert.deepEqual(bodies.at(-1).turns, []);
  } finally { teardown(); }
});
