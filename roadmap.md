# Nimble roadmap

## Open
- Current-officeholder queries ("who is the current president") — DDG + Wikipedia return the *office* page, not the incumbent. Fix is a Gemma call via the Cloudflare Worker proxy (`worker/worker.js`, merged); blocked on deploying the Worker with a Gemma API key.
- Sync iOS UI polish to match the web app's classification/theming (mostly there — web is the newest surface).
- **App Store submission**: bundle IDs now registered (`com.nulljosh.nimble` macOS id `XM9AAAAYS6`, `com.nulljosh.nimble.ios` id `NU796452Z2`, both via `asc bundle-ids create`). Still blocked on creating the two ASC app records via browser (asc-app-create-ui skill) — the New App dialog's "Primary Language" field is a custom Ember Power Select widget that isn't responding to standard click/select/keyboard automation (tried native `<select>` value-set, click+arrow-keys, and clicking the rendered option directly; all silently no-op). Needs either a fresh automation approach or the user picking Primary Language + Bundle ID manually (2 clicks) before handing back for the rest (SKU, User Access, Create, then archive/upload/metadata/screenshots/pricing/submit). GitHub release is the distribution channel until then.
- **Custom domain**: `nimble.heyitsmejosh.com` is taken by the web app; landing page needs its own, e.g. `nimbleapp.com` (maybulb.com is already owned by someone else on the team). User will buy in a few weeks — check availability/price via Vercel domain tools when ready, confirm cost before purchasing.
- **Design system + landing page/splash screen**: DONE 2026-08-02 — pulled maybulb.com's actual CSS (`#ffca30` yellow, black text, Avenir Next stack, flat pill-free buttons, 2px yellow section dividers) and applied it to `docs/index.html` (buttons/dividers/font restyled to match). Added `docs/splash.html` loading screen (yellow bg, pulsing icon mark). Not yet wired as an iOS LaunchScreen — web-only splash for now.

## From Apple Notes (imported 2026-08-04)
- [ ] **Logo provenance — needs a decision.** maybulb.com is a real third party (a three-person studio) whose own shipping macOS product is *also* called Nimble ("a simple but powerful Wolfram|Alpha menubar client"), and `maybulb.com/img/logo.svg` is their titled "Bulby" artwork. Shipping a byte-copy of their logo under the same product name is a trademark exposure and a likely App Review rejection, so the mark that landed is an original bulb in the same spirit (their `#ffca30` yellow, black rounded-square badge) rather than their file. Their yellow + Avenir/Europa fallback stack are not protectable and were used as asked. Decide whether to (a) keep the original bulb, (b) rename the app to clear the collision, or (c) get written permission from Maybulb. Same question already flagged for wiretext ("find a custom name rather than copying the name from the source idea").
- [ ] Re-upload the new icon to App Store Connect once the two app records exist (blocked on the Ember Power Select issue under **App Store submission** above).
- [ ] `docs/splash.html` still isn't wired as an iOS LaunchScreen — web-only splash.

## Decision 2026-08-04

Rename decision REVERSED by Joshua 2026-08-04: **Nimble keeps its name.** Do not rename it; do not re-raise this unprompted.

Context kept only so the risk is known, not as a task: maybulb.com is a real third-party studio whose own shipping macOS product is also called Nimble. The practical exposure is an App Store name collision at submission time. If App Review ever rejects on the name, that is the moment to revisit, and `asc-name-creator` is the tool for it. The bulb mark shipped here is original work in their spirit, not their artwork, so it carries no separate risk.

## From Apple Notes (imported 2026-08-11)
- [ ] iOS app must mirror the website in functionality + UI (incl. shopping)
- [ ] Site needs a landing/marketing page — currently it drops straight into the app with no preview
