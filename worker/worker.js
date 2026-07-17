// Nimble answer proxy. Runs Gemma + Qwen in parallel on Cloudflare Workers AI
// (no external API key needed) and synthesizes one answer.
// POST { "q": "who is the ceo of apple" } -> { "answer": "Tim Cook." } or { "answer": "UNKNOWN" }
const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";
const SYSTEM =
  "Answer in one short factual sentence. No preamble, no markdown. If you do not know, reply exactly UNKNOWN.";

export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("POST only", { status: 405 });

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
        max_tokens: 600,
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

    if (qwenAnswer === "UNKNOWN" && gemmaAnswer === "UNKNOWN") return json({ answer: "UNKNOWN" });
    if (qwenAnswer === "UNKNOWN") return json({ answer: gemmaAnswer });
    if (gemmaAnswer === "UNKNOWN") return json({ answer: qwenAnswer });
    if (qwenAnswer === gemmaAnswer) return json({ answer: qwenAnswer });

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
    return json({ answer });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
