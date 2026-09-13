# Nimble Technical Whitepaper

**v1.0.0** | August 2026

Ask a question. Get one sentence back.

A search engine hands back ten links because it doesn't actually know the answer,
just where the answer probably lives. Nimble exists to skip that step: type a
query and get the answer, a number, a definition or a fact, instead of a page of
links to read through. It's a native search bar for macOS, iOS and the web.

## Query Classification and Answer Pipeline

`QueryEngine.classifyQuery()` is the core algorithm. It buckets an incoming
query into one of three types before deciding where the answer comes from:

1. **Math**: evaluated entirely offline via `NSExpression`, no network call,
   because a query like "12% of 340" has one correct answer that a device can
   compute itself; sending it to a server would only add latency.
2. **Definition**: routed to the Wikipedia REST API for a summary extract,
   the same source most people would end up at anyway, minus the page.
3. **Factual**: routed to the DuckDuckGo Instant Answer API, with a Gemma
   model on Cloudflare Workers AI behind it for queries the instant-answer
   endpoint has nothing for, since a fixed API only covers a fixed set of
   question shapes.

Classification happens before any network request fires, so math queries
resolve instantly with zero latency and no external dependency, and the
common case (arithmetic) never depends on anything being online at all.

## Structure

- `Sources/Models/QueryEngine.swift`: classification, math eval, API queries
- `Sources/Models/AppState.swift`: app state, theme, preferences (`@Observable`)
- `Sources/Views/SearchView.swift`: main search UI
- `Tests/`: 26 tests covering QueryEngine and Preferences

## Platform

SwiftUI, macOS 14+. A `MenuBarExtra` item and a global ⌥Space hotkey summon the
window from anywhere, because a search bar that requires switching to an app
first has already lost to just typing the query into whatever's on screen.

## Security / Privacy

Math queries never leave the device, since there's nothing a server could add
to arithmetic. Definition and factual queries go to Wikipedia, DuckDuckGo, and
the project's own Cloudflare Worker, no user accounts and no query logging,
because a search bar people summon reflexively shouldn't carry a memory of
every question asked.

## License

MIT 2026, Joshua Trommel
