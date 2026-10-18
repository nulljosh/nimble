// Nimble answer proxy. Runs Gemma + Qwen in parallel on Cloudflare Workers AI
// (no external API key needed) and synthesizes one answer.
// POST { "q": "who is the ceo of apple", "turns": [{"q": "...", "a": "..."}] } -> { "answer": "Tim Cook." } or { "answer": "UNKNOWN" }
// turns is optional: the last three exchanges, so "and in celsius?" has something to refer to.
const QWEN = "@cf/qwen/qwen3-30b-a3b-fp8";
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";
const LLAMA = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Groq's free tier, asked first when the GROQ_KEY secret is set: separate daily caps per model and no neurons.
// A model that errors or hits its cap (429) hands over to the next, then to Workers AI.
export const GROQ_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
// gpt-oss reasons before it answers: low effort, reasoning dropped from the reply, room for both in max_tokens.
const groqParams = (model) => (model.startsWith("qwen/") ? { reasoning_format: "hidden", max_tokens: 80 } : { reasoning_effort: "low", include_reasoning: false, max_tokens: 300 });
// House model: Qwen3 30B bills 4,625 neurons per M input tokens, Gemma 4 26B 9,091 (Workers AI pricing, Oct 2026).
// Input dominates here (grounding plus question), so Qwen is the one asked first and alone.
const SYSTEM =
  "Answer in one short factual sentence. No preamble, no markdown. Assume Earth and our own Sun unless the question names another world or star. If you do not know, reply exactly UNKNOWN.";
// Model weights are frozen at their training cutoff, so "who is the current president"
// came back "Joe Biden". Ground every question in live Wikipedia intros plus today's date
// and tell the models the context beats their memory.
// ponytail: top-3 search intros, swap for a real search API if Wikipedia misses too often
// "who is the prime minister of canada" finds the list and history pages, which bury the holder; "current ..." finds the page that names them.
const whoTerm = (q) => (/^who (is|are) (?!(the )?(current|first|last|former|next|youngest|oldest)\b)/i.test(q.trim()) ? q.trim().replace(/^who (is|are) (the )?/i, "current ").replace(/\?$/, "") : q);
// "tallest mountain" finds the Solar System list and its Olympus Mons; a superlative landform means Earth unless the question names another world.
const earthTerm = (q) => (/\b(tallest|highest|biggest|largest|longest|deepest) (mountain|volcano|canyon|waterfall)\b/i.test(q) && !/\b(mars|venus|moon|lunar|solar system|jupiter|mercury|planet|titan|io)\b/i.test(q) ? `${q.trim().replace(/\?$/, "")} on Earth` : q);
export const searchTerm = (q) => earthTerm(whoTerm(q));
async function freshContext(q, attempt = 0) {
  try {
    const r = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=800&format=json&formatversion=2&gsrsearch=" +
        encodeURIComponent(searchTerm(q)),
      { headers: { "user-agent": "nimble-answers/1.0 (trommatic.workers.dev)" } },
    );
    // A throttled or empty Wikipedia reply leaves the models on their stale memory ("Joe Biden"),
    // so one retry after a beat is worth more than a fast wrong answer.
    const pages = (r.ok && (await r.json())?.query?.pages) || [];
    if (!pages.length && attempt === 0) { await new Promise((ok) => setTimeout(ok, 400)); return freshContext(q, 1); }
    const sorted = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    // Officeholder intros bury "The current prime minister is X" ten sentences deep, so keep
    // the lead plus any sentence naming who holds something now.
    // Dates are kept in two cases: the question asks when (or what year), so "when was the printing
    // press invented" gets its date sentence; or the sentence's year also appears in the lead, so it
    // is on the same subject. "since 1944" in an unrelated sentence of a France page stays out.
    const when = WHEN.test(q);
    const trim = (t = "") => {
      const sents = t.split(/(?<=[.!?])\s+/);
      const lead = sents.slice(0, 4);
      const leadYears = new Set(lead.join(" ").match(YEAR_G) || []);
      const keep = (x) => {
        if (/\b(current|incumbent)\b|\bsince\b[\s\S]*\b(president|minister|premier|ceo|governor|mayor|secretary|chancellor|king|queen|head)\b/i.test(x)) return true;
        if (!DATE.test(x)) return false;
        return when || (x.match(YEAR_G) || []).some((y) => leadYears.has(y));
      };
      return [...lead, ...sents.slice(4).filter(keep)].join(" ");
    };
    return { text: pages.map((p) => `${p.title}: ${trim(p.extract)}`.slice(0, 1000)).join("\n\n").slice(0, 2800), pages: sorted };
  } catch {
    return { text: "", pages: [] };
  }
}

// A photo rides on an AI answer only when it is the picture of an entity the ANSWER names (the same rule as
// docs/engine.js answerEntities and photoFromEntity). Words in the question never pick a photo. The entity's own
// page must contain the entity. Wikipedia's lead image is sometimes a logo or flag: skipped.
const NOT_A_PHOTO = /\.svg(\.png)?(\?|$)|logo|flag|icon|coat[_ ]of[_ ]arms|seal|map|commons-/i;
const PHOTO_EXT = /\.(png|jpe?g|webp)(\?|$)/i;
const ENTITY_RUN = /\b\p{Lu}[\p{L}'’-]+(?:\s+(?:(?:da|de|del|della|der|di|du|la|le|van|von|of|the)\s+)?\p{Lu}[\p{L}'’-]+){0,3}/gu;
const SENTENCE_WORDS = new Set("The A An It This That In On At As Its He She They There Yes No I Of For And But If When Where Who What From With By To Is Was These Those We You January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday".split(" "));
const keyWordsW = (s) => (s.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !GLUE.has(w));
// The entities the answer names, photo order. A name after a preposition is never the subject
// ("the largest planet in the Solar System is Jupiter" gives Jupiter, and the Solar System is dropped). The question's own words count only when
// the answer names nothing else.
const PREP_W = new Set(["of", "in", "from", "at", "on", "near", "into", "across", "between", "among", "within"]);
function answerEntities(q, answer) {
  const ql = q.toLowerCase(), text = String(answer), out = [];
  for (const m of text.matchAll(ENTITY_RUN)) {
    const words = m[0].split(/\s+/);
    while (words.length && SENTENCE_WORDS.has(words[0])) words.shift();
    const name = words.join(" ");
    if (!name || out.some((e) => e.name === name)) continue;
    const before = text.slice(0, m.index).replace(/\b(the|a|an|its|his|her|their|our)\s+$/i, "").match(/(\S+)\s*$/);
    out.push({ name, echo: ql.includes(name.toLowerCase()), prep: !!before && PREP_W.has(before[1].toLowerCase()) });
  }
  const pool = out.some((e) => !e.echo) ? out.filter((e) => !e.echo) : out;
  return pool.filter((e) => !e.prep).slice(0, 3).map(({ name, echo }) => ({ name, echo }));
}
// The entity's own Wikipedia summary, or null (missing, disambiguation, or a failed request).
async function wikiSummary(name) {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`,
      { headers: { "user-agent": "nimble-answers/1.0 (trommatic.workers.dev)" } });
    const s = r.ok ? await r.json() : null;
    return s && s.title && s.type !== "disambiguation" ? s : null;
  } catch {
    return null;
  }
}
// The summary gives the photo for this entity: a real https picture, the page contains the entity, and an echoed
// entity also shares a content word with the answer (its own words do not count).
function photoFromEntity(s, entity, answerWords) {
  const src = s?.thumbnail?.source;
  if (!src || !s.extract || !/^https:\/\//.test(src) || NOT_A_PHOTO.test(src) || !PHOTO_EXT.test(src)) return false;
  const have = s.extract.toLowerCase();
  if (!entity.name.toLowerCase().split(/\s+/).every((w) => have.includes(w))) return false;
  if (!entity.echo) return true;
  const own = new Set(keyWordsW(entity.name)), lead = new Set(keyWordsW(s.extract));
  return [...answerWords].some((w) => !own.has(w) && lead.has(w));
}
// The photo for an AI answer, with the Wikipedia page it came from (its title is the credit). No entity, no photo.
async function photoFor(q, answer) {
  const ents = answerEntities(q, answer);
  if (!ents.length) return null;
  const answerWords = new Set(keyWordsW(answer));
  const sums = await Promise.all(ents.map((e) => wikiSummary(e.name)));
  const i = ents.findIndex((e, k) => photoFromEntity(sums[k], e, answerWords));
  if (i < 0) return null;
  const t = sums[i].thumbnail;
  return { image: { url: t.source, width: t.width ?? null, height: t.height ?? null }, page: sums[i] };
}
// The Wikipedia page a sentence is credited to: the photo's page, else the first grounding page.
// Title and URL use the same format as the refs, so clients can match them.
function topicOf(photoPage, refs) {
  const title = photoPage?.title || refs[0]?.title;
  if (!title) return null;
  return { topic: title, topicUrl: encodeURI(`https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`) };
}
// The Wikipedia pages behind an AI answer, up to three, each with the same word-overlap test as the
// photo. The client lists one of them as a second source next to DDG. URLs match DDG's format
// (underscores, the article's own title) so the client can dedupe them.
export function groundingRefs(answer, pages, q = "") {
  const keys = (s) => (s.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !GLUE.has(w));
  const want = [...new Set(keys(answer))];
  if (!want.length) return [];
  // The words the answer adds to the question carry the answer ("Paris"); a page that only repeats the question
  // ("Capital punishment in France") must not pass on echoed words alone.
  const asked = new Set(keys(q));
  const added = want.filter((w) => !asked.has(w));
  return pages
    .filter((p) => p.title && p.extract && !/^list of /i.test(p.title))
    .filter((p) => {
      const have = new Set(keys(p.extract));
      if (added.length && added.filter((w) => have.has(w)).length < Math.ceil(added.length * 0.6)) return false;
      return want.filter((w) => have.has(w)).length >= Math.ceil(want.length * 0.6);
    })
    .slice(0, 3)
    .map((p) => ({ title: p.title, url: encodeURI(`https://en.wikipedia.org/wiki/${p.title.replace(/ /g, "_")}`), extract: p.extract }));
}
// A date or figure comes only from the reference: "since 1944" from an unrelated page is how the France answer went wrong.
const GROUNDED = "Do not add a date or figure the reference lacks.";
// Question shapes that ask for a date, and the date tokens a reference sentence can carry.
const WHEN = /\b(when|what year|which year|what date|what century|how old)\b/i;
const DATE = /\b(1\d{3}|20\d{2})s?\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/;
const YEAR_G = /\b(1\d{3}|20\d{2})s?\b/g;
const GLUE = new Set("that this with from which were have they their also been into about after there these those when where while would could should will".split(" "));

// Follow-up context from the client: at most 3 {q, a} string pairs, each side cut to 300 chars.
// Anything else is dropped. Never logged.
// The last AI call failure (a thrown error, not a model's UNKNOWN), kept in module memory for debugging.
// A request reports its own failure as aiError, so concurrent requests never share one.
let lastAiError = "";
function aiErrorText(e) {
  return String(e?.message ?? e ?? "unknown error").replace(/\s+/g, " ").slice(0, 200);
}

function cleanTurns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t.q === "string" && typeof t.a === "string" && t.q.trim() && t.a.trim())
    .slice(-3)
    .map((t) => ({ q: t.q.slice(0, 300), a: t.a.slice(0, 300) }));
}

// ---- Neuron guard, answer cache, /stats ------------------------------------------------------
// Free Workers AI is 10,000 neurons a day, resetting 00:00 UTC. Per call we assume ~1,700 input tokens
// (grounding plus question) and up to 80 output tokens: about 10 neurons on Qwen. NEURONS_PER_CALL is a
// deliberate 6x overestimate so the guard trips early, never late. Calibrate it from the dashboard later.
export const NEURONS_PER_CALL = 60;
export const BUDGET_NEURONS = 8500;
const BUDGET_NOTE = "AiError: daily free AI budget nearly used";
export const TTL_CACHE = 6 * 3600; // seconds
export const TTL_TIMELY = 3600; // time-sensitive answers go stale fast
const TIMELY = /\b(current|latest|today|price|score|now)\b|\bwho is the\b/i;
export const isTimeSensitive = (q) => TIMELY.test(q);
// Question shapes where two models clashing is worth a second call (see the flow below).
export const needsSecondModel = (q) => isTimeSensitive(q) || WHEN.test(q) || /\d/.test(q);
export const normalizeQuestion = (q) => String(q).trim().toLowerCase().replace(/\s+/g, " ");
export const cacheUrl = (origin, q) => `${origin}/__nimble/answer?q=${encodeURIComponent(normalizeQuestion(q))}`;
const statsUrl = (origin, day) => `${origin}/__nimble/stats/${day}`;
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const estNeurons = (aiCalls) => aiCalls * NEURONS_PER_CALL;
export const overBudget = (c) => estNeurons(c.aiCalls) > BUDGET_NEURONS;
// The Cache API is per data center (it survives a deploy: a cached answer outlives the fix that changes it, until
// its TTL ends), so every cached answer here is best effort: a colo only sees its own traffic. A global count needs a KV namespace (see wrangler.jsonc).
const store = () => globalThis.caches?.default ?? null;
const fresh = (day = "") => ({ day, aiCalls: 0, cacheHits: 0, groqCalls: 0, groqRefused: 0 });
let mem = fresh();
export function _resetForTests() {
  mem = fresh();
}
async function cacheGet(key) {
  try {
    const hit = await store()?.match(new Request(key));
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}
async function cachePut(key, body, ttl) {
  try {
    await store()?.put(new Request(key), new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` } }));
  } catch {
    // best effort: a failed put only costs a repeat AI call
  }
}
// Today's counts: this isolate's numbers, raised to whatever the Cache API holds for today.
// With the COUNTS Durable Object bound, one global instance holds the day's numbers (max-merged, so a
// racing isolate can lose a few counts but never move them backwards); without it, the Cache API is the store.
const FIELDS = ["aiCalls", "cacheHits", "groqCalls", "groqRefused"];
export class NimbleCounts {
  constructor(state) {
    this.state = state;
  }
  async fetch(req) {
    let s = (await this.state.storage.get("c")) || fresh();
    if (req.method === "POST") {
      const inc = await req.json();
      if (inc.day !== s.day) s = s.day > inc.day ? s : fresh(inc.day);
      if (inc.day === s.day) for (const k of FIELDS) s[k] = Math.max(s[k], Number(inc[k]) || 0);
      // One latency sample per answered request, the last 50 per source: enough for a p95 that moves.
      if (inc.day === s.day && inc.sample?.source && Number.isFinite(inc.sample.ms)) {
        const ring = ((s.lat ??= {})[inc.sample.source] ??= []);
        ring.push(inc.sample.ms);
        if (ring.length > 50) ring.shift();
      }
      await this.state.storage.put("c", s);
    }
    return json(s);
  }
}
const globalCounts = (env, init) => {
  try {
    return env?.COUNTS?.get(env.COUNTS.idFromName("global")).fetch("https://counts/", init).then((r) => r.json());
  } catch {
    return null;
  }
};
async function loadCounts(origin, env) {
  const day = dayKey();
  if (mem.day !== day) mem = fresh(day);
  const g = await globalCounts(env)?.catch(() => null);
  if (g?.day === day) {
    for (const k of FIELDS) mem[k] = Math.max(mem[k], Number(g[k]) || 0);
    mem.lat = g.lat || {};
  }
  const text = await cacheGet(statsUrl(origin, day));
  try {
    const s = JSON.parse(text || "{}");
    mem.aiCalls = Math.max(mem.aiCalls, Number(s.aiCalls) || 0);
    mem.cacheHits = Math.max(mem.cacheHits, Number(s.cacheHits) || 0);
    mem.groqCalls = Math.max(mem.groqCalls, Number(s.groqCalls) || 0);
    mem.groqRefused = Math.max(mem.groqRefused, Number(s.groqRefused) || 0);
  } catch {
    // unreadable counter: keep the isolate's own numbers
  }
  return mem;
}
async function saveCounts(origin, c, env) {
  await globalCounts(env, { method: "POST", body: JSON.stringify(c) })?.catch(() => null);
  delete c.sample; // sent once
  await cachePut(statsUrl(origin, c.day), { aiCalls: c.aiCalls, cacheHits: c.cacheHits, groqCalls: c.groqCalls, groqRefused: c.groqRefused }, 2 * 86400);
}
async function statsReply(origin, env) {
  const c = await loadCounts(origin, env);
  // groqCalls counts every request sent to Groq, groqRefused the ones it turned away (cap or error): the capacity gauge.
  const pct = (v, p) => [...v].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * v.length) - 1)];
  // latency: per answering source, from the global counter's last 50 samples; empty without the Durable Object.
  const latency = Object.fromEntries(Object.entries(c.lat || {}).map(([k, v]) => [k, { n: v.length, p50: pct(v, 0.5), p95: pct(v, 0.95) }]));
  return json({ day: c.day, aiCalls: c.aiCalls, cacheHits: c.cacheHits, estNeurons: estNeurons(c.aiCalls), groqCalls: c.groqCalls, groqRefused: c.groqRefused, latency });
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
    const isStats = req.method === "GET" && url.pathname === "/stats";
    if (isStats) return statsReply(url.origin, env);
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
    // A key from API_KEYS (comma-separated secret, issued by hand) gets its own 60/min bucket instead of the IP's 20.
    const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || req.headers.get("x-api-key") || "";
    if (key && !(env.API_KEYS || "").split(",").map((k) => k.trim()).includes(key)) return json({ error: "bad key" }, 401);
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    const limiter = key && env.API_LIMITER ? env.API_LIMITER : env.RATE_LIMITER;
    const { success } = await limiter.limit({ key: key || ip });
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
    const t0 = Date.now();

    const counts = await loadCounts(url.origin, env);
    // An identical question (normalized) inside the TTL is served from the Cache API: no AI, no neurons.
    // Follow-up turns depend on the conversation, so they skip the cache.
    const cKey = turns.length === 0 ? cacheUrl(url.origin, q) : null;
    const hit = cKey ? await cacheGet(cKey) : null;
    if (hit) {
      counts.cacheHits++;
      await saveCounts(url.origin, counts, env);
      return new Response(hit, { headers: { "content-type": "application/json", ...CORS } });
    }
    // Past the daily estimate: no AI call. The client shows its resting note because aiError is set.
    const resting = () => json({ answer: "UNKNOWN", resting: true, aiError: BUDGET_NOTE });
    if (overBudget(counts) && !env.GROQ_KEY) return resting();

    // A bare follow-up ("and in celsius?") searches badly alone, so lead with the last question.
    const { text: context, pages } = await freshContext(turns.length ? `${turns[turns.length - 1].q} ${q}` : q);
    // Set only when an AI call threw and the answer is UNKNOWN because of it (see the flow below).
    const aiFailures = [];
    // Every reply goes through here. Known answers are cached (UNKNOWN and errors never are), and the counts are saved.
    const finish = async (o) => {
      const known = o.answer !== "UNKNOWN";
      // A disagreement has no photo: the sources do not say which answer is right, so no picture leans either way.
      const photo = known && !o.disagree ? await photoFor(q, o.answer) : null;
      const refs = known ? groundingRefs(o.answer, pages, q) : [];
      const topic = known ? topicOf(photo?.page, refs) : null;
      const body = { ...o, ...(photo ? { image: photo.image } : {}), ...(refs.length ? { refs } : {}), ...(topic || {}) };
      if (cKey && known && !o.aiError) await cachePut(cKey, body, isTimeSensitive(q) ? TTL_TIMELY : TTL_CACHE);
      // Keyed by the first source that answered (Groq, Qwen, Gemma), whole request time as the user felt it.
      if (o.source) counts.sample = { source: o.source.split(" ")[0], ms: Date.now() - t0 };
      await saveCounts(url.origin, counts, env);
      return json(body);
    };
    const today = new Date().toISOString().slice(0, 10);
    const system =
      `${SYSTEM} Today is ${today}. Your training data is out of date; when the reference text below ` +
      `covers the question, trust it over your memory. Never mention the reference text.` + (context ? ` ${GROUNDED}` : "") + (context ? `\n\nReference (live Wikipedia):\n${context}` : "");
    const messages = [
      { role: "system", content: system },
      ...turns.flatMap((t) => [
        { role: "user", content: `${t.q} /no_think` },
        { role: "assistant", content: t.a },
      ]),
      // The model gets the same Earth rewrite the search does ("tallest mountain on Earth"): gpt-oss answered
      // Olympus Mons from memory with only the system prompt and the grounding saying Earth.
      { role: "user", content: `${earthTerm(q)} /no_think` },
    ];
    const ask = (model) =>
      env.AI.run(model, {
        messages,
        temperature: 0,
        max_tokens: 80, // ponytail: neurons bill per token; a sentence never needs 600
      })
        .then((d) => {
          const msg = d?.choices?.[0]?.message;
          // Reasoning models sometimes hit max_tokens mid-thought and leave content null;
          // fall back to the last sentence of the reasoning trace.
          return cleanReply(d?.response || msg?.content || msg?.reasoning?.split(/(?<=[.!?])\s+/).pop() || "");
        })
        .catch((e) => {
          lastAiError = aiErrorText(e);
          aiFailures.push(lastAiError);
          return "UNKNOWN";
        });
    // The free Groq models in order. Null when there is no key or every model refused (cap, error), so Workers AI takes over.
    const groqCall = (model) => {
      counts.groqCalls++;
      return fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${env.GROQ_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0, ...groqParams(model) }),
      });
    };
    // One model: its answer, or null when it refused (cap, error). A bare 429 with no retry-after is a per-minute burst.
    let burst = false;
    const tryGroq = async (model) => {
      try {
        let r = await groqCall(model);
        // A per-minute cap clears in seconds: wait out a short retry-after once before giving the model up.
        const ra = r.headers.get("retry-after");
        const wait = ra == null ? NaN : Number(ra);
        if (r.status === 429 && wait >= 0 && wait <= 3) {
          counts.groqRefused++;
          await new Promise((ok) => setTimeout(ok, wait * 1000));
          r = await groqCall(model);
        }
        if (r.status === 429 && Number.isNaN(wait)) burst = true;
        if (!r.ok) { counts.groqRefused++; return null; }
        const d = await r.json();
        // gpt-oss italicizes titles (*War and Peace*); the answer is plain text.
        return cleanReply((d?.choices?.[0]?.message?.content || "").replace(/\*/g, ""));
      } catch {
        return null;
      }
    };
    const askGroq = async () => {
      for (const model of GROQ_MODELS) {
        const a = await tryGroq(model);
        if (a !== null) return a;
      }
      // Every model refused with a bare 429: a burst, not the day's cap. One breath, then the first model once more,
      // so a few simultaneous questions do not all land on Workers AI (or on the resting note past its budget).
      if (burst) {
        await new Promise((ok) => setTimeout(ok, Number(env.GROQ_BURST_WAIT_MS ?? 2000)));
        return tryGroq(GROQ_MODELS[0]);
      }
      return null;
    };
    // Samantha, the local 9B model, when SAMANTHA_URL (a tunnel to the Mini's oMLX) is set. Null on any error or
    // timeout, so Groq takes over the moment the Mini is off.
    const askSamantha = async () => {
      try {
        const r = await fetch(`${env.SAMANTHA_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "Qwen3.5-9B-OptiQ-4bit", messages, temperature: 0, max_tokens: 80, chat_template_kwargs: { enable_thinking: false } }),
          signal: AbortSignal.timeout(Number(env.SAMANTHA_TIMEOUT_MS ?? 8000)),
        });
        if (!r.ok) return null;
        const d = await r.json();
        const a = cleanReply((d?.choices?.[0]?.message?.content || "").replace(/\*/g, ""));
        return a === "UNKNOWN" ? null : a;
      } catch {
        return null;
      }
    };
    const cleanReply = (text) => {
      // Models narrate the grounding ("not mentioned in the provided reference") instead of
      // saying UNKNOWN; treat that as UNKNOWN so the client falls through to DDG/Wikipedia.
      // The same goes for the model quoting its own rules back ("The instructions say: ... reply exactly UNKNOWN").
      if (/\b(reference|provided (text|context))\b|reply exactly|\bthe instructions?\b|\bUNKNOWN\b|\bconstraints?\b|^\s*[*-]\s|\btoday is \d{4}-\d{2}-\d{2}/i.test(text)) return "UNKNOWN";
      // Telling the models today's date makes them echo it: "As of today, October 11, 2026, the CEO is X."
      // The date is ours, not the answer's; drop the preamble and recapitalize.
      const clean = text.trim().replace(/^as of (today,? )?(\w+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2}|\d{4})?,?\s*/i, "");
      // A reply with no letter or digit (a stray "*" from a reasoning trace) is no answer.
      return /[a-z0-9]/i.test(clean) ? clean[0].toUpperCase() + clean.slice(1) : "UNKNOWN";
    };

    // Every model call goes through askCounted so the day's estimate sees it, failures included.
    const askCounted = (model) => {
      counts.aiCalls++;
      return ask(model);
    };
    // One house model first. The second model runs only when the first gave no answer, or when the question
    // is time-sensitive, asks a date, or has a number: the cases where a "Sources disagree" card is worth a call.
    // Groq answers first when it can; past the Workers AI estimate its answer (or UNKNOWN) is final.
    const samantha = env.SAMANTHA_URL ? await askSamantha() : null;
    if (samantha !== null) return finish({ answer: samantha, source: "Samantha" });
    const groq = env.GROQ_KEY ? await askGroq() : null;
    if (groq === null && overBudget(counts)) return resting();
    const [first, house] = groq !== null ? [groq, "Groq"] : [await askCounted(QWEN), "Qwen"];
    if (first !== "UNKNOWN" && (!needsSecondModel(q) || overBudget(counts))) return finish({ answer: first, source: house });
    if (overBudget(counts)) return resting();
    const second = await askCounted(GEMMA);

    // The client shows `source` under the answer, so it names only the models that actually produced it.
    if (first === "UNKNOWN" && second === "UNKNOWN")
      return finish({ answer: "UNKNOWN", ...(aiFailures.length ? { aiError: aiFailures[aiFailures.length - 1] } : {}) });
    if (first === "UNKNOWN") return finish({ answer: second, source: "Gemma" });
    if (second === "UNKNOWN") return finish({ answer: first, source: house });
    if (normalize(first) === normalize(second)) return finish({ answer: first, source: `Gemma + ${house}` });

    // Qwen and Gemma disagree. Rather than let Qwen arbitrate its own dispute, ask a third,
    // independent model and take the majority. Only adds fields (disagree, alts) when the reference does not settle it.
    const dis = disagreement(first, second, pages.map((p) => p.extract || "").join(" "), q);
    const third = await askCounted(LLAMA);
    if (third !== "UNKNOWN") {
      if (normalize(third) === normalize(first)) return finish({ answer: first, source: `${house} + Llama`, ...dis });
      if (normalize(third) === normalize(second)) return finish({ answer: second, source: "Gemma + Llama", ...dis });
    }

    // All three differ (or Llama said UNKNOWN). No synthesis call any more: the house model's answer, with
    // both answers in alts when the reference does not settle the clash.
    return finish({ answer: first, source: house, ...dis });
  },
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

// Two models rarely emit byte-identical sentences even when they agree, so lowercase +
// strip punctuation + collapse whitespace before comparing, instead of paying for a
// synthesis call on every near-duplicate answer.
function normalize(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

// Disagreement. Two answers agree unless they clash on a key token: a number or year that only one of
// them carries and the other does not, or a proper noun the question does not already name. Words both
// answers share never count, so "Apple's CEO is Tim Cook" and "Apple's CEO is Satya Nadella" clash on the names.
const PLAIN = new Set(("the a an it its he she they them this that these those in on at of as is was are were be been and or but " +
  "for from with by to after before during since until today yes no not also one most many several some there both each every all any").split(" "));
const isUnknown = (s) => !s || /^\s*UNKNOWN\s*$/i.test(s);
// Numbers ("1,200" reads as 1200) and capitalised words, lowercased. Question words and question numbers are not the answer's, so they are dropped.
function keyTokens(s, q = "") {
  const text = String(s).replace(/(\d),(?=\d{3}\b)/g, "$1");
  const asked = new Set(String(q).toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) || []);
  const nums = new Set((text.match(/\d+(?:\.\d+)?/g) || []).filter((n) => !asked.has(n)));
  const names = new Set();
  for (const m of text.matchAll(/\b[A-Z][\w'’-]*/g)) {
    const w = m[0].replace(/['’]s$/, "").toLowerCase();
    if (w.length > 1 && !PLAIN.has(w) && !asked.has(w)) names.add(w);
  }
  return { nums, names };
}
// Names match when one is a prefix of the other ("tim" and "timothy"); numbers match exactly.
const sameName = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
// The key tokens that clash: a number or name one answer has and the other lacks, but only when both
// answers each have such a token. One-sided extras ("... and Jeff Williams") are not a clash.
function clashTokens(ka, kb) {
  const only = (x, y) => ({
    nums: [...x.nums].filter((t) => !y.nums.has(t)),
    names: [...x.names].filter((t) => ![...y.names].some((u) => sameName(t, u))),
  });
  const a = only(ka, kb), b = only(kb, ka), out = [];
  if (a.nums.length && b.nums.length) out.push(...a.nums, ...b.nums);
  if (a.names.length && b.names.length) out.push(...a.names, ...b.names);
  return out;
}
export function agree(a, b, q = "") {
  if (isUnknown(a) || isUnknown(b)) return true;
  if (normalize(a) === normalize(b)) return true;
  return clashTokens(keyTokens(a, q), keyTokens(b, q)).length === 0;
}
// The fields to add to a reply: {} when the answers agree, or when a reference names one of the tokens
// they clash on (the reference settles it). Otherwise both answers with their model names, and no pick.
export function disagreement(qwen, gemma, grounding, q = "") {
  if (isUnknown(qwen) || isUnknown(gemma)) return {};
  const clash = clashTokens(keyTokens(qwen, q), keyTokens(gemma, q));
  if (!clash.length) return {};
  const words = new Set(String(grounding).replace(/(\d),(?=\d{3}\b)/g, "$1").toLowerCase().match(/[a-z0-9]+(?:\.\d+)?/g) || []);
  if (clash.some((t) => words.has(t))) return {};
  return { disagree: true, alts: [{ model: "Qwen3 30B", answer: qwen }, { model: "Gemma 4 26B", answer: gemma }] };
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
