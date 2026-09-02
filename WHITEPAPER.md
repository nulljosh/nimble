# Nimble Technical Whitepaper

**v1.3.0** | August 2026

Ask a question. Get one sentence back.

Nimble is a native search bar for macOS, iOS and the web. Type a query and get the
answer, a number, a definition or a fact, instead of a page of links.

## Query Classification and Answer Pipeline

`QueryEngine.classifyQuery()` is the core algorithm. It buckets an incoming
query into one of three types before deciding where the answer comes from:

1. **Math**: evaluated entirely offline via `NSExpression`, no network call.
   Covers arithmetic and standard operator precedence.
2. **Definition**: routed to the Wikipedia REST API for a summary extract.
3. **Factual**: routed to the DuckDuckGo Instant Answer API, with a Gemma
   model on Cloudflare Workers AI behind it for queries the instant-answer
   endpoint has nothing for.

Classification happens before any network request fires, so math queries
resolve instantly with zero latency and no external dependency.

## Structure

- `Sources/Models/QueryEngine.swift`: classification, math eval, API queries
- `Sources/Models/AppState.swift`: app state, theme, preferences (`@Observable`)
- `Sources/Views/SearchView.swift`: main search UI
- `Tests/`: 26 tests covering QueryEngine and Preferences

## Platform

SwiftUI, macOS 14+. A `MenuBarExtra` item and a global ⌥Space hotkey summon the
window from anywhere.

## Security / Privacy

Math queries never leave the device. Definition and factual queries go to
Wikipedia, DuckDuckGo, and the project's own Cloudflare Worker, no user
accounts and no query logging.

## License

MIT 2026, Joshua Trommel
