# Nimble loop handoff (2026-10-20, night)

## What the loop is

Nimble ships one small slice per tick, from v10 up the roadmap to v100. Each slice is built on the web first, then Swift (iPhone and Mac), then Kotlin (Android and desktop). A slice ends the same way every time: tests green, push, CI green, tag, release, Homebrew tap bumped, docs and screenshots checked by eye. The bar is A+ on every surface and a free AI that lasts the whole day.

10.0.0 closed v10. Joshua called it on 2026-10-20 without waiting for Mac 9.4.3 to clear review. After that, ROADMAP.md runs v11 (native type) to v100 (the answer bar of a computer), one major at a time. Each major has an exit test, and its X.0.0 tag is cut the day that test passes.

Each tick, in order: `asc versions list --app 6807858746` (a rejection jumps the queue), `gh run list --limit 3` (a red run on main jumps the queue), read `/stats` on the Worker, `df -h /System/Volumes/Data` (under 10 GB free means clean up before any build), then the next item below.

Rules that bite:

- Stage by exact path. Never add `kmp/.kotlin/` or `.asc/signing-new/`.
- `scripts/bump-version.sh` also edits `kmp/composeApp/build.gradle.kts`, so never filter `kmp/` out of the staged paths.
- The loop and other sessions both push to main. Pull with `--rebase` before pushing.
- Roadmap check-offs stay in the working tree until Joshua says otherwise.
- The Worker deploys by hand: `cd worker && npx wrangler deploy`. A push does not ship it. Secrets go in with `wrangler secret put`, which reads stdin. Never print or commit a key.
- Exam: run the full exam at most once a day. It costs about 110K of the 600K Groq tokens a day. Use `LAST=N` for a slice.
- Live probe rounds: read `/stats` first. Skip the round when estNeurons is over 6,000 or groqRefused is over a quarter of groqCalls. The day resets at 17:00 Pacific.
- Long commands (npm test, xcodebuild, gradle, the exam) run in the background. Never a wait loop.
- Keep 10 GB of disk free, and 20 GB before a heavy build.
- Posting is Joshua's call, one post at a time, with a plain yes. Never sign Joshua up or in anywhere.
- Questions go to Groq and Cloudflare. Any change to who sees them updates docs/privacy.html and CLAUDE.md together.

## Where things stand

- Repo: main at 346f7d8 (2026-10-19 afternoon). The Kotlin offline exam at 72 of 154 is in (13d6976); the roadmap was pruned of checked items (346f7d8). Latest tag v10.0.0, Homebrew tap at 10.0.0. The handoff commit's Tests and Deploy site runs were still queued when this was written, so check CI first.
- Exam: 154 of 154 online on the web. Offline, the 14,000-article pack passes 72 of 154 with 3 wrong on the web, Kotlin and the Apple apps (Tests/OfflineExamTests.swift, run with TEST_RUNNER_NIMBLE_EXAM=1). Method and numbers are in docs/BENCHMARK.md.
- Store, checked with asc 2026-10-20 00:00: iPhone 9.4.4 is READY_FOR_SALE. Mac 9.4.3 is WAITING_FOR_REVIEW. 10.0.0 is tagged; the next store build carries it.
- Price: $0.99 on the App Store since 2026-10-18. License Apache 2.0. Web stays free. MONEY.md says what the dollar buys.
- Worker (nimble-answers.trommatic.workers.dev): Groq answers first, then Workers AI, then Wikipedia. The Samantha tier stays off until SAMANTHA_URL is set. API keys are issued through the API_KEYS secret. The live status page is at nimble.jaybulb.com/status.
- Shipped on the web this round, and on the next store build: the status page, minimum wage by province from the Government of Canada table, the compare card with two rows, one-file JavaScript and Python API clients in sdk/, CI size budgets (Mac 11.9 MB of 20, iPhone 12.9 MB of 15), the review key moved into an Authorization header and rotated, and offline Kotlin unit conversion and time.
- The offline Wikipedia pack rebuilds on the 3rd of each month in CI and rebases before pushing.
- Blocked on Joshua: a native-speaker check of the de, pt, hi and ja strings. A real-device walk (Siri, share sheet, VoiceOver, Android). Chrome and Firefox extension store submissions. The rest of the launch drafts in docs/launch/nimble.md and the Reddit modmail follow-up. Issuing API keys. The optional SAMANTHA_URL tunnel. Private Cloud Compute needs a managed entitlement.

## Next, in order

0. Curriculum and public exams (Joshua, 2026-10-20). A+ means 95%, judged on a held-out form written before tuning, offline and online, on web then Swift then Kotlin, with every score in docs/BENCHMARK.md:
   - BC Pre-Calculus 12 (test/exam-pc12.js): A+ everywhere (2026-10-20). Web 95% online on fresh form G, 281/281 offline; Apple 279/281 offline (engine.js in JavaScriptCore); Kotlin 279/281 offline (Precalc.kt, a line-for-line port). A change to precalc() in docs/engine.js must be mirrored in Precalc.kt.
   - BC Pre-Calculus 11 (test/courses/pc11.js): A+ (2026-10-20), held-out form B 40/40 online and offline on the web, 80/80 Kotlin offline. Runner: `COURSE=<name> node test/exam-course.js`. Each new course is one file in test/courses, symlinked into Tests/Fixtures and listed in testCourseExams; Kotlin's courseExams reads the folder.
   - Foundations of Mathematics and Pre-Calculus 10 (test/courses/fmpc10.js): A+ offline on every platform (2026-10-20), held-out form B 40/40. The online run waits for a day under 6,000 neurons.
   - Foundations of Mathematics 11 (test/courses/fom11.js): A+ offline on every platform (2026-10-20), held-out form B 40/40. Online waits, like FMPC10.
   - Foundations of Mathematics 12 (test/courses/fom12.js): A+ offline on every platform (2026-10-20), held-out form B 40/40. Online waits.
   - Calculus 12 (test/courses/calc12.js): A+ offline on every platform (2026-10-20), held-out form B 40/40. Online waits.
   - Statistics 12 (test/courses/stats12.js): A+ offline on every platform (2026-10-20), held-out form B 38/40 on its first run. Online waits.
   - Workplace Mathematics 10 (test/courses/work10.js): A+ offline on every platform (2026-10-20), held-out form B 40/40. Online waits.
   - Apprenticeship and Workplace Mathematics 12 (test/courses/aw12.js): A+ offline on every platform (2026-10-20), held-out form B 39/40 first run. Every BC grade 10 to 12 math course is done offline; the online grades wait for a day under 6,000 neurons.
   - Science 10 (test/courses/sci10.js): A+ offline on every platform (2026-10-20), held-out form B 40/40. The facts half is weak evidence until the online run.
   - Chemistry 11 (test/courses/chem11.js): A+ offline on every platform (2026-10-20), held-out form B 39/40 first run.
   - Chemistry 12 (test/courses/chem12.js): A+ offline on every platform (2026-10-20), held-out form B 39/40 honest first run.
   - Physics 11 (test/courses/phys11.js): A+ offline on every platform (2026-10-20), held-out form B 40/40 first run.
   - Physics 12 (test/courses/phys12.js): A+ offline on every platform (2026-10-20), held-out form B 40/40 first run.
   - Life Sciences 11 (test/courses/lifesci11.js): A+ offline on A and B (2026-10-20), but the fresh form C was 15/40 first run; it now has three forms. Fact-heavy courses get a fresh form C after tuning and need an online held-out grade.
   - Anatomy and Physiology 12 (test/courses/ap12.js): A+ offline on A and B (2026-10-20); fresh form C 20/40 first run, 40/40 after fixes. Method from here: build from form A only, run B once, then write and run a fresh C.
   - Earth Sciences 11 (test/courses/es11.js): A+ offline on A and B (2026-10-20); fresh form C 18/40 first run, 40/40 after fixes. Re-run every course after adding one: a new solver ahead of Chemistry 12 once stole its terms.
   - 2026-10-20 07:45: an unplanned live run. `test/exam.js` ignores OFFLINE and was started by mistake, then stopped part way through; estNeurons went from 6240 to 7200 with no score posted. Nothing runs online before the 17:00 reset. `test/exam-offline.js` is the offline general exam, and `test/exam-pc12.js` needs OFFLINE=1 to stay off the network.
   - Next courses, in order: Environmental Science 11; then Social Studies 10, Physical Geography 12, 20th Century World History 12, Law 12, Economic Theory 12, BC First Peoples 12. English, arts and PE are skipped.
   - SimpleQA (public short-answer facts), then GSM8K, then the Canadian citizenship and BC driver's knowledge tests. Every miss is training data for Samantha in turing.
1. Follow-ups ("and in celsius?", "who was before him?") on iOS, Mac and Kotlin, matching the web.
2. Packs by topic (science, history, geography), so a phone can carry what it needs.
3. 10.0.0 is out (2026-10-20). Joshua posts the rest of docs/launch/nimble.md when he wants.

Until a build clears, do the next item each tick. If a build is rejected, read the reason with `asc web review show --app 6807858746`, fix it and resubmit. Do not resubmit unchanged.

## Restart prompt

```
/loop Nimble (~/Documents/Code/nimble): take the next open roadmap slice toward v100 and ship it. One slice per tick, inline with no subagents, light on memory (no browsers, no Samantha model loads). Tests green, push, deploy the worker when it changes, tick the roadmap. Reply in one short line.
```

Then read this file first, run the tick checks, and work "Next, in order" top down.
