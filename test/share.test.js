// The share card says one line per answer. shareText picks it for every answer kind; no canvas needed.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

test("math is the value, rounded past float noise", () => {
  assert.equal(E.shareText({ kind: "math", value: 36 }), "36");
  assert.equal(E.shareText({ kind: "math", value: 0.1 + 0.2 }), "0.3");
  assert.equal(E.shareText({ kind: "math", value: NaN }), null);
});

test("convert is the result and its unit", () => {
  assert.equal(E.shareText({ kind: "convert", from: "5", to: "8.04672", fromUnit: "mi", toUnit: "km" }), "8.04672 km");
});

test("graph is the equation", () => {
  assert.equal(E.shareText({ kind: "graph", expr: "x^2", svg: "<svg/>" }), "y = x^2");
});

test("card is big, unit, then the sub line", () => {
  assert.equal(E.shareText({ kind: "card", big: "137.12", unit: "CAD", sub: "100 USD at today's rate" }), "137.12 CAD, 100 USD at today's rate");
  assert.equal(E.shareText({ kind: "card", big: "12", unit: "°C", sub: "Vancouver, Canada" }), "12°C, Vancouver, Canada");
  assert.equal(E.shareText({ kind: "card", big: "nimble", unit: "", sub: "Derived from nymyl" }), "nimble, Derived from nymyl");
});

test("text is the first sentence only", () => {
  assert.equal(E.shareText({ kind: "text", title: "Ottawa", body: "Ottawa is the capital of Canada. It sits on the Ottawa River.", src: "Wikipedia" }), "Ottawa is the capital of Canada.");
  assert.equal(E.shareText({ kind: "text", title: "x", body: "", src: "Wikipedia" }), null);
});

test("nothing to share for consent, offline, none or missing", () => {
  for (const kind of ["consent", "offline", "none"]) assert.equal(E.shareText({ kind }), null);
  assert.equal(E.shareText(null), null);
  assert.equal(E.shareText(undefined), null);
});

test("source line: offline kinds say so, the rest credit their source", () => {
  assert.equal(E.shareSource({ kind: "math" }), "Computed offline");
  assert.equal(E.shareSource({ kind: "text", src: "Wikipedia" }), "Wikipedia");
  assert.equal(E.shareSource({ kind: "card", src: "Open-Meteo" }), "Open-Meteo");
});

test("shareImage resolves null outside a browser instead of throwing", async () => {
  assert.equal(await E.shareImage("15% of 240", { kind: "math", value: 36 }), null);
});

test("renderAnswer hands back the answer object for the share button", async () => {
  const r = await E.renderAnswer("15% of 240");
  assert.deepEqual(r.a, { kind: "math", value: 36 });
  assert.equal(E.shareText(r.a), "36");
});
