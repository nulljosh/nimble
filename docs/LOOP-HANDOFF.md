# Nimble loop handoff (2026-10-18, evening)

## What the loop is

Ship Nimble one small slice per version, through v10 and on up the roadmap below. Each slice is built on the web first, then Swift (iPhone and Mac), then Kotlin (Android and desktop). Every slice ends the same way: tests green, push, CI green, tag, GitHub release, Homebrew tap bumped, README and docs synced, screenshots retaken and checked by eye. The bar is A+ on every surface, plus a free AI that lasts the whole day.

v9 is closed by 9.4.4. The next major, 10.0.0, closes v10 and is cut the moment both store builds clear review. After that, every major has an exit test ("Roadmap past v10"): its minors ship one slice at a time, and the X.0.0 tag is cut the day the exit test passes, never on a feeling that the work is done.

## Each tick

1. `asc versions list --app 6807858746`: a rejection jumps the queue.
2. `gh run list --limit 3`: a red run on main jumps the queue.
3. `curl -s https://nimble-answers.trommatic.workers.dev/stats`: decides whether a live probe round may run.
4. `df -h /System/Volumes/Data`: under 10 GB free, run /cleanup before any build.
5. Then the next item in "Next, in order", then the current major's next slice.

## Where things stand

- Repo: 9.10.0 on main. Tags v8.0.0 through v9.10.0 exist. There is no 7.0.0: v7's work shipped as 6.25 to 6.37 and the 7.0.0 cut waited on a clean exam until v8 was done too. 9.0.0 was skipped on purpose (a 9.0.0 tag would sit below the existing 9.1.0 build and compile the wrong version). CI is green. The Homebrew tap is current.
- Quality: the 154-question exam reads 154 of 154. The 1,049-question exam (test/exam-1000.js) reads offline 810 of 810, and the AI slice is run a rotating slice per run. Method and numbers are in docs/BENCHMARK.md.
- Store, iPhone 9.4.4 (build 202610181545) and Mac 9.4.3 (build 202610181537): both WAITING_FOR_REVIEW. The iPhone 9.4.4 build was rejected once under Guideline 5, because the China AI rule flagged the word "OpenAI" in the store metadata. Fixed 2026-10-18: China mainland removed from availability, "OpenAI" removed from the store description on iPhone and Mac, and the build resubmitted. ASC app id 6807858746.
- Price: free. Joshua decided it on 2026-10-12. The $0.99 flip waits until the Worker has all-day Groq headroom, and Joshua runs it himself.
- Worker (nimble-answers.trommatic.workers.dev): Groq answers first, then Workers AI. The Samantha tier is in the code and stays off until the SAMANTHA_URL secret is set. API keys are hand-issued through the API_KEYS secret. The grounding-prompt fix is deployed.
- Launch drafts are in docs/launch/nimble.md. Joshua's X thread is up. The r/SideProject post went up but Reddit's spam filter hid it (the account has karma 2), and a modmail asking the mods to approve it is sent. Product Hunt launched on 2026-10-13. Show HN waits until the account has karma.
- .asc/signing-new/ holds provisioning profiles and signing files. It is gitignored. Stage by exact path anyway.
- QA probe, 2026-10-18: 114 fresh real-user questions (word math, typos, office holders, time, currency) read 105, and all nine misses are fixed in 9.4.5 (everyday word math offline, "what time is it in X", "1 euro to usd", Wikipedia's double space). The probe script lives in the session scratchpad; rebuild one from new phrasings each round rather than rerunning the old one. Round 2 (104 questions: dates, people, acronyms, small talk, more math shapes) read 95; 9.4.6 fixes float noise ("7% of 200" showed 14.000000000000002 on the web), "one hundred minus seven", "sqrt 2", the DDG swap that traded "343 m/s" for a definition, and the Worker rule that refused "hours of sleep" (deployed).
- Round 3 (103 questions: comparisons, yes/no, how-to, translation, live cards in other words) read 86 and found stock cards dead on every platform: Stooq walled its CSV behind a bot check. 9.7.0 moves quotes to the Worker's GET ?quote= (Yahoo's chart API with a browser user agent, names like "apple" looked up to AAPL, cached 60 s) for web, Swift and Kotlin. It also found a lone model naming F.W. de Klerk as South Africa's first president, so firsts and lasts now get the second model. "first president of south africa" answered P. W. Botha because the context trimmer dropped the President page's undated "The first president ... was Nelson Mandela"; since 2026-10-18 (Worker, PROMPT_V 4) a first or last question keeps every sentence saying first or last (test/worker-ordinal.test.mjs). Live: "Nelson Mandela." with his photo. Round 4 (95 questions: science, health, money, coding, 2025-26, Canada and BC, false premises) read 83. Fixed in the Worker for 9.7.1: "who created c" found The Who (a subject of a letter or two now gets no reference), "the 50th president" was Donald Trump (false premises are now called out), constants came back as definitions (value with unit now). The cache key carries PROMPT_V: bump it whenever the prompt changes. Fixed in 9.10.0: the gravitational constant (eight physical constants answer offline from a NIST table on every platform; test/constants.test.js and its Swift and Kotlin mirrors). Still open: "how much vitamin d per day" and "inflation rate in canada" come back UNKNOWN, "minimum wage in bc" lands on an unrelated Wikipedia page.
- The offline Wikipedia pack (docs/pack) rebuilds itself on the 3rd of each month (.github/workflows/offline-pack.yml), commits, and asks Deploy site to run. If a month's run times out, the pack is left as it was. The site's /api and /mcp tools are documented in docs/API.md.
- Look: 2026-10-18 Apple pass. The landing and web app (docs/tokens.css overrides the shared cream) are white and true black, system font, 48px capsules, cards 28, photos and code 20. 9.9.0 brings the same palette to Swift (Sources/Views/Tokens.swift) and Kotlin (Theme.kt). The native apps keep Nimble Sans: a missing-font fallback to the system face drops the weight (tested with ImageRenderer on macOS), so switching needs real `.system` calls with Dynamic Type kept, checked on an iPhone.
- Disk: the Mac ran out of space mid-round on 2026-10-18 (Bash cannot even start). Keep xcodebuild DerivedData in the default place and delete scratchpad build folders when done. On 2026-10-18 the iOS 26.5 simulator runtime was deleted to get back to 21 GB free. Re-download it (`xcodebuild -downloadPlatform iOS`, about 8 GB) only with 20 GB of headroom.

## Next, in order

1. Wait on Apple for both builds. Check status once per tick with `asc versions list`. Never a wait loop.
2. If either build is rejected, read the reason with `asc web review show --app 6807858746`, fix it, and resubmit. Do not resubmit unchanged.
3. When both are approved, cut 10.0.0: `scripts/bump-version.sh 10.0.0`, `npm test`, the Xcode test run, the handoff edit, push, CI green, `git tag v10.0.0`, `gh release create`, then `scripts/bump-tap.sh 10.0.0`. Then Joshua posts the rest of docs/launch/nimble.md (the X thread and Product Hunt are already up; Show HN waits for karma).
4. Until then, keep the loop useful: 100+ questions and QA sweeps, fix every miss, screenshot every UI change, run the exam at most once a day, and read /stats once per tick.
5. After 10.0.0, work the roadmap below, one major at a time. roadmap.md holds older unchecked items (some already shipped, like the monthly pack and the /mcp docs); fold each into the major it belongs to as you reach it. The Worker deploys by hand, so a push does not ship it.

Blocked on Joshua: a native-speaker check of the de, pt, hi and ja strings. A real-device walk (Siri, share sheet, VoiceOver, Android). Chrome and Firefox extension store submissions. Posting the rest of the launch drafts, and the Reddit modmail follow-up. Issuing API keys (`wrangler secret put API_KEYS` with the old list plus the new key). The optional SAMANTHA_URL tunnel. The $0.99 price flip.

Already in the code, so don't rebuild: answers with Why this answer, follow-ups (Android, Windows and Linux too since 9.8.0: kmp Turns.kt), Tell me more on every platform (9.5.0 web, 9.6.0 Swift and Kotlin: the Worker's more:true asks one model for three sentences; never on a site's own page, which the AI does not know), "from primitive.dev" for a site answer instead of "powered by", step math, multiple sources, the News, Markets and Sports cards, the offline Wikipedia pack, Private mode, Listen, the voice loop, Ask Nimble from every share sheet, Siri and Shortcuts, the public API (docs/API.md), the Homebrew tap, nine languages on every platform, the Apple Watch app, lock screen widgets, and the browser extension zip that CI builds.

## Roadmap past v10

Directions, not dates. Each major's minors are slices; the exit test cuts the X.0.0.

- **v11 Native type.** The apps drop Nimble Sans for the system face with Dynamic Type kept (real `.system` sizes scaled per text style, not a missing-font fallback), plus the square and story share cards. Exit: iPhone, Mac and Android screenshots read as Apple and Android apps, checked on a real iPhone at the largest text size.
- **v12 Right answers.** Every open probe miss fixed with a pinned test: "first <office> of <place>" (fixed 2026-10-18), constants answer with the number (9.10.0), health and statistics questions ("vitamin d per day", "inflation in canada") ground on a source instead of UNKNOWN, local questions ("minimum wage in bc") find the right page. Exit: the 1,049-question exam at 99 percent, and four fresh probe rounds of 100 at 97 or better.
- **v13 Simple settings.** Joshua's 2026-10-16 asks: no AI engine picker (Nimble picks Samantha, then Groq, then Workers AI, then Wikipedia), the nav bar at the bottom with Settings as a tab, copy beside the field, What's New padded. Exit: Settings has no API words in it on any platform.
- **v14 Sources you can trust.** Site answers show the favicon and page name, JS-only pages fall back to og:description, every answer quotes the sentence it rests on. Exit: every probe answer links a source a person can check in one tap.
- **v15 On device.** Apple Foundation Models where the device has them, a small local model elsewhere, graded on the exam; the offline pack grows past 9,000 articles. Exit: 90 percent of the 154-question exam with the network off.
- **v16 Our own model.** Samantha (the Turing pipeline's model) answers first when she clears 95 percent standalone; Groq becomes the fallback. Exit: Samantha is the default on the Mac without oMLX running.
- **v17 More live cards.** Free public data only: sunrise and sunset, holidays, earthquakes, flight status if a free source holds up, nutrition. Exit: each card has a probe row and a stubbed screenshot.
- **v18 Hands free.** Voice in and out on every platform, the Watch answers by voice alone, Android app actions. Exit: ten spoken questions answered with no touch on iPhone, Watch and Android.
- **v19 Fast and steady.** p50 under 2 s and p95 under 6 s on the free engine, every upstream tested down (Wikipedia, DDG, Groq, Workers AI), a public status line. Exit: a week of /stats inside both numbers.
- **v20 Pays for itself.** Joshua's calls: the $0.99 store price, a paid API key tier through Stripe, twenty languages checked by native speakers. Exit: the Worker's real costs covered by its revenue, or a recorded decision to stay free.
- **v21 to v30, a platform.** The extension in the Chrome and Firefox stores, Raycast and Alfred plugins, an SDK, and the labs apps asking Nimble through its API.
- **v31 to v50, its own knowledge.** Offline packs per language and 100,000 articles, a private on-device index of your own notes and files, the on-device model at 95 percent with no network.
- **v51 to v100, the answer bar of a computer.** Nimble as Joshua Tree's system answer bar and on the Pi appliance offline, every language Wikipedia has, a 10,000-question exam at 99 percent.

## Android emulator

SDK lives on the LaCie, never the Mac disk: `/Volumes/LaCie/android-sdk` (platform-tools, emulator, android-36 google_apis arm64 image, a copy of cmdline-tools beside it, AVD `nimble36` in `avd/`). Build the APK with `cd kmp && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :composeApp:assembleDebug` (kmp/local.properties points at the Homebrew SDK, gitignored). Boot headless: `ANDROID_SDK_ROOT=/Volumes/LaCie/android-sdk ANDROID_AVD_HOME=/Volumes/LaCie/android-sdk/avd emulator -avd nimble36 -no-window -no-audio -gpu swiftshader_indirect -no-snapshot &` (about 70 s), then `adb install -r composeApp/build/outputs/apk/debug/composeApp-debug.apk`, `adb shell am start -n com.nulljosh.nimble.android/com.nulljosh.nimble.MainActivity`, `adb shell input tap X Y` / `input text "a%sb"`, `adb exec-out screencap -p > shot.png`. The screen is 1080x2400. Stop it with `adb emu kill` when done. The fish `ls` alias adds icons, so use `command ls`.

## Restart prompt

```
/loop 100+ questions and QA until a+ results. Then push, deploy and ship, and keep going until v10, then up the roadmap (v11, v12 and on; each major cut when its exit test passes). Strengthen the loop and docs/LOOP-HANDOFF.md. In the nimble project.
```

Then read docs/LOOP-HANDOFF.md first, run "Each tick", and work "Next, in order" top down.

## Rules that bite

- One slice per version, web then Swift then Kotlin. Gate: `npm test` and `xcodebuild test -scheme Nimble -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO` green, `scripts/bump-version.sh X.Y.Z`, handoff edit, stage explicit paths, push, `gh run list` until Tests, Build native apps and Deploy site are green, `git tag vX.Y.Z <sha>`, `git push origin vX.Y.Z`, `gh release create`, then `scripts/bump-tap.sh X.Y.Z`.
- A push on top of an unfinished CI run cancels the previous commit's Tests run (concurrency). Tag the older commit only once the newer commit is green.
- scripts/bump-version.sh also edits kmp/composeApp/build.gradle.kts. Never filter `^kmp/` out of the staged paths.
- Never stage roadmap.md, kmp/.kotlin or .asc/signing-new. Roadmap check-offs stay in the working tree until Joshua says otherwise.
- The Worker deploys by hand: `cd worker && npx wrangler deploy`. A push deploys nothing there.
- The Worker asks Groq first (secret GROQ_KEY). Never print, paste or commit a key. `wrangler secret put` reads stdin.
- Read /stats before every live probe round and skip the round when estNeurons is over 6,000 or groqRefused is over a quarter of groqCalls: four rounds on 2026-10-18 took the day to 7,200 neurons and 44% refused, which is the free AI real people need. The day is UTC, so it resets at 17:00 Pacific.
- Groq caps are tokens a day. One full exam costs about 110K tokens of the 600K a day across the three models, so run it at most once a day. Use `LAST=N` for a slice.
- Questions go to Groq and Cloudflare. Any change to who sees them updates the recipient string (docs/engine.js, extension/engine.js, AppState.swift, Watch/WatchAsk.swift; test/consent.test.js checks the Swift copies match the web), docs/privacy.html and CLAUDE.md together.
- Never sign Joshua up or in anywhere. He logs in, then Chrome tools can create the key. Browser tabs only inside the Claude tab group (`tabs_context_mcp` first).
- Long commands (npm test, xcodebuild, the exam, gradle) run in the background. Poll nothing and wait for the notification.
- Screenshot every UI change and read it by eye. Replies are a TLDR of 1 to 3 lines, no bullet walls.
- Re-arm ScheduleWakeup every tick. Idle ticks run hourly. Never poll. Stop at 88 percent usage with /checkpoint.
- Posting is Joshua's call, per post, with a plain yes. Safari takes AppleScript `do JavaScript` (Reddit and X are logged in there); a direct API send gets blocked, so fill the form and click, then confirm it landed (Reddit's modmail shows as a chat room, not in /message/sent).
- Keep 10 GB of disk free (20 GB before a heavy build), one Haiku agent at a time, 0 open issues that the code can close, 0 open PRs, only main.
