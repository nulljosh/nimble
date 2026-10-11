# Nimble loop handoff (2026-10-11, late)

## What the loop is

Keep Nimble moving after 5.0.0 with one small, shippable slice at a time: fix what App Review or Joshua's phone turns up, ship each as a patch with tests green, and close every release with a tag, a GitHub release (notarized Mac zip, msi, apk), synced landing and docs, fresh screenshots and What's New. Joshua's standing goal: zero open issues, zero stale branches, all PRs merged, and UI, UX, accessibility and language at A+.

## Where things stand

- Current version is 5.0.1 (2026-10-11). 5.0.0 was the last major.
- iOS 5.0.1 is in App Review, submitted 2026-10-11 with fresh iPhone, iPad and Mac screenshots.
- Mac 5.0.1 was cancelled and resubmitted with the fixed build (timestamp build number 202610110121). Apple blocks lowering a version, so 5.0.1 is the next number.
- Mac fixes in 5.0.1: the search window takes keyboard focus, drags with AppKit's performDrag and tracks the cursor exactly (90 of 90 px, tested twice), and no longer crashes on system remote-view windows. 66 unit tests green.
- The signed, sandboxed release build launches, renders answers and accepts typing. The earlier drag and typing check is closed.
- The two loop bugs are closed: the Vancouver weather card renders fine on iPhone, and the widget updates after the card lands.
- GitHub release v5.0.1 carries the notarized Mac zip, plus the msi and apk attached by hand with gh release upload, because the native-release workflow only produces CI artifacts.
- Landing page and web app pass axe with zero violations in light and dark. The live version badge reads v5.0.1.
- All 78 native strings carry en, fr, es, zh and pa.
- The three stale remote branches are deleted. Zero open issues, zero open PRs.
- Query QA loop (2026-10-11 afternoon): a 61-question exam (math, units, science, history, politics, definitions, sites, geography, people, live cards) lives in the loop's scratchpad as qa.js and runs against docs/engine.js with consent "yes". Round 3 scored 58/61 with the 3 misses in the answer key (299 792 458 m/s, Wiktionary's serendipity, Mauna Kea), so the free engine is clean on that set; round 4 is 95 questions. The exam must pace itself at 3.2s per AI question or it trips the proxy's 20/min limit and the fallbacks look broken. Round 1 scored 51/61; the misses were a stale answer key (UK PM is Andy Burnham since 20 July 2026, Nimble was right), the web app's 6s proxy timeout (fixed, 15s like native), Wikipedia list articles leaking as answers (fixed, skipped), and card shapes in the test harness. "define nimble" still picks an obscure Wiktionary sense.
- Website questions ("what's primitive.dev?") are answered from the site itself: title, meta description, h1, first paragraph, via the worker's `?site=` route on web/API and direct in Swift. Numeric entities decode.
- Samantha is an engine option on web and native (oMLX on localhost:8000, OpenAI chat shape, source label "Samantha"). Her 9B (Qwen3.5-9B-OptiQ-4bit, 6.94GB) would not load on 2026-10-11 afternoon: oMLX's memory guard (now set to aggressive in ~/.omlx/settings.json) saw only 6.2GB reclaimable while another session ran Turing's eval/hands.py. Retry when that eval is idle; never force a custom ceiling (that is how the Bonsai crash happened). She is opt-in until she passes the same exam at the free engine's score; then she becomes the default.
- The default Claude model ID is still `claude-opus-5` (stale; current is `claude-opus-5-5`). Not yet changed.

## Next, in order

0. Query QA loop: rerun qa.js, fix every real miss at the root (engine.js first, mirror in QueryEngine.swift), push, let deploy-site.yml ship docs/, redeploy worker/ with wrangler when it changes. Then start oMLX on :8000, run the same exam against Samantha, grade her, and write the score here.
1. Wait on App Review for iOS 5.0.1 and Mac 5.0.1. If either is rejected, fix the stated reason and resubmit.
2. Fix the query failures from the Oct 3 screenshots, one test each, then ship the next patch.
3. Confirm the iOS search view font and formatting, since the roadmap notes it was not checked on iOS.
4. Re-run axe on the landing page and web app after each UI change.

## Restart prompt

```
/loop /check ~/Documents/Code/nimble

Loop: Nimble. First, the manual release-build check: launch the exported release Nimble.app, drag the window, type a query (synthetic input went to the wrong app, so do it by hand or with a targeted check). Then check the App Review state of iOS and macOS 5.0.1 with asc, and resubmit with the fix if either was rejected. Then fix the query failures in roadmap.md (raw model text for "who is the president", Wikipedia articles for "who created you" and "nine plus ten"), one test each, unit tests green, push, bump the version with a timestamp-safe Mac build number. Then check the iOS search view font, and run axe on the landing page and web app. Remind Joshua to delete the three merged remote branches. Ping after each round. Stop only at zero open issues, zero stale branches, all PRs merged, and A+ on UI, UX, accessibility and language.
```

---

Loop status: live. 5.0.1 in App Review. Query QA loop running; Samantha grading next.
