Skip: no technical hook

# Hacker News

## Title (<=80 chars)
Show HN: Nimble Answers – ask a question, get one sentence back

## Body
Nimble is a native search bar for macOS, iOS and the web that skips the results page. It classifies a query as math, definition, or fact before answering: math runs offline on-device via NSExpression, definitions come from the Wikipedia REST API, and facts come from DuckDuckGo's Instant Answer API with two open models (Gemma and Qwen3) on Cloudflare Workers AI behind it for anything those don't cover. There's no API key anywhere in the binary or repo, no accounts, and no query logging. It's free, MIT licensed, and the source (including the Cloudflare Worker) is at github.com/nulljosh/nimble. Would love feedback on the classification logic and where it still guesses wrong.
