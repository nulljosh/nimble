// Nimble answer proxy. Holds the Gemma key so it never ships in the app binary.
// POST { "q": "who is the ceo of apple" } -> { "answer": "Tim Cook." } or { "answer": "UNKNOWN" }
const MODEL = "gemma-4-31b-it";
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMMA_KEY },
        body: JSON.stringify({
          // Gemma has no system role; prepend the instruction to the user turn.
          contents: [{ role: "user", parts: [{ text: `${SYSTEM}\n\nQuestion: ${q}` }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 400 },
        }),
      });
    } catch {
      return json({ error: "upstream unreachable" }, 502);
    }
    if (!r.ok) return json({ error: "upstream", status: r.status }, 502);

    const data = await r.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    // Gemma 4 emits reasoning parts flagged thought:true; the answer is the non-thought part.
    const answer = parts.filter((p) => !p.thought).map((p) => p.text).join("").trim() || "UNKNOWN";
    return json({ answer });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
