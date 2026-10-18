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

Since the Groq run: the model is now asked the same Earth rewrite the search uses, and the exam accepts Proxima or the Sun. 154 of 154 is confirmed after the cached "tallest mountain" answer expires, then this table gets a new row.

## What it does not measure

Speed is not in the exam. Live latency is at `/stats` on the Worker: Groq answers in about 650 ms at the median. The exam is also ours, so it can flatter us. The 1,000-question exam (slice 9.1) is the fix.
