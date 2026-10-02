# Nimble loop handoff (2026-10-02, evening)

## What the loop is

Ship Nimble 5.0.0 feature by feature. One subagent per slice (1.0 icon, 2.0 API, 3.0 memory, 4.0 cards, 5.0 voice), tests green, push, version bump. Each major closes with tag, GitHub release (notarized Mac zip, Windows msi, Android apk), landing + README + whitepaper synced, screenshots updated, What's New filed, ASC submit if iOS is in the release.

## Where things stand

Loop complete at 5.0.0 (2026-10-02). iOS 5.0.0 submitted WAITING_FOR_REVIEW. macOS live. Web live. Windows and Android via KMP.

- 1.0.0: Foundation (icon, web app, dark mode, offline percentages)
- 1.1.0: Glass icon via Icon Composer, /app web experience, 15% offline answers
- 2.0.0: REST /api and MCP /mcp endpoints backed by live QueryEngine, web consent prompt
- 3.0.0: Device-local search history (clearable), follow-up questions carrying last three turns
- 4.0.0: Answer cards (weather, currency, time, word origins), share-as-card, iPhone widget, menu-bar quick-ask
- 5.0.0: Voice in web/iOS/macOS/Windows/Android, five languages (en, fr, es, zh, pa), landing A grade, docs 100%, TUI fixed

Two known bugs remain in roadmap.md under "Open for contribution":
- iOS weather card for "weather in Vancouver" renders three dots instead of temperature
- Widget lags one answer behind async card updates

No blocked items.

## Next, in order

If resuming the loop:

1. File the two bugs as GitHub issues (weather card Vancouver dots, widget lag)
2. Fix and ship one at a time (one-line fixes likely)
3. Loop to 5.1.0 for bug fixes only, or move to the "Open for contribution" feature list

If not resuming the loop, leave the bugs in roadmap.md; they are low impact and listed for community contribution.

## Restart prompt

```
/loop /check ~/Documents/Code/nimble

Loop: Nimble bug fixes. Find the two open bugs in roadmap.md ("weather card for Vancouver", "widget lags one answer"). File as GitHub issues if not already filed. Assign one to yourself, fix and test green locally with `npm test` and `swift build -c release` for native. Push and bump version. If the other bug is a one-liner, grab that too and ship as 5.0.1. Cap: 15 min per bug, stop and return if either hits the cap.
```

---

Loop status: complete. Restarting should hit two minor bug fixes and close them out, then the roadmap moves to feature work ("Open for contribution" items like the Java/Electron ports).
