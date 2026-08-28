# Nimble
v1.0.0

Instant-answer search: macOS menu bar app, iOS app, and a static web app. Query classification (math/factual/definition). Offline math. DDG + Wikipedia.

## Stack
- SwiftUI (macOS 14+ / iOS 17+), @Observable
- QueryEngine: classifyQuery() enum, NSExpression math eval (native); same logic reimplemented in JS for `web/index.html`
- DuckDuckGo Instant Answer API + Wikipedia REST API
- 34 tests (QueryEngine + Preferences + UpdateChecker)

## Structure
- `Sources/Models/QueryEngine.swift` — classification, math eval, API queries
- `Sources/Models/AppState.swift` — state, theme, preferences
- `Sources/Models/UpdateChecker.swift` — macOS-only GitHub Releases update check
- `Sources/Views/SearchView.swift` — macOS search UI, `Sources/iOS/SearchView.swift` — iOS
- `web/index.html` — standalone web app (no backend), deployed via Vercel to `nimble.heyitsmejosh.com`
- `docs/index.html` — marketing/landing page, deployed via GitHub Pages (default `nulljosh.github.io/nimble` URL — the custom domain is taken by the web app)
- `Tests/` — 34 tests

## Build
```bash
xcodegen generate && open Nimble.xcodeproj
scripts/release-macos.sh   # signed + notarized Mac release zip
```
