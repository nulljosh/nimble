// The one-file clients in sdk/. Offline by default (fetch stubbed); NIMBLE_LIVE=1 also asks the live API a
// question that needs no model (the minimum wage table), through both the JS and the Python client.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ask } from "../sdk/nimble.mjs";

const realFetch = globalThis.fetch;

test("sends the question and the key as a Bearer header, and UNKNOWN reads as null", async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = init; return new Response(JSON.stringify({ answer: "UNKNOWN", source: "Groq" })); };
  const d = await ask("who is x", { key: "k1", turns: [{ q: "a", a: "b" }] });
  assert.equal(d.answer, null);
  assert.equal(seen.headers.authorization, "Bearer k1");
  assert.deepEqual(JSON.parse(seen.body), { q: "who is x", turns: [{ q: "a", a: "b" }] });
  globalThis.fetch = async () => new Response("{}", { status: 429 });
  await assert.rejects(ask("x"), /429/);
});

test("live: both clients answer from the minimum wage table", { skip: !process.env.NIMBLE_LIVE }, async () => {
  globalThis.fetch = realFetch;
  assert.match((await ask("minimum wage in bc")).answer, /^British Columbia's minimum wage is \$\d+\.\d\d an hour/);
  const py = execFileSync("python3", ["sdk/nimble.py", "minimum", "wage", "in", "bc"], { encoding: "utf8" });
  assert.match(py, /^British Columbia's minimum wage is \$/);
});
