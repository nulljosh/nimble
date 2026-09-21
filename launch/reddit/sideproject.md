Note: check subreddit rules before posting (self-promo day/flair requirements vary). Public, no beta gate.

## r/SideProject

Title: I got tired of reading ten blue links for one answer, so I built a search bar that skips them

Body:
Every time I googled something simple, arithmetic, a conversion, a definition, a quick fact, I'd land on a results page and have to click through to find the one sentence I actually wanted. So I built Nimble: type a question, get the answer, nothing else.

It classifies what you're asking before it answers. Math runs entirely offline on-device (arithmetic, trig, roots, logs, unit conversion), so it's instant and works with no connection at all. Definitions come from Wikipedia's REST API. Facts come from DuckDuckGo's instant answers, and when those don't have it, two open models (Gemma and Qwen3) run in parallel on Cloudflare Workers AI. If both give up, it falls back to DuckDuckGo and Wikipedia search results instead of failing outright.

It's native SwiftUI on macOS and iOS, plus a web version and a terminal client. No API keys in the app or the repo, no accounts, no tracking. Free, MIT licensed.

Would genuinely like feedback on where the classification gets it wrong, i.e. questions it routes to the wrong source.

Web: https://nimble.heyitsmejosh.com
Source: https://github.com/nulljosh/nimble
