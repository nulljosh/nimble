# Nimble
v1.0.0

Instant-answer search: macOS HUD + menu bar app, iOS app, and a web app. Query classification (math/factual/definition). Offline math. Gemma + Qwen3 on Cloudflare Workers AI, falling back to DDG + Wikipedia.

## Stack
- SwiftUI (macOS 14+ / iOS 17+), @Observable
- QueryEngine: classifyQuery() enum, NSExpression math eval (native); same logic reimplemented in JS in `docs/engine.js`
- Answer proxy: Cloudflare Worker + Workers AI binding (no API key), Gemma + Qwen3 in parallel, synthesized on disagreement; returns `{answer, source}` and the UI shows `source`
- DuckDuckGo Instant Answer API + Wikipedia REST API as fallback
- macOS window is borderless (`styleMask = [.resizable, .fullSizeContentView]`), dropping `.titled` is what removes the titlebar strip; do not restore it
- 34 tests (QueryEngine + Preferences + UpdateChecker)

## Structure
- `Sources/Models/QueryEngine.swift`: classification, math eval, API queries
- `Sources/Models/AppState.swift`: state, theme, preferences
- `Sources/Models/UpdateChecker.swift`: macOS-only GitHub Releases update check
- `Sources/Views/SearchView.swift`: macOS search UI, `Sources/iOS/SearchView.swift`, iOS
- `Sources/macOS/GlobalHotkey.swift`: ⌥Space summon via Carbon RegisterEventHotKey
- `worker/worker.js`: answer proxy, `npx wrangler deploy` from `worker/`
- `docs/`: landing page with the live engine (`engine.js`), deployed via Cloudflare Pages to `nimble.heyitsmejosh.com`; `/app/*` redirects to `/`
- `docs/index.html`: marketing/landing page, deployed via GitHub Pages (default `nulljosh.github.io/nimble` URL, the custom domain is taken by the web app)
- `Tests/`: 34 tests

## Build
```bash
xcodegen generate && open Nimble.xcodeproj
scripts/release-macos.sh   # signed + notarized Mac release zip
```
