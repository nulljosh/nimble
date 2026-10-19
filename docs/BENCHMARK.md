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

The same 154 questions with no network at all: math, units, constants, the device's time zones and the 9,000-article offline pack. 49 pass (45, then factorials and base conversion moved offline). The pack used to answer 75 of them and get 49 wrong, mostly by matching one word of a title ("how many bones in the human body" gave the article on the penis). It now answers only when its sentence shares the question's own words: 33 answers, 12 wrong, and the rest say "not in the offline pack". Honest misses beat confident wrong answers. Rerun with `npm run exam:offline`. The next step is the on-device model reading the pack (roadmap v31-40).

## The 1,000-question exam

`test/exam-1000.js` is a bank of 1,049 questions: math (633) and units (177) are computed, so the expected answers cannot be mistyped, and they run offline every time at no cost. The 239 AI questions (capitals, elements, authors, dates, facts) are asked a rotating slice at a time (`CAP`, default 250) so the free Groq caps hold. `npm run exam:1000`, weekly in CI.

First run, 2026-10-18: offline half 810 of 810; a 60-question AI slice (dates and facts) 60 of 60.

## What it does not measure

Speed is not in the exam. Live latency is at `/stats` on the Worker: Groq answers in about 650 ms at the median. The exam is also ours, so it can flatter us. The 1,000-question exam is the start of the fix; its facts are still ours.
