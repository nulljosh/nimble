<img src="icon.svg" width="80" style="border-radius:18px">

# Nimble

![version](https://img.shields.io/badge/version-v1.3.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) [![GitHub](https://img.shields.io/badge/GitHub-nulljosh%2Fnimble-black?logo=github)](https://github.com/nulljosh/nimble)

Native macOS instant-answer search. Smart query classification. Math offline. Factual questions prioritize instant answers.

**[nimble.heyitsmejosh.com →](https://nimble.heyitsmejosh.com)**

Inspired by the original [Nimble](https://github.com/Maybulb/Nimble) (Electron + Wolfram|Alpha, deprecated 2020).

## Features

- **Smart classification**: math/factual/definition intent detection
- **Instant answers**: DDG API → Wikipedia (prioritized for questions)
- **Offline math**: Arithmetic, trig, sqrt, log, powers, pi
- **8 themes** (orange, red, yellow, green, blue, purple, pink, contrast)
- **No API keys** required, 26 tests passing
- Copy results, search links

> MenuBarExtra disabled (macOS Tahoe beta bug). Re-enabled when SDK stabilizes.

## iOS companion

<img src="docs/screenshots/ios-search.jpg" width="240">

## Roadmap

- [x] Verified math already returns direct computed answers, never a Wikipedia link — `AppState.performQuery()` runs `evaluateMath()` first and short-circuits before any network query. Confirmed via `QueryEngineTests` (21/21 pass) and live DDG API check.
- [ ] Current-officeholder queries ("who is the current president") — DDG + Wikipedia return the *office* page, not the incumbent. Addressed by a single Gemma call via a Cloudflare Worker proxy (`worker/worker.js`, code merged); blocked on deploying the Worker with a Gemma API key before it ships.

## Architecture

<img src="architecture.svg" width="600">

## Development

```bash
xcodegen generate && open Nimble.xcodeproj
```

Requires Xcode + xcodegen.

## License

MIT 2026 Joshua Trommel
