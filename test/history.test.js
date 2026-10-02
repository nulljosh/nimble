// Search history on web: newest first, de-duplicated, capped at 50, clearable.
// Offline: localStorage is a tiny in-memory stub, nothing leaves the machine.
const test = require("node:test"), assert = require("node:assert/strict");
const { history } = require("../docs/engine.js");

function stub() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  return store;
}
test.afterEach(() => { delete globalThis.localStorage; });

test("add then list is newest first, entries are {q, t}", () => {
  stub();
  const before = Date.now();
  history.add("one"); history.add("two"); history.add("three");
  const l = history.list();
  assert.deepEqual(l.map(e => e.q), ["three", "two", "one"]);
  assert.ok(l.every(e => typeof e.t === "number" && e.t >= before && e.t <= Date.now()));
});

test("asking again moves it to the top without duplicating", () => {
  stub();
  history.add("a"); history.add("b"); history.add("c");
  history.add("a");
  assert.deepEqual(history.list().map(e => e.q), ["a", "c", "b"]);
  history.add("  B ");
  assert.deepEqual(history.list().map(e => e.q), ["B", "a", "c"]);
});

test("blank queries are ignored", () => {
  stub();
  history.add(""); history.add("   "); history.add(null);
  assert.deepEqual(history.list(), []);
});

test("caps at 50 and drops the oldest", () => {
  stub();
  for (let i = 0; i < 60; i++) history.add("q" + i);
  const l = history.list();
  assert.equal(l.length, 50);
  assert.equal(l[0].q, "q59");
  assert.equal(l[49].q, "q10");
});

test("clear empties it", () => {
  const store = stub();
  history.add("x");
  history.clear();
  assert.deepEqual(history.list(), []);
  assert.equal(store.has("nimble.history"), false);
});

test("corrupt storage reads as empty and recovers", () => {
  const store = stub();
  store.set("nimble.history", "{not json");
  assert.deepEqual(history.list(), []);
  history.add("fresh");
  assert.deepEqual(history.list().map(e => e.q), ["fresh"]);
});

test("no storage at all returns [] and never throws", () => {
  delete globalThis.localStorage;
  assert.deepEqual(history.list(), []);
  assert.doesNotThrow(() => { history.add("x"); history.clear(); });
  assert.deepEqual(history.list(), []);
});

test("storage that throws returns [] and never throws", () => {
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.deepEqual(history.list(), []);
  assert.doesNotThrow(() => { history.add("x"); history.clear(); });
});
