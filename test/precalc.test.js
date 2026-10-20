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

test("form B shapes: growth, interest, cubics, factor theorem, asymptotes, angles", () => {
  assert.equal(body("a population of 200 doubles every 3 hours, how many after 12 hours"), "3200");
  assert.equal(body("$500 invested at 4% compounded annually for 3 years"), "$562.43");
  assert.equal(body("$1000 invested at 6% compounded monthly for 5 years"), "$1348.85");
  assert.equal(body("factor x^3 - x"), "x(x + 1)(x - 1)");
  assert.equal(body("zeros of x^3 - 6x^2 + 11x - 6"), "x = 1, x = 2, x = 3");
  assert.equal(body("is x - 1 a factor of x^3 - 1"), "Yes. P(1) = 0.");
  assert.equal(body("horizontal asymptote of y = (2x + 1)/(x - 3)"), "y = 2");
  assert.match(body("is 1, 4, 9, 16 a geometric sequence"), /^No\./);
  assert.equal(body("sum of the infinite series 8 + 4 + 2 + 1"), "16");
  assert.equal(body("solve 2sin x - 1 = 0"), "x = π/6 or x = 5π/6");
  assert.equal(body("coterminal angles of 3pi/4"), "-5π/4 and 11π/4 (any multiple of 2π away).");
  assert.equal(body("what quadrant is 200 degrees in"), "Quadrant III.");
  assert.equal(body("cot 45 degrees"), "1", "coterminal must not read as cot");
});

test("form C shapes: rational factors, x/2 periods, log equations, doubling time", () => {
  assert.equal(body("factor 2x^2 + 7x + 3"), "(x + 3)(2x + 1)");
  assert.equal(body("period of y = cos(x/2)"), "4π ≈ 12.56637061");
  assert.equal(body("amplitude and period of y = 4sin(3x)"), "Amplitude 4, period 2π/3 ≈ 2.094395102.");
  assert.equal(body("solve log2(x) = 5"), "x = 32");
  assert.equal(body("how long until $1000 doubles at 7% compounded annually"), "10.24 years");
  assert.equal(body("inverse of y = x/3 + 1"), "f⁻¹(x) = 3x - 3");
  assert.equal(body("inverse of y = (2x + 1)/3"), "f⁻¹(x) = (3x - 1)/2");
  assert.equal(body("if f(x) = 2x - 1, find f^-1(5)"), "3");
  assert.equal(body("a car worth $30000 depreciates 15% per year, value after 5 years"), "$13311.16");
  assert.equal(body("how many terms are in 3, 6, 12, ..., 384"), "8 terms");
  assert.equal(body("solve 2cos^2 x - 1 = 0"), "x = π/4 or x = 3π/4 or x = 5π/4 or x = 7π/4");
  assert.equal(body("sum of 3 + 1 + 1/3 + ..."), "4.5");
  assert.match(body("does the series 1 + 2 + 4 + 8 converge"), /^No\./);
  assert.equal(body("sector area with radius 4 and angle pi/2"), "4π ≈ 12.56637061");
});

test("form D shapes: division, holes, repeating decimals, identities, general solve", () => {
  assert.equal(body("carbon-14 has a half-life of 5730 years, what fraction is left after 11460 years"), "1/4 (25%)");
  assert.equal(body("divide x^3 - 1 by x - 1"), "x^2 + x + 1");
  assert.equal(body("oblique asymptote of y = (x^2 + 1)/x"), "y = x");
  assert.equal(body("where is the hole in y = (x^2 - 1)/(x - 1)"), "x = 1, at the point (1, 2)");
  assert.equal(body("write 0.142857142857... as a fraction"), "1/7");
  assert.equal(body("find k if x - 2 is a factor of x^2 + kx - 6"), "k = 1");
  assert.equal(body("zeros of (x - 1)(x + 2)(x - 3)"), "x = -2, x = 1, x = 3");
  assert.equal(body("solve x^2 = 9"), "x = -3 and x = 3");
  assert.equal(body("solve 1/x = 4"), "x = 1/4");
  assert.equal(body("range of y = 3sin(x) + 1"), "-2 ≤ y ≤ 4");
  assert.equal(body("phase shift of y = sin(x - pi/4)"), "π/4 to the right.");
  assert.match(body("prove tan x cos x = sin x"), /^True/);
  assert.match(body("prove sin x = cos x"), /^Not an identity/);
  assert.equal(body("y = f(x) is shifted 3 left and 2 down, write the new equation"), "y = f(x + 3) - 2");
});

test("form E shapes: any base function, domains, cubic factors, half-life from two amounts", () => {
  assert.equal(body("what happens to y = sqrt(x) when it becomes y = sqrt(x - 3) + 2"), "It shifts it 3 units right, then shifts it 2 units up.");
  assert.equal(body("y = |x| reflected in the x-axis"), "y = -(|x|)");
  assert.equal(body("domain of y = sqrt(x - 4)"), "x ≥ 4.");
  assert.equal(body("domain of y = log(x + 2)"), "x > -2.");
  assert.equal(body("factor x^3 - 8"), "(x - 2)(x^2 + 2x + 4)");
  assert.equal(body("a radioactive substance decays from 80 g to 10 g in 12 days, what is its half-life"), "4 days");
  assert.equal(body("how much is $5000 worth after 8 years at 6% compounded semi-annually"), "$8023.53");
  assert.equal(body("period of y = sin(pi x)"), "2");
  assert.match(body("how many roots does a degree 4 polynomial have"), /^4,/);
  assert.equal(E.tryMath("3 log(10)"), 3);
});

test("form G shapes: tiny trig values are 0, translations, time to grow", () => {
  assert.equal(E.tryMath("tan(pi)"), 0);
  assert.equal(E.tryMath("2^-50"), 8.881784197e-16, "a real small number stays");
  assert.equal(body("y = x^3 translated 4 units up"), "y = x^3 + 4");
  assert.equal(body("how long until $2000 grows to $3000 at 4% compounded annually"), "10.34 years");
  assert.equal(body("how is y = 2f(x) - 1 related to y = f(x)"), "It stretches it vertically by a factor of 2, then shifts it 1 units down.");
});

test("not precalc: prose and plain facts fall through", () => {
  assert.equal(E.precalc("who wrote hamlet"), null);
  assert.equal(E.precalc("capital of france"), null);
  assert.equal(E.precalc("2+2"), null);
});

test("Life Sciences 11: microscope, growth and names, and Pre-Calc growth still wins outside bacteria", () => {
  assert.equal(body("total magnification with a 10x eyepiece and a 40x objective lens"), "400× (10× eyepiece times 40× objective)");
  assert.equal(body("field of view at 400x if it is 4 mm at 40x"), "0.4 mm (field of view × magnification stays the same)");
  assert.equal(body("a bacterium divides every 30 minutes, how many bacteria after 3 hours starting with 10"), "640 bacteria (6 doublings: 10 × 2^6)");
  assert.equal(body("what is the scientific name for cats"), "Felis catus.");
  assert.equal(body("a population of 200 doubles every 3 hours, how many after 12 hours"), "3200");
  assert.equal(body("conjugation of spanish verbs"), undefined);
});

test("Anatomy and Physiology 12: sequences, codons, cardiac output and the which-organelle lookup", () => {
  assert.equal(body("what is the complementary strand of ATGCCA"), "TACGGT");
  assert.equal(body("translate the mRNA AUGUUUGGCUAA"), "Met-Phe-Gly-Stop (methionine, phenylalanine, glycine, then stop)");
  assert.equal(body("what amino acid does the codon AUG code for"), "Methionine (Met), also the start codon.");
  assert.equal(body("cardiac output if heart rate is 70 bpm and stroke volume is 70 mL"), "4900 mL/min (4.9 L/min; cardiac output = heart rate × stroke volume)");
  assert.match(body("what organelle makes ATP"), /^Mitochondria\./);
  assert.match(body("what part of the brain controls balance"), /^Cerebellum\./);
});

test("Earth Sciences 11: dating, magnitude and rocks, and Chemistry 12 still answers its own terms first", () => {
  assert.equal(body("carbon-14 has a half-life of 5730 years, how old is a sample with 12.5% of its carbon-14 left"), "17190 years (3 half-lives of 5730 years)");
  assert.equal(body("the half-life of potassium-40 is 1.3 billion years, how old is a rock with 50% of its potassium-40 left"), "1.3 billion years (1 half-life of 1.3 billion years)");
  assert.equal(body("how many times more energy does a magnitude 6 earthquake release than a magnitude 4"), "Energy: about 1000 times (about 32 per step). Amplitude: 100 times (10 per magnitude step).");
  assert.equal(body("what type of rock is marble"), "Metamorphic: from limestone.");
  assert.match(body("in which layer of the atmosphere does weather occur"), /^Troposphere\./);
  assert.match(body("what is activation energy"), /^The minimum energy colliding particles/);
  assert.match(body("what is oxidation"), /electrons/i);
});
test("Environmental Science 11: energy, density, mark and recapture, growth, and kinds", () => {
  assert.equal(body("if producers have 10000 kJ of energy how much energy reaches the secondary consumers"), "100 kJ: about 10 percent of the energy passes up each trophic level, so 10000 × 0.1^2.");
  assert.equal(body("a population of 500 deer lives in 25 square kilometres, what is the population density"), "20 per square kilometre (500 ÷ 25).");
  assert.equal(body("in a mark recapture study 40 fish are marked, later 50 are caught and 10 of them are marked, estimate the population"), "About 200 (marked × caught ÷ marked recaptures = 40 × 50 ÷ 10).");
  assert.equal(body("a population grows from 200 to 260 in one year, what is the growth rate"), "30% (0.3): (260 - 200) ÷ 200.");
  assert.equal(body("a population with a 2% growth rate doubles in how many years"), "About 35 years (rule of 70: 70 ÷ 2).");
  assert.match(body("which relationship benefits both species"), /^Mutualism\./);
  assert.match(body("how long to double money at 6% using the rule of 72"), /\b12\b/);
});
test("Social Studies 10: government, history and terms, and generic words keep their cards", () => {
  assert.match(body("what are the three levels of government in Canada"), /^Federal/);
  assert.match(body("when was the Constitution patriated"), /^1982\./);
  assert.match(body("what was the Komagata Maru incident"), /^In 1914 the ship Komagata Maru/);
  assert.match(body("who was prime minister of Canada during World War II"), /^William Lyon Mackenzie King/);
  for (const q of ["what is hong kong", "what is a white paper", "what is cpp", "who is the prime minister of canada", "what is conscription", "who was british prime minister during world war 2", "who is the head of state of france"]) assert.equal(E.precalc(q), null, q);
});
