// Step-by-step math: "Show steps" lists one line per evaluation step, in the on-device parser's order.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

test("parentheses reduce first, one line per operation", () => {
  assert.deepEqual(E.mathSteps("(3+4)*2"), ["3+4 = 7", "7*2 = 14"]);
});

test("precedence shows the product before the sum", () => {
  assert.deepEqual(E.mathSteps("3 + 4 * 2"), ["4*2 = 8", "3+8 = 11"]);
});

test("spoken math gets the same steps as its symbols", () => {
  assert.deepEqual(E.mathSteps("what's three plus four times two"), ["4*2 = 8", "3+8 = 11"]);
});

test("percent-of shows the fraction, then the product", () => {
  assert.deepEqual(E.mathSteps("20% of 50"), ["20/100 = 0.2", "0.2*50 = 10"]);
});

test("power is right-associative and shown with a caret", () => {
  assert.deepEqual(E.mathSteps("2^3^2"), ["3^2 = 9", "2^9 = 512"]);
});

test("a function call is one step, then the rest of the expression", () => {
  assert.deepEqual(E.mathSteps("sqrt(16)+1"), ["sqrt(16) = 4", "4+1 = 5"]);
});

test("a single operation has nothing to expand, so no steps", () => {
  assert.equal(E.mathSteps("2+2"), null);
  assert.equal(E.mathSteps("42"), null);
});

test("a negated group with one operation inside has no steps", () => {
  assert.equal(E.mathSteps("-(3+4)"), null);
});

test("non-math and unit expressions have no steps", () => {
  assert.equal(E.mathSteps("5 km * 2"), null);
  assert.equal(E.mathSteps("what is the capital of france"), null);
});

test("an expression that does not evaluate has no steps", () => {
  assert.equal(E.mathSteps("(3+4)/0"), null);
});

test("the answer page shows the steps behind a collapsed Show steps line", async () => {
  const r = await E.renderAnswer("(3+4)*2");
  assert.equal(r.credit, "computed offline");
  assert.match(r.h, /<details class="why steps"><summary>Show steps<\/summary><ol><li>3\+4 = 7<\/li><li>7\*2 = 14<\/li><\/ol><\/details>/);
});

test("a plain sum renders the answer with no Show steps line", async () => {
  const r = await E.renderAnswer("2+2");
  assert.match(r.h, /mockup-big num">4</);
  assert.doesNotMatch(r.h, /Show steps/);
});
