# Nimble loop handoff (2026-10-12, night)

## What the loop is

Ship Nimble one small slice per version, toward v10 and then v20. Each slice is built on the web first, then Swift (iPhone and Mac), then Kotlin (Android and desktop). Every slice ends the same way: tests green, push, CI green, tag, GitHub release, README and docs synced, screenshots retaken and checked by eye. The bar is A+ on every surface, plus a free AI that lasts the whole day.

## Where things stand

- Version 6.15.0: the privacy page now explains the three modes (free cloud, your own key, Private), every outside service, what the Worker briefly keeps and iCloud history sync. 6.14.0: voice loop on every platform, a question asked by voice gets its answer read back (web tested headless with a fake mic and voice, Swift unit-tested, Android CI-only). 6.13.0: Mac answers get Copy beside Listen and Share (the bottom-bar copy glyph is gone), and Share lost its grey bezel. 6.12.0: the installed web app shows in the share sheet (manifest share_target to /app?q=, a link as url) and web answers get Copy beside Listen and Share. 6.11.0: Android shows Nimble in the share sheet; shared text is asked on arrival (CI-proven only). 6.10.0: Ask Nimble in Shortcuts and Spotlight on the Mac (the shared AskNimbleIntent hands the question to AskService; compiled and unit-tested, not yet run from the Shortcuts app). 6.9.0: Ask Nimble on the Mac from the Services menu on any selected text, and nimble://ask?q= links (link proven live; the Services menu not yet clicked through). 6.8.0: Ask Nimble in the iPhone share sheet (NimbleShare extension parks the text in the app group; the app asks it on open; the extension UI itself not yet run through a real share sheet). 6.7.1: the What's new sheet measures itself again, so the button never hides. 6.7.0: Listen on Android (TextToSpeech, CI-proven only). 6.6.0: Listen on iPhone and Mac (system voice, Stop on a second tap or when the card goes away). Since 6.0: Ask Nimble in Siri, Spotlight, Shortcuts and the Action button on iPhone (6.1.0, not yet run on a device). Private mode on the web (6.2.0), iPhone and Mac (6.3.0) and Android (6.4.0, proven in CI only). A Listen button on the web reads answers aloud (6.5.0). Related links must carry the answer's own words (6.0.2), and the What's new sheet scrolls at large text (6.0.1).
- Tests: `npm test` 298 (297 pass, 1 skipped). Swift 227 (`xcodebuild test`, 2 skipped). Kotlin `:shared:jvmTest` runs in CI only, because this Mac has no Java.
- Worker: the quota fix has been live since 17:10 PDT on 2026-10-12. Qwen answers first, and Gemma only joins for time-sensitive or number questions. Answers are cached for 6h, and a daily guard stops at 8,500 estimated neurons. `GET https://nimble-answers.trommatic.workers.dev/stats` gives the day's numbers (per data center). It counts as proven only after the 2026-10-13 17:00 PDT reset passes with no dry day. Until then, nothing is called fixed.
- Price: free. The $0.99 flip waits until the free AI is proven to last all day. Joshua runs it himself.
- QA: `-shot*` launch flags sandbox all storage. On iPhone, `-shotHistory YES` and `-shotSettings YES` open those tabs. The web uses Playwright with a static server on a fresh port. measure4 checks spacing, taps and contrast, but it misses duplicate or hidden controls, so read every shot by eye.
- roadmap.md carries another session's unstaged edit, and many of its checkboxes are stale. Read it, verify against the code, and never stage it.

## Next, in order

1. Read /stats once per tick. After the 2026-10-13 17:00 PDT reset, report the result to Joshua.
3. Then v9: the `nimble "question"` command is in bin/nimble.js; package it for brew (needs a tap repo and a release tarball). The extension is in extension/; submit it to the Chrome and Firefox stores.

Already in the code, so don't rebuild: Why this answer, follow-ups, step math, multiple sources, the News, Markets and Sports cards, the offline pack, Private mode, Listen, the voice loop, Ask Nimble from every platform's share sheet, Siri and Shortcuts.

## Restart prompt

```
/loop until v10-20. Nimble: ship one slice per version, web then Swift then Kotlin, toward v10 then v20. Read docs/LOOP-HANDOFF.md first and work "Next, in order" top down. Re-arm ScheduleWakeup every tick and update this file's Next list as items ship. No idle ticks: while CI runs, start the next slice. Each slice: npm test and `xcodebuild test -scheme Nimble -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO` green, bump version (project.yml, kmp/composeApp/build.gradle.kts versionName+versionCode, README badge, WHITEPAPER, CLAUDE.md, this file), stage explicit paths only (never roadmap.md or kmp/.kotlin), push, one-shot `gh run list` until Tests and Build native apps are green, tag, gh release. Screenshot every UI change and read it by eye before sending. Each tick: one curl of the Worker /stats; tell Joshua the quota is fixed only after the 2026-10-13 17:00 PDT reset passes. Never run the $0.99 flip, npm run exam, bulk AI calls, background CI wait loops or uv cache clean. Keep 10GB disk free. One Haiku agent at a time. Stop at 88% usage with /checkpoint. Replies: 1-2 lines.
```
