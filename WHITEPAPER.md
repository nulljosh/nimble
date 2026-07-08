# Nimble Technical Whitepaper

**v1.3.0** | July 2026

Nimble is a native macOS instant-answer search bar: type a query, get a
direct answer (math result, definition, or factual snippet) instead of a page
of links.

## Query Classification and Answer Pipeline

`QueryEngine.classifyQuery()` is the core algorithm. It buckets an incoming
query into one of three types before deciding where the answer comes from:

1. **Math** — evaluated entirely offline via `NSExpression`, no network call.
   Covers arithmetic and standard operator precedence.
2. **Definition** — routed to the Wikipedia REST API for a summary extract.
3. **Factual** — routed to the DuckDuckGo Instant Answer API.

Classification happens before any network request fires, so math queries
resolve instantly with zero latency and no external dependency.

## Structure

- `Sources/Models/QueryEngine.swift` — classification, math eval, API queries
- `Sources/Models/AppState.swift` — app state, theme, preferences (`@Observable`)
- `Sources/Views/SearchView.swift` — main search UI
- `Tests/` — 26 tests covering QueryEngine and Preferences

## Platform

SwiftUI, macOS 14+. `MenuBarExtra` integration is currently disabled — blocked
on a macOS Tahoe beta SDK bug, re-enable once the SDK stabilizes.

## Security / Privacy

Math queries never leave the device. Definition/factual queries go to
DuckDuckGo and Wikipedia's public APIs only — no API keys, no user accounts,
no query logging.

## License

MIT 2026, Joshua Trommel
