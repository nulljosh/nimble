# Product Hunt, Nimble Answers

## Name
Nimble Answers

## Tagline (<=60 chars)
Ask a question. Get one sentence back.

## Description (<=260 chars)
Nimble skips the ten blue links. Type a question and get the answer: math evaluated offline on your device, facts and definitions from DuckDuckGo and Wikipedia, two AI models on standby for the rest. No account, no tracking, no subscription.

## Topics (3)
- Productivity
- Search
- macOS

## First comment (maker story)
I built Nimble because I was tired of opening a browser, typing a question into a search bar, and reading ten blue links to find one sentence I actually needed. A search engine hands back links because it doesn't know the answer, just where the answer probably lives. Nimble skips that step.

It works out what you're asking before it answers. Math (arithmetic, trig, roots, logs, unit conversions) runs entirely offline on your device with NSExpression, so it's instant and works on a plane. Definitions go to Wikipedia. Facts go to DuckDuckGo's instant answers. If those come up empty, two open models, Gemma and Qwen3, run in parallel on Cloudflare Workers AI, and if they disagree, the two answers get folded into one line. If both give up, DuckDuckGo and Wikipedia catch it. You can also just type "y = x^2" or "plot sin(x)" and it draws the curve.

It's native SwiftUI on macOS and iOS, with a global hotkey (⌥Space) and a menu bar item on Mac, plus a web version at nimble.heyitsmejosh.com. There's a terminal version too. No API keys anywhere, not in the binary, not in the repo. No accounts, no telemetry, no query logging.

Nimble Answers is free. No subscription, no paywall, nothing planned. Free is the whole model: it's the front door to everything else I'm building, so it stays open.

## Pricing line
Free. No subscription, no paid tier.

## Links
- Web: https://nimble.heyitsmejosh.com
- App Store: https://apps.apple.com/app/id6807858746
- GitHub: https://github.com/nulljosh/nimble
