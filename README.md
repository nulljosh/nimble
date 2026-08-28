<img src="icon.svg" width="80" style="border-radius:18px">

# Nimble

![version](https://img.shields.io/badge/version-v1.0.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) [![GitHub](https://img.shields.io/badge/GitHub-nulljosh%2Fnimble-black?logo=github)](https://github.com/nulljosh/nimble)

Instant-answer search for macOS, iOS, and the web. Classifies your query — math, factual, or definition — and answers in one sentence. Math runs fully offline; everything else goes to a pair of open models and falls back to DuckDuckGo and Wikipedia.

**[nimble.heyitsmejosh.com →](https://nimble.heyitsmejosh.com)**

Inspired by the original [Nimble](https://github.com/Maybulb/Nimble) (Electron + Wolfram|Alpha, deprecated 2020) — rebuilt native, from scratch.

## Features

- **Smart classification** — math / factual / definition intent detection
- **Two models, one answer** — Gemma and Qwen3 answer in parallel on Cloudflare Workers AI; matching answers pass through, differing ones are synthesized into a single sentence. The label under an answer names the models that produced it.
- **Falls back, never fails** — DuckDuckGo → Wikipedia when the models return UNKNOWN
- **Offline math** — arithmetic, trig, sqrt, log, powers, pi
- **Summon from anywhere** — ⌥Space global hotkey, plus a menu bar item
- **8 themes** — orange, red, yellow, green, blue, purple, pink, contrast
- **In-app updates** — checks GitHub Releases daily, plus a manual check in Preferences
- No API keys required · no telemetry · 34 tests

## Platforms

| | |
|---|---|
| macOS | Native SwiftUI HUD + menu bar item, ⌥Space to summon |
| iOS | Native SwiftUI app |
| Web | Single page — [web/index.html](web/index.html), same answer engine |

<img src="docs/screenshots/ios-search.jpg" width="240">

## Installing the Mac app

Download the latest `.zip` from [Releases](https://github.com/nulljosh/nimble/releases/latest), unzip, drag `Nimble.app` to `/Applications`.

Releases from v1.0.1 on are Developer ID-signed and notarized, so they open on first
launch. The v1.0.0 build was signed with a development certificate only — macOS
quarantines it and it has to be approved under System Settings → Privacy & Security →
"Open Anyway". If you are on that build, updating clears it.

Maintainers: build releases with `scripts/release-macos.sh`, which signs, notarizes,
staples and packages in one pass. It needs a Developer ID Application certificate and a
`notarytool` credential profile — see the header of the script.

## Answer engine

`worker/worker.js` is a Cloudflare Worker with a Workers AI binding — **no API key
anywhere**, in the binary or the repo. It runs `@cf/google/gemma-4-26b-a4b-it` and
`@cf/qwen/qwen3-30b-a3b-fp8` in parallel, rate-limited to 20 req/min per IP.

```bash
cd worker && npx wrangler deploy
```

## Architecture

<img src="architecture.svg" width="600">

See [roadmap.md](roadmap.md) for open work.

## Development

```bash
xcodegen generate && open Nimble.xcodeproj
```

Requires Xcode + xcodegen.

## License

MIT 2026 Joshua Trommel

## Whitepaper

[Technical whitepaper](WHITEPAPER.md)
