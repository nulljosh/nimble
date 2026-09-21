Note: frame as a build post, not a link drop, per r/webdev norms. Public, no beta gate.

## r/webdev

Title: I built a one-answer search page backed by a Cloudflare Worker running two AI models in parallel

Body:
Wanted a search page that gives one sentence instead of a results list, so the web version of Nimble classifies a query (math, definition, or fact) before deciding where the answer comes from. Math runs client-side, no network call. Definitions hit the Wikipedia REST API. Facts hit DuckDuckGo's instant answers, and if that's empty, a Cloudflare Worker with a Workers AI binding runs Gemma and Qwen3 side by side, no API key anywhere, and folds the two responses into one line if they disagree.

The whole worker is in the repo (worker/worker.js), capped at 20 requests a minute per IP, deployed with `npx wrangler deploy`. Landing page is just static HTML/JS, no framework.

Free to use, MIT licensed, would like eyes on the worker code if anyone wants to poke at the fallback logic.

Web: https://nimble.heyitsmejosh.com
Source: https://github.com/nulljosh/nimble
