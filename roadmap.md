# Nimble roadmap

> Priority tier 2 (2026-10-17): ship push, this week. Order: live blockers, ship pushes, active features, portfolio, exploratory. See ~/Documents/Code/LOOP-HANDOFF.md.

## Loop to v10 (from 5.1.0, 2026-10-11, one subagent at a time)

Each line is one shippable slice: tests green, push, minor or patch bump (SemVer: fixes
are patches, features are minors, a major closes a theme). A major closes when every slice
under it is checked: tag, GitHub release (notarized Mac zip, msi, apk), landing + README +
whitepaper + screenshots synced, What's New, ASC submit if a session is live. The loop's
yardstick is the question exam (scratchpad qa.js, moved into the repo at 5.2): every round
must hold 100% on the free engine before a slice counts as shipped. Model tags route the
subagent: [Haiku] mechanical or UI, [Sonnet] engine work, [Opus] design calls.

Rules: usage line at or above 88% on any window means /checkpoint and stop. One subagent at a
time, 10 minute cap. Mac zip is re-notarized only at majors. `native-v*` tags are Joshua's to
force-push. Free or $1 only, no new paid tiers. No em dashes, no emojis, no purple/teal.

### v5.5 Premium (Joshua, 2026-10-11: domain now, premium features, then $1 on the App Store)

- [x] [Sonnet] Price flip at the 5.5 release: iPhone and Mac go to Apple price tier 1 ($0.99) via `asc pricing` (apple-pricing skill), web stays free with the $1 Stripe unlock; MONEY.md and the landing updated the same day. Done 2026-10-18: $0.99 on the store, web free with no Stripe unlock, license now Apache 2.0.

### v8 Private and on-device

- [ ] [Opus] Pick the on-device model (Apple Foundation Models where available, otherwise a small MLX/GGUF), grade it on the exam, and ship it only if it clears 90%. 2026-10-18: Apple Foundation Models scored 87% alone (113 of 130, stale office holders and shy UNKNOWNs; BENCHMARK.md). It stays the offline fallback. A raw Wikipedia reference made it worse (75%), so it stays bare.
- [ ] [Sonnet] Samantha promoted: if the 9B or a distilled model clears 95% on the exam standalone, she ships as the Mac default without needing oMLX running.

### v9 Everywhere

- [ ] [Sonnet] Windows, Android and Linux reach exam parity with iOS and Mac (same 95 questions, same pass bar).
- [ ] [Haiku] Languages: answers and UI in the five shipped languages, then ten more, checked against the exam translated. 2026-10-18: UI now in 15 (added Italian, Korean, Russian, Dutch, Turkish, Polish on web, Apple and Kotlin); the translated exam is still to do.

### v10 A+

Joshua's v10 direction (2026-10-11): the whole app goes premium. Decide between a paid app on the
App Store ($1, the house rule) or a $1 one-time unlock, with offline mode as the headline premium
feature and a real domain (getnimbleapp.com or nimbleapp.com; buy via /buy-domain when the name is
settled). Web stays free with the $1 unlock through Stripe. Decide pricing shape at v8 (private
mode is the premium feature), buy the domain at v9, flip the switch at v10.

- [ ] [Haiku] Full accessibility audit (axe, VoiceOver, Dynamic Type, reduced motion, contrast) at zero violations on all surfaces.
- [ ] [Haiku] Landing, README, whitepaper and screenshots rebuilt for 10.0 with the new look and the benchmark.
- [ ] [Opus] 10.0 launch: Product Hunt, HN (when the account allows), release notes, and the What's New that explains what a decade of versions bought you in one screen.

## Loop to v100 (from 9.10, 2026-10-18)

Same rules as the loop to v10: one slice per tick, tests green, exam at 100% on the free engine before a
slice counts, minors for features, patches for fixes, a major closes a band. Free or $1 only. Each band
has a theme; its last slice is the major's release (tag, notes, landing, README, What's New).

### v11-v20 Trust: every answer shows why

- [x] [Sonnet] Every AI answer carries the sentence it rests on ("Why this answer") on all surfaces, not just web. Checked 2026-10-18: web (details.why), Apple (ResultView whyText) and Compose (WhyThisAnswer) all show it.
- [ ] [Sonnet] The exam grows to 1,000 questions (the 1,000-question bank in BENCHMARK.md) and holds 99% on the free engine.
- [x] [Sonnet] A nightly exam in CI posts the score to /stats; a drop of two points opens a roadmap line by itself. Done 2026-10-18 as weekly, not nightly (nightly runs ate the free Workers AI quota): exam.yml posts the 154-question score to POST /exam (secret NIMBLE_REPORTS_KEY) and /stats shows it; any miss already opens the exam issue.
- [x] [Haiku] "This is wrong" on an answer sends the question (text only) to a review list; the exam adopts each one. Web and Worker done 2026-10-18 (POST /report into the NimbleCounts Durable Object, last 200; GET /report with the key from .env as a Bearer header). Apple and Compose shipped the same day. Adopting reports into the exam is by hand: read GET /report and add each real miss to test/exam.js.
- [x] [Sonnet] Freshness: every live answer says when it was checked; anything older than its TTL refetches. Done 2026-10-18: every live card already shows "as of"; coming back to the app (tab visible, scene active, Mac activate, Android resume) asks a live answer older than ten minutes again. Daily values (a rate's day) are skipped.

### v21-v30 Live: the numbers people check every day

- [ ] [Sonnet] Canada and BC live figures: CPI, policy rate, minimum wage by province (StatCan / Bank of Canada). CPI and the policy rate answer from Bank of Canada Valet since 2026-10-18 (canadaFigure); minimum wage still comes from the models.
- [ ] [Haiku] Sports scores beyond ESPN's top leagues: NHL, MLS, CFL, with the next game when none is live. 2026-10-18: NHL and MLS already answer on every platform. CFL has no live feed (ESPN's CFL scoreboard is frozen at the 2022 season), so it waits for another free source. Next game shipped 2026-10-18 on web, Apple and Kotlin: after a Final, the team's next game from its ESPN page is a second row.

### v31-v40 Offline: most questions need no network

- [ ] [Sonnet] The offline pack grows from 9,000 to 50,000 articles under 15 MB, delta updates monthly.
- [ ] [Opus] The on-device model (v8) answers from the pack with no network and clears 90% of the exam offline.
- [ ] [Sonnet] Offline exam: a second score in BENCHMARK.md, airplane mode, every platform. Web 2026-10-19: 49 of 154 offline, and the pack's wrong answers cut from 49 to 12 (BENCHMARK.md). Apple and Kotlin packs got the same rule the same night; their offline exam runs are still to do.
- [ ] [Haiku] Packs by topic (science, history, geography) so a phone can carry what it needs.

### v41-v50 Follow-ups: a short conversation, kept on the device

- [ ] [Sonnet] Follow-ups ("and in celsius?", "who was before him?") on iOS, Mac and Kotlin, matching the web.
- [ ] [Sonnet] Compare: "paris vs london population" answers as a two-row card. 2026-10-18: answers on every platform from the Worker, as a sentence ("Paris: 2.1 million (2023). London: 8.9 million (2023)."), from Wikidata with no model. The two-row card layout is still open.
- [ ] [Sonnet] Math shows its steps for algebra and calculus, offline.
- [ ] [Haiku] Graphs: pinch, pan and trace a point on every surface.

### v51-v60 Everywhere: Nimble wherever a question starts

- [ ] [Sonnet] App Intents and Shortcuts: "Ask Nimble" from Siri, Spotlight and the Action button.
- [ ] [Sonnet] Widgets: a home screen ask box and a "question of the day".
- [ ] [Sonnet] Apple Watch answers by voice with the same exam score as the phone.
- [ ] [Haiku] Raycast and Alfred extensions over the public API.
- [ ] [Haiku] Linux packages (deb, rpm, flatpak) from the KMP desktop build.

### v61-v70 Voice: ask and hear it, hands free

- [ ] [Sonnet] Spoken answers in the device's voice on every surface, one tap to listen (web done).
- [ ] [Sonnet] Hands-free mode on Mac and iPhone: hold a key or the Action button, ask, hear the answer.
- [ ] [Opus] Samantha's own voice as an option on the Mac, local, no network.

### v71-v80 Developers: the engine as a service

- [ ] [Sonnet] Self-serve API keys with a free tier and the $1 unlock, issued and revoked from a page.
- [ ] [Haiku] SDKs: a tiny JS and Python client, each one file, tested against the live API.
- [ ] [Haiku] A public status page from /stats: uptime, latency, exam score.
- [ ] [Sonnet] MCP server listed in the public registries with the four tools.

### v81-v90 Every language, every person

- [ ] [Sonnet] The exam translated into all 15 UI languages, each at 95%.
- [ ] [Sonnet] Right-to-left: Arabic and Hebrew UI, then answers.
- [ ] [Haiku] 30 UI languages.
- [ ] [Haiku] Accessibility at WCAG AAA on web; VoiceOver and TalkBack walkthroughs recorded each release.

### v91-v99 Craft: fast, small, never crashes

- [ ] [Sonnet] p95 under 1 s on the free engine, cache hit rate above 50%. 2026-10-19: a cached answer went from 0.18 s to 0.10 s median (the counts and cache writes now finish after the response, the cache read runs beside the counts load); the photo search starts with the AI call on every platform (up to 0.7 s off); the cache key folds "what's" and a trailing "?". Live Groq p95 1.5 s; not there yet.
- [ ] [Haiku] Size budgets enforced in CI: web under 300 KB first load, iOS under 15 MB, Mac under 20 MB. Web done 2026-10-18: test/size-budget.test.js (runs in CI) holds app.html plus its direct files under 300 KB gzipped; it reads 127 KB after the header icon went from a 16-bit 665 KB PNG to a 3.7 KB one. Measured 2026-10-19 from Release builds: Mac 7.2 MB, iPhone 13 MB, both under; not yet enforced in CI.
- [ ] [Sonnet] Zero crashes over 30 days on every store build.
- [ ] [Opus] Design pass on every screen against the web, the newest surface.

### v100 The century

- [ ] [Opus] Exam at 99% on 1,000 questions in 15 languages, online and offline, on every platform. Release notes that read like a short history, a launch, and a What's New that fits on one screen.

## Open for contribution

Each bullet is one PR. Bugs, features, and UI/UX are mixed together, grab any one.

- **Bug:** iOS UI is behind the web app's polish. Sync it up (web is the newest surface).
- **Bug:** tests are thin and result filtering is loose. Tighten both.
- **Feature:** iOS app should mirror the website's full functionality, shopping included.
- **Platform:** Java version, only if a plain-Java/Swing or JavaFX UI over the engine is actually wanted (KMP desktop already ships a JVM binary).
- **Platform:** Electron version, would just wrap `web/`, which already installs as a PWA. Only real gain is a global hotkey on Linux/Windows.

## Blocked on Joshua

- **Apple Private Cloud Compute.** Apple's bigger cloud model is free for Small Business Program apps (iOS/macOS 27, `PrivateCloudComputeLanguageModel`). It needs the managed entitlement `com.apple.developer.private-cloud-compute`: request it at https://developer.apple.com/contact/request/private-cloud-compute/. Once granted: grade it on the exam, and if it clears 95% it becomes an answer tier on Apple builds (never in Private mode, since it leaves the device).

- **Custom domain.** `nimble.heyitsmejosh.com` is taken by the web app. Candidate: `nimbleapp.com`. Buy when ready.
- **Play Store.** Needs an Android keystore + $25 Play Console fee.
- **Microsoft Store.** Needs MSIX signing + $19 dev account.
- **Logo provenance decision.** maybulb.com ships their own app called Nimble with
  a titled "Bulby" mark; ours is original work in the same spirit, not a copy.
  Decide: keep the mark, rename, or get written permission.
- **Real auto-update (Sparkle).** Today's updater only checks and notifies. In-place
  updates need a signed appcast + helper process once Developer ID signing is set up.

## Decisions on the record

- **Nimble keeps its name** (2026-08-04, reversed the same day the name-collision
  question first came up; do not re-raise unprompted). The real exposure is an
  App Store name collision at submission time, `asc-name-creator` is the tool if
  App Review ever rejects on it. The shipped bulb mark is original work, not a
  copy of Maybulb's file, so it carries no separate risk on its own.
- **App Store name resolved: "Nimble Answers."** Bare "Nimble" is held by Nimble,
  Inc., and Apple's app-name namespace is exact-match at record creation, the
  "keep the name, revisit only if rejected" plan didn't hold, since review never
  gets a say. On-device name stays "Nimble" (Guideline 2.3.8 only requires the two be similar).

## Shipped

- **Offline mode (2026-10-01):** graphs sample on device via QueryEngine/Compute.swift and docs/engine.js, not Curvely API. iOS and macOS use NWPathMonitor for instant network detection, show "You're offline. Math, units and graphs still work." Web app gained docs/sw.js service worker. Cleanup: removed root icon.svg, unused entitlements, gitignored ASC logs. 38 Swift and 8 JS tests green. Commit 131f5a9.

- **iOS App Store link published (2026-09-24):** iOS 1.0.0 approved by App Review and went live on the App Store. README and landing page updated with App Store links for both iPhone and Mac using the same Universal Purchase ID (6807858746).

- **Wikipedia starts in parallel (2026-09-10):** `QueryEngine.query()` only
  started the Wikipedia fetch after the LLM came back empty, adding a real
  sequential hop on a cold LLM call. Now starts alongside `llm`/`ddg` via
  `async let`; request timeout raised 8s → 15s to match the worker's actual
  response time. PR: nulljosh/nimble#6.

- **Roadmap corrections (2026-09-10):** three listed gaps turned out to be
  already fixed or never real, no code changed, just removed the stale
  claims. Trailing-junk math ("2 + 2 banana") is already rejected by the
  hand-written `MathLexer`/`MathParser` that replaced `NSExpression` (the
  comment at `QueryEngine.swift:156` documents the switch; `nimble/CLAUDE.md`
  still says "NSExpression math eval" and needs the same correction). Unit
  conversion isn't dead code, `AppState.performQuery()` calls
  `queryEngine.convert(text)`, implemented in `QueryEngine+Compute.swift`.
  `dist/index.html` doesn't exist on disk (gitignored, regenerated by
  `scripts/build-site.sh`), so there's nothing stale to delete.

- **Neutral tiebreaker (2026-09-10):** `worker/worker.js` used to let Qwen
  arbitrate its own disagreement with Gemma. Now a third independent model
  (llama-3.3-70b) weighs in and majority wins; Qwen-synthesis only fires on a
  true 3-way split. PR: nulljosh/nimble#5.

- **Agreement check normalized (2026-09-10):** `worker/worker.js` compared
  model answers with exact string equality, making the synthesis fallback the
  common path instead of the rare one. Now normalizes (lowercase, strip
  punctuation, collapse whitespace) before comparing. PR: nulljosh/nimble#4.

- **Current-officeholder queries fixed (2026-09-10):** `worker/worker.js` now
  detects "who is the current/present X" and swaps in a system prompt that
  pushes Gemma/Qwen to commit to their best-known answer instead of hedging
  into UNKNOWN, which used to send the client to DDG/Wikipedia's static office
  page. PR: nulljosh/nimble#3.

- **Security (2026-08-17):** public answer proxy was unauthenticated and
  unthrottled. Added a per-IP 20 requests/minute limit in `wrangler.jsonc`, live.
- **Design system + landing/splash screen (2026-08-02):** pulled maybulb.com's
  real CSS (`#ffca30` yellow, black text, Avenir Next, flat pill-free buttons, 2px
  yellow dividers) into `docs/index.html`, added `docs/splash.html`. Not yet wired
  as an iOS LaunchScreen, web-only splash for now.
- **App Store launch (submitted 2026-09-02):** ASC record 6807858746 "Nimble
  Answers," one Universal Purchase record, bundle `com.nulljosh.nimble.ios` on
  both targets. iOS 1.0.0 and macOS 1.0.0 both went to WAITING_FOR_REVIEW.
  Signing needed manual profiles via `asc signing fetch --create-missing`
  (automatic signing can't mint them headlessly); macOS was rejected once for
  missing `com.apple.security.app-sandbox`, fixed via
  `Nimble-macOS.entitlements`. iPad screenshot required because
  `TARGETED_DEVICE_FAMILY` is 1,2. Primary language en-CA.
- **macOS 1.0.0 rejection fix (2026-09-02):** rejected for 2.4.5(vii); updater
  removed, rebuilt, reuploaded.
- **UI polish (2026-08-28):** removed the pale translucent titlebar strip
  (dropped `.titled` from the window style mask, clipped content view to radius
  14). Re-enabled `MenuBarExtra`. Added global hotkey ⌥Space via Carbon
  `RegisterEventHotKey` (no Accessibility prompt). Moved Settings into the menu
  bar (Cmd-comma). Default theme changed orange → brand yellow `#FFCA30`. All 34
  tests pass.
- **Native Kotlin Multiplatform apps (2026-08-28):** real native Windows and
  Android builds (KMP + Compose Multiplatform, Skia rendering, no web view),
  ported the whole Swift `QueryEngine` to Kotlin including a hand-written
  expression parser (`Expr.kt`) replacing `NSExpression`. CI green on
  `nimble-windows-msi` (59MB) and `nimble-android-apk` (12MB).
  Toolchain notes: AGP 9 doesn't support KMP's application plugin, so the app
  module is pinned to AGP 8.x, which in turn needs Gradle <= 9.5.0 (9.6 dropped
  an API it needs). Compose pinned to 1.11.1 on compileSdk 36 (1.12 wants
  compileSdk 37, not yet fetchable). `brew install --cask temurin@17` silently
  installs nothing without sudo; used `openjdk@17` formula instead with
  `JAVA_HOME` set explicitly.
- **Source labeling fix (2026-08-28):** the answer's source label now names the
  models that actually ran ("Gemma + Qwen") instead of hardcoding "Gemma" for
  every branch.
- **Clickable results (2026-09-02):** source URL + web search fallback for AI
  answers, shipped across landing, macOS/iOS, and KMP.
- **TUI pilot (2026-09-05):** `nimble-tui` SwiftPM target using SwiftTUI
  (rensbreur/SwiftTUI). `swift build && ./.build/debug/nimble-tui "<query>"`
  renders the answer as a bordered terminal card, reusing the same
  `QueryEngine`/`QueryResult` as the macOS/iOS apps. Needs a real TTY. Extracted
  `QueryResult` into its own Foundation/CoreGraphics-only file so the TUI target
  doesn't need SwiftUI. Static render, not a REPL. First app in the fleet-wide
  TUI rollout; the extraction pattern should port cleanly to other Swift apps
  with a headless model layer.

## Ingested 2026-10-16
- [ ] README: refresh the primitive.dev screenshot with a more generic example (banner, H1 and GitHub badge removed 2026-10-18).
