# Architecture

Nimble is an instant-answer search engine. Type a query; get the answer in milliseconds with the source. Deployed as a macOS HUD and menu bar app, iOS app, and web app. Local math evaluation (no network), factual questions answered by AI or DuckDuckGo, definitions from Wikipedia. Theme system and user-selectable AI engine (Nimble proxy, Claude, OpenAI, or Ollama).

## How it runs

macOS app: `Sources/NimbleApp.swift` registers a global hotkey (⌥Space) to show a borderless HUD window at the top-center of the screen. User types a query; `AppState.performQuery()` classifies it via `QueryEngine.classifyQuery()` (math, factual, definition, or unknown), runs the appropriate handler, and populates `state.result`. `SearchView.swift` watches `state.result` and renders the answer via `ResultView.swift` (specific views for math, definitions, color output, unit conversion, and graphs). Settings (`SettingsView.swift`) persist to `~/.Nimble/Preferences.json`, including theme and AI engine choice. The menu bar icon opens the HUD with a click.

iOS app: `Sources/iOS/NimbleApp.swift` wraps the search in a NavigationStack. No global hotkey; users tap to open. Preferences stored in UserDefaults. Includes a what's-new sheet on version bump.

Web app: `docs/index.html` (HTML + `docs/engine.js`) runs the same QueryEngine logic in JavaScript. Calls `docs/engine.js`'s own `tryMath()`, `tryConvert()`, `tryGraph()`, then falls through to an answer proxy for factual queries.

Answer pipeline:
1. **Math**: local `QueryEngine.evaluateMath()` (hand-written lexer + parser, replaces NSExpression which silently dropped trailing input)
2. **Conversion**: local unit table + math (e.g., "5 miles in km")
3. **Graphing**: fetch points from Curvely's `/api/sample` endpoint
4. **Factual/definition**: DuckDuckGo Instant Answer API, fallback to Wikipedia search
5. **AI fallback**: user's chosen engine (Nimble proxy on Workers AI, Claude, OpenAI, or Ollama)

## Files

| File | What it owns |
|---|---|
| `Sources/NimbleApp.swift` | macOS app entry: borderless HUD window, global hotkey registration, menu bar extra, settings scene |
| `Sources/iOS/NimbleApp.swift` | iOS app entry: window group, share button, what's-new sheet |
| `Sources/Models/QueryEngine.swift` | Query classification (math/factual/definition), DuckDuckGo + Wikipedia API calls, math evaluation |
| `Sources/Models/QueryEngine+Compute.swift` | Math evaluation: unit conversion, graph sampling via Curvely API |
| `Sources/Models/AppState.swift` | Observable state: query, result, theme, AI engine, preferences load/save, placeholder rotation |
| `Sources/Models/AIEngine.swift` | AI engine enum (nimble, claude, openai, ollama) with display names and request formatting |
| `Sources/Models/Preferences.swift` | Preferences struct: theme, math/math-update toggles, launch on startup (macOS), update check interval |
| `Sources/Models/QueryResult.swift` | Result enum: none, loading, math, text, definition, color, convert, graph |
| `Sources/Models/UpdateChecker.swift` | macOS-only: checks GitHub Releases for new versions |
| `Sources/Views/SearchView.swift` | macOS search UI: text input, result display, accessibility focus management |
| `Sources/Views/ResultView.swift` | Result rendering: math, text with source link, definitions, colors, conversions, graphs |
| `Sources/Views/ContextMenuView.swift` | Right-click menu: theme picker, AI engine selector, settings link |
| `Sources/Views/SettingsView.swift` | macOS settings: theme picker, math toggle, launch on startup, automatic updates, update check now button |
| `Sources/Views/AIEngineSettings.swift` | Reusable AI engine picker + key/model input fields (used by macOS settings and iOS preferences) |
| `Sources/Views/ThemePickerView.swift` | Theme circle button: toggles settings visibility on click |
| `Sources/Views/VisualEffectView.swift` | macOS HUD glass background wrapping NSVisualEffectView |
| `Sources/macOS/GlobalHotkey.swift` | Carbon RegisterEventHotKey wrapper for ⌥Space system-wide hotkey |
| `Sources/iOS/SearchView.swift` | iOS search UI: large search bar, results below in a scroll view, nav stack for context |
| `Sources/iOS/PreferencesView.swift` | iOS settings list: theme, AI engine, math toggle, about links |
| `Sources/iOS/WhatsNewSheet.swift` | Modal sheet on version bump: title, bullet features, dismiss |
| `docs/index.html` | Landing page: hero, mockup (device frame), "try it" demo, features, privacy link, GitHub link |
| `docs/engine.js` | JavaScript port of QueryEngine: tryMath, tryConvert, tryGraph, fallback to answer proxy |
| `docs/privacy.html` | Privacy policy: no accounts, no tracking, no data retention |
| `docs/splash.html` | Static splash screen (used by early PWA or app opening) |
| `docs/tokens.css` | Nimble design tokens: imports shared Jaybulb palette, adds theme aliases |
| `docs/devices.css` | CSS for device frames in mockups (iphone, android, windows, mac windows) |
| `Tests/` | QueryEngine (30 tests: arithmetic, functions, edge cases), Preferences (4 tests), AIConfig (2 tests) |
| `Package.swift` | Swift Package manifest: macOS/iOS targets, SwiftTUI for TUI variant |
| `worker/worker.js` | Cloudflare Worker answer proxy: calls Workers AI (Gemma + Qwen3 in parallel), synthesizes on disagreement |
| `kmp/composeApp/src/*/` | Android/desktop Kotlin Multiplatform: common SearchScreen, platform-specific entry points |
| `tui/` (Swift TUI variant, not deployed) | Terminal UI using SwiftTUI |
| `tui/main.swift` | CLI entry: fetches from `/api/sample` endpoint, renders results as text cards |
| `.github/workflows/` | CI/CD: build + test on push, release on tags |
| `Tests/PreferencesTests.swift` | Preferences persistence (load/save), theme colors, AI config |
| `Tests/QueryEngineTests.swift` | Query evaluation: 150+ cases (arithmetic, trig, functions, edge cases) |
| `vite.config.js` | Vite config for web app builds (if applicable) |
| `wrangler.toml` | Cloudflare Worker config for the answer proxy |
| `project.yml` | Project configuration (if using xcodegen) |

## Query classification

`QueryEngine.classifyQuery()` returns a QueryType enum (math, factual, definition, or unknown). Logic:
- If the query starts with digits, operators, or math functions (sin, sqrt, etc), it's math
- If it contains "what is", "who is", "define", etc, it's a definition request
- If it ends with a question mark or contains question words, it's factual
- Otherwise, try math first; if that fails, fall through to factual

Math evaluation uses a hand-written lexer + recursive-descent parser (replacing NSExpression which silently ignored trailing input like "2+2x" reporting 4 instead of failing). Supports: basic arithmetic, 40+ trig/log functions, unit conversion.

## AI engine selection

Four engines available:
- **Nimble** (default): Cloudflare Worker + Workers AI (Gemma + Qwen3), free, no API key needed
- **Claude/OpenAI/Ollama**: user provides API key or local URL; stays on device, never sent to Nimble's servers

Engine choice saved in Preferences and survives app restart. Missing API key = silent fallback to Nimble proxy.

## Gotchas

- macOS window has no title bar (`.fullSizeContentView` + no `.titled` style mask). Restoring `.titled` will break the flush layout.
- math parsing intentionally rejects "2+2x" with an error instead of silently interpreting "2+2" like NSExpression. This strictness is a feature, not a bug.
- Update checking runs on launch but throttles to 24-hour intervals (stored in Preferences).
- Query results are held in-memory; closing the app forgets them. This is intentional (no logging).
