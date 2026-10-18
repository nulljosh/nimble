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

### v5.x Finish 5.1 (patches and minors until clean)

- [ ] [Sonnet] 5.3 Samantha picker: Mac Preferences shows whether she is running, her model and her last latency; one-click start via `omlx start`.
- [ ] [Sonnet] 5.3 Site answers show a favicon and the page's own name; handle JS-only pages by falling back to the og:description and a one-line "this site loads with JavaScript" note.

### v5.5 Premium (Joshua, 2026-10-11: domain now, premium features, then $1 on the App Store)

- [ ] [Sonnet] Offline Wikipedia pack: top intros, compressed, one download, refreshed monthly; the grounding source when there is no network.
- [ ] [Sonnet] Price flip at the 5.5 release: iPhone and Mac go to Apple price tier 1 ($0.99) via `asc pricing` (apple-pricing skill), web stays free with the $1 Stripe unlock; MONEY.md and the landing updated the same day.

- [ ] [Sonnet] "Why this answer": tap the source line to see the exact text the answer came from, with a link. Every text answer carries a sourceURL.
- [ ] [Sonnet] News card: top three headlines on "news", "what's happening in <place>", from the RSS set already in the stack, one sentence each with the outlet.
- [ ] [Sonnet] Markets card: stock, crypto and FX quotes ("AAPL", "bitcoin price"), keyless sources first.
- [ ] [Sonnet] Sports and scores card for "who won the <game>".
- [ ] [Sonnet] Disagreement honesty: when the models split and no source settles it, say "sources disagree" with both answers instead of picking one.
- [ ] [Sonnet] Step-by-step math (the Wolfram gap): "show steps" on any math answer expands the evaluation tree the on-device parser already builds, one line per step, offline.
- [ ] [Sonnet] Multiple sources per answer: when DDG, Wikipedia and the models agree, list up to three sources under the sentence instead of one (the Perplexity gap).
- [ ] [Haiku] Freshness label on anything time-sensitive ("as of Oct 11").

### v7 Conversation

- [ ] [Sonnet] Follow-ups on every platform ("and in celsius?", "who was before him?"), a visible thread of the last three turns.
- [ ] [Sonnet] Tap-to-expand: "tell me more" returns three sentences with sources, still never a wall of text.
- [ ] [Haiku] Share card variants (square, story) with the new look.

### v8 Private and on-device

- [ ] [Opus] Pick the on-device model (Apple Foundation Models where available, otherwise a small MLX/GGUF), grade it on the exam, and ship it only if it clears 90%.
- [ ] [Sonnet] "Private mode" toggle: answers only from on-device model plus an offline Wikipedia pack, nothing leaves the device; label it honestly with what it cannot answer.
- [ ] [Sonnet] Offline Wikipedia pack (top-N intros, compressed) downloadable once, refreshed monthly.
- [ ] [Sonnet] Samantha promoted: if the 9B or a distilled model clears 95% on the exam standalone, she ships as the Mac default without needing oMLX running.

### v9 Everywhere

- [ ] [Sonnet] Windows, Android and Linux reach exam parity with iOS and Mac (same 95 questions, same pass bar).
- [ ] [Sonnet] Browser extension (Safari, Chrome, Firefox): select text or hit a hotkey, get the one-sentence answer.
- [ ] [Sonnet] Public API with a free key tier and clear rate limits; `/api` and `/mcp` documented with examples; keep it read-only.
- [ ] [Haiku] TUI and CLI (`nimble "question"`) installable by brew, same engine.
- [ ] [Haiku] Languages: answers and UI in the five shipped languages, then ten more, checked against the exam translated.

### v10 A+

Joshua's v10 direction (2026-10-11): the whole app goes premium. Decide between a paid app on the
App Store ($1, the house rule) or a $1 one-time unlock, with offline mode as the headline premium
feature and a real domain (getnimbleapp.com or nimbleapp.com; buy via /buy-domain when the name is
settled). Web stays free with the $1 unlock through Stripe. Decide pricing shape at v8 (private
mode is the premium feature), buy the domain at v9, flip the switch at v10.

- [ ] [Opus] Publish the benchmark: a 1000-question exam across math, science, history, politics, news, sites, units, definitions, with method and results for Nimble, Samantha and the BYO engines, reproducible from the repo.
- [ ] [Sonnet] Reliability: answer p50 under 2s and p95 under 6s on the free engine, graceful degradation tested with every upstream (Wikipedia, DDG, Workers AI) down in turn.
- [ ] [Haiku] Full accessibility audit (axe, VoiceOver, Dynamic Type, reduced motion, contrast) at zero violations on all surfaces.
- [ ] [Haiku] Landing, README, whitepaper and screenshots rebuilt for 10.0 with the new look and the benchmark.
- [ ] [Opus] 10.0 launch: Product Hunt, HN (when the account allows), release notes, and the What's New that explains what a decade of versions bought you in one screen.

## Open for contribution

Each bullet is one PR. Bugs, features, and UI/UX are mixed together, grab any one.

- **Bug:** iOS UI is behind the web app's polish. Sync it up (web is the newest surface).
- **Bug:** tests are thin and result filtering is loose. Tighten both.
- **Feature:** iOS app should mirror the website's full functionality, shopping included.
- **Platform:** Java version, only if a plain-Java/Swing or JavaFX UI over the engine is actually wanted (KMP desktop already ships a JVM binary).
- **Platform:** Electron version, would just wrap `web/`, which already installs as a PWA. Only real gain is a global hotkey on Linux/Windows.

## Blocked on Joshua

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

## Ingested 2026-10-03
- [ ] Needs better QA testing and filtering of queries. Screenshots (from Joshua's phone, Oct 3): "Who is the president of the United States" returned raw model text ("The instructions say: 'If you do not know, reply exactly UNKNOWN'", source Gemma); "Who created you" returned the Wikipedia YouTube article; "What's nine plus ten" returned the Wikipedia Vine (service) article; "X=5+5. Solve for x." answered x=10 via Qwen (correct).

## Ingested 2026-10-16
- [ ] UI bump: nav bar at the bottom, Settings as a tab in it, color goes into Settings, copy to clipboard near search. What's New modal needs padding. (screenshots: notes/attachments/2026-10-16/nimble-6.png, notes/attachments/2026-10-16/nimble-7.png, notes/attachments/2026-10-16/nimble-8.png)
- [ ] Remove "AI answers" from Settings. Default to Samantha, then other LLMs, Wikipedia etc. Filter through them for the user; don't make the user manage APIs. Same with engines.
- [ ] README: simplify, remove the H1 and the image banner rules, remove the GitHub badge, refresh the primitive.dev screenshots and make examples more generic.
- [ ] User feedback (email from a user): add a Home / New Question button to leave an answer, a History section via a hamburger menu, and single and multi-select in history (delete, share, organize). (screenshot: notes/attachments/2026-10-16/nimble-10.png)
- [ ] Old ASC email (Nimble Answers 5.0.1 build 20): ITMS-90061, CFBundleVersion must exceed 202609210930. Likely already fixed by later builds; verify. (screenshot: notes/attachments/2026-10-16/nimble-6.png)
- [ ] UI bump: nav bar at the bottom, Settings as a tab in it, color goes into Settings, copy to clipboard near search. What's New modal needs padding. (screenshots: notes/attachments/2026-10-16/nimble-6.png, notes/attachments/2026-10-16/nimble-7.png, notes/attachments/2026-10-16/nimble-8.png)
- [ ] Remove "AI answers" from Settings. Default to Samantha, then other LLMs, Wikipedia etc. Filter through them for the user; don't make the user manage APIs. Same with engines.
- [ ] README: simplify, remove the H1 and the image banner rules, remove the GitHub badge, refresh the primitive.dev screenshots and make examples more generic.
- [ ] User feedback (email from a user): add a Home / New Question button to leave an answer, a History section via a hamburger menu, and single and multi-select in history (delete, share, organize). (screenshot: notes/attachments/2026-10-16/nimble-10.png)
- [ ] Old ASC email (Nimble Answers 5.0.1 build 20): ITMS-90061, CFBundleVersion must exceed 202609210930. Likely already fixed by later builds; verify. (screenshot: notes/attachments/2026-10-16/nimble-6.png)
