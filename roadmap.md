# Nimble roadmap

## Completed (2026-07-29)
- [x] Web app redesigned from tiny centered box to full viewport (v1.0.0 shipped)
- [x] Icon redesigned to match brand aesthetic
- [x] Architecture diagrams refreshed
- [x] README trimmed and updated
- [x] Tagged GitHub release v1.0.0 with signed macOS binary

## Open
- Current-officeholder queries ("who is the current president") — DDG + Wikipedia return the *office* page, not the incumbent. Fix is a Gemma call via the Cloudflare Worker proxy (`worker/worker.js`, merged); blocked on deploying the Worker with a Gemma API key.
- Sync iOS UI polish to match the web app's classification/theming (mostly there — web is the newest surface).
- **App Store submission**: bundle IDs now registered (`com.nulljosh.nimble` macOS id `XM9AAAAYS6`, `com.nulljosh.nimble.ios` id `NU796452Z2`, both via `asc bundle-ids create`). Still blocked on creating the two ASC app records via browser (asc-app-create-ui skill) — the New App dialog's "Primary Language" field is a custom Ember Power Select widget that isn't responding to standard click/select/keyboard automation (tried native `<select>` value-set, click+arrow-keys, and clicking the rendered option directly; all silently no-op). Needs either a fresh automation approach or the user picking Primary Language + Bundle ID manually (2 clicks) before handing back for the rest (SKU, User Access, Create, then archive/upload/metadata/screenshots/pricing/submit). GitHub release is the distribution channel until then.
- **Custom domain**: `nimble.heyitsmejosh.com` is taken by the web app; landing page needs its own, e.g. `nimbleapp.com` (maybulb.com is already owned by someone else on the team). User will buy in a few weeks — check availability/price via Vercel domain tools when ready, confirm cost before purchasing.
