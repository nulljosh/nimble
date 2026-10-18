# Nimble Technical Whitepaper

**v8.0.0** | October 2026

Ask a question. Get one sentence back.

A search engine hands back ten links because it doesn't know the answer, only where it
probably lives. Nimble skips that step. You type a query and get the answer, a number,
a definition or a fact. It is one search bar on iPhone, Mac, Windows, Android and the web.

## How a question is answered

`QueryEngine.classifyQuery()` sorts each query before any network call fires:

1. **Math, units and graphs** run on the device. "12% of 340" has one correct answer a
   phone can compute, so it never leaves. The parser is hand-written (`MathLexer` and
   `MathParser` in Swift, the same logic in `docs/engine.js` and Kotlin), because a
   parser that ignores trailing junk is worse than none.
2. **Live cards**: weather, currency, local time, markets and sports each have their own
   source. A quote that can't be fetched says so and never guesses.
3. **Everything else** goes to the answer proxy, with DuckDuckGo and Wikipedia behind it.

## The answer proxy

`worker/worker.js` is the one place models run. It is built to stay inside free tiers.

- **Groq first.** `gpt-oss-120b`, then `qwen3.8-27b`, then `gpt-oss-20b`, each with its own
  free daily cap. A capped or failing model hands to the next, then to Cloudflare Workers AI.
- **Grounded.** Each question gets a short Wikipedia excerpt, and the models are told the
  excerpt beats their memory. That is how "who is the prime minister" stays current.
- **One model first.** On Cloudflare, Qwen3 answers alone unless the question has a date,
  a number or a time-sensitive word. Then Gemma joins, and Llama breaks a tie. If nothing
  agrees, the app shows "Sources disagree" with both answers.
- **Cached.** Known answers are kept for six hours (one for time-sensitive ones). A repeat
  costs nothing. UNKNOWN and errors are never cached.
- **Guarded.** Workers AI stops at 8,500 estimated neurons a day. Groq keeps answering.
  When every model is out, the app says the free AI is resting and falls back to
  DuckDuckGo and Wikipedia.
- **Counted.** `GET /stats` reports the day's calls, cache hits and Groq refusals, kept
  globally by a Durable Object.

Keys for Claude, OpenAI or Ollama stay on the device if you add them in Settings, and the
call goes straight to that vendor.

## Offline pack

Any client can hold a small copy of Wikipedia: the opening sentences of the 9,000
most-viewed English articles, about 1.9 MB, downloaded only when you ask. With no network,
or when every online source comes back empty, the same lookup runs against the pack. A weak
match says "Not in the offline pack" and never guesses. It is rebuilt monthly and credited
CC BY-SA 4.0.

## Platforms

SwiftUI on macOS 14+ and iOS 17+. A menu bar item and the ⌥Space hotkey summon the Mac
window from anywhere. iPhone has three tabs: Ask, History and Settings. Kotlin
Multiplatform (`kmp/`) covers Android, Windows and Linux desktop. The web app and landing
page live in `docs/`. Nim, the mascot, waves, thinks and dozes on every platform.

## Privacy

Math never leaves the device. Other questions go to Nimble's Worker, and from there to
Groq, Cloudflare, DuckDuckGo and Wikipedia. There are no accounts and no query logging.
History stays on the device; iCloud only gets questions and times.

## Checked

A 154-question exam runs against the live Worker. The latest run through Groq passed 152.
`npm test` runs the web tests, `xcodebuild test` the Swift ones, and Gradle the Kotlin ones.

## License

MIT 2026, Joshua Trommel
