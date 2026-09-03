// Nimble answer proxy. Runs Gemma + Qwen in parallel on Cloudflare Workers AI
// (no external API key needed) and synthesizes one answer.
// POST { "q": "who is the ceo of apple" } -> { "answer": "Tim Cook." } or { "answer": "UNKNOWN" }
const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";
const SYSTEM =
  "Answer in one short factual sentence. No preamble, no markdown. If you do not know, reply exactly UNKNOWN.";

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    // Browsers can't call DuckDuckGo's JSON API directly (no CORS), so the web
    // app fetches it through here. Native apps still hit DDG themselves.
    const isDDG = req.method === "GET" && url.searchParams.has("ddg");
    if (req.method !== "POST" && !isDDG) return new Response("POST only", { status: 405, headers: CORS });

    if (isDDG) {
      const ddgQ = url.searchParams.get("ddg").slice(0, 500);
      const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(ddgQ)}&format=json&no_html=1&skip_disambig=1`);
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", ...CORS } });
    }

    // Public endpoint, and every AI request bills Workers AI. Throttle per client IP.
    // DDG proxying above is free and stays outside the limit: a page load used to spend
    // two of the 20/min on itself and a few reloads knocked the whole engine offline.
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "rate limited" }, 429);

    let q;
    try {
      q = (await req.json()).q;
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (typeof q !== "string" || !q.trim()) return json({ error: "empty q" }, 400);
    if (q.length > 500) return json({ error: "too long" }, 400);

    const ask = (model) =>
      env.AI.run(model, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${q} /no_think` },
        ],
        temperature: 0,
        max_tokens: 80, // ponytail: neurons bill per token; a sentence never needs 600
      })
        .then((d) => {
          const msg = d?.choices?.[0]?.message;
          // Reasoning models sometimes hit max_tokens mid-thought and leave content null;
          // fall back to the last sentence of the reasoning trace.
          const text = d?.response || msg?.content || msg?.reasoning?.split(/(?<=[.!?])\s+/).pop() || "";
          return text.trim() || "UNKNOWN";
        })
        .catch(() => "UNKNOWN");

    const [qwenAnswer, gemmaAnswer] = await Promise.all([ask(QWEN), ask(GEMMA)]);

    // The client shows `source` under the answer, so it has to name the models that
    // actually produced it — it used to hardcode "Gemma" for all four branches.
    if (qwenAnswer === "UNKNOWN" && gemmaAnswer === "UNKNOWN") return json({ answer: "UNKNOWN" });
    if (qwenAnswer === "UNKNOWN") return json({ answer: gemmaAnswer, source: "Gemma" });
    if (gemmaAnswer === "UNKNOWN") return json({ answer: qwenAnswer, source: "Qwen" });
    if (qwenAnswer === gemmaAnswer) return json({ answer: qwenAnswer, source: "Gemma + Qwen" });

    // Both models answered but disagree/differ in wording — synthesize one sentence.
    const synthesis = await env.AI.run(QWEN, {
      messages: [
        {
          role: "system",
          content:
            "Two AI models answered the same question. Merge them into one short, accurate factual sentence. No preamble, no markdown.",
        },
        {
          role: "user",
          content: `Question: ${q}\nAnswer A: ${qwenAnswer}\nAnswer B: ${gemmaAnswer}`,
        },
      ],
      temperature: 0,
      max_tokens: 200,
    }).catch(() => null);

    const answer =
      (synthesis?.response || synthesis?.choices?.[0]?.message?.content || "").trim() || qwenAnswer;
    return json({ answer, source: "Gemma + Qwen" });
  },
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
