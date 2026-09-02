<img src="icon.svg" width="80" style="border-radius:18px">

# Nimble

![version](https://img.shields.io/badge/version-v1.0.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) [![GitHub](https://img.shields.io/badge/GitHub-nulljosh%2Fnimble-black?logo=github)](https://github.com/nulljosh/nimble)

Ask a question. Get one sentence back.

Nimble works out what you meant, math, fact or definition, and answers in a line. Math never leaves the device. Everything else goes to two open models at once, and if they both give up, DuckDuckGo and Wikipedia catch it.

**[nimble.heyitsmejosh.com →](https://nimble.heyitsmejosh.com)**

The original [Nimble](https://github.com/Maybulb/Nimble) was Electron plus Wolfram|Alpha and died in 2020. This one is native, and written from scratch.

## Features

- **Knows what you meant.** Math, fact or definition, sorted before it answers.
- **Two models, one answer.** Gemma and Qwen3 run in parallel on Cloudflare Workers AI. If they agree, you get it. If they don't, the two are folded into one sentence. The label under the answer names who said it.
- **Falls back. Never fails.** DuckDuckGo, then Wikipedia, when the models say UNKNOWN.
- **Math and units offline.** Arithmetic, trig, sqrt, log, powers, pi, and unit conversion ("5 miles to km", "100 F to C"). No network.
- **Graphs.** "y = x^2" or "plot sin(x)" draws the curve, sampled by Curvely.
- **Numbers get a source.** A model's number is a guess, so numeric answers are cross-checked against DuckDuckGo and the sourced one wins.
- **Summon it anywhere.** ⌥Space, or the menu bar.
- **8 themes.** Orange, red, yellow, green, blue, purple, pink, contrast.
- **Updates itself.** Checks GitHub Releases daily. Or check by hand in Preferences.
- No API keys. No telemetry. 34 tests.

## Platforms

| | |
|---|---|
| macOS | Native SwiftUI HUD + menu bar item, ⌥Space to summon |
| iOS | Native SwiftUI app |
| Web | One page, [web/index.html](web/index.html). Same engine |

<img src="docs/screenshots/ios-search.jpg" width="240">

## Installing the Mac app

Download the latest `.zip` from [Releases](https://github.com/nulljosh/nimble/releases/latest), unzip, drag `Nimble.app` to `/Applications`.

From v1.0.1 on, releases are Developer ID signed and notarized. They open first try.
The v1.0.0 build was signed with a development certificate only, so macOS quarantines it.
Approve it under System Settings, Privacy & Security, "Open Anyway". Or just update.

Maintainers: `scripts/release-macos.sh` signs, notarizes, staples and packages in one
pass. It needs a Developer ID Application certificate and a `notarytool` credential
profile. The script header explains both.

## Answer engine

`worker/worker.js` is a Cloudflare Worker with a Workers AI binding. **There is no API key
anywhere.** Not in the binary, not in the repo. It runs `@cf/google/gemma-4-26b-a4b-it` and
`@cf/qwen/qwen3-30b-a3b-fp8` side by side, capped at 20 requests a minute per IP.

```bash
cd worker && npx wrangler deploy
```

## Architecture

<img src="architecture.svg" width="600">

Open work is in [roadmap.md](roadmap.md).

## Development

```bash
xcodegen generate && open Nimble.xcodeproj
```

Requires Xcode + xcodegen.

## License

MIT 2026 Joshua Trommel

## Whitepaper

[Technical whitepaper](WHITEPAPER.md)
