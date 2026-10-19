// Markets and freshness, offline: fetch is stubbed per host and every call is recorded.
// Covers symbol detection (no hijack of math or normal questions), crypto, stock and pair parsing,
// the calm failure state (never a made-up number, never an AI guess), and the "as of" line.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
let calls = [];
function stub(routes) {
  calls = [];
  globalThis.fetch = async url => {
    const u = new URL(url);
    calls.push(u.host);
    const hit = routes[u.host];
    if (!hit) throw new Error("unexpected host " + u.host);
    if (hit instanceof Error) throw hit;
    if (hit.status) return { ok: false, status: hit.status, text: async () => "", json: async () => ({}) };
    return { ok: true, status: 200, text: async () => hit.text ?? "", json: async () => hit.json ?? {} };
  };
}
function restore() { globalThis.fetch = realFetch; }

const coingecko = { json: { bitcoin: { usd: 83405, usd_24h_change: 0.5632, last_updated_at: 1791800345 } } };
const PROXY = "nimble-answers.trommatic.workers.dev";
const quote = { json: { symbol: "AAPL", name: "Apple Inc.", price: 205, currency: "USD", pct: 2.5, time: "2026-10-09T20:00:00.000Z" } };
const frankfurter = { json: { base: "EUR", rates: { "2026-10-08": { USD: 1.08 }, "2026-10-09": { USD: 1.0812 } } } };
const CHALLENGE = "<!DOCTYPE html><html><body><script>(async()=>{const c=\"AAAA\"})();</script></body></html>";

test("stock symbols: tickers in, math and normal questions out", () => {
  for (const q of ["AAPL", "AAPL stock", "$TSLA", "aapl price", "stock price of MSFT", "AAPL stock price", "what is the price of AAPL"])
    assert.ok(E.stockSymbol(q), q);
  for (const q of ["a+b", "who is apple", "what is apple", "is apple good", "apple", "aapl", "AI", "US", "price", "2 + 2", "5 miles to km"])
    assert.equal(E.stockSymbol(q), null, q);
});

test("crypto and pair queries are recognised, normal questions are not", () => {
  for (const q of ["bitcoin price", "btc", "BTC", "ethereum price", "price of bitcoin", "what's the current price of ethereum", "eth"])
    assert.ok(E.CRYPTO_RE.test(q), q);
  for (const q of ["what is bitcoin", "bitcoin", "who is apple", "a+b", "eur to usd rate"])
    assert.equal(E.CRYPTO_RE.test(q), false, q);
  assert.deepEqual(E.currencyExpr("eur to usd rate"), { v: 1, from: "EUR", to: "USD", pair: true });
  assert.deepEqual(E.currencyExpr("eur to usd"), { v: 1, from: "EUR", to: "USD", pair: true });
  assert.equal(E.currencyExpr("the to and"), null);
  assert.equal(E.currencyExpr("100 usd to eur").pair, false);
});

test("market() leaves non-market questions alone", async () => {
  stub({});
  for (const q of ["a+b", "who is apple", "what is bitcoin", "bitcoin", "is apple good", "the to and"])
    assert.equal(await E.market(q), null, q);
  restore();
});

test("bitcoin price: CoinGecko, price in dollars, change in words, time it was priced", async () => {
  stub({ "api.coingecko.com": coingecko });
  try {
    const m = await E.market("bitcoin price");
    assert.equal(m.kind, "market");
    assert.equal(m.title, "Bitcoin (BTC)");
    assert.equal(m.big, "$83,405.00");
    assert.equal(m.change, "Up 0.56% in the last 24 hours");
    assert.equal(m.asOf, new Date(1791800345 * 1000).toISOString());
    assert.equal(m.src, "CoinGecko");
    assert.deepEqual(calls, ["api.coingecko.com"]);
  } finally { restore(); }
});

test("a down move reads as words, and small prices keep four decimals", () => {
  assert.equal(E.changeText(-1.2, "today"), "Down 1.20% today");
  assert.equal(E.changeText(0.004, "today"), "Flat today");
  assert.equal(E.changeText(undefined, "today"), "");
  assert.equal(E.changeText(NaN, "today"), "");
});

test("a failed crypto quote is the calm state, not a number", async () => {
  stub({ "api.coingecko.com": { status: 429 } });
  try {
    const m = await E.market("btc");
    assert.equal(m.unavailable, true);
    assert.equal(m.big, undefined);
    assert.equal(m.title, "Bitcoin (BTC)");
  } finally { restore(); }
});

test("a crypto body with no usd price is unavailable, not zero", async () => {
  stub({ "api.coingecko.com": { json: { bitcoin: {} } } });
  try { assert.equal((await E.market("bitcoin price")).unavailable, true); }
  finally { restore(); }
});

test("stock: the proxy's quote, named, with the day's change and the time it was priced", async () => {
  stub({ [PROXY]: quote });
  try {
    const m = await E.market("apple stock");
    assert.equal(m.title, "Apple Inc. (AAPL)");
    assert.equal(m.big, "$205.00");
    assert.equal(m.change, "Up 2.50% today");
    assert.equal(m.asOf, "2026-10-09T20:00:00.000Z");
    assert.equal(m.src, "Yahoo Finance");
  } finally { restore(); }
});

test("stock: an error, a dead proxy or no price is unavailable, never a price", async () => {
  for (const hit of [{ json: { error: "no quote" } }, { status: 503 }, new Error("offline"), { json: { symbol: "AAPL", price: null } }]) {
    stub({ [PROXY]: hit });
    try {
      const m = await E.market("AAPL");
      assert.equal(m.unavailable, true);
      assert.equal(m.big, undefined);
    } finally { restore(); }
  }
});

test("stock questions never reach a model or the web search", async () => {
  stub({ [PROXY]: { status: 500 } });
  try {
    const a = await E.answer("AAPL");
    assert.equal(a.kind, "market");
    assert.equal(a.unavailable, true);
    assert.deepEqual(calls, [PROXY]);
  } finally { restore(); }
});

test("pair: EUR to USD from the Frankfurter series, with the day's change", async () => {
  stub({ "api.frankfurter.dev": frankfurter });
  try {
    const m = await E.market("eur to usd rate");
    assert.equal(m.title, "EUR to USD");
    assert.equal(m.big, "1.0812 USD");
    assert.equal(m.change, "Up 0.11% on Oct 9");
    assert.equal(m.asOf, "2026-10-09");
  } finally { restore(); }
});

test("pair: fewer than two days of rates is unavailable", async () => {
  stub({ "api.frankfurter.dev": { json: { rates: { "2026-10-09": { USD: 1.08 } } } } });
  try { assert.equal((await E.market("eur to usd")).unavailable, true); }
  finally { restore(); }
});

test("amount conversion still goes through the existing FX card", async () => {
  stub({ "api.frankfurter.dev": { json: { base: "USD", date: "2026-10-09", rates: { EUR: 0.92 } } } });
  try {
    const a = await E.answer("100 usd to eur");
    assert.equal(a.kind, "card");
    assert.equal(a.big, "92.00");
    assert.equal(a.asOf, "2026-10-09");
    assert.equal(a.asOfDay, true);
  } finally { restore(); }
});

test("freshness: the clock is formatted in a fixed zone, dates stay dates", () => {
  assert.equal(E.asOfLabel("2026-10-12T22:41:00Z", false, "America/Vancouver"), "Oct 12, 3:41 pm");
  assert.equal(E.asOfLabel("2026-10-12T08:05:00Z", false, "America/Vancouver"), "Oct 12, 1:05 am");
  assert.equal(E.asOfLabel("2026-10-09", true), "Oct 9");
  assert.equal(E.asOfLabel("not a date", false), "");
});

test("the market card renders the price, the change, and an as-of line", async () => {
  const card = { kind: "market", title: "Bitcoin (BTC)", big: "$83,405.00", change: "Up 0.56% in the last 24 hours", src: "CoinGecko", url: "https://www.coingecko.com", asOf: "2026-10-12T22:41:00Z" };
  const r = await E.renderAnswer("bitcoin price", { scripted: card, t: null });
  assert.match(r.h, /market-price num">\$83,405\.00</);
  assert.match(r.h, /Up 0\.56% in the last 24 hours/);
  assert.match(r.h, /class="as-of num">as of [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (am|pm)</);
  assert.match(r.credit, /powered by CoinGecko/);
});

test("the unavailable state says so calmly and shows no price", async () => {
  const r = await E.renderAnswer("AAPL", { scripted: { kind: "market", title: "AAPL", unavailable: true, src: "Stooq", url: "https://stooq.com" } });
  assert.match(r.h, /Quote unavailable right now/);
  assert.doesNotMatch(r.h, /market-price/);
  assert.doesNotMatch(r.h, /\$\d/);
});

test("the share text for a market card is the title, price and change", () => {
  assert.equal(E.shareText({ kind: "market", title: "AAPL", big: "$205.00", change: "Up 2.50% on Oct 9" }), "AAPL $205.00, Up 2.50% on Oct 9");
  assert.equal(E.shareText({ kind: "market", title: "AAPL", unavailable: true }), null);
});
