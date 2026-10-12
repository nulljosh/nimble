// Nimble answer proxy. Runs Gemma + Qwen in parallel on Cloudflare Workers AI
// (no external API key needed) and synthesizes one answer.
// POST { "q": "who is the ceo of apple", "turns": [{"q": "...", "a": "..."}] } -> { "answer": "Tim Cook." } or { "answer": "UNKNOWN" }
// turns is optional: the last three exchanges, so "and in celsius?" has something to refer to.
const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";
const LLAMA = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SYSTEM =
  "Answer in one short factual sentence. No preamble, no markdown. If you do not know, reply exactly UNKNOWN.";
// Model weights are frozen at their training cutoff, so "who is the current president"
// came back "Joe Biden". Ground every question in live Wikipedia intros plus today's date
// and tell the models the context beats their memory.
// ponytail: top-3 search intros, swap for a real search API if Wikipedia misses too often
async function freshContext(q, attempt = 0) {
  try {
    const r = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=800&format=json&formatversion=2&gsrsearch=" +
        encodeURIComponent(q),
      { headers: { "user-agent": "nimble-answers/1.0 (trommatic.workers.dev)" } },
    );
    // A throttled or empty Wikipedia reply leaves the models on their stale memory ("Joe Biden"),
    // so one retry after a beat is worth more than a fast wrong answer.
    const pages = (r.ok && (await r.json())?.query?.pages) || [];
    if (!pages.length && attempt === 0) { await new Promise((ok) => setTimeout(ok, 400)); return freshContext(q, 1); }
    const sorted = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    // Officeholder intros bury "The current prime minister is X" ten sentences deep, so keep
    // the lead plus any sentence naming who holds something now.
    const trim = (t = "") => {
      const sents = t.split(/(?<=[.!?])\s+/);
      return [...sents.slice(0, 4), ...sents.slice(4).filter((x) => /\b(current|incumbent|since)\b/i.test(x))].join(" ");
    };
    return { text: pages.map((p) => `${p.title}: ${trim(p.extract)}`).join("\n\n").slice(0, 6000), pages: sorted };
  } catch {
    return { text: "", pages: [] };
  }
}

// A photo rides on an AI answer only when the page it came from backs the sentence, the same
// agreement test the web engine uses. Wikipedia's lead image is sometimes a logo or flag: skipped.
const NOT_A_PHOTO = /\.svg(\.png)?(\?|$)|logo|flag|icon|coat[_ ]of[_ ]arms|seal|map|commons-/i;
function photoFor(answer, pages) {
  const keys = (s) => (s.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !GLUE.has(w));
  const want = [...new Set(keys(answer))];
  if (!want.length) return null;
  for (const p of pages) {
    const src = p.thumbnail?.source;
    if (!src || NOT_A_PHOTO.test(src) || !p.extract) continue;
    const have = new Set(keys(p.extract));
    if (want.filter((w) => have.has(w)).length >= Math.ceil(want.length * 0.6)) {
      return { url: src, width: p.thumbnail.width ?? null, height: p.thumbnail.height ?? null };
    }
  }
  return null;
}
const GLUE = new Set("that this with from which were have they their also been into about after there these those when where while would could should will".split(" "));

// Follow-up context from the client: at most 3 {q, a} string pairs, each side cut to 300 chars.
// Anything else is dropped. Never logged.
function cleanTurns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t.q === "string" && typeof t.a === "string" && t.q.trim() && t.a.trim())
    .slice(-3)
    .map((t) => ({ q: t.q.slice(0, 300), a: t.a.slice(0, 300) }));
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    // Browsers can't call DuckDuckGo's JSON API directly (no CORS), so the web
    // app fetches it through here. Native apps still hit DDG themselves.
    const isDDG = req.method === "GET" && url.searchParams.has("ddg");
    const isSite = req.method === "GET" && url.searchParams.has("site");
    const isNews = req.method === "GET" && url.searchParams.has("news");
    if (req.method !== "POST" && !isDDG && !isSite && !isNews) return new Response("POST only", { status: 405, headers: CORS });

    if (isDDG) {
      const ddgQ = url.searchParams.get("ddg").slice(0, 500);
      const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(ddgQ)}&format=json&no_html=1&skip_disambig=1`);
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", ...CORS } });
    }

    // "What's primitive.dev?" is about the site, so read its own title and description.
    // Browsers can't fetch other origins, hence here. Hostname is validated to a plain public
    // domain before fetching. Free like DDG, so it stays outside the rate limit.
    if (isSite) {
      const host = url.searchParams.get("site").toLowerCase();
      if (!/^(?:[a-z0-9-]{1,63}\.)+[a-z]{2,24}$/.test(host)) return json({ error: "bad host" }, 400);
      try {
        const r = await fetch(`https://${host}/`, { headers: { "user-agent": "nimble-answers/1.0 (trommatic.workers.dev)" }, signal: AbortSignal.timeout(5000) });
        const html = (await r.text()).slice(0, 200000);
        const meta = (re) => html.match(re)?.[1]?.replace(/\s+/g, " ").trim().replace(/&(#x?[0-9a-f]+|amp|quot|apos|nbsp|lt|gt);/gi, decodeEntity) || "";
        const description =
          meta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
          meta(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) ||
          meta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
          meta(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
        // Scrape past the meta tags: many landing pages leave the description empty or generic,
        // so also return the first headline and the first real paragraph of body text.
        const strip = (h) => h.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().replace(/&(#x?[0-9a-f]+|amp|quot|apos|nbsp|lt|gt);/gi, decodeEntity);
        const h1 = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").slice(0, 200);
        const text = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).find((t) => t.length > 60)?.slice(0, 400) || "";
        // js: the page ships scripts, so an empty body means it renders client-side.
        const js = /<script[\s>]/i.test(html);
        const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
        // The page's own share image, when it names one. Https only, resolved against the host.
        const ogImage = meta(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']*)["']/i) ||
          meta(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
        const image = safeImage(ogImage, `https://${host}/`);
        return json({ host, title: meta(/<title[^>]*>([^<]*)<\/title>/i), siteName: meta(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i), description, h1, text, js, favicon, image });
      } catch {
        return json({ host, title: "", description: "" });
      }
    }

    // "news" and "what's happening in <place>": the top three headlines from keyless RSS.
    // Free like DDG and site, so it sits outside the rate limit. Feed text is untrusted, so only
    // http(s) links survive and every string is stripped of tags and entities.
    if (isNews) {
      const place = url.searchParams.get("news").trim().slice(0, 80);
      return json({ items: await news(place) }, 200);
    }

    // Public endpoint, and every AI request bills Workers AI. Throttle per client IP.
    // DDG proxying above is free and stays outside the limit: a page load used to spend
    // two of the 20/min on itself and a few reloads knocked the whole engine offline.
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "rate limited" }, 429);

    let q, turns;
    try {
      const body = await req.json();
      q = body.q;
      turns = cleanTurns(body.turns);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (typeof q !== "string" || !q.trim()) return json({ error: "empty q" }, 400);
    if (q.length > 500) return json({ error: "too long" }, 400);

    // A bare follow-up ("and in celsius?") searches badly alone, so lead with the last question.
    const { text: context, pages } = await freshContext(turns.length ? `${turns[turns.length - 1].q} ${q}` : q);
    const reply = (o) => {
      const image = o.answer !== "UNKNOWN" ? photoFor(o.answer, pages) : null;
      return json(image ? { ...o, image } : o);
    };
    const today = new Date().toISOString().slice(0, 10);
    const system =
      `${SYSTEM} Today is ${today}. Your training data is out of date; when the reference text below ` +
      `covers the question, trust it over your memory. Never mention the reference text.` + (context ? `\n\nReference (live Wikipedia):\n${context}` : "");
    const ask = (model) =>
      env.AI.run(model, {
        messages: [
          { role: "system", content: system },
          ...turns.flatMap((t) => [
            { role: "user", content: `${t.q} /no_think` },
            { role: "assistant", content: t.a },
          ]),
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
          // Models narrate the grounding ("not mentioned in the provided reference") instead of
          // saying UNKNOWN; treat that as UNKNOWN so the client falls through to DDG/Wikipedia.
          // The same goes for the model quoting its own rules back ("The instructions say: ... reply exactly UNKNOWN").
          if (/\b(reference|provided (text|context))\b|reply exactly|\bthe instructions?\b|\bUNKNOWN\b/i.test(text)) return "UNKNOWN";
          // Telling the models today's date makes them echo it: "As of today, October 11, 2026, the CEO is X."
          // The date is ours, not the answer's; drop the preamble and recapitalize.
          const clean = text.trim().replace(/^as of (today,? )?(\w+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2}|\d{4})?,?\s*/i, "");
          return clean ? clean[0].toUpperCase() + clean.slice(1) : "UNKNOWN";
        })
        .catch(() => "UNKNOWN");

    const [qwenAnswer, gemmaAnswer] = await Promise.all([ask(QWEN), ask(GEMMA)]);

    // The client shows `source` under the answer, so it has to name the models that
    // actually produced it — it used to hardcode "Gemma" for all four branches.
    if (qwenAnswer === "UNKNOWN" && gemmaAnswer === "UNKNOWN") return reply({ answer: "UNKNOWN" });
    if (qwenAnswer === "UNKNOWN") return reply({ answer: gemmaAnswer, source: "Gemma" });
    if (gemmaAnswer === "UNKNOWN") return reply({ answer: qwenAnswer, source: "Qwen" });
    if (normalize(qwenAnswer) === normalize(gemmaAnswer)) return reply({ answer: qwenAnswer, source: "Gemma + Qwen" });

    // Qwen and Gemma disagree. Rather than let Qwen arbitrate its own dispute, ask a third,
    // independent model and take the majority — neutral, same call count either way.
    const llamaAnswer = await ask(LLAMA);
    if (llamaAnswer !== "UNKNOWN") {
      if (normalize(llamaAnswer) === normalize(qwenAnswer)) return reply({ answer: qwenAnswer, source: "Qwen + Llama" });
      if (normalize(llamaAnswer) === normalize(gemmaAnswer)) return reply({ answer: gemmaAnswer, source: "Gemma + Llama" });
    }

    // All three differ (or Llama came back UNKNOWN) — fall back to synthesizing one sentence.
    const synthesis = await env.AI.run(QWEN, {
      messages: [
        {
          role: "system",
          content:
            "Two AI models answered the same question. Merge them into one short, accurate factual sentence. No preamble, no markdown.",
        },
        {
          role: "user",
          content: `${turns.map((t) => `Earlier: ${t.q} -> ${t.a}\n`).join("")}Question: ${q}\nAnswer A: ${qwenAnswer}\nAnswer B: ${gemmaAnswer}`,
        },
      ],
      temperature: 0,
      max_tokens: 200,
    }).catch(() => null);

    const answer =
      (synthesis?.response || synthesis?.choices?.[0]?.message?.content || "").trim() || qwenAnswer;
    return reply({ answer, source: "Gemma + Qwen" });
  },
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

// Two models rarely emit byte-identical sentences even when they agree, so lowercase +
// strip punctuation + collapse whitespace before comparing, instead of paying for a
// synthesis call on every near-duplicate answer.
function normalize(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntity(_, e) {
  e = e.toLowerCase();
  if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10) || 32);
  return { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" }[e];
}

// Keyless news. Outlets come in FEEDS order and are interleaved, so the top three span outlets.
// A place keeps only items that name it; when fewer than three do, Google News search for the
// place tops up (its <source> tag names the outlet). Never unrelated headlines under a place.
const NEWS_FEEDS = [
  ["BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["CBC", "https://www.cbc.ca/webfeed/rss/rss-topstories"],
  ["NPR", "https://feeds.npr.org/1001/rss.xml"],
  ["The Guardian", "https://www.theguardian.com/world/rss"],
  ["Global News", "https://globalnews.ca/feed/"],
];
async function news(place) {
  const lists = await Promise.all(
    NEWS_FEEDS.map(([outlet, feed]) => feedItems(feed, outlet, place)),
  );
  let items = interleave(lists).slice(0, 3);
  if (place && items.length < 3) {
    const search = await feedItems(
      `https://news.google.com/rss/search?q=${encodeURIComponent(place)}&hl=en-CA&gl=CA&ceid=CA:en`,
      "",
      "",
    );
    const seen = new Set(items.map((i) => i.url));
    items = [...items, ...search.filter((i) => i.outlet && !seen.has(i.url))].slice(0, 3);
  }
  return items;
}

async function feedItems(feed, outlet, place) {
  try {
    const r = await fetch(feed, {
      headers: { "user-agent": "nimble-answers/1.0 (trommatic.workers.dev)" },
      signal: AbortSignal.timeout(5000),
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
      .map((m) => newsItem(m[1], outlet))
      .filter(Boolean);
    const keep = place ? items.filter((i) => `${i.title} ${i.sentence}`.toLowerCase().includes(place.toLowerCase())) : items;
    return keep.slice(0, 5);
  } catch {
    return [];
  }
}

// A picture URL from a page or feed: https only, relative links resolved against base, and the
// width and height kept when the source states them. Anything else is no picture.
function safeImage(raw, base, width, height) {
  if (!raw) return null;
  try {
    const u = new URL(decodeAttr(raw), base);
    if (u.protocol !== "https:") return null;
    const n = (v) => (/^\d{1,5}$/.test(v || "") ? Number(v) : null);
    return { url: u.href, width: n(width), height: n(height) };
  } catch {
    return null;
  }
}
// Attribute values come with &amp; and friends. Only the entities we decode elsewhere.
function decodeAttr(s) {
  return s.replace(/&(#x?[0-9a-f]+|amp|quot|apos|nbsp|lt|gt);/gi, decodeEntity);
}

function newsItem(block, fallbackOutlet) {
  const tag = (name) => {
    const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    return m ? m[1] : "";
  };
  // Strip tags, decode entities, then once more for double-encoded feeds ("&amp;lt;img&amp;gt;").
  const plain = (raw) => {
    let t = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
    for (let i = 0; i < 2; i++) t = t.replace(/<[^>]+>/g, " ").replace(/&(#x?[0-9a-f]+|amp|quot|apos|nbsp|lt|gt);/gi, decodeEntity);
    return t.replace(/\s*[\u2013\u2014]\s*/g, ", ").replace(/\s+/g, " ").trim();
  };
  const url = plain(tag("link"));
  if (!/^https?:\/\//i.test(url)) return null;
  const sourceTag = block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
  const outlet = sourceTag ? plain(sourceTag[1]) : fallbackOutlet;
  let title = plain(tag("title")).replace(/\s-\s[^-]+$/, (m) => (sourceTag ? "" : m));
  if (!title) return null;
  // A story photo: media:thumbnail first, then an image enclosure. Attribute order varies, so match each attribute alone.
  const attr = (el, name) => el.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1];
  const media = block.match(/<media:thumbnail\b[^>]*>/i)?.[0];
  const enclosure = [...block.matchAll(/<enclosure\b[^>]*>/gi)].map((m) => m[0]).find((e) => /type=["']image\//i.test(e));
  const pic = media ? { el: media, url: attr(media, "url") } : enclosure ? { el: enclosure, url: attr(enclosure, "url") } : null;
  const image = pic ? safeImage(pic.url, url, attr(pic.el, "width"), attr(pic.el, "height")) : null;
  // The first sentence of the description is the body; the headline stands in when it is empty.
  const desc = plain(tag("description")).replace(/\s*\.\.\.$/, "");
  const sentences = desc.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/);
  // Google News descriptions repeat the headline and the outlet, so their headline is the sentence.
  let sentence = !sourceTag && sentences[0] && sentences[0].length >= 40 ? sentences[0] : title;
  if (sentence.length > 220) sentence = sentence.slice(0, 217).replace(/\s+\S*$/, "") + "...";
  if (!/[.!?]$/.test(sentence)) sentence += ".";
  return { title, sentence, outlet, url, image };
}

function interleave(lists) {
  const out = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
