# Nimble roadmap

## Open
- Current-officeholder queries ("who is the current president") — DDG + Wikipedia return the *office* page, not the incumbent. Fix is a Gemma call via the Cloudflare Worker proxy (`worker/worker.js`, merged); blocked on deploying the Worker with a Gemma API key.
- Sync iOS UI polish to match the web app's classification/theming (mostly there — web is the newest surface).
- **App Store submission**: bundle IDs now registered (`com.nulljosh.nimble` macOS id `XM9AAAAYS6`, `com.nulljosh.nimble.ios` id `NU796452Z2`, both via `asc bundle-ids create`). Still blocked on creating the two ASC app records via browser (asc-app-create-ui skill) — the New App dialog's "Primary Language" field is a custom Ember Power Select widget that isn't responding to standard click/select/keyboard automation (tried native `<select>` value-set, click+arrow-keys, and clicking the rendered option directly; all silently no-op). Needs either a fresh automation approach or the user picking Primary Language + Bundle ID manually (2 clicks) before handing back for the rest (SKU, User Access, Create, then archive/upload/metadata/screenshots/pricing/submit). GitHub release is the distribution channel until then.
- **Custom domain**: `nimble.heyitsmejosh.com` is taken by the web app; landing page needs its own, e.g. `nimbleapp.com` (maybulb.com is already owned by someone else on the team). User will buy in a few weeks — check availability/price via Vercel domain tools when ready, confirm cost before purchasing.
- **Design system + landing page/splash screen**: DONE 2026-08-02 — pulled maybulb.com's actual CSS (`#ffca30` yellow, black text, Avenir Next stack, flat pill-free buttons, 2px yellow section dividers) and applied it to `docs/index.html` (buttons/dividers/font restyled to match). Added `docs/splash.html` loading screen (yellow bg, pulsing icon mark). Not yet wired as an iOS LaunchScreen — web-only splash for now.

## Ingested 2026-08-04
- [ ] Still missing a landing page (load animation is good, keep it)
- [ ] Logo should be the Maybulb lightbulb (pull icon from maybulb.com), not a magnifying glass — double-check source
- [ ] Build a nimble design system around the Maybulb yellow + Maybulb website font, and use it more widely
