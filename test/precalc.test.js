// Pre-Calculus 12 answers offline, computed: the shapes a calculator cannot read on its own.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");
const body = q => E.precalc(q)?.body;

test("log means base 10, ln is natural, and pi and e read as numbers", () => {
  assert.equal(E.tryMath("log(1000)"), 3);
  assert.equal(E.tryMath("ln(e)"), 1);
  assert.equal(E.tryMath("cos(pi)"), -1);
  assert.equal(E.tryMath("pi"), null, "a bare constant is not a calculation");
});

test("logs and exponential equations", () => {
  assert.equal(body("log base 3 of 81"), "4");
  assert.equal(body("solve 3^(x+1) = 27"), "x = 2");
  assert.equal(body("solve 4^(2x-1) = 64"), "x = 2");
});

test("geometric sequences and series", () => {
  assert.equal(body("10th term of the geometric sequence 2, 6, 18"), "39366");
  assert.equal(body("sum of the first 8 terms of 3, 6, 12"), "765");
  assert.equal(body("sum of the infinite geometric series with first term 10 and ratio 0.5"), "20");
  assert.match(body("sum of the infinite geometric series 2, 4, 8"), /diverges/);
});

test("quadratics, remainders and asymptotes", () => {
  assert.equal(body("factor x^2 - 5x + 6"), "(x - 2)(x - 3)");
  assert.equal(body("roots of 2x^2 - 8"), "x = -2 and x = 2");
  assert.equal(body("roots of x^2 + 1"), "No real roots.");
  assert.equal(body("remainder when x^3 - 2x + 1 is divided by x - 2"), "5");
  assert.equal(body("vertical asymptote of y = 1/(x^2 - 4)"), "x = -2 and x = 2");
});

test("trigonometry: degrees, exact values, equations, amplitude and period", () => {
  assert.equal(body("sin 30 degrees"), "1/2 ≈ 0.5");
  assert.equal(body("exact value of cos(5pi/6)"), "-√3/2 ≈ -0.8660254038");
  assert.equal(body("solve sin x = 1/2 for 0 ≤ x < 2π"), "x = π/6 or x = 5π/6");
  assert.equal(body("solve cos x = -1"), "x = π");
  assert.equal(body("period of y = 2cos(3x)"), "2π/3 ≈ 2.094395102");
  assert.equal(body("convert 3pi/4 radians to degrees"), "135°");
});

test("transformations and inverses", () => {
  assert.equal(body("what does y = f(x - 2) do to the graph"), "It shifts it 2 units right.");
  assert.equal(body("inverse of y = 2x + 3"), "f⁻¹(x) = (x - 3)/2");
});

test("not precalc: prose and plain facts fall through", () => {
  assert.equal(E.precalc("who wrote hamlet"), null);
  assert.equal(E.precalc("capital of france"), null);
  assert.equal(E.precalc("2+2"), null);
});
