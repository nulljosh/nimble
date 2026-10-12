// Rich results in the worker, offline: fetch is stubbed per upstream URL. Covers the photo rules:
// https only, logos skipped, news thumbnails, og:image on sites, and a photo on AI answers only when
// the page it came from backs the sentence.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const env = { RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async () => ({ response: "UNKNOWN" }) } };
const get = (path) => worker.fetch(new Request("https://w.test/" + path), env);
const rss = (items) => `<rss><channel>${items}</channel></rss>`;
const item = (n, extra = "") => `<item><title>Story ${n} happened</title><link>https://www.bbc.com/news/${n}</link><description>Story ${n} is a full sentence about the news today.</description>${extra}</item>`;

test("news: media:thumbnail becomes a photo, enclosure works too, plain items get none", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("bbc")) return new Response(rss(
      item(1, `<media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/news/240/a.jpg?x=1&amp;y=2"/>`) +
      item(2, `<enclosure url="https://cdn.example.com/b.jpg" type="image/jpeg" length="10"/>`) +
      item(3)), { status: 200 });
    return new Response(rss(""), { status: 200 });
  };
  const body = await (await get("?news=")).json();
  const [a, b, c] = body.items;
  assert.deepEqual(a.image, { url: "https://ichef.bbci.co.uk/news/240/a.jpg?x=1&y=2", width: 240, height: 135 });
  assert.deepEqual(b.image, { url: "https://cdn.example.com/b.jpg", width: null, height: null });
  assert.equal(c.image, null);
});

test("news: an http picture is dropped, never shown", async () => {
  globalThis.fetch = async (url) => String(url).includes("bbc")
    ? new Response(rss(item(1, `<media:thumbnail url="http://insecure.example.com/a.jpg"/>`)), { status: 200 })
    : new Response(rss(""), { status: 200 });
  const body = await (await get("?news=")).json();
  assert.equal(body.items[0].image, null);
});

test("site: og:image in either attribute order, relative resolved, favicon kept", async () => {
  const html = `<html><head><title>Acme</title><meta property="og:image" content="/share.png"><meta content="Ship faster" property="og:description"></head><body><h1>Ship</h1></body></html>`;
  globalThis.fetch = async () => new Response(html, { status: 200 });
  const body = await (await get("?site=acme.com")).json();
  assert.deepEqual(body.image, { url: "https://acme.com/share.png", width: null, height: null });
  assert.match(body.favicon, /domain=acme\.com/);
});

test("site: no og:image means image null, and an http og:image is refused", async () => {
  globalThis.fetch = async () => new Response(`<title>Plain</title>`, { status: 200 });
  assert.equal((await (await get("?site=plain.com")).json()).image, null);
  globalThis.fetch = async () => new Response(`<meta property="og:image" content="http://x.com/a.png">`, { status: 200 });
  assert.equal((await (await get("?site=plain.com")).json()).image, null);
});

test("AI answer: the photo comes from the page that backs the sentence, logos are skipped", async () => {
  const wiki = {
    query: { pages: [
      { title: "Eiffel Tower", index: 1, extract: "The Eiffel Tower is an iron lattice tower in Paris.", thumbnail: { source: "https://upload.wikimedia.org/wiki/Eiffel_Tower_logo.svg/330px.png", width: 330, height: 423 } },
      { title: "Hamlet", index: 2, extract: "Hamlet is a tragedy written by William Shakespeare.", thumbnail: { source: "https://upload.wikimedia.org/hamlet.jpg", width: 800, height: 600 } },
    ] },
  };
  const ask = async (q, text) => {
    globalThis.fetch = async (url) => String(url).includes("wikipedia")
      ? new Response(JSON.stringify(wiki), { status: 200 })
      : new Response("{}", { status: 404 });
    const res = await worker.fetch(
      new Request("https://w.test/", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify({ q }) }),
      { ...env, AI: { run: async () => ({ response: text }) } },
    );
    return res.json();
  };
  const hamlet = await ask("who wrote hamlet", "William Shakespeare wrote Hamlet.");
  assert.equal(hamlet.answer, "William Shakespeare wrote Hamlet.");
  assert.deepEqual(hamlet.image, { url: "https://upload.wikimedia.org/hamlet.jpg", width: 800, height: 600 });
  const unrelated = await ask("who wrote hamlet", "Paris is the capital of France.");
  assert.equal(unrelated.image, undefined);
  const unknown = await ask("who wrote hamlet", "UNKNOWN");
  assert.equal(unknown.answer, "UNKNOWN");
  assert.equal(unknown.image, undefined);
});
