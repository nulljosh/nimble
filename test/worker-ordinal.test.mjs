// "first president of south africa" answered P. W. Botha: the President page's "The first president ... was
// Nelson Mandela" has no date, so the trimmer dropped it and the State President page won. A first or last
// question keeps every sentence that says first or last.
import test from "node:test";
import assert from "node:assert/strict";
import { freshContext } from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

const lead = "The president of South Africa is the head of state. The office is elected. The term is five years. The president leads the cabinet.";
const page = { index: 1, title: "President of South Africa", extract: `${lead} Some filler about the office. The first president to be elected under the new constitution was Nelson Mandela.` };
const serve = () => { globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200 }); };

test("a first question keeps the sentence that names the first holder", async () => {
  serve();
  const { text } = await freshContext("who was the first president of south africa");
  assert.match(text, /Nelson Mandela/);
  assert.doesNotMatch(text, /filler/);
});

test("other questions still trim undated sentences past the lead", async () => {
  serve();
  const { text } = await freshContext("who is the president of south africa");
  assert.doesNotMatch(text, /Nelson Mandela/);
});
