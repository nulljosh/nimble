// The proxy's ?quote=: a ticker goes straight to Yahoo's chart, a name is looked up first, and a miss is an error, never a price.
import test from "node:test";
import assert from "node:assert/strict";
import { stockQuote } from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });
const meta = { symbol: "AAPL", longName: "Apple Inc.", regularMarketPrice: 205, currency: "USD", regularMarketChangePercent: 2.5, regularMarketTime: 1791576000 };
function stub(routes, seen) {
  globalThis.fetch = async (url) => {
    url = String(url); seen.push(url);
    for (const [k, v] of Object.entries(routes)) if (url.includes(k)) return new Response(JSON.stringify(v), { status: 200 });
    return new Response("", { status: 404 });
  };
}

test("a name is looked up to its ticker, then priced", async () => {
  const seen = [];
  stub({ "/search?q=apple": { quotes: [{ quoteType: "EQUITY", symbol: "AAPL" }] }, "/chart/AAPL": { chart: { result: [{ meta }] } } }, seen);
  const q = await stockQuote("apple");
  assert.deepEqual([q.symbol, q.name, q.price, q.pct], ["AAPL", "Apple Inc.", 205, 2.5]);
});

test("no price anywhere is an error, and junk never leaves the worker", async () => {
  const seen = [];
  stub({}, seen);
  assert.deepEqual(await stockQuote("zzzzz"), { error: "no quote" });
  assert.deepEqual(await stockQuote("<script>"), { error: "bad quote" });
  assert.ok(seen.every((u) => !u.includes("script")));
});
