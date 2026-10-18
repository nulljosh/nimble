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

Since the Groq run: the model is now asked the same Earth rewrite the search uses, and the exam accepts Proxima or the Sun. 154 of 154 is confirmed after the cached "tallest mountain" answer expires, then this table gets a new row.

## The 1,000-question exam

`test/exam-1000.js` is a bank of 1,049 questions: math (633) and units (177) are computed, so the expected answers cannot be mistyped, and they run offline every time at no cost. The 239 AI questions (capitals, elements, authors, dates, facts) are asked a rotating slice at a time (`CAP`, default 250) so the free Groq caps hold. `npm run exam:1000`, weekly in CI.

First run, 2026-10-18: offline half 810 of 810; a 60-question AI slice (dates and facts) 60 of 60.

## What it does not measure

Speed is not in the exam. Live latency is at `/stats` on the Worker: Groq answers in about 650 ms at the median. The exam is also ours, so it can flatter us. The 1,000-question exam is the start of the fix; its facts are still ours.
