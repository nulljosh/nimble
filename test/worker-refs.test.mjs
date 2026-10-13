import { test } from "node:test";
import assert from "node:assert/strict";
import { groundingRefs } from "../worker/worker.js";

const pages = [
  { title: "Capital punishment in France", extract: "Capital punishment in France is banned by the Constitution of the French Republic and was abolished in 1981." },
  { title: "Paris", extract: "Paris is the capital and largest city of France, on the river Seine." },
];

test("refs must carry the words the answer adds, not only the question's own", () => {
  const refs = groundingRefs("The capital of France is Paris.", pages, "capital of france");
  assert.deepEqual(refs.map((r) => r.title), ["Paris"]);
});

test("without a question the old overlap rule still applies", () => {
  assert.ok(groundingRefs("The capital of France is Paris.", pages).length >= 1);
});
