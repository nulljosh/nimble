# Nimble loop handoff (2026-10-12)

## What the loop is

Keep Nimble moving with one small, shippable slice at a time: fix what App Review or Joshua's phone turns up, ship each as a patch with tests green, and close every release with a tag, a GitHub release (notarized Mac zip, msi, apk), synced landing and docs, fresh screenshots and What's New. Joshua's standing goal: zero open issues, zero stale branches, all PRs merged, and UI, UX, accessibility and language at A+. The loop runs until that bar is met, not until a version number.

## Where things stand

- Version 5.14.1 (was 5.14.0): web surfaces (landing, app, brand kit) pass the UI constraint measure at 390, 768 and 1440 in light and dark, zero violations: spacing, 44px targets, type scale, AA contrast, gutters, 4px line heights.
- Version 5.14.0 (was 5.13.13): footer Why toggle, source links and resting note now meet 44pt taps and AA contrast on iPhone. Current state, not history: answers carry a photo when the picture belongs to the entity the answer names, credited "<Title> · Wikipedia" on web, Swift, Mac and Kotlin; the Why text opens on the Wikipedia page behind any answer that has none of its own; the proxy returns `topic`, `topicUrl` and `aiError`.
- When the free AI fails (quota or outage), the Worker says why in `aiError` and the app shows "The free AI is resting, showing Wikipedia." Joshua declined the $5 paid plan: Workers AI stays on the free tier, 10,000 neurons a day.
- Do not run the 95-question exam in a loop. Repeated exam runs used up the day's free quota on 2026-10-12. The quota note lives in memory (feedback_nimble_worker_neuron_quota.md).
- Brand kit at nimble.jaybulb.com/brand. The brand/ folder at the repo root holds the icon, wordmark, mascots and social image. Domain stays nimble.jaybulb.com.
- Nimble Sans is the app's own typeface, derived from Inter 4.1 under OFL 1.1. Spacing runs on one 4px scale in tokens.css; text pairs meet 4.5:1 in light and dark.
- The landing page is built only from tokens. Its demo is scripted and opens on "who wrote Hamlet".
- Apple: iPhone 5.4.0 is IN_REVIEW (build 202610111645). Mac 5.0.1 is IN_REVIEW. Mac 5.4.0 and 5.5+ submissions wait for these to clear.
- The $0.99 price flip rides the next store release (asc pricing, apple-pricing skill). Web stays free with the $1 unlock.
- Samantha (local Qwen on oMLX) is opt-in, not the public default. She scored 89/95 under load; the free engine scores 95/95.
- roadmap.md has another session's unstaged edit. Check-offs and prune wait until that lands; do not stage it from the loop.

## Next, in order

1. Watch the App Review pair: iPhone 5.4.0 and Mac 5.0.1 are both IN_REVIEW. If either is rejected, fix the stated reason and resubmit. When they clear, submit 5.5 and up with the store text and screenshots.
2. Flip the price to $0.99 with the next store release, and update MONEY.md and the landing the same day.
3. Check off the shipped items in roadmap.md once its unstaged edit is committed: Samantha picker, favicon and page title, Why this answer, Show steps, news card, multiple sources.
4. Grade the rich results and brand kit at A+ on a phone and a Mac: photo crops, thumbnails, tap targets, dark mode. Rasterise the deployed landing and brand page before calling them done.
5. Next features from the v10 list: markets card, sports card, freshness label, follow-ups, tap-to-expand, then the offline Wikipedia pack.

## Restart prompt

```
/loop /check ~/Documents/Code/nimble

Loop: Nimble, until A+. Read docs/LOOP-HANDOFF.md and roadmap.md first. Check App Review for iPhone 5.4.0 and Mac 5.0.1 with asc; resubmit with the fix if either was rejected. Then take the next single slice from "Next, in order": one patch, tests green, tag, GitHub release, landing and docs synced, screenshots retaken and reviewed. Do not touch roadmap.md unless its unstaged edit has been committed. Stage explicit paths only. Ping after each round. Stop only at zero open issues, zero stale branches, all PRs merged, and A+ on UI, UX, accessibility and language.
```
