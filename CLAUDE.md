# Nimble
v9.6.0

Instant-answer search: macOS HUD + menu bar app, iOS app, and a web app. Query classification (math/factual/definition). Offline math. Groq's free models first (gpt-oss 120B, Qwen 27B, gpt-oss 20B), then Qwen3 + Gemma on Cloudflare Workers AI, falling back to DDG + Wikipedia.

## Stack
- SwiftUI (macOS 14+ / iOS 17+), @Observable
- QueryEngine: classifyQuery() enum, hand-written MathLexer/MathParser eval (replaced NSExpression, which silently ignored trailing junk); same logic reimplemented in JS in `docs/engine.js`
- Answer proxy: Cloudflare Worker + Workers AI binding (no API key). Qwen3 alone by default; Gemma joins for time-sensitive, date or number questions and when Qwen gives UNKNOWN; Llama breaks a clash. Known answers cached 6h (1h time-sensitive) via the Cache API, no neurons on a repeat. With the optional `SAMANTHA_URL` secret set, Samantha (the local model, over a tunnel) is tried before everything and any failure falls through. With the `GROQ_KEY` secret set, Groq answers first (separate free daily caps, no neurons) and a capped or failing Groq model hands to the next. A neuron guard stops Workers AI at 8,500 estimated neurons a day (Groq keeps answering past it) and `GET /stats` reports the day's counts (global, kept by the NimbleCounts Durable Object). Returns `{answer, source}` and the UI shows `source`
- AI engine is user-selectable in Settings (`Sources/Models/AIEngine.swift`, `ENGINES` in `engine.js`): Nimble proxy (default, free), Claude, OpenAI, Ollama. Keys stay on device (prefs file / localStorage), calls go straight to the vendor; no key = silent fallback to the proxy
- DuckDuckGo Instant Answer API + Wikipedia REST API as fallback
- macOS window is borderless (`styleMask = [.resizable, .fullSizeContentView]`), dropping `.titled` is what removes the titlebar strip; do not restore it
- Tests at 6.30.0: 309 web (`npm test`, 0 fail); 228 Swift tests, all run with `xcodebuild test` (0 failures, 1 skipped); 171 `@Test` in `kmp/` (`:shared:jvmTest` runs on this Mac, 171 pass, and in CI)

## Structure
- `Sources/Models/QueryEngine.swift`: classification, math eval, API queries
- `Sources/Models/AppState.swift`: state, theme, preferences
- `Sources/Models/UpdateChecker.swift`: macOS-only GitHub Releases update check
- `Sources/Views/SearchView.swift`: macOS search UI, `Sources/iOS/SearchView.swift`, iOS
- `Sources/macOS/GlobalHotkey.swift`: ⌥Space summon via Carbon RegisterEventHotKey
- `worker/worker.js`: answer proxy, `npx wrangler deploy` from `worker/`
- `docs/`: landing page with the live engine (`engine.js`), deployed via Cloudflare Pages to `nimble.jaybulb.com`; the full web app is `docs/app.html`, served at `/app`
- `docs/index.html`: marketing/landing page, deployed via GitHub Pages (default `nulljosh.github.io/nimble` URL, the custom domain is taken by the web app)
- `Tests/`: the Swift tests (count under Stack); `test/`: the web tests

## The loop

See `docs/LOOP-HANDOFF.md` (current state at 9.4.4, 2026-10-18). v9 is closed. iPhone 9.4.4 and Mac 9.4.3 are WAITING_FOR_REVIEW after one Guideline 5 rejection, fixed and resubmitted. Next: when both clear, cut 10.0.0 (closes v10), then Joshua posts the launch drafts. Joshua owns the store submissions, the real-device walk and the native-speaker check.

## QA
QA hooks always sandbox storage: any `-shot*` or `-qaSandbox` launch arg moves history, prefs, the shared answer suite and iCloud sync to a fresh temp root (`Sources/Models/QASandbox.swift`). Never launch the real app bundle for QA against real data.

## Build
```bash
xcodegen generate && open Nimble.xcodeproj
scripts/release-macos.sh   # signed + notarized Mac release zip
```
