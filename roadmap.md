# Nimble roadmap

## Open for contribution

No small, well-scoped single-PR gaps left as of 2026-09-10 — every remaining
item below is either a multi-day feature, a decision only Joshua can make, or
blocked on him directly (money, dashboard-only steps, domain purchase). Next
contribution-sized work starts from "Open for contribution: bigger features"
below.

## Open for contribution: bigger features (a few days each)

- **Search history.** Local-only log of past questions and answers, browsable and
  re-runnable, with a clear-history action. Store in Core Data or a flat JSON
  file (macOS/iOS), localStorage (web). No sync, no server — this is not
  account data.
- **Voice input.** Tap the mic (or hold a hotkey) and speak the question instead
  of typing it. `SFSpeechRecognizer` on macOS/iOS; Web Speech API on the web app.
  Feeds straight into the existing `QueryEngine`, no new answer path needed.
- **Shareable answer cards.** Turn an answer into an image (question, answer,
  source) for sharing — `ImageRenderer` on macOS/iOS, `<canvas>` export on web.
  Nimble has no social feature today; this is the whole thing.
- **Follow-up questions.** Let a query reference the previous answer ("and in
  celsius?", "who was before him?") by carrying the last Q&A as context into the
  next Worker call. Needs a short-lived conversation state (last N turns) and a
  system prompt tweak in `worker/worker.js` to use it when present.
- **Widget / Live Activity (iOS) and menu bar quick-ask (macOS).** A home-screen
  widget showing the last answer plus a quick-entry field; on macOS, ask
  straight from the menu bar dropdown without opening the HUD.

## Open

- Sync iOS UI polish to match the web app (mostly there, web is the newest surface).
- Custom domain for the landing page. `nimble.heyitsmejosh.com` is taken by the web
  app. Candidate: `nimbleapp.com`. Joshua buys when ready.
- Mac menu bar screenshot for the landing page and README (only the iPhone shot exists today).
- Play Store submission: needs an Android keystore and the $25 Play Console fee.
- Microsoft Store submission: needs MSIX signing and the $19 dev account.
- Logo provenance decision. maybulb.com is a real three-person studio whose own
  shipping macOS app is also called Nimble, and their `logo.svg` is titled artwork
  ("Bulby"). Nimble's mark is an original bulb in their color/shape spirit, not a
  copy of their file. Decide: keep the original mark, rename to clear the
  collision, or get written permission from Maybulb.
- Real auto-update (Sparkle). What's shipped today only checks and notifies — it
  downloads and replaces nothing. In-place updates need a signed appcast and a
  helper process, once Developer ID signing is in place.
- No graphing. The original leaned on Wolfram|Alpha for plots; DDG + Wikipedia have no equivalent.
- More platforms, after native Windows/Android ship:
  - Java version — mostly moot. The KMP desktop app already ships as a JVM
    binary. "A Java version" only means something new if it's a plain-Java/Swing
    or JavaFX UI over the same engine. Confirm that's actually wanted before building it.
  - Electron version — none exists. The *original* Maybulb Nimble was Electron +
    Wolfram|Alpha, deprecated 2020; this project is the from-scratch native
    rebuild of it. An Electron build would just wrap `web/`, which already
    installs as a PWA on Windows/Linux/Android. The only thing it adds is a
    global hotkey on Linux/Windows.
- iOS app should mirror the website's full functionality and UI, shopping included.
- More thorough tests, tighter result filtering.

## Blocked on Joshua

- **Deploy pipeline is dead.** `.github/workflows/deploy-site.yml` has no
  Cloudflare API token to give CI, so it can't auto-deploy the site.
  `secrets.fish` only has `CLOUDFLARE_DNS_TOKEN` (DNS-scoped); naming a token
  `CLOUDFLARE_API_TOKEN` breaks wrangler's OAuth on purpose, so that path is
  closed. The workflow now fails loudly (was silently green while shipping
  nothing). Fix: mint a Pages-Edit-scoped API token in the Cloudflare dashboard,
  then `gh secret set CLOUDFLARE_API_TOKEN --repo nulljosh/nimble` and
  `gh secret set CLOUDFLARE_ACCOUNT_ID` (`14c849d102ecc38b5fae54d9b22deec4`).
  Until then, deploy by hand:
  `bash scripts/build-site.sh && npx wrangler pages deploy dist --project-name=nimble --branch=main`

## Decisions on the record

- **Nimble keeps its name** (2026-08-04, reversed the same day the name-collision
  question first came up; do not re-raise unprompted). The real exposure is an
  App Store name collision at submission time — `asc-name-creator` is the tool if
  App Review ever rejects on it. The shipped bulb mark is original work, not a
  copy of Maybulb's file, so it carries no separate risk on its own.
- **App Store name resolved: "Nimble Answers."** Bare "Nimble" is held by Nimble,
  Inc., and Apple's app-name namespace is exact-match at record creation — the
  "keep the name, revisit only if rejected" plan didn't hold, since review never
  gets a say. On-device name stays "Nimble" (Guideline 2.3.8 only requires the two be similar).

## Shipped

- **Wikipedia starts in parallel (2026-09-10):** `QueryEngine.query()` only
  started the Wikipedia fetch after the LLM came back empty, adding a real
  sequential hop on a cold LLM call. Now starts alongside `llm`/`ddg` via
  `async let`; request timeout raised 8s → 15s to match the worker's actual
  response time. PR: nulljosh/nimble#6.

- **Roadmap corrections (2026-09-10):** three listed gaps turned out to be
  already fixed or never real — no code changed, just removed the stale
  claims. Trailing-junk math ("2 + 2 banana") is already rejected by the
  hand-written `MathLexer`/`MathParser` that replaced `NSExpression` (the
  comment at `QueryEngine.swift:156` documents the switch; `nimble/CLAUDE.md`
  still says "NSExpression math eval" and needs the same correction). Unit
  conversion isn't dead code — `AppState.performQuery()` calls
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
  as an iOS LaunchScreen — web-only splash for now.
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
