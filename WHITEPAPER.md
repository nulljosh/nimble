# Nimble Technical Whitepaper

**v6.17.0** | October 2026

Ask a question. Get one sentence back.

A search engine hands back ten links because it doesn't actually know the answer,
just where the answer probably lives. Nimble skips that step: type a query and get
the answer, a number, a definition or a fact, instead of a page of links to read
through. It's one search bar on iPhone, Mac, Windows, Android and the web.

## Query Classification and Answer Pipeline

`QueryEngine.classifyQuery()` is the core algorithm. It sorts each query before any
network call fires:

1. **Math, units and graphs**: evaluated on the device. "12% of 340" has one correct
   answer that a phone can compute itself, so it never leaves the device. The
   parser is hand-written (`MathLexer` and `MathParser` in Swift, the same logic in
   `docs/engine.js` and Kotlin), because a parser that silently ignores trailing
   junk is worse than none.
2. **Live cards**: weather, currency, local time, markets (crypto, currency pairs,
   stocks) and sports scores each have their own pattern-gated source. A stock quote
   that cannot be fetched says "Quote unavailable right now" and never guesses.
3. **Everything else**: the answer proxy on Cloudflare Workers AI, with DuckDuckGo
   and Wikipedia behind it.

## The Answer Proxy

`worker/worker.js` is the one place models run. It is built to stay inside Workers AI's
free tier of 10,000 neurons a day:

- **One model first.** Qwen3 answers alone unless the question needs a second look:
  a date, a number, a time-sensitive word, or Qwen saying UNKNOWN. Gemma joins then.
- **A tie-breaker, not a referee.** When Qwen and Gemma split, a third model (Llama)
  votes. If it matches one of them, that answer wins. If nothing agrees, the app shows
  "Sources disagree" with both answers and their model names, and no photo.
- **Six hours of cache.** Known answers are kept in the Cache API for six hours (one
  hour for time-sensitive questions). A repeat costs no neurons. UNKNOWN and errors
  are never cached.
- **A daily guard.** The Worker estimates neurons per call and stops calling AI at
  8,500 a day. Past that, questions fall back to DuckDuckGo and Wikipedia. `GET /stats`
  reports the day's counts.
- **Freshness.** Time-sensitive answers carry an "as of" line with the check time.

Clients never call a model vendor directly by default. Keys for Claude, OpenAI or
Ollama stay on the device if the user adds them in Settings, and the call goes
straight to that vendor.

## Structure

- `Sources/Models/QueryEngine.swift`: classification, math eval, API queries
- `Sources/Models/AppState.swift`: app state, theme, preferences (`@Observable`)
- `Sources/Views/SearchView.swift`: macOS search UI; `Sources/iOS/` has the three-tab iPhone app
- `kmp/`: Kotlin Multiplatform engine and Compose UI for Android, Windows and desktop
- `docs/`: the web app and landing page, with the same engine in `engine.js`
- `Tests/`: Swift test suite (QueryEngine, Preferences, History, offline pack, sports and more)
- `test/`: 295 web tests, run with `npm test`

## Platform

SwiftUI on macOS 14+ and iOS 17+. A `MenuBarExtra` item and a global ⌥Space hotkey
summon the Mac window from anywhere, because a search bar that needs an app switch
first has already lost to just typing the query into whatever is on screen. iPhone
has three tabs: Ask, History and Settings. History keeps each question with its
saved answer, and deletes sync as tombstones so an old copy on another device can't
bring them back.

## Offline pack

Any Nimble client can hold a small copy of Wikipedia. It is the opening sentences
(up to about 1,000 characters) of the 9,000 most-viewed English articles over the last
120 days, gzipped plain JSON, about 1.9 MB. The user downloads it once, from the
Settings row on iPhone, Mac and Android or from the menu on the web. Nothing
downloads on its own. A question gets the sentence or two that share its words; a
"capital of" or "population of" question gets the sentence with that relation word,
and nothing when no sentence has it. When the network is down, or every online source
comes back empty, the same lookup runs against the pack: a title or alias match, then
a keyword score. A weak score says "Not in the offline pack." It never guesses. The
pack is rebuilt monthly by `scripts/build-offline-pack.mjs` from Wikimedia pageviews
and Wikipedia summaries, and is credited CC BY-SA 4.0 on every answer.

## Security / Privacy

Math never leaves the device. Questions that need an answer go to the project's own
Worker, and from there to the models, DuckDuckGo and Wikipedia. There are no user
accounts and no query logging. Recent questions and saved answers stay on the device;
iCloud only gets questions and times.

## What changed in 6.0

Since 5.0: the iPhone app gained three tabs, History with saved answers and
multi-select share and delete, and a New question button. Settings gained an accent
picker. The "Sources disagree" card reached every client. Sports and markets became
cards. Freshness lines went on time-sensitive answers. The offline Wikipedia pack
shipped on web, iPhone, Mac and Android. The Worker became quota-aware: one model
first, a six-hour answer cache, a daily neuron guard and `/stats`.

## License

MIT 2026, Joshua Trommel
