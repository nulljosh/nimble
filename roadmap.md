# Nimble roadmap

## Security (2026-08-17)
- **Public answer proxy rate-limited** — The public Cloudflare Workers AI proxy endpoint had no authentication or rate-limiting, exposed to abuse. Added per-IP 20 requests/minute limit in wrangler.jsonc (commit 0105db9), deployed live.

## Open
- Current-officeholder queries ("who is the current president") — DDG + Wikipedia return the *office* page, not the incumbent. Fix is a Gemma call via the Cloudflare Worker proxy (`worker/worker.js`, merged); blocked on deploying the Worker with a Gemma API key.
- Sync iOS UI polish to match the web app's classification/theming (mostly there — web is the newest surface).
- **App Store submission**: bundle IDs now registered (`com.nulljosh.nimble` macOS id `XM9AAAAYS6`, `com.nulljosh.nimble.ios` id `NU796452Z2`, both via `asc bundle-ids create`). Still blocked on creating the two ASC app records via browser (asc-app-create-ui skill) — the New App dialog's "Primary Language" field is a custom Ember Power Select widget that isn't responding to standard click/select/keyboard automation (tried native `<select>` value-set, click+arrow-keys, and clicking the rendered option directly; all silently no-op). Needs either a fresh automation approach or the user picking Primary Language + Bundle ID manually (2 clicks) before handing back for the rest (SKU, User Access, Create, then archive/upload/metadata/screenshots/pricing/submit). GitHub release is the distribution channel until then.
- **Custom domain**: `nimble.heyitsmejosh.com` is taken by the web app; landing page needs its own, e.g. `nimbleapp.com` (maybulb.com is already owned by someone else on the team). User will buy in a few weeks — check availability/price via Vercel domain tools when ready, confirm cost before purchasing.
- **Design system + landing page/splash screen**: DONE 2026-08-02 — pulled maybulb.com's actual CSS (`#ffca30` yellow, black text, Avenir Next stack, flat pill-free buttons, 2px yellow section dividers) and applied it to `docs/index.html` (buttons/dividers/font restyled to match). Added `docs/splash.html` loading screen (yellow bg, pulsing icon mark). Not yet wired as an iOS LaunchScreen — web-only splash for now.

## From Apple Notes (imported 2026-08-04)
- [ ] **Logo provenance — needs a decision.** maybulb.com is a real third party (a three-person studio) whose own shipping macOS product is *also* called Nimble ("a simple but powerful Wolfram|Alpha menubar client"), and `maybulb.com/img/logo.svg` is their titled "Bulby" artwork. Shipping a byte-copy of their logo under the same product name is a trademark exposure and a likely App Review rejection, so the mark that landed is an original bulb in the same spirit (their `#ffca30` yellow, black rounded-square badge) rather than their file. Their yellow + Avenir/Europa fallback stack are not protectable and were used as asked. Decide whether to (a) keep the original bulb, (b) rename the app to clear the collision, or (c) get written permission from Maybulb. Same question already flagged for wiretext ("find a custom name rather than copying the name from the source idea").
- [ ] Re-upload the new icon to App Store Connect once the two app records exist (blocked on the Ember Power Select issue under **App Store submission** above).
- [ ] `docs/splash.html` still isn't wired as an iOS LaunchScreen — web-only splash.

## Decision 2026-08-04

Rename decision REVERSED by Joshua 2026-08-04: **Nimble keeps its name.** Do not rename it; do not re-raise this unprompted.

Context kept only so the risk is known, not as a task: maybulb.com is a real third-party studio whose own shipping macOS product is also called Nimble. The practical exposure is an App Store name collision at submission time. If App Review ever rejects on the name, that is the moment to revisit, and `asc-name-creator` is the tool for it. The bulb mark shipped here is original work in their spirit, not their artwork, so it carries no separate risk.

## From Apple Notes (imported 2026-08-11)
- [ ] iOS app must mirror the website in functionality + UI (incl. shopping)
- [ ] Site needs a landing/marketing page — currently it drops straight into the app with no preview

> Resume note (2026-08-11): a `wip: partial work from /work notes ingest` commit holds unfinished, unverified changes for the items above. Review `git show HEAD` before building on it — it was committed mid-flight, not reviewed, and is unpushed.

## Ingested 2026-08-18
- [ ] Add more thorough tests, making sure results are more filtered.
- [x] Build out Windows/Linux apps + Android. **DONE 2026-08-28** — shipped as a PWA rather than a third implementation: `web/` now has a manifest, PNG icons and a cache-first service worker, so Windows, Linux and Android all install the web app as a standalone windowed app with offline math working. Landing page has an "Install it anywhere" section. Store presence is the only thing left and is optional:
  - Play Store: `npx @bubblewrap/cli init --manifest https://nimble.heyitsmejosh.com/manifest.webmanifest` then `bubblewrap build` (Trusted Web Activity). Needs `web/.well-known/assetlinks.json` deployed, plus the $25 Play Console fee.
  - Microsoft Store: pwabuilder.com → MSIX. $19 dev account.
  - Not ported to the web app: the macOS global hotkey (no PWA equivalent) and the 8 themes (`tokens.css` already has the token layer if it ever matters).

## Ingested 2026-08-22
- [ ] Ship iOS and Mac apps — right now only web is available.

## App Store launch — status 2026-08-23

**Name RESOLVED: "Nimble Answers".** Bare "Nimble" is held by Nimble, Inc. Apple's
app-name namespace is exact-match *at record creation*, so the New App form refuses a
taken name — the earlier 2026-08-04 decision to "keep the name, revisit only if App
Review rejects" was wrong; review never gets a say. Verified free 2026-08-23:
Nimble Answers / Nimble Search / Nimble Ask / Nimble Facts. On-device name stays
"Nimble" (Guideline 2.3.8 only requires the two be similar).

DONE this session:
- iOS target now sets `LSApplicationCategoryType` (was missing; real cause of ITMS-90242).
- iOS build green against `generic/platform=iOS Simulator`.
- Privacy policy written and live: **https://heyitsmejosh.com/nimble/privacy.html** (verified 200 with correct title).
  Trap: `https://nimble.heyitsmejosh.com/privacy.html` also returns 200 but serves the
  *landing page* via a catch-all. Do not use that URL — App Review would see the wrong document.
- Metadata authored under `metadata/` (app-info + version/1.0.0), lengths validated.

Verified 2026-08-23 by running it: `asc xcode archive` **succeeds**, `asc xcode export`
**fails** with `No profiles for 'com.nulljosh.nimble.ios' were found`. Automatic signing
cannot mint a distribution profile until the App Store Connect record exists, so the
record gates the entire build pipeline, not just metadata. Do not attempt to build and
upload before creating it. `.asc/workflow.json` and `ExportOptions.plist` are in place
and ready; fill in `IOS_APP_ID` once the record exists, then `asc workflow run ship-ios`.

REMAINING, in order:
- [ ] **Create the ASC app record** — browser-only, `asc-app-create-ui` skill. Name "Nimble Answers", bundle `com.nulljosh.nimble.ios` (already registered, NU796452Z2). Known friction: the New App dialog's Primary Language Ember Power Select widget resists automation — expect to need Joshua for two clicks rather than burning attempts.
- [ ] Apply `metadata/` to the record, set marketingUrl + supportUrl to https://heyitsmejosh.com.
- [ ] App Privacy questionnaire: the question text is transmitted to DuckDuckGo, Wikipedia and the Workers AI service, **not linked to identity**, no tracking. Under-declaring is a rejection.
- [ ] Screenshots — none exist yet. Use the `appstore-screenshots` / `asc-shots-pipeline` skills at the iPhone 11 Pro Max / 14 Plus sizes.
- [ ] Add `.asc/workflow.json` with a `ship-ios` workflow modelled on Healstack's (known-good shape).
- [ ] Archive → export → upload. Verify with `asc builds uploads list`; `asc publish` reports false successes.
- [ ] `asc validate --app <id> --version 1.0.0` until zero blocking errors.
- [ ] Run it on a simulator before submitting — test a math query (offline path) and a factual query (Worker path). Do not submit on a compile alone.
- [ ] **GATE — 1 of 3 met as of 2026-08-25.** Sparkjar macOS **1.0.1 is APPROVED and live** (READY_FOR_SALE). Still pending: Healstack iOS 2.3.5 and Lexly macOS 1.1.4, both WAITING_FOR_REVIEW. Note the 5.6 caution below is milder than written: per the account history, 5.6 fires on bulk *thin new* records, not submission frequency — and nine records are currently in the queue with no incident. Original note follows:

Plan file: `~/.claude/plans/tldr-shorter-and-you-cryptic-reef.md`

## Approved to ship — 2026-08-22
Measured at 1,677 lines of app code with real search, result and context-menu UI over
the Workers AI backend. Substantive enough to clear Guideline 4.2, unlike Newsline.
- [ ] Ship to the App Store **after** the 2026-08-22 resubmissions (Healstack, Lexly Mac, Sparkjar Mac) come back approved — a clean approval streak makes creating a new app record much safer on an account with a 5.6 suspension in its history.
- [ ] Full new-app checklist: create the ASC app record (browser-only, use the asc-app-create-ui skill), register the bundle ID, signing assets, screenshots, metadata, App Privacy answers, then `asc validate` before submitting.

## Found while capturing screenshots — 2026-08-23
- [ ] Screenshots still to capture. App is installed and running full-screen on the iPhone 17 Pro Max sim (6.9", the size Apple requires). Flow: dismiss the What's New sheet, then type a math query (offline path), a factual query (Worker path) and a definition, capturing each. Save to `screenshots/` (gitignored).

## Maybulb-clone refinements — 2026-08-23

Shipped this session:

Still open:
- [ ] **Real auto-update (Sparkle).** What shipped is check-and-notify: it downloads
      nothing and replaces nothing. In-place updates need a helper process and a signed
      appcast — Sparkle, once Developer ID signing is in place.
- [ ] **Recapture the iOS screenshot** after the safe-area fix, at 6.9" instead of the
      369px asset in `docs/screenshots/`, and drop the crop.
- [ ] Unit conversion is dead code: `QueryResult.convert` renders in `ResultView` and
      copies in `AppState`, but nothing ever produces it. The original Nimble converts
      units, so this is a real parity gap.
- [ ] No graphing. The original leaned on Wolfram|Alpha for plots; DDG + Wikipedia have
      no equivalent.
- [ ] `maybulb.com` is blocked by this environment's network egress policy, so the clone
      could not be diffed against the live site this session. Known gaps from the earlier
      pass and from search: the source page carries a third press quote (ifun.de, in
      German) that `docs/index.html` does not, and their Europa Typekit face is
      approximated by the Avenir Next stack in `tokens.css`. Re-check the live site from
      an unblocked machine before calling the landing page done.
- [ ] **Stale `dist/index.html` duplicate** — `docs/index.html` is the canonical source (GitHub Pages serves from docs/), but a diverged copy at `dist/index.html` remains (still says "Global Hotkey", missing the animated "what you can ask" ticker and scrim from the 2026-08-24 hero rewrite). Should be deleted or generated from a build step; currently kept in sync by hand and keeps drifting.

## Worker answer engine — 2026-08-28

**The source label under an answer now names the models that actually ran** ("Gemma + Qwen"), instead of hardcoding "Gemma" for every branch (commit ae0817d). Two real problems found and still open:

- [ ] **The agreement test is exact string equality** (`worker/worker.js`,
      `qwenAnswer === gemmaAnswer`). Two models never emit byte-identical sentences, so
      the synthesis call fires on nearly every query — the "rare" fallback is the common
      path, and it doubles wall time. Normalize (lowercase, strip punctuation, compare
      token sets) before deciding they disagree.
- [ ] **`QueryEngine.query` is a waterfall** (`Sources/Models/QueryEngine.swift:356`): it
      fully awaits the LLM, then DDG, then Wikipedia — three sequential network legs.
      This, not the models, is why hard questions feel slow; the worker itself answers in
      ~5.6s measured. Start all three with `async let` and keep the same preference order.
      Also raise `timeoutIntervalForRequest` from 8s, which is a trap against a 5-15s
      backend.
- [ ] **A real tiebreaker.** On disagreement, Qwen currently rewrites its own answer plus
      Gemma's — a model arbitrating a dispute it is a party to. Ask a third model
      (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) the original question independently and
      take the majority. Same call count, better answer.

## UI Polish — DONE 2026-08-28

Removed the pale translucent titlebar strip (commit 68a5197) that had been annoying for months. Three attempts: first two guesses, then dumped the NSView hierarchy to identify _NSTitlebarDecorationView inside NSTitlebarContainerView; fix was dropping `.titled` from window style mask + clipping content view to radius 14. Re-enabled MenuBarExtra (Tahoe SDK bug is fixed post-release). Added global hotkey Opt+Space via Carbon RegisterEventHotKey (no Accessibility prompt needed). Moved Settings to menu bar (Nimble > Settings with Cmd-comma hotkey). Removed theme swatch from HUD (SettingsView already has the full grid). Changed default theme from orange to brand yellow #FFCA30. All 34 tests pass.

## Deploy pipeline — BLOCKED ON JOSHUA (2026-08-28)

`.github/workflows/deploy-site.yml` has never deployed. Its wrangler step was guarded by
`if: env.CF_API_TOKEN != ''`, so with no repo secret every run went green while shipping
nothing — the exact "silently fell weeks behind" failure the workflow header describes.

Fixed the silence: the guard is now a hard failure, so main goes **red** until real
credentials exist. Red is correct here — the site genuinely is not auto-deploying.

Root cause of why it cannot be fixed from this machine: there is no Cloudflare API token
to give CI. `secrets.fish` has only `CLOUDFLARE_DNS_TOKEN` (DNS scope), and its own
comment notes the name `CLOUDFLARE_API_TOKEN` is deliberately avoided because wrangler
then skips OAuth and fails for lack of Workers scope. Local `wrangler pages deploy` works
only because it falls back to the saved OAuth session in `~/.wrangler` — CI has no such
session.

- [ ] **Joshua:** mint a Pages-Edit-scoped API token in the Cloudflare dashboard, then
      `gh secret set CLOUDFLARE_API_TOKEN --repo nulljosh/nimble` and
      `gh secret set CLOUDFLARE_ACCOUNT_ID` (= `14c849d102ecc38b5fae54d9b22deec4`).
      Main goes green again the moment both exist.

Until then ship by hand (works, uses the OAuth session):
`bash scripts/build-site.sh && npx wrangler pages deploy dist --project-name=nimble --branch=main`

## Requested 2026-08-28 — more platforms, after native lands

Ordered deliberately: these come **after** the native Windows/Android apps are done, not
instead of them.

- [ ] **Java version.** Worth noting the overlap before building it: the Compose
      Multiplatform desktop app now in `kmp/` is already a JVM app — Kotlin compiles to
      the same bytecode and it ships as a normal JVM binary. So "a Java version" is either
      (a) a plain-Java/Swing or JavaFX UI over the same shared engine, which is a real,
      separate thing, or (b) already covered. Confirm which is wanted before writing it.
- [ ] **Electron version.** None exists today. Worth knowing the history: the *original*
      Maybulb Nimble was Electron + Wolfram|Alpha and was deprecated in 2020; this project
      was the from-scratch native rebuild of it. An Electron build would wrap `web/`, which
      is already a complete app and already installs as a PWA on Windows, Linux and
      Android. The one thing it would add over the PWA is a global hotkey on Linux/Windows.
