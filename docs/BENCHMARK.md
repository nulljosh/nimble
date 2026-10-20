# Nimble benchmark

How good are the answers, and which engine gave them. One exam, graded by regex, run against the real sources.

## The exam

`test/exam.js` asks 154 questions: math, units, science, history, current office holders, definitions, sites, geography, people, tech and live cards. Each question has a pattern the answer must match, and a wrong fact fails. It hits the live Worker, so it is not part of `npm test`.

```
node test/exam.js                    # the free chain: Groq, then Cloudflare
ENGINE=samantha node test/exam.js    # Samantha, the local 9B model on :8000
LAST=45 node test/exam.js            # only the newest 45
```

Free-engine questions are paced 3.2 seconds apart because the proxy allows 20 AI calls a minute per IP. Math and unit questions are answered offline and cost nothing. The exit code is 1 on any miss.

## Results, 2026-10-18

| Engine | Score | Notes |
|---|---|---|
| Groq chain (gpt-oss-120b, qwen3.8-27b, gpt-oss-20b) | 152 of 154 | Misses: tallest mountain (a model answered Olympus Mons from memory), nearest star (Proxima against an expected Sun). |
| Samantha, local 9B | 147 of 154 | Runs on the Mac mini, no network. |
| Qwen on Cloudflare | 43 of 45 | Newest 45 only. The free Cloudflare quota ran out that day. |

Rerun at 16:30 PDT the same day through Groq: 152 of 154 as first graded. Both misses were our patterns, not the answers: "Mauna Kea" came with a non-breaking space, and "absolute zero" with an en dash ("–273.15 °C"). With the patterns fixed the same answers pass, so 154 of 154. Note "tallest mountain" can legitimately answer Mauna Kea (tallest from base), and the exam accepts it.

Confirmed at 22:20 PDT the same day, after the Worker changes (vitamin D, Canada inflation, the second model in parallel): 154 of 154 on the free chain.

| Engine | Score | p50 | p95 | Notes |
|---|---|---|---|---|
| Groq chain, 2026-10-18 22:20 | 154 of 154 | 0.94 s | 2.0 s | Latency on 12 uncached questions, measured from Vancouver. |

## Apple's on-device model, 2026-10-18

Apple's own model (Foundation Models, macOS 27, Apple Intelligence on) took the same 154 questions alone: no reference text, no math engine, no cards. It answered 113 of the 130 questions that need a model (87%) at 0.42 s median, all on the device. The misses fall in two groups. It names the office holders from its training (Biden, Trudeau, Sunak, Horgan), and it says UNKNOWN to easy facts like who wrote the Odyssey or created Linux. That is fine for the offline fallback it already is, and short of the 90% bar to become the default.

Fed the top Wikipedia hit as a reference, it fell to 75%: a loose intro sends it to UNKNOWN or the wrong page (the Puerto Rico Trench, Murder, She Wrote for 1984). Reference first and bare on UNKNOWN gets back to 87%, no better than bare alone. So it stays bare.

Apple's bigger Private Cloud Compute model needs a managed entitlement, so it is not graded yet.

## Offline, 2026-10-19

The same 154 questions with no network at all: math, units, constants, the device's time zones and the offline pack. 49 pass (45, then factorials and base conversion moved offline). The pack used to answer 75 of them and get 49 wrong, mostly by matching one word of a title ("how many bones in the human body" gave the article on the penis). It now answers only when its sentence shares the question's own words: 33 answers, 12 wrong, and the rest say "not in the offline pack". Honest misses beat confident wrong answers. On 2026-10-19 the pack grew to 14,000 articles (3.2 MB), the 10,000 vital articles first: 73 of 154 passed offline, with 14 wrong. A title that holds a word the question never asked for ("Alexander the Great" for "who wrote the great gatsby") stopped counting the same day: 72 pass and only 3 are wrong. Kotlin takes the same exam (`NIMBLE_EXAM=1 ./gradlew :shared:jvmTest --tests "*OfflineExamJvmTest"` in kmp/) and scores the same 72 with the same 3 wrong, after it gained offline units, offline time and four math phrasings it was missing. The Apple apps take it too (`TEST_RUNNER_NIMBLE_EXAM=1 xcodebuild test -scheme Nimble -destination platform=macOS -only-testing:NimbleTests/OfflineExamTests`), through the same offline chain the app runs, and score the same 72 with the same 3 wrong, on 2026-10-20 after `log10` and `log2` joined the Swift calculator. Rerun with `npm run exam:offline`. The next step is the on-device model reading the pack (roadmap v31-40).

## BC curriculum: Pre-Calculus 12

`test/exam-pc12.js` asks Pre-Calculus 12 the way a student types it, across the course's five units: transformations, exponents and logs, geometric sequences and series, polynomials and rational functions, and trigonometry. Form A is 40 questions. Each later form is written fresh before any run, so its first score is the honest grade: form B (41) scored 25 offline, form C (40) scored 24 offline. After each form is fixed it stays in the exam as a regression check, and the next fresh form takes over as the grade. One form C key was wrong (sector area with r = 4 and θ = π/2 is 4π, not 2π) and is corrected. Run `node test/exam-pc12.js`, or `OFFLINE=1` for no network. The bar is A+, 95%.

| Date | Engine | Form A | Form B |
|---|---|---|---|
| 2026-10-20 | Web, offline, before | 5/40 | |
| 2026-10-20 | Web, online, before | 30/40 | |
| 2026-10-20 | Web, offline, with the precalc solver | 40/40 | 25/41 |
| 2026-10-20 | Web, offline, form B fixed | 40/40 | 41/41 |
| 2026-10-20 | Web, online, form B fixed | 40/40 | 41/41 |

| Date | Engine | Form C (fresh) |
|---|---|---|
| 2026-10-20 | Web, offline, first run | 24/40 |
| 2026-10-20 | Web, offline, fixed | 40/40 |

| Date | Engine | Form D (fresh) |
|---|---|---|
| 2026-10-20 | Web, offline, first run | 8/40 |
| 2026-10-20 | Web, online, first run | 32/40 (35 with dash-tolerant grading) |
| 2026-10-20 | Web, offline, fixed | 40/40 |

| Date | Engine | Form E (fresh) |
|---|---|---|
| 2026-10-20 | Web, offline, first run | 30/40 (one key was wrong: $5,000 at 6% semi-annually for 8 years is $8,023.53) |
| 2026-10-20 | Web, online, first run | 36/40 |
| 2026-10-20 | Web, offline, fixed | 40/40 |

| Date | Engine | Form F (fresh) |
|---|---|---|
| 2026-10-20 | Web, offline, first run | 29/40 |
| 2026-10-20 | Web, online, first run | 35/40 (36 counting "x = π/4 + kπ/2", a correct general solution the key did not list) |
| 2026-10-20 | Web, offline, fixed | 40/40 |

| Date | Engine | Form G (fresh) |
|---|---|---|
| 2026-10-20 | Web, offline, first run | 36/40 |
| 2026-10-20 | Web, online, first run | 38/40 (39 counting "scaled vertically by 2", a correct answer the key missed) |
| 2026-10-20 | Web, offline, fixed | 40/40 |

**The web app reached A+ on Pre-Calculus 12 on 2026-10-20: 95% online on a fresh form (form G).** Fresh online grades: form D 80%, form E 90%, form F 90%, form G 95%. Fresh offline grades: 61%, 60%, 20%, 75%, 73%, 90%. The one real bug left on form G was tan(π) printing -1.2e-16; trig values that small now read 0. The iPhone and Mac apps run the same solver: docs/engine.js is bundled and `precalc()` runs in JavaScriptCore, so there is one solver to fix, not three. Apple, offline, all seven forms: 279/281 (`TEST_RUNNER_NIMBLE_EXAM=1 xcodebuild test -scheme Nimble -destination platform=macOS -only-testing:NimbleTests/OfflineExamTests`); the two misses are definitions the offline pack answers in the app, which this test leaves out. The general offline exam moved to 73/154 on Apple, since physical constants now answer offline there too. Android and the desktop apps have no JavaScript engine to share, so `precalc()` is ported line for line to Kotlin (`kmp/shared/.../Precalc.kt`). Kotlin, offline, all seven forms, 2026-10-20: 277/281 on the first run, 279/281 after `3 log(10)` read as a product in the Kotlin calculator (`NIMBLE_EXAM=1 ./gradlew :shared:jvmTest` in kmp/, report in `shared/build/pc12-exam.txt`). The same two definitions miss. That is A+ on every platform. Form F's online misses were the AI's: it called f(x/2) a horizontal compression (it is a stretch), rounded $13,311.16 to $13,310, and sent "the first term is 4 and the common ratio is 1/2" to the Stability and Growth Pact. The A+ bar is 95% on a fresh form, so form F is next. Form E's online misses: the AI read 3 log(10) as a natural log (6.9), sent the $5,000 question to the Wikipedia page on copper, called x³ - 8 unfactorable, and gave "how many roots does a degree 4 polynomial have" a definition.

Form D was the first fresh form graded online. The AI's own misses were real: it said a magnitude 7 earthquake is 1,000 times a magnitude 5 (it is 100), and it sent "which term of 2, 4, 8 is 256" and "solve sin²x = 1/4" to unrelated Wikipedia pages. The solver now computes all of them on the device: polynomial division, oblique asymptotes, holes, multiplicity, repeating decimals, log and exponential forms, pH and magnitude, phase shift and range, sum and double-angle identities, an identity checker, and a general solve for equations whose roots are small fractions.

The first online run lost "10th term of 2, 6, 18" to a Wikipedia article on a trillion, and `log(1000)` came back as the natural log. The fix is `precalc()` in docs/engine.js: log bases, exponential equations, geometric sequences, degrees and radians, half-life, quadratics, remainders, asymptotes, exact trig values, trig equations, amplitude and period, inverses and transformations, all computed on the device.

## BC curriculum: Pre-Calculus 11

`test/courses/pc11.js` holds two 40-question forms across the course: radicals and rational exponents, absolute value, quadratics (vertex, discriminant, completing the square), linear and quadratic inequalities, systems, rational expressions, the sine and cosine laws, and interest. Both forms were written before any run, and form B was held out until form A was fixed. Run `COURSE=pc11 node test/exam-course.js` (`OFFLINE=1` for no network, `FORM=B` for one form). Every later course uses the same runner and one file in test/courses.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web online, first run | 32/40 (80%) | 40/40 (100%) |
| Web offline, first run | 14/40 (35%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Form A's first online misses: the AI answered in raw LaTeX (`\(\frac{\sqrt{2}}{2}\)`), called simple interest compound ($1,687.30 for $180), glued UNKNOWN to a right answer ("5UNKNOWN"), and rounded a sine-law angle to 27.4° (27.33°). One key was too strict (it wanted -2 before 2). The fix was a Pre-Calc 11 solver that runs before the AI (`pc11()` in docs/engine.js, `Precalc11.kt` on Kotlin; the Apple apps run engine.js), and the Worker now turns LaTeX into plain text and keeps an answer with UNKNOWN glued on. **A+ on the web, iPhone, Mac and Android, both forms, online and offline.**

## BC curriculum: Foundations of Mathematics and Pre-Calculus 10

`test/courses/fmpc10.js`, two 40-question forms written before any run: primes, factors and multiples, exponent laws, expanding and factoring, measurement (unit conversion, surface area and volume), right-triangle trigonometry, lines and functions, systems, and pay. Run `COURSE=fmpc10 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 10/40 (25%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Online is not graded yet: the Worker passed 6,000 estimated neurons for the day, which is the line the loop does not cross for live rounds, so the online run waits for the 17:00 reset. Form A's first offline run also caught a real bug in the Pre-Calc 12 factoring: "factor 6x^2 + 9x" printed "3(2x + 3)(x - 0)". A common factor now comes out first ("3x(2x + 3)", "2x²(2x + 5)"). The solver is `fm10()` in docs/engine.js and `Precalc10.kt` on Kotlin. **A+ offline on every platform.**

## BC curriculum: Foundations of Mathematics 11

`test/courses/fom11.js`, two 40-question forms written before any run: statistics and the normal curve, polygons and angles, inductive and deductive reasoning, scale, interest and credit, quadratic functions, linear inequalities, and the sine and cosine laws. Run `COURSE=fom11 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 8/40 (20%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

One key in form A was too strict: the pack's "Deductive reasoning is the process of drawing valid inferences" is right, and the key now takes it. Two of form A's first offline answers were wrong, not just missing: the pack answered "next number in 1, 4, 9, 16, 25" with the article on numbers, and the Pre-Calc 12 solver worked the rule of 72 out exactly (11.9 years) when the question asked for the rule (12). The solver is `fom11()` in docs/engine.js and `Foundations11.kt` on Kotlin. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Foundations of Mathematics 12

`test/courses/fom12.js`, two 40-question forms written before any run: permutations and combinations, Pascal's triangle, probability with dice, cards and coins, odds, sets and Venn counts, converse and contrapositive, annuities and loan payments, growth and decay, circles, and fractals. Run `COURSE=fom12 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 8/40 (20%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Two of form A's first offline answers were confidently wrong: the Pre-Calc 12 compound-interest branch read "$200 deposited monthly for 5 years" as one deposit ($269.77, the right answer is $13,954.01) and a $20,000 loan payment as an investment ($26,764.51 for $386.66 a month). Annuities and loan payments now run first. A mortgage answer gives both the monthly-compounded payment and the semi-annual compounding Canadian mortgages use by law. The solver is `fom12()` in docs/engine.js and `Foundations12.kt` on Kotlin. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Calculus 12

`test/courses/calc12.js`, two 40-question forms written before any run: the power, product, quotient and chain rules, trig, exponential and log derivatives, tangent lines, critical points, extrema, concavity and inflection, limits (including at infinity and ones that do not exist), differentiability, antiderivatives, definite integrals, area, average value, motion and related rates. Run `COURSE=calc12 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 0/40 (0%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

The engine had no calculus at all, so form A started at zero. The fix is a small symbolic engine (`calc12()` and the `c*` helpers in docs/engine.js, `Calculus12.kt` on Kotlin): it parses an expression in x, differentiates it, simplifies (like terms, powers of x, numbers across a fraction bar) and prints the way a textbook does, "8x(x^2 + 1)^3", "1/(2√x)", "1/(x + 1)^2". Integrals of the standard forms are symbolic; definite integrals use Simpson's rule; limits approach from both sides. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Statistics 12

`test/courses/stats12.js`, two 40-question forms written before any run: five-number summaries, quartiles and outliers, sample and population spread, z tables both ways, the binomial model, expected value, correlation and least squares, confidence intervals, margin of error and sample size, hypothesis-test words, sampling methods and bias, and conditional probability. Run `COURSE=stats12 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 6/40 (15%) | 38/40 (95%) |
| Web offline, after fixes | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Form B's honest first grade is 38/40, an A+ on its own. Its two misses were wording the solver had not seen: "what percent score below 58" (no "than") and "3 coin flips" (a word between the number and "flips"). Both now answer. One form A key was too strict about word order ("Rejecting the null hypothesis when it is actually true" is right) and now takes it. Form A's first offline run also gave one wrong answer, not a miss: "are A and B independent if P(A) = 0.5 ..." printed 0.2 from the Foundations 12 branch. The statistics solver now runs first (`stats12()` in docs/engine.js, `Statistics12.kt` on Kotlin). The normal CDF is Abramowitz and Stegun 7.1.26, good to about 1e-7. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Workplace Mathematics 10

`test/courses/work10.js`, two 40-question forms written before any run: perimeter, area and volume with units in the question, mixed units ("3 feet 6 inches"), temperature, GST and PST, discounts and tips, unit price and the better buy, exchange rates, overtime and percent deductions, ratios, speed and travel time, and the rise over a run. Run `COURSE=work10 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 14/40 (35%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Form A's first offline run had one wrong answer: "net pay if gross is $1200 and deductions are 22%" printed $1,178.00, reading 22% as $22. The solver is `work10()` in docs/engine.js and `Workplace10.kt` on Kotlin; it runs before the Foundations 10 pay branch. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Apprenticeship and Workplace Mathematics 12

`test/courses/aw12.js`, two 40-question forms written before any run: mixed numbers and inch fractions, tolerance and precision, board feet and concrete, squaring a corner, gears and Ohm's law, rates of change and linear cost models, composite areas, conversions, budgets, depreciation, studs and roof pitch, paint coverage, marbles and odds, and the cosine law. Run `COURSE=aw12 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 10/40 (25%) | 39/40 (97.5%) |
| Web offline, after fixes | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Form A's first offline run had one wrong answer: "probability of drawing a red marble from 3 red and 5 blue" printed 1/2, treating it as a red card. Form B's one first-run miss was the key's fault: "Accuracy is how close a measurement is to the true value" is right, and the key now allows words between "close" and "to". Adding this solver briefly broke one Pre-Calc 12 question ("write 0.333... as a fraction" printed NaN), caught by the regression run and fixed before the commit. The solver is `aw12()` in docs/engine.js and `Apprenticeship12.kt` on Kotlin. Online waits for the neuron reset. **A+ offline on every platform. Every BC grade 10 to 12 math course is now at A+ offline.**

## BC curriculum: Science 10

`test/courses/sci10.js`, two 40-question forms written before any run: atoms, isotopes and ions, compound names and formulas, balancing and reaction types, acids and bases, energy, work and power, radioactivity, DNA and Punnett squares, and the universe. Run `COURSE=sci10 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 9/40 (23%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

The solver is `sci10()` in docs/engine.js and `Science10.kt` on Kotlin. The computed half is real chemistry and physics: a periodic table to krypton plus common heavy elements, compound names both ways (ionic with Roman numerals and polyatomic ions, covalent with prefixes), equations balanced by searching small coefficients, reaction types, molar mass, energy, work, power and Punnett squares for one or two genes. The other half is a table of curriculum facts. That half is weaker evidence than the math courses: the same author wrote the facts and the held-out form, so form B mostly checks that the facts cover the course. The online run is the stronger test, and it waits for the neuron reset. One first-run answer was incomplete rather than missing: "the charge of an electron" gave 1.602 × 10⁻¹⁹ C with no sign, from the constants table. The general offline exam rose to 75 of 154 on the web and Kotlin and 76 on Apple. **A+ offline on every platform.**

## BC curriculum: Chemistry 11

`test/courses/chem11.js`, two 40-question forms written before any run: significant figures and scientific notation, density, the mole, percent composition and empirical formulas, molarity and dilution, gases at STP, stoichiometry, limiting reactants and yield, electron configurations, periodic trends, bonding, VSEPR shape and polarity, and alkane names. Run `COURSE=chem11 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 6/40 (15%) | 39/40 (97.5%) |
| Web offline, after fixes | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Form A's first offline run had one wrong answer: "what is a mole" returned the Wikipedia article on the animal. Form B's one first-run miss was a real bug: "how many grams of CO2 from 16 g of methane burning" lowercased the formula before reading it. The question is now read as typed, as the other formula branches are. The key also only took 43.9 g, and the answer, 43.89 g, is right, so the key now takes both. Writing the Kotlin port turned up a logic slip on the web too: "the lowest ionization energy in period 3" would have named the wrong end of the period. Both are fixed and tested. Stoichiometry balances the equation with the Science 10 search before it converts, and shapes come from VSEPR on the formula. The solver is `chem11()` in docs/engine.js and `Chemistry11.kt` on Kotlin. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Chemistry 12

`test/courses/chem12.js`, two 40-question forms written before any run: rates and collision theory, equilibrium expressions, Keq and Le Chatelier, Ksp and molar solubility, pH and pOH, strong and weak acids, conjugate pairs, Ka, titration and indicators, oxidation numbers, redox agents, cell potentials and half-reactions. Run `COURSE=chem12 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 2/40 (5%) | 39/40 (97.5%, see below) |
| Web offline, after fixes | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Form B scored 40/40 on its run, but the honest grade is 39/40. Before the run I spot-checked a few answers by hand, and one of them, "conjugate acid of OH-", is a form B question. It printed OH₂ and was fixed to H₂O first, so that item does not count as a first-run pass. The spot checks also caught a real parsing bug: "HCO3-" was read as HCO with a 3- charge, and "NH4+" as NH with a 4+ charge. A number before the sign is now a charge only on a one-element ion (Cu2+) or after a space or ^ (CO3 2-). Form A's first fixes: weak-acid pH uses the square-root shortcut when it passes the 5% rule, as a textbook does, and the quadratic when it does not; the equation pattern reads only formula terms. The solver is `chem12()` in docs/engine.js and `Chemistry12.kt` on Kotlin. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Physics 11

`test/courses/phys11.js`, two 40-question forms written before any run: vectors and scalars, kinematics and free fall, Newton's laws, weight, friction and net force, work, energy, power and efficiency, waves and sound, and series and parallel circuits, with g = 9.8 m/s². Run `COURSE=phys11 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 7/40 (18%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 |

Form A's first offline run had wrong pack answers, not just misses: "what is the speed of sound in air" gave 331 m/s at 0 °C from Wikipedia's first sentence, and three kinematics questions got the article on velocity. The kinematics solver picks the constant-acceleration equation that fits the three values given and reads acceleration by its unit (m/s²) wherever it sits. Results are given to three significant figures. No form B answer was checked by hand before the run. The solver is `phys11()` in docs/engine.js and `Physics11.kt` on Kotlin. Online waits for the neuron reset. **A+ offline on every platform.**

## BC curriculum: Physics 12

`test/courses/phys12.js`, two 40-question forms written before any run: vector resultants and components, relative motion, horizontal and angled projectiles, circular motion, gravitation, field strength and orbits, momentum, impulse and collisions, torque and balance, inclines, Coulomb's law, electric fields and work, magnetic force and induction. Run `COURSE=phys12 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B (held out) |
|---|---|---|
| Web offline, first run | 2/40 (5%) | 40/40 (100%) |
| Apple offline | 40/40 | 40/40 |
| Kotlin offline | 40/40 (79/80 on the first Kotlin run) | 40/40 |

No form B answer was checked by hand before the run. Two side effects were caught before the commit. The new "gravitational constant" fact shadowed the constants table, so the web test that wants NIST's exact 6.67430 × 10⁻¹¹ failed; the fact now covers only the wordings the table does not take. And Kotlin had no answer for "the speed of light in m/s", which the web took from elsewhere; it now answers on every platform. The solver is `phys12()` in docs/engine.js and `Physics12.kt` on Kotlin. Online waits for the neuron reset. **A+ offline on every platform. Every BC science course in physics and chemistry is now at A+ offline.**

## BC curriculum: Life Sciences 11

`test/courses/lifesci11.js`: characteristics of life, taxonomy and scientific names, viruses and their cycles, bacteria and archaea, protists, fungi, plants, evolution and its mechanisms, animal body plans, and microscope and bacterial growth arithmetic. Forms A and B were written before any run. Form C was written after the solver passed A and B, because this course is mostly facts and those facts were written with B's misses in view, so B stopped being a fair held-out test. Run `COURSE=lifesci11 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B | Form C (held out) |
|---|---|---|---|
| Web offline, first run | 4/40 (10%) | 7/40 (18%) | 15/40 (38%) |
| Web offline, after fixes | 40/40 | 40/40 | 39/40 |
| Apple offline | 40/40 | 40/40 | 39/40 |
| Kotlin offline | 40/40 | 40/40 | 39/40 (118/120 before algae and seed got facts; the web had them from the pack) |

The honest held-out number is form C's first run, 15/40. A facts table only knows what it was written for, and a fresh set of questions on the same course found the gaps at once: kingdoms and phyla of common organisms, diseases by cause, pili and peptidoglycan, niches, punctuated equilibrium, the functions of plant parts. Those are now covered, and C reads 39/40 after the fixes, but that is tuned, not held out. The one miss is "what is photosynthesis": a local fact would hide the Wikipedia card and its diagram, which the web tests protect, so the pack answers it and its opening line has no "light" or "glucose". The math half (total magnification, field of view, actual size, doubling growth) is real arithmetic and generalizes. The solver is `ls11()` in docs/engine.js and `LifeSciences11.kt` on Kotlin, whose tables are copied from engine.js by script. A known cost: a local definition answers before Wikipedia even online, so bare terms like virus, fossil, fern or species now get one textbook line instead of their Wikipedia card, as Science 10 already does for evolution and galaxy. Narrowing those is on the list. The bacteria growth rule only fires when the question says bacteria, after it first took a Pre-Calc 12 population question. **A+ offline on A and B; held-out form C is 38% first run, so fact courses need an online held-out grade before they count.**

## BC curriculum: Anatomy and Physiology 12

`test/courses/ap12.js`: organelles, membrane transport and tonicity, biological molecules, enzymes, DNA replication, transcription and translation, homeostasis, and the digestive, circulatory, respiratory, urinary and nervous systems. Forms A and B were written before any run, and the solver was built from the curriculum and form A's misses only. Form C was written after A and B passed and run once. Run `COURSE=ap12 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B | Form C (held out) |
|---|---|---|---|
| Web offline, first run | 3/40 (8%) | 2/40 (5%) | 20/40 (50%) |
| Web offline, after A only | 40/40 | 40/40 | |
| Web offline, after fixes | 40/40 | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 | 40/40 |

Form B scored 40/40 on its first run after the solver was built from form A, but the same person wrote form B and the solver, so its topics were in mind; that makes it weaker evidence than it looks. Form C is the honest held-out number: 20/40 first run. That is better than Life Sciences 11's 15/40 because this solver matches whole terms ("function of X", "what does X do", "what is X") against one table of structures and ideas, rather than one pattern per question. C's misses were reverse questions ("which organelle makes ATP", "what part of the brain controls balance"), now answered by scoring each term of the asked kind on shared words, with a word weighted down the more terms use it, plus facts it simply lacked (base pairing, enzyme substrates, the body's response to heat, where bile is made). The sequence work (complements, transcription, the genetic code, translation, codon counts) and cardiac output are real computation. The solver is `ap12()` in docs/engine.js and `AnatomyPhysiology12.kt` on Kotlin, whose tables are copied from engine.js by script. **A+ offline on A and B; held-out form C is 50% first run, so this course also waits for an online held-out grade.**

## BC curriculum: Earth Sciences 11

`test/courses/es11.js`: minerals and rocks, the rock cycle, Earth's layers, plate tectonics, earthquakes and volcanoes, geologic time and dating, weathering and erosion, the atmosphere, oceans and climate. Forms A and B were written before any run and the solver was built from form A's misses only; form C was written after A and B passed and run once. Run `COURSE=es11 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B | Form C (held out) |
|---|---|---|---|
| Web offline, first run | 7/40 (18%) | 7/40 (18%) | 18/40 (45%) |
| Web offline, after A only | 40/40 | 40/40 | |
| Web offline, after fixes | 40/40 | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 | 40/40 (118/120 before soil and thermohaline circulation got facts; the web had them from the pack) |

Form C is the honest held-out number, 18/40. Most misses were facts the table lacked (the thinnest and thickest layers, the Juan de Fuca Plate, calderas, uniformitarianism, the air's makeup), and one was a parser gap: "the half-life of potassium-40 is 1.3 billion years" did not read because an isotope name sat between "of" and the number. The term matcher from Anatomy and Physiology 12 is now shared (`termAsk()` in engine.js, `Terms.kt` on Kotlin) and also reads "how are X formed", "what happens at X", "what causes X" and "what is X made of". Radiometric dating, magnitude ratios and S minus P epicentre distance are computed.

A regression caught here: the Anatomy and Physiology 12 commit put its solver ahead of Chemistry 12, so "what is activation energy" got the enzyme answer and Chemistry 12 form A fell to 39/40 (38/40 once Earth Sciences took "oxidation" too). The three fact courses now run after the chemistry and physics solvers, the chemistry line for activation energy also says it is the energy needed to start a reaction, and every course was re-run before this commit: all at their old scores. **A+ offline on A and B; held-out form C is 45% first run, so this course also waits for an online held-out grade.**

## BC curriculum: Environmental Science 11

`test/courses/envsci11.js`: ecosystems and energy flow, the carbon, nitrogen and phosphorus cycles, biodiversity, succession, population dynamics, species interactions, ecosystem services, human impacts, sustainability, conservation and First Peoples knowledge. Forms A and B were written before any run and the solver was built from form A's misses only; form C was written after A and B passed and run once. Run `COURSE=envsci11 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B | Form C (held out) |
|---|---|---|---|
| Web offline, first run | 5/40 (13%) | 9/40 (23%) | 11/40 (28%) |
| Web offline, after A only | 40/40 | 32/40 (80%) | |
| Web offline, after fixes | 40/40 | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 | 40/40 |
| Kotlin offline | 40/40 | 40/40 | 40/40 (115/120 before ecosystem, biome, invasive species, endangered species and extinction got local text; the web had them from the pack) |

This time form B was kept honest: the solver was built from A and the curriculum, and B's first run after that was 32/40. Its eight misses were all "why" and "example" questions (why food chains are short, why biodiversity matters, examples of keystone and invasive species in BC). Form C, 11/40 first run, missed the same shapes plus BC specifics: the mountain pine beetle, the Great Bear Rainforest, clearcutting, COSEWIC, old growth. The 10 percent rule, population density, mark and recapture (Lincoln-Petersen), growth rate and doubling time (rule of 70, populations only, so Foundations' rule of 72 for money still answers) are computed. Every course was re-run before this commit: all at their old scores. **A+ offline on all three forms after fixes; the honest held-out numbers are B 80% and C 28% first run, so this course waits for an online held-out grade.**

## BC curriculum: Social Studies 10

`test/courses/ss10.js`: Canada and the World, 1914 to the present. Government and elections, the Constitution and the Charter, Canadian autonomy, discriminatory policies (the head tax, the Komagata Maru, internment), Indigenous peoples and reconciliation, the world wars, the Depression, the Cold War, Quebec and the political spectrum. Forms A and B were written before any run, the solver was built from form A only, with form B's topics kept out on purpose, and form C was written after A and B passed and run once. Run `COURSE=ss10 node test/exam-course.js`.

| Run (2026-10-20) | Form A | Form B | Form C (held out) |
|---|---|---|---|
| Web offline, first run | 4/40 (10%) | 5/40 (13%) | 6/40 (15%) |
| Web offline, after A only | 40/40 | 5/40 (13%) | |
| Web offline, after fixes | 40/40 | 40/40 | 40/40 |
| Apple offline | 40/40 | 40/40 | 40/40 (106/120 before 14 pack-only topics got local text) |
| Kotlin offline | 40/40 | 40/40 | 40/40 (106/120 before the same 14) |

The 14 topics (the Great Depression, the Cold War, NATO, the Holocaust, the United Nations, Louis Riel and others) answered on the web from the Wikipedia pack, which the apps do not carry. Local text now answers them first everywhere, so online they show a short paragraph instead of the Wikipedia card, the same cost logged for the science courses. The probe over the general exams also caught "who was british prime minister during world war 2" getting Mackenzie King; the country-specific facts (head of state, seats, electoral system, voting age, wartime prime ministers, women's vote) now need Canada or BC in the question.

The first social studies course shows the limit of an offline table plainly. Every question is recall, so what A taught did not carry to B at all (5/40 before and after), and C was 6/40, with its passes all from the Wikipedia pack (the Battle of the Atlantic, Louis Riel, the Iron Curtain). After fixes the course holds 112 entries of Canadian history and civics, each a short paragraph. Generic words stay open: "what is hong kong", "what is a white paper", "what is conscription" and "who is the prime minister of canada" still go to the live sources. **A+ offline after fixes; the honest held-out numbers are B 13% and C 15%, so this course depends on its online grade.**

## The 1,000-question exam

`test/exam-1000.js` is a bank of 1,049 questions: math (633) and units (177) are computed, so the expected answers cannot be mistyped, and they run offline every time at no cost. The 239 AI questions (capitals, elements, authors, dates, facts) are asked a rotating slice at a time (`CAP`, default 250) so the free Groq caps hold. `npm run exam:1000`, weekly in CI.

First run, 2026-10-18: offline half 810 of 810; a 60-question AI slice (dates and facts) 60 of 60.

## What it does not measure

Speed is not in the exam. Live latency is at `/stats` on the Worker: Groq answers in about 650 ms at the median. The exam is also ours, so it can flatter us. The 1,000-question exam is the start of the fix; its facts are still ours.
