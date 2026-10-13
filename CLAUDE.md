# Nimble
v6.10.0

Instant-answer search: macOS HUD + menu bar app, iOS app, and a web app. Query classification (math/factual/definition). Offline math. Gemma + Qwen3 on Cloudflare Workers AI, falling back to DDG + Wikipedia.

## Stack
- SwiftUI (macOS 14+ / iOS 17+), @Observable
- QueryEngine: classifyQuery() enum, hand-written MathLexer/MathParser eval (replaced NSExpression, which silently ignored trailing junk); same logic reimplemented in JS in `docs/engine.js`
- Answer proxy: Cloudflare Worker + Workers AI binding (no API key). Qwen3 alone by default; Gemma joins for time-sensitive, date or number questions and when Qwen gives UNKNOWN; Llama breaks a clash. Known answers cached 6h (1h time-sensitive) via the Cache API, no neurons on a repeat. A neuron guard stops AI at 8,500 estimated neurons a day and `GET /stats` reports the day's counts (per data center, see `worker/wrangler.jsonc` for the KV option). Returns `{answer, source}` and the UI shows `source`
- AI engine is user-selectable in Settings (`Sources/Models/AIEngine.swift`, `ENGINES` in `engine.js`): Nimble proxy (default, free), Claude, OpenAI, Ollama. Keys stay on device (prefs file / localStorage), calls go straight to the vendor; no key = silent fallback to the proxy
- DuckDuckGo Instant Answer API + Wikipedia REST API as fallback
- macOS window is borderless (`styleMask = [.resizable, .fullSizeContentView]`), dropping `.titled` is what removes the titlebar strip; do not restore it
- Tests at 6.10.0: 298 web (`npm test`: 297 pass, 1 skipped, 0 fail); 226 Swift tests, all run with `xcodebuild test` (0 failures, 1 skipped); 169 `@Test` in `kmp/` (`:shared:jvmTest` runs in CI)

## Structure
- `Sources/Models/QueryEngine.swift`: classification, math eval, API queries
- `Sources/Models/AppState.swift`: state, theme, preferences
- `Sources/Models/UpdateChecker.swift`: macOS-only GitHub Releases update check
- `Sources/Views/SearchView.swift`: macOS search UI, `Sources/iOS/SearchView.swift`, iOS
- `Sources/macOS/GlobalHotkey.swift`: ⌥Space summon via Carbon RegisterEventHotKey
- `worker/worker.js`: answer proxy, `npx wrangler deploy` from `worker/`
- `docs/`: landing page with the live engine (`engine.js`), deployed via Cloudflare Pages to `nimble.jaybulb.com`; the full web app is `docs/app.html`, served at `/app`
- `docs/index.html`: marketing/landing page, deployed via GitHub Pages (default `nulljosh.github.io/nimble` URL, the custom domain is taken by the web app)
- `Tests/`: 218 Swift test functions (see the count under Stack); `test/`: 295 web tests

## The loop

See `docs/LOOP-HANDOFF.md` (current state at 6.0.0, 2026-10-12). The loop shipped five majors 1.0 to 5.0 in one session, then 6.0.0 on top of 5.23.1: the three-tab iPhone, History, sources disagree, sports and markets cards, freshness lines, the offline Wikipedia pack on four platforms, and a quota-aware Worker. Open: query QA in roadmap.md, three merged remote branches Joshua has to delete, and the zero-issue goal; no blockers.

## QA
QA hooks always sandbox storage: any `-shot*` or `-qaSandbox` launch arg moves history, prefs, the shared answer suite and iCloud sync to a fresh temp root (`Sources/Models/QASandbox.swift`). Never launch the real app bundle for QA against real data.

## Build
```bash
xcodegen generate && open Nimble.xcodeproj
scripts/release-macos.sh   # signed + notarized Mac release zip
```
