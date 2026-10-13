# Nimble loop handoff (2026-10-12, evening)

## What the loop is

Ship Nimble one small slice per version, toward v10 and then v20. Each slice is built on the web first, then Swift (iPhone and Mac), then Kotlin (Android and desktop). Every slice ends the same way: tests green, push, CI green, tag, GitHub release, README and docs synced, screenshots retaken and checked by eye. The bar is A+ on every surface, plus a free AI that lasts the whole day.

## Where things stand

- Version 6.5.0, released. Since 6.0: Ask Nimble in Siri, Spotlight, Shortcuts and the Action button on iPhone (6.1.0, not yet run on a device). Private mode on the web (6.2.0), iPhone and Mac (6.3.0) and Android (6.4.0, proven in CI only). A Listen button on the web reads answers aloud (6.5.0). Related links must carry the answer's own words (6.0.2), and the What's new sheet scrolls at large text (6.0.1).
- Tests: `npm test` 298 (297 pass, 1 skipped). Swift 221 (`xcodebuild test`, 2 skipped). Kotlin `:shared:jvmTest` runs in CI only, because this Mac has no Java.
- Worker: the quota fix has been live since 17:10 PDT on 2026-10-12. Qwen answers first, and Gemma only joins for time-sensitive or number questions. Answers are cached for 6h, and a daily guard stops at 8,500 estimated neurons. `GET https://nimble-answers.trommatic.workers.dev/stats` gives the day's numbers (per data center). It counts as proven only after the 2026-10-13 17:00 PDT reset passes with no dry day. Until then, nothing is called fixed.
- Price: free. The $0.99 flip waits until the free AI is proven to last all day. Joshua runs it himself.
- QA: `-shot*` launch flags sandbox all storage. On iPhone, `-shotHistory YES` and `-shotSettings YES` open those tabs. The web uses Playwright with a static server on a fresh port. measure4 checks spacing, taps and contrast, but it misses duplicate or hidden controls, so read every shot by eye.
- roadmap.md carries another session's unstaged edit, and many of its checkboxes are stale. Read it, verify against the code, and never stage it.

## Next, in order

1. Listen on iPhone and Mac (6.6.0): a button beside Share that reads the answer with the built-in voice, Stop on a second tap or a new question, 44pt taps, VoiceOver label, and an XCTest.
2. Listen on Android (6.7.0): TextToSpeech, with CI as the proof.
3. Read /stats once per tick. After the 2026-10-13 17:00 PDT reset, report the result to Joshua.
4. Ask Nimble about this: a share extension on iPhone and Mac that answers the selected text or a link.
5. Ask Nimble as a Shortcuts action on the Mac.
6. Then the next biggest A+ gap from roadmap.md v7 to v8, checked against the code first.

## Restart prompt

```
/loop until v10-20. Nimble: ship one slice per version, web then Swift then Kotlin, toward v10 then v20. Read docs/LOOP-HANDOFF.md first and work "Next, in order" top down. No idle ticks: while CI runs, start the next slice. Each slice: npm test and `xcodebuild test -scheme Nimble -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO` green, bump version (project.yml, kmp/composeApp/build.gradle.kts versionName+versionCode, README badge, WHITEPAPER, CLAUDE.md, this file), stage explicit paths only (never roadmap.md or kmp/.kotlin), push, one-shot `gh run list` until Tests and Build native apps are green, tag, gh release. Screenshot every UI change and read it by eye before sending. Each tick: one curl of the Worker /stats; tell Joshua the quota is fixed only after the 2026-10-13 17:00 PDT reset passes. Never run the $0.99 flip, npm run exam, bulk AI calls, background CI wait loops or uv cache clean. Keep 10GB disk free. One Haiku agent at a time. Stop at 88% usage with /checkpoint. Replies: 1-2 lines.
```
