# Roadmap

## Open for contribution: bring-your-own-API-key

Compute is the bottleneck. Nimble already runs free Gemma + Qwen on Cloudflare
Workers AI with no key required — this adds an opt-in path for people who want
to use their own OpenAI/Anthropic/Google key, with the free models staying as
the default and fallback.

### Task 1 — Worker: accept user-supplied API key

Repo: nulljosh/nimble, file: `worker/worker.js`

Right now every request runs Gemma + Qwen on Cloudflare Workers AI (`env.AI`, no key
needed). Add support for a user-supplied API key as an alternative provider, with
free Workers AI as the fallback when no key is given.

Requirements:
- POST body gains two optional fields: `provider` (`"openai" | "anthropic" | "google"`)
  and `apiKey` (string). If absent, behavior is unchanged — same Gemma+Qwen path.
- If `apiKey` is present, call that provider's chat completion API directly with the
  same `SYSTEM` prompt and question, single model call (no need to run two models when
  the user pays for their own).
- Never log or store the key. It passes through the request only; nothing persists it
  server-side (no KV write, no analytics).
- On provider error (bad key, rate limit, network), fall back to the existing free
  Gemma+Qwen path rather than failing the request.
- Keep the existing response shape: `{ answer, source }`. When using a user key, set
  `source` to the model name (e.g. "gpt-4o-mini", "claude-haiku", "gemini-flash").
- Match the existing style: no extra deps, plain `fetch()` calls, same CORS/json helpers
  already in the file.

Ship it as a PR against main.

### Task 2 — Client: BYOK settings

Repo: nulljosh/nimble. Add a "Use your own API key" setting, available on macOS
(SwiftUI Preferences), iOS (SwiftUI settings screen), and the web app
(`docs/index.html` + `docs/engine.js`).

- A settings field: provider picker (OpenAI / Anthropic / Google) + API key text
  field (secure/masked input).
- Store the key locally only: Keychain on macOS/iOS, localStorage on web. Never send
  it anywhere except directly to `worker/worker.js` in the request body over HTTPS.
- When a key is set, every `/ask` request includes `{ provider, apiKey }` in the POST
  body (see `worker.js`'s existing fetch call for the current request shape).
- When no key is set, behavior is exactly as today (free Gemma+Qwen, no key field
  sent).
- Add a small "Free tier" vs "Your API key" indicator near the answer, matching the
  existing "source" label style already shown under answers.
- Keep it optional and low-friction — one settings row, not a whole onboarding flow.

Ship it as a PR against main.
