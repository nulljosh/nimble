// Physical constants answer offline from a table: "what is the gravitational constant" came back from the
// models as a definition with no number.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

test("constants answer with the value and NIST as the source", () => {
  for (const [q, v] of [["what is the gravitational constant", "6.67430 × 10⁻¹¹"], ["gravitational constant?", "6.67430"],
    ["what's planck's constant", "6.62607015"], ["avogadro's number", "6.02214076"], ["speed of light", "299,792,458"],
    ["what is the charge of an electron", "1.602176634"], ["the value of the gas constant", "8.314462618"],
    ["acceleration due to gravity", "9.80665"], ["What is Boltzmann's constant?", "1.380649"]]) {
    const k = E.constant(q);
    assert.ok(k && k.body.includes(v), q);
    assert.equal(k.src, "NIST");
  }
});

test("other questions about the same words are left to the usual sources", () => {
  for (const q of ["who measured the gravitational constant", "is the speed of light constant", "speed of light in water", "planck"])
    assert.equal(E.constant(q), null, q);
});

test("answer() returns a constant as a text answer without the network", async () => {
  const realFetch = global.fetch; global.fetch = async () => { throw new Error("no network in this test"); };
  try {
    const a = await E.answer("what is the gravitational constant");
    assert.equal(a.kind, "text");
    assert.match(a.body, /6\.67430/);
    assert.deepEqual(a.sources, [{ name: "NIST", url: "https://physics.nist.gov/cuu/Constants/" }]);
  } finally { global.fetch = realFetch; }
});
