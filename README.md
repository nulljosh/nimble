<img src="icon.svg" width="80" style="border-radius:18px">

# Nimble

![version](https://img.shields.io/badge/version-v1.3.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) [![GitHub](https://img.shields.io/badge/GitHub-nulljosh%2Fnimble-black?logo=github)](https://github.com/nulljosh/nimble)

Native macOS instant-answer search. Smart query classification. Math offline. Factual questions prioritize instant answers.

Inspired by the original [Nimble](https://github.com/Maybulb/Nimble) (Electron + Wolfram|Alpha, deprecated 2020).

## Features

- **Smart classification**: math/factual/definition intent detection
- **Instant answers**: DDG API → Wikipedia (prioritized for questions)
- **Offline math**: Arithmetic, trig, sqrt, log, powers, pi
- **8 themes** (orange, red, yellow, green, blue, purple, pink, contrast)
- **No API keys** required, 26 tests passing
- Copy results, search links

> MenuBarExtra disabled (macOS Tahoe beta bug). Re-enabled when SDK stabilizes.

## Roadmap

- [x] Verified math already returns direct computed answers, never a Wikipedia link — `AppState.performQuery()` runs `evaluateMath()` first and short-circuits before any network query. Confirmed via `QueryEngineTests` (21/21 pass) and live DDG API check.
- [ ] "Who is the current president" style queries can't return a person-specific answer (e.g. a Donald Trump profile) from the existing DDG + Wikipedia pipeline — checked live: DDG's Instant Answer for "president of the united states" returns the *office* abstract with an empty `Answer` field and no incumbent data in its Infobox, and Wikipedia search resolves to the same office page. Getting an actual current-officeholder profile needs a different data source (e.g. a small LLM call or a maintained current-facts table) — out of scope for the existing offline/API-only architecture, flagging for a future feature decision rather than building it blind.

## Development

```bash
xcodegen generate && open Nimble.xcodeproj
```

Requires Xcode + xcodegen.

## License

MIT 2026 Joshua Trommel
