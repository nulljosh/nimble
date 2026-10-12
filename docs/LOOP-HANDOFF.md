# Nimble loop handoff (2026-10-11, 22:00)

## What the loop is

Keep Nimble moving with one small, shippable slice at a time: fix what App Review or Joshua's phone turns up, ship each as a patch with tests green, and close every release with a tag, a GitHub release (notarized Mac zip, msi, apk), synced landing and docs, fresh screenshots and What's New. Joshua's standing goal: zero open issues, zero stale branches, all PRs merged, and UI, UX, accessibility and language at A+. The loop runs until that bar is met, not until a version number.

## Where things stand

- Version 5.13.2 is on main and pushed. Spacing runs on one 4px scale in tokens.css with a gutter token; links, buttons and fields reach 44px tall.
- Version 5.13.3: dark and light QA on all three pages at 390 and 1440, zero text under 4.5:1 in either scheme; brand captions moved to --text-mid and the brand cards got a hairline. Photo card and source row checked on live queries; Why this answer only shows when the source text says more than the sentence, so it did not fire on the four queries tried.
- Version 5.13.4: an AI answer with no proxy photo now takes the picture of the Wikipedia topic its sentence names ("Paris" for capital of France), with the page title as credit and that page's text under the source line. Math, units, weather and time never look. Photosynthesis has no photo on purpose: its lead image is an SVG diagram, and SVGs are skipped. Swift and Kotlin parity not done.
- Brand kit lives at nimble.jaybulb.com/brand (logo, icon, Flit and Fen, live tokens, type, voice, downloads). The brand/ folder at the repo root holds the icon, wordmark, mascots and the GitHub social image; the social image and link preview show the real app icon.
- Nimble Sans is the app's own typeface, derived from Inter 4.1 under OFL 1.1. Type is swept across web, iOS and Mac.
- Rich results on every surface: answer photos (16:9, top-cropped) on web, Swift, Mac and Kotlin; a news card with thumbnails; up to three source links under an answer.
- The landing page is built only from tokens (zero hex outside tokens.css). The demo is scripted: it opens on "who wrote Hamlet" with a local Hamlet photo, then steps through news and weather.
- Domain stays nimble.jaybulb.com. Do not move it.
- Apple: iPhone 5.4.0 is WAITING_FOR_REVIEW (build 202610111645). Mac 5.0.1 is IN_REVIEW. Mac 5.4.0 and later go in after it clears.
- The $0.99 price flip happens at the next store release (asc pricing, apple-pricing skill). Web stays free with the $1 unlock.
- Samantha (local Qwen on oMLX) is opt-in and not the public default. She scored 89/95 on the exam under load. The free engine scores 95/95.
- roadmap.md has another session's unstaged edit. Check-offs and prune wait until that lands; do not stage it from the loop.

## Next, in order

1. Keep the App Review pair moving: if iPhone 5.4.0 or Mac 5.0.1 is rejected, fix the stated reason and resubmit. When Mac 5.0.1 clears, ship Mac 5.4.0 with the store text and screenshots.
2. Flip the price to $0.99 with the next store release, and update MONEY.md and the landing the same day.
3. Check off the shipped items in roadmap.md once its unstaged edit is committed: Samantha picker, favicon and page title, Why this answer, Show steps, news card, multiple sources.
4. Grade the rich results and brand kit at A+ on a phone and a Mac: photo crops, thumbnails, tap targets, dark mode. Rasterise the deployed landing and brand page before calling them done.
5. Next features from the v10 list: markets card, sports card, freshness label, follow-ups, tap-to-expand, then the offline Wikipedia pack.

## Restart prompt

```
/loop /check ~/Documents/Code/nimble

Loop: Nimble, until A+. Read docs/LOOP-HANDOFF.md and roadmap.md first. Check App Review for iPhone 5.4.0 and Mac 5.0.1 with asc; resubmit with the fix if either was rejected. Then take the next single slice from "Next, in order": one patch, tests green, tag, GitHub release, landing and docs synced, screenshots retaken and reviewed. Do not touch roadmap.md unless its unstaged edit has been committed. Stage explicit paths only. Ping after each round. Stop only at zero open issues, zero stale branches, all PRs merged, and A+ on UI, UX, accessibility and language.
```
