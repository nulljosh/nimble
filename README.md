<img src="icon.svg" width="80" height="80" alt="Nimble icon">

![version](https://img.shields.io/badge/version-v10.0.0-blue) [![tests](https://github.com/nulljosh/nimble/actions/workflows/test.yml/badge.svg)](https://github.com/nulljosh/nimble/actions/workflows/test.yml) [![exam](https://github.com/nulljosh/nimble/actions/workflows/exam.yml/badge.svg)](https://github.com/nulljosh/nimble/actions/workflows/exam.yml) ![license](https://img.shields.io/badge/license-Apache%202.0-green)

Ask a question. Get one sentence back.

Math, units and graphs answer on the device. Everything else goes to an open model, and a second model checks dates, numbers and fresh facts. Every answer names its source. No API keys, no accounts, no telemetry.

<p>
<img src="docs/screenshots/ios-site.png" width="180" alt="Ask about a website">
<img src="docs/screenshots/ios-convert.png" width="180" alt="Unit conversion, offline">
<img src="docs/screenshots/ios-graph.png" width="180" alt="A graph, drawn offline">
<img src="docs/screenshots/ios-dark.png" width="180" alt="Dark mode">
</p>

## Get it

iPhone and Mac on the [App Store](https://apps.apple.com/app/nimble-answers/id6807858746). A signed Mac build, plus Windows and Android, on the [latest release](https://github.com/nulljosh/nimble/releases/latest). In a terminal: `brew install nulljosh/tap/nimble`, then `nimble "question"`.

## Features

Weather, currency, local time, word origins, markets and scores come back as cards. Follow-ups work: ask "and in celsius?" and it remembers. Ask out loud, hear the answer read back, or share it as a card. Siri, Spotlight, widgets, the Watch and the Mac menu bar (⌥Space) all answer too. Nine languages.

An optional offline pack holds the top 9,000 Wikipedia intros in 1.9 MB. Private mode keeps every question on the device.

On a 154-question exam the free models score 154 of 154, with a median answer in 0.94 s. The exam badge above is the weekly run of a bigger 1,049-question exam against the live app. Method in [docs/BENCHMARK.md](docs/BENCHMARK.md).

Agents get the same engine over REST and MCP. See [docs/API.md](docs/API.md).

## Development

```bash
xcodegen generate && open Nimble.xcodeproj   # macOS + iOS
node --test 'test/*.test.*js'               # web engine
cd worker && npx wrangler deploy             # answer proxy
```

<img src="architecture.svg" width="600">

[Roadmap](roadmap.md) · [Whitepaper](WHITEPAPER.md)

## License

Apache 2.0, 2026 Joshua Trommel. See [LICENSE](LICENSE).
