// Rich results in the web engine, offline: fetch is stubbed per URL. Photos come from Wikipedia's
// lead image (logos skipped), a site's og:image, each news story, and the proxy's AI answer.
// No photo means today's layout.
const test = require("node:test"), assert = require("node:assert/strict");

// Outside a browser the engine treats consent as "yes", so give it a small localStorage with the choice.
let consent = "no";
globalThis.localStorage = {
  getItem: (k) => (k === "nimble.aiConsent" ? consent : null),
  setItem() {}, removeItem() {},
};
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; consent = "no"; });

const json = (o) => ({ ok: true, json: async () => o });
const PHOTO = { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ev/Everest.jpg/800px-Everest.jpg", width: 800, height: 533 };
const LOGO = { source: "https://upload.wikimedia.org/wikipedia/en/thumb/b/ba/Eiffel_Tower_logo.svg/330px.png", width: 330, height: 423 };

// Wikipedia search finds the title; the REST summary carries the thumbnail.
function wikiStub(thumbnail, title = "Mount Everest") {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes("list=search")) return json({ query: { search: [{ title }] } });
    if (url.includes("/page/summary/")) return json({ title, extract: "Mount Everest is the highest mountain above sea level, on the Nepal and China border.", thumbnail, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Mount_Everest" } } });
    return { ok: false };
  };
}

test("a Wikipedia answer carries its lead photo, with width and height", async () => {
  wikiStub(PHOTO);
  const a = await E.answer("Mount Everest");
  assert.equal(a.kind, "text");
  assert.deepEqual(a.image, { url: PHOTO.source, width: 800, height: 533 });
});

test("a logo is not a photo: the answer keeps its text and drops the picture", async () => {
  wikiStub(LOGO);
  const a = await E.answer("Mount Everest");
  assert.equal(a.kind, "text");
  assert.equal(a.image, null);
});

test("a photo never reaches the answer over plain http", async () => {
  wikiStub({ source: "http://example.com/x.jpg", width: 1, height: 1 });
  const a = await E.answer("Mount Everest");
  assert.equal(a.image, null);
});

test("the card renders the photo on top, with the title as alt text", async () => {
  wikiStub(PHOTO);
  const r = await E.renderAnswer("Mount Everest");
  assert.match(r.h, /<span class="mockup-photo"><img src="https:\/\/upload\.wikimedia\.org[^"]*" alt="Mount Everest" loading="lazy"/);
  assert.ok(r.h.indexOf("mockup-photo") < r.h.indexOf("<p>"), "photo sits above the text");
});

test("alt text is escaped, so a quote in the title cannot break the attribute", async () => {
  wikiStub(PHOTO, 'Mount "Everest"');
  const r = await E.renderAnswer('Mount "Everest"');
  assert.match(r.h, /alt="Mount &quot;Everest&quot;"/);
});

test("no photo means today's layout: no photo element at all", async () => {
  wikiStub(null);
  const r = await E.renderAnswer("Mount Everest");
  assert.doesNotMatch(r.h, /mockup-photo/);
  assert.match(r.h, /<p>Mount Everest is the highest mountain/);
});

test("a site's og:image is the card photo and the favicon steps aside", async () => {
  globalThis.fetch = async (url) => String(url).includes("site=acme.com")
    ? json({ host: "acme.com", title: "Acme", description: "Ship faster with Acme tools.", image: { url: "https://acme.com/share.png", width: null, height: null } })
    : { ok: false };
  const a = await E.answer("what is acme.com");
  assert.equal(a.kind, "text");
  assert.equal(a.image.url, "https://acme.com/share.png");
  assert.equal(a.icon, null);
  const r = await E.renderAnswer("what is acme.com");
  assert.match(r.h, /mockup-photo/);
  assert.doesNotMatch(r.h, /mockup-icon/);
});

test("a site with no og:image keeps the favicon exactly as before", async () => {
  globalThis.fetch = async (url) => String(url).includes("site=acme.com")
    ? json({ host: "acme.com", title: "Acme", description: "Ship faster with Acme tools." })
    : { ok: false };
  const a = await E.answer("what is acme.com");
  assert.ok(!a.image);
  assert.match(a.icon, /google\.com\/s2\/favicons\?domain=acme\.com/);
  const r = await E.renderAnswer("what is acme.com");
  assert.doesNotMatch(r.h, /mockup-photo/);
  assert.match(r.h, /mockup-icon/);
});

test("news: a story with a picture gets a 56px square beside it, the others stay plain", async () => {
  globalThis.fetch = async (url) => String(url).includes("?news=")
    ? json({ items: [
        { title: "Story one", sentence: "First story happened today.", outlet: "BBC", url: "https://www.bbc.com/news/1", image: { url: "https://ichef.bbci.co.uk/a.jpg", width: 240, height: 135 } },
        { title: "Story two", sentence: "Second story happened.", outlet: "CBC", url: "https://www.cbc.ca/news/2", image: null },
      ] })
    : { ok: false };
  const r = await E.renderAnswer("news");
  assert.equal((r.h.match(/class="news-thumb"/g) || []).length, 1);
  assert.match(r.h, /<img class="news-thumb" src="https:\/\/ichef\.bbci\.co\.uk\/a\.jpg" alt="Story one" width="56" height="56"/);
  assert.match(r.h, /<li class="has-thumb">/);
  assert.match(r.h, /<li><div><a href="https:\/\/www\.cbc\.ca\/news\/2"/);
});

test("news: no picture anywhere is today's list", async () => {
  globalThis.fetch = async (url) => String(url).includes("?news=")
    ? json({ items: [{ title: "A", sentence: "A happened.", outlet: "NPR", url: "https://www.npr.org/a" }] })
    : { ok: false };
  const r = await E.renderAnswer("news");
  assert.doesNotMatch(r.h, /news-thumb|has-thumb/);
});

test("the proxy's AI answer keeps its photo, and a non-https photo is dropped", async () => {
  consent = "yes";
  const reply = (image) => async (url, opts) => {
    if (String(url).includes("nimble-answers") && opts && opts.method === "POST")
      return json({ answer: "William Shakespeare wrote Hamlet.", source: "Gemma + Qwen", image });
    return { ok: false };
  };
  globalThis.fetch = reply({ url: "https://upload.wikimedia.org/hamlet.jpg", width: 800, height: 600 });
  const a = await E.answer("who wrote hamlet");
  assert.equal(a.kind, "text");
  assert.equal(a.body, "William Shakespeare wrote Hamlet.");
  assert.deepEqual(a.image, { url: "https://upload.wikimedia.org/hamlet.jpg", width: 800, height: 600 });

  globalThis.fetch = reply({ url: "http://insecure.example/x.jpg", width: 1, height: 1 });
  const b = await E.answer("who wrote hamlet");
  assert.equal(b.body, "William Shakespeare wrote Hamlet.");
  assert.ok(!b.image);
});
