// "This is wrong" and the exam score: POST /report keeps the question and answer, GET /report needs the review key.
import test from "node:test";
import assert from "node:assert/strict";
import worker, { NimbleCounts } from "../worker/worker.js";

function env(extra = {}) {
  const store = new Map();
  const box = new NimbleCounts({ storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v) } });
  return { COUNTS: { idFromName: () => "g", get: () => ({ fetch: (u, init) => box.fetch(new Request(u, init)) }) }, RATE_LIMITER: { limit: async () => ({ success: true }) }, REPORTS_KEY: "secret", ...extra };
}
const post = (body) => new Request("https://w.example/report", { method: "POST", body: JSON.stringify(body) });

test("a report is kept as text and read back with the key", async () => {
  const e = env();
  assert.equal((await worker.fetch(post({ q: "  who wrote 1984 ", answer: "Murder, She Wrote" }), e)).status, 200);
  const list = await (await worker.fetch(new Request("https://w.example/report?key=secret"), e)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].q, "who wrote 1984");
  assert.equal(list[0].answer, "Murder, She Wrote");
});

test("no key, a wrong key, an empty question or the rate limit are refused", async () => {
  const e = env();
  assert.equal((await worker.fetch(new Request("https://w.example/report"), e)).status, 403);
  assert.equal((await worker.fetch(new Request("https://w.example/report?key=nope"), e)).status, 403);
  assert.equal((await worker.fetch(post({ q: " " }), e)).status, 400);
  assert.equal((await worker.fetch(post({ q: "x" }), env({ RATE_LIMITER: { limit: async () => ({ success: false }) } }))).status, 429);
});

test("CI posts the exam score with the key and /stats shows it", async () => {
  const e = env();
  const exam = (q, body) => worker.fetch(new Request("https://w.example/exam" + q, { method: "POST", body: JSON.stringify(body) }), e);
  assert.equal((await exam("", { score: 150, total: 154 })).status, 403);
  assert.equal((await exam("?key=secret", { score: 160, total: 154 })).status, 400);
  assert.equal((await exam("?key=secret", { score: 150, total: 154 })).status, 200);
  const stats = await (await worker.fetch(new Request("https://w.example/stats"), e)).json();
  assert.equal(stats.exam.score, 150);
  assert.equal(stats.exam.total, 154);
});
