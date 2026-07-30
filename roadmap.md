# Nimble roadmap

- Current-officeholder queries ("who is the current president") — DDG + Wikipedia return the *office* page, not the incumbent. Fix is a Gemma call via the Cloudflare Worker proxy (`worker/worker.js`, merged); blocked on deploying the Worker with a Gemma API key.
- Sync iOS UI polish to match the web app's classification/theming (mostly there — web is the newest surface).
- **App Store submission**: never registered on ASC (no bundle ID, no app record — verified via `asc apps list`). First-time onboarding for both macOS + iOS: register bundle ID/certs, create app record via browser (asc-app-create-ui skill), archive/upload both targets, metadata, screenshots, pricing/availability, submit. Needs a dedicated session with headroom for the browser step. GitHub release is the distribution channel until then.
- **Custom domain**: `nimble.heyitsmejosh.com` is taken by the web app; landing page needs its own, e.g. `nimbleapp.com` (maybulb.com is already owned by someone else on the team). User will buy in a few weeks — check availability/price via Vercel domain tools when ready, confirm cost before purchasing.
