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

Fresh online grades so far: form D 80%, form E 90%, form F 90%. Form F's online misses were the AI's: it called f(x/2) a horizontal compression (it is a stretch), rounded $13,311.16 to $13,310, and sent "the first term is 4 and the common ratio is 1/2" to the Stability and Growth Pact. The A+ bar is 95% on a fresh form, so form F is next. Form E's online misses: the AI read 3 log(10) as a natural log (6.9), sent the $5,000 question to the Wikipedia page on copper, called x³ - 8 unfactorable, and gave "how many roots does a degree 4 polynomial have" a definition.

Form D was the first fresh form graded online. The AI's own misses were real: it said a magnitude 7 earthquake is 1,000 times a magnitude 5 (it is 100), and it sent "which term of 2, 4, 8 is 256" and "solve sin²x = 1/4" to unrelated Wikipedia pages. The solver now computes all of them on the device: polynomial division, oblique asymptotes, holes, multiplicity, repeating decimals, log and exponential forms, pH and magnitude, phase shift and range, sum and double-angle identities, an identity checker, and a general solve for equations whose roots are small fractions.

The first online run lost "10th term of 2, 6, 18" to a Wikipedia article on a trillion, and `log(1000)` came back as the natural log. The fix is `precalc()` in docs/engine.js: log bases, exponential equations, geometric sequences, degrees and radians, half-life, quadratics, remainders, asymptotes, exact trig values, trig equations, amplitude and period, inverses and transformations, all computed on the device.

## The 1,000-question exam

`test/exam-1000.js` is a bank of 1,049 questions: math (633) and units (177) are computed, so the expected answers cannot be mistyped, and they run offline every time at no cost. The 239 AI questions (capitals, elements, authors, dates, facts) are asked a rotating slice at a time (`CAP`, default 250) so the free Groq caps hold. `npm run exam:1000`, weekly in CI.

First run, 2026-10-18: offline half 810 of 810; a 60-question AI slice (dates and facts) 60 of 60.

## What it does not measure

Speed is not in the exam. Live latency is at `/stats` on the Worker: Groq answers in about 650 ms at the median. The exam is also ours, so it can flatter us. The 1,000-question exam is the start of the fix; its facts are still ours.
