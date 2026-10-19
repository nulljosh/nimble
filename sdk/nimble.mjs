// Nimble API client, one file, no dependencies. Node 18+, Deno, Bun and browsers.
//   import { ask } from "./nimble.mjs";
//   const { answer, source } = await ask("capital of france");
// Returns the reply object (answer, source, refs, ...); answer is null when no model knew it.
export const ENDPOINT = "https://nimble-answers.trommatic.workers.dev/";

export async function ask(q, { key, turns, endpoint = ENDPOINT, timeoutMs = 15000 } = {}) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ q, ...(turns ? { turns } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`Nimble API ${r.status}`);
  const d = await r.json();
  return { ...d, answer: d.answer && d.answer !== "UNKNOWN" ? d.answer : null };
}
