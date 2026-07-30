# Nimble roadmap

- Current-officeholder queries ("who is the current president") — DDG + Wikipedia return the *office* page, not the incumbent. Fix is a Gemma call via the Cloudflare Worker proxy (`worker/worker.js`, merged); blocked on deploying the Worker with a Gemma API key.
- Sync iOS UI polish to match the web app's classification/theming (mostly there — web is the newest surface).
