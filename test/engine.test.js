// node --test  (offline by default; LIVE=1 node --test hits the real sources)
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

test("math", () => {
  assert.equal(E.tryMath("2+2"), 4);
  assert.equal(E.tryMath("sqrt(16)*2"), 8);
  assert.equal(E.tryMath("2^10"), 1024);
  assert.equal(E.tryMath("hello"), null);
  assert.equal(E.tryMath("process.exit()"), null);
  assert.equal(E.tryMath("1/0"), null);
});

test("units", () => {
  assert.equal(E.tryConvert("10 km to miles").to, "6.213712");
  assert.equal(E.tryConvert("how many cups in 2 liters").to, "8.453506");
  assert.equal(E.tryConvert("100 c to f").to, "212");
  assert.equal(E.tryConvert("5 kg to miles"), null);
  assert.equal(E.tryConvert("5 usd to eur"), null);
});

test("currency expr", () => {
  assert.deepEqual(E.currencyExpr("100 usd to eur"), {v:100, from:"USD", to:"EUR"});
  assert.equal(E.currencyExpr("100 km to mi"), null);
});

test("graph expr", () => {
  assert.equal(E.graphExpr("plot x^2"), "x^2");
  assert.equal(E.graphExpr("y = sin(x)"), "sin(x)");
  assert.equal(E.graphExpr("plot 2+2"), null);
});

test("first sentence", () => {
  assert.equal(E.first("Tim Cook is CEO. He joined in 1998."), "Tim Cook is CEO.");
  assert.equal(E.first("Ver. 2.0 shipped. Then more."), "Ver. 2.0 shipped.");
});

test("getJSON never throws", async () => {
  assert.equal(await E.getJSON("http://127.0.0.1:1/nope"), null);
  assert.equal(await E.getJSON("https://en.wikipedia.org/api/rest_v1/page/summary/definitely-not-a-page-zz9"), null);
});

test("offline answer kinds", async () => {
  assert.equal((await E.answer("3*3")).kind, "math");
  assert.equal((await E.answer("1 mile to km")).kind, "convert");
});

test("live sources", { skip: !process.env.LIVE }, async () => {
  const cur = await E.answer("100 usd to eur"); assert.equal(cur.kind, "convert"); assert.match(cur.to, /^\d+\.\d\d$/);
  assert.equal((await E.answer("weather in Vancouver")).src, "Open-Meteo");
  assert.match((await E.answer("time in Tokyo")).src, /Tokyo/);
  assert.equal((await E.answer("define nimble")).src, "Wiktionary");
  assert.equal((await E.answer("Alan Turing")).kind, "text");
});
