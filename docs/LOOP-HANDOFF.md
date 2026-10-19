# Nimble loop handoff (2026-10-18, evening)

## What the loop is

Ship Nimble one small slice per version, toward v10. Each slice is built on the web first, then Swift (iPhone and Mac), then Kotlin (Android and desktop). Every slice ends the same way: tests green, push, CI green, tag, GitHub release, Homebrew tap bumped, README and docs synced, screenshots retaken and checked by eye. The bar is A+ on every surface, plus a free AI that lasts the whole day.

v9 is closed by 9.4.4. The next major, 10.0.0, closes v10 and is cut the moment both store builds clear review.

## Where things stand

- Repo: 9.5.0 on main. Tags v8.0.0 through v9.4.6 exist; 9.5.0 is tagged once CI is green. 7.0.0 and 9.0.0 were skipped on purpose (a 9.0.0 tag would sit below the existing 9.1.0 build and compile the wrong version). CI is green. The Homebrew tap is current.
- Quality: the 154-question exam reads 154 of 154. The 1,049-question exam (test/exam-1000.js) reads offline 810 of 810, and the AI slice is run a rotating slice per run. Method and numbers are in docs/BENCHMARK.md.
- Store, iPhone 9.4.4 (build 202610181545) and Mac 9.4.3 (build 202610181537): both WAITING_FOR_REVIEW. The iPhone 9.4.4 build was rejected once under Guideline 5, because the China AI rule flagged the word "OpenAI" in the store metadata. Fixed 2026-10-18: China mainland removed from availability, "OpenAI" removed from the store description on iPhone and Mac, and the build resubmitted. ASC app id 6807858746.
- Price: free. Joshua decided it on 2026-10-12. The $0.99 flip waits until the Worker has all-day Groq headroom, and Joshua runs it himself.
- Worker (nimble-answers.trommatic.workers.dev): Groq answers first, then Workers AI. The Samantha tier is in the code and stays off until the SAMANTHA_URL secret is set. API keys are hand-issued through the API_KEYS secret. The grounding-prompt fix is deployed.
- Launch drafts are in docs/launch/nimble.md. Nothing is posted.
- .asc/signing-new/ holds provisioning profiles and signing files. It is gitignored. Stage by exact path anyway.
- QA probe, 2026-10-18: 114 fresh real-user questions (word math, typos, office holders, time, currency) read 105, and all nine misses are fixed in 9.4.5 (everyday word math offline, "what time is it in X", "1 euro to usd", Wikipedia's double space). The probe script lives in the session scratchpad; rebuild one from new phrasings each round rather than rerunning the old one. Round 2 (104 questions: dates, people, acronyms, small talk, more math shapes) read 95; 9.4.6 fixes float noise ("7% of 200" showed 14.000000000000002 on the web), "one hundred minus seven", "sqrt 2", the DDG swap that traded "343 m/s" for a definition, and the Worker rule that refused "hours of sleep" (deployed).
- Disk: the Mac ran out of space mid-round on 2026-10-18 (Bash cannot even start). Keep xcodebuild DerivedData in the default place and delete scratchpad build folders when done.

## Next, in order

1. Wait on Apple for both builds. Check status once per tick with `asc versions list`. Never a wait loop.
2. If either build is rejected, read the reason with `asc web review show --app 6807858746`, fix it, and resubmit. Do not resubmit unchanged.
3. When both are approved, cut 10.0.0: `scripts/bump-version.sh 10.0.0`, `npm test`, the Xcode test run, the handoff edit, push, CI green, `git tag v10.0.0`, `gh release create`, then `scripts/bump-tap.sh 10.0.0`. Then Joshua posts docs/launch/nimble.md: Show HN in the morning Pacific, Reddit that afternoon, the short post last.
4. Until then, keep the loop useful: 100+ questions and QA sweeps, fix every miss, screenshot every UI change, run the exam at most once a day, and read /stats once per tick.
5. The open work is the unchecked items in roadmap.md, in order. The Worker deploys by hand, so a push does not ship it.

Blocked on Joshua: a native-speaker check of the de, pt, hi and ja strings. A real-device walk (Siri, share sheet, VoiceOver, Android). Chrome and Firefox extension store submissions. Posting the launch drafts. Issuing API keys (`wrangler secret put API_KEYS` with the old list plus the new key). The optional SAMANTHA_URL tunnel. The $0.99 price flip.

Already in the code, so don't rebuild: answers with Why this answer, follow-ups, Tell me more (web in 9.5.0: the Worker's more:true asks one model for three sentences; Swift and Kotlin still to come, next slices), step math, multiple sources, the News, Markets and Sports cards, the offline Wikipedia pack, Private mode, Listen, the voice loop, Ask Nimble from every share sheet, Siri and Shortcuts, the public API (docs/API.md), the Homebrew tap, nine languages on every platform, the Apple Watch app, lock screen widgets, and the browser extension zip that CI builds.

## Android emulator

SDK lives on the LaCie, never the Mac disk: `/Volumes/LaCie/android-sdk` (platform-tools, emulator, android-36 google_apis arm64 image, a copy of cmdline-tools beside it, AVD `nimble36` in `avd/`). Build the APK with `cd kmp && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :composeApp:assembleDebug` (kmp/local.properties points at the Homebrew SDK, gitignored). Boot headless: `ANDROID_SDK_ROOT=/Volumes/LaCie/android-sdk ANDROID_AVD_HOME=/Volumes/LaCie/android-sdk/avd emulator -avd nimble36 -no-window -no-audio -gpu swiftshader_indirect -no-snapshot &` (about 70 s), then `adb install -r composeApp/build/outputs/apk/debug/composeApp-debug.apk`, `adb shell am start -n com.nulljosh.nimble.android/com.nulljosh.nimble.MainActivity`, `adb shell input tap X Y` / `input text "a%sb"`, `adb exec-out screencap -p > shot.png`. The screen is 1080x2400. Stop it with `adb emu kill` when done. The fish `ls` alias adds icons, so use `command ls`.

## Restart prompt

```
/loop 100+ questions and QA until a+ results. Then push, deploy and ship, and keep going until v10 (next major semvers). Strengthen the loop and docs/LOOP-HANDOFF.md. In the nimble project.
```

Then read docs/LOOP-HANDOFF.md first and work "Next, in order" top down.

## Rules that bite

- One slice per version, web then Swift then Kotlin. Gate: `npm test` and `xcodebuild test -scheme Nimble -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO` green, `scripts/bump-version.sh X.Y.Z`, handoff edit, stage explicit paths, push, `gh run list` until Tests, Build native apps and Deploy site are green, `git tag vX.Y.Z <sha>`, `git push origin vX.Y.Z`, `gh release create`, then `scripts/bump-tap.sh X.Y.Z`.
- A push on top of an unfinished CI run cancels the previous commit's Tests run (concurrency). Tag the older commit only once the newer commit is green.
- scripts/bump-version.sh also edits kmp/composeApp/build.gradle.kts. Never filter `^kmp/` out of the staged paths.
- Never stage roadmap.md, kmp/.kotlin or .asc/signing-new. Roadmap check-offs stay in the working tree until Joshua says otherwise.
- The Worker deploys by hand: `cd worker && npx wrangler deploy`. A push deploys nothing there.
- The Worker asks Groq first (secret GROQ_KEY). Never print, paste or commit a key. `wrangler secret put` reads stdin.
- Groq caps are tokens a day. One full exam costs about 110K tokens of the 600K a day across the three models, so run it at most once a day. Use `LAST=N` for a slice.
- Questions go to Groq and Cloudflare. Any change to who sees them updates the recipient string (docs/engine.js, extension/engine.js, AppState.swift, Watch/WatchAsk.swift; test/consent.test.js checks the Swift copies match the web), docs/privacy.html and CLAUDE.md together.
- Never sign Joshua up or in anywhere. He logs in, then Chrome tools can create the key. Browser tabs only inside the Claude tab group (`tabs_context_mcp` first).
- Long commands (npm test, xcodebuild, the exam, gradle) run in the background. Poll nothing and wait for the notification.
- Screenshot every UI change and read it by eye. Replies are a TLDR of 1 to 3 lines, no bullet walls.
- Re-arm ScheduleWakeup every tick. Idle ticks run hourly. Never poll. Stop at 88 percent usage with /checkpoint.
- Keep 10 GB of disk free, one Haiku agent at a time, 0 open issues that the code can close, 0 open PRs, only main.
